# Vulpix

<img src="https://archives.bulbagarden.net/media/upload/0/06/0037Vulpix.png" alt="Vulpix" style="width: 200px; height: auto;" />

## Installation

```
npm install vulpix
```

## What is it?

Vulpix is a small NodeJS library providing CSP([Communicating Synchronous Processes](https://en.wikipedia.org/wiki/Communicating_sequential_processes))-like abstractions similar to those present in other programming languages such as Go and Kotlin.

## Why is it?

Given that NodeJS is a single-threaded runtime, synchronisation primitives like channels might seem unnecessary at best. However, these can still prove useful in non-concurrent environments by providing a way to model and even improve the thoughput of I/O intensive workflows.

The paradigm that Vulpix brings forward encourages the segregation of more granular components in an I/O intensive application. These components (called routines from here on) communicate with each other by messages sent through channels.

### Example

Assume the following scenario:
```
For each Post entity in source A, we need to grab the corresponding PostDetails and PostComments from source B and C, respectively.

Source A exposes a paginated API.

We need to merge PostDetails and PostComments into sink D.

We can't process more than N posts at a time on each service, N being a parameterisable value.
```

We have the following API:
```ts
type Post = Pick<PostDetails, 'id'>;

type PostDetails = {
    id: number;
    author: string;
    date: Date;
    text: string;
};

type PostComment = {
    id: number;
    post: number;
    comment: string;
};

type PostWithComments = PostDetails & {
    comments: Array<PostComment>;
};

function getPosts(page: number, pageSize: number, signal?: AbortSignal): Promise<Array<Post>>;
function getPostDetails(id: number, signal?: AbortSignal): Promise<PostDetails>;
function getComments(id: number, signal?: AbortSignal): Promise<Array<PostComment>>;
function savePostWithComments(post: PostWithComments, signal?: AbortSignal): Promise<void>;
```

One very straight-forward solution would be as follows:
```ts
// benchmark-1.ts
let page = 1;
let posts: Array<Post>;
do {
    posts = await getPosts(page, PAGE_SIZE);
    for (const { id } of posts) {
        const post = await getPostDetails(id);
        const comments = await getComments(id);

        const combined = {
            ...post,
            comments,
        };

        await savePostWithComments(combined);
    }
    page++;
} while (posts.length === PAGE_SIZE);
```
This will grab a page of posts and process each one at a time, contacting each source and sync in serial order. There is a clear opportunity to parallelise:
```ts
// benchmark-2.ts
const [post, comments] = await Promise.all([getPostDetails(id), getComments(id)]);
```
Since getting the post details and comments are two independent tasks, these can be done at the same time. With this we take full advantage of the data dependencies for a single post and can't parallelise more, since we need the post to be in the list first so we can use its id to grab the details and comments, and then we need those before we compute the final result to save. Still, each post is independent from each other, and can be processed in parallel, up to N posts at a time (currently we ignore N and process posts as if N was always 1).

We can start processing posts in groups of N:
```ts
// benchmark-3.ts
let page = 1;
let posts: Array<Post>;
do {
    posts = await getPosts(page, PAGE_SIZE);
    let processedPosts = 0;
    while (processedPosts < posts.length) {
        const remaining = posts.length - processedPosts;
        const postsToProcess = posts.slice(processedPosts, processedPosts + Math.min(N, remaining));
        await Promise.all(postsToProcess.map(processPost));
        processedPosts += Math.min(N, remaining);
    }
    page++;
} while (posts.length === PAGE_SIZE);

async function processPost({ id }: Post) {
    const [post, comments] = await Promise.all([getPostDetails(id), getComments(id)]);

    const combined = {
        ...post,
        comments,
    };

    await savePostWithComments(combined);
}
```
This is much better since now we can process N posts at a time in the same way we were processing each post in the previous example.

Now we process posts in windows of N, meaning that we start processing N posts, and only when all N have been processed do we proceed with processing the following N. Meaning we start with a burst of N posts being processed, and then, as they finish, we 'only' have N-1, N-2, ..., N-(N-1) post processes in-flight, until the one that takes the longest to process finishes, and only then do we start processing another N posts. It would be best if we could start processing another post from the page as soon as one finishes. We can do that as follows:
```ts
// benchmark-4.ts
let page = 1;
let posts: Array<Post>;
const semaphore = createSemaphore(N);
do {
    posts = await getPosts(page, PAGE_SIZE);
    await Promise.all(
        posts.map(async (post) => {
            await semaphore.acquire();
            await processPost(post);
            semaphore.release();
        })
    );
    page++;
} while (posts.length === PAGE_SIZE);

function createSemaphore(concurrency: number) {
    const waitQueue: Array<() => void> = [];
    let count = 0;

    function acquire() {
        if (count < concurrency) {
            count++;
            return Promise.resolve();
        }
        return new Promise<void>((resolve) =>
            waitQueue.push(() => {
                count++;
                resolve();
            })
        );
    }

    function release() {
        count--;
        if (waitQueue.length > 0) {
            const resolve = waitQueue.shift();
            resolve!();
        }
    }

    return { acquire, release };
}
```

Now, even though this is already a pretty good solution (error handling aside), we still have more potential for parallelism since N is the concurrency limit for __each__ service. With this solution we can cap, at most, the concurrency limit of B and C if all N `processPost` calls have a `getPostDetails` and a `getComments` request in-flight.

We could be saving N posts and fetching another page at the same time, if we extracted each step into more granual and independent components:
1. Fetch a page of posts from source A and forward each post;
2. Fetch PostDetails and PostComments from sources B and C, simultaneously, and forward their combined result;
3. Take the combination of PostDetails and PostComments to save into sink D.

This is what we can do in the following example using Vulpix:
```ts
// benchmark-5.ts
const NUM_OF_POST_PRODUCERS = 1;
const NUM_OF_POST_COMMENTS_AGGREGATORS = N;
const NUM_OF_POST_COMMENTS_SAVERS = N;

await workflow(setup);

function setup(ctx: Context) {
    const { $channel: $posts, waitGroup: wgPosts } = channel<Post>(NUM_OF_POST_PRODUCERS);
    const { $channel: $postsWithComments, waitGroup: wgPostsWithComments } = channel<PostWithComments>(
        NUM_OF_POST_COMMENTS_AGGREGATORS
    );

    for (let i = 0; i < NUM_OF_POST_PRODUCERS; i++) {
        ctx.launch(postProducer, $posts, wgPosts.signal, i + 1, NUM_OF_POST_PRODUCERS);
    }

    for (let i = 0; i < NUM_OF_POST_COMMENTS_AGGREGATORS; i++) {
        ctx.launch(postCommentsAggregator, $posts, $postsWithComments, wgPostsWithComments.signal);
    }

    for (let i = 0; i < NUM_OF_POST_COMMENTS_SAVERS; i++) {
        ctx.launch(postWithCommentsSaver, $postsWithComments);
    }
}

async function postProducer(
    ctx: Context,
    $posts: SendChannel<Post>,
    doneSignal: WaitGroup.DoneSignal,
    startingPage = 1,
    pageIncrement = 1
) {
    let page = startingPage;
    let posts: Array<Post>;
    do {
        posts = await getPosts(page, PAGE_SIZE);
        for (const post of posts) {
            await $posts.send(post);
        }
        page += pageIncrement;
    } while (posts.length === PAGE_SIZE);
    doneSignal.done();
}

async function postCommentsAggregator(
    ctx: Context,
    $posts: ReceiveChannel<Post>,
    $postsWithComments: SendChannel<PostWithComments>,
    doneSignal: WaitGroup.DoneSignal
) {
    for await (const { id } of $posts) {
        const [postDetails, comments] = await Promise.all([getPostDetails(id), getComments(id)]);
        await $postsWithComments.send({
            ...postDetails,
            comments,
        });
    }
    doneSignal.done();
}

async function postWithCommentsSaver(ctx: Context, $postsWithComments: ReceiveChannel<PostWithComments>) {
    for await (const postWithComments of $postsWithComments) {
        await savePostWithComments(postWithComments);
    }
}
```

Here we have three routines (`postProducer`, `postCommentsAggregator` and `postWithCommentsSaver`). Routines communicate with each other via channels, making them decoupled. Each receives data inputs from (a) channel(s) and/or sends data through (a) channel(s).

In this sense, we can have each routine schedule and wait for async operations to complete (i.e. I/O operations) at the same time. So, in the example above, we can actually have a new page being fetched, N requests for PostDetails and PostComments in-flight, and N save operations in flight as well.

Here are some benchmarks to see the throughput improvement over each iteration:

| **Benchmark #** | **# N** | **Max Network I/O Ops In-Flight** | **Workflow Duration (ms)** |
|:---------------:|:------------------------:|:----------------------------------:|:------------------:|
|        1        |             -            |                  1                 |        77700       |
|        2        |             -            |                  2                 |        52396       |
|        3        |             4            |                  8                 |        13943       |
|        4        |             4            |                  8                 |        13922 *     |
|        5        |             4            |                 13                 |         6795       |

Simulation environment parameters used:
* TOTAL_POSTS: 500
* PAGE_SIZE: 50
* BASE_LATENCY: 50 (ms)
* MIN_LATENCY_INCREMENT: 0 (ms)
* MAX_LATENCY_INCREMENT: 0 (ms)
* PARALLELISM: 4 (represents N)
* NUM_OF_POST_PRODUCERS: 1 (only applicable for benchmark 5)
* NUM_OF_POST_COMMENTS_AGGREGATORS: 4 (only applicable for benchmark 5 - represents N)
* NUM_OF_POST_COMMENTS_SAVERS: 4 (only applicable for benchmark 5 - represents N)

> (*) Benchmarks 3 and 4 have aproximate results because tests were made in a simulation environment where request latency was fixed at 50ms.
> 
> When compared using the same scenario with MAX_LATENCY_INCREMENT=500ms, benchmark-3.ts took also 30% more time to complete than benchmark-4.ts.

In summary, Vulpix provides a way to model the problem as routines communicating with each other, specially if the problem resembles an in-process data pipeline, and in some scenarios it might allow for improved throughput. More than the time it took each process to complete, it is important to compare the max number of in-flight I/O ops each solution provides.

> It should be noted that another benchmark was run, benchmark-6.ts, which provided a slighly lower result: 6569ms. This has the same idea than the example with Vulpix, but using NodeJS streams instead. The example can be seen in the source code. The time difference has to do with the overhead of communicating through channels. All examples are available in the source code. It is notable that benchmark-6.ts is much more complicated than benchmark-5.ts simply because channels provide some properties that are harder to achieve with streams. This makes the slight difference in time be irrelevant. The max I/O is still the same.

## Concepts & API

### Channel

A channel can be seen as a communication link between routines that matches offer and demand. A generic interface for it would be something like:
```ts
interface OfferAndDemandMatchingQueue<T> {
    produce(value: T): Promise<Ok | Error>;
    consume(): Promise<T | Error>;
}
```
where some routine(s) produce values in the channel, and other(s) take those values from the channel.

When a routine produces a value and there's no routine on the other end to consume it, it can wait until its value is consumed. Likewise, if a routine wants to consume from the channel, it can wait until someone produces a value. 

> :warning: under construction :warning: