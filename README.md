# Vulpix

![Vulpix](https://archives.bulbagarden.net/media/upload/thumb/6/60/037Vulpix.png/200px-037Vulpix.png)

A small NodeJS library providing a CSP-like channel abstraction for data exchange between application components. Given that NodeJS is a single-threaded runtime, such an abstraction might seem unnecessary at best. However, it is very suitable for I/O (filesystem, networking) intensive workflows. Even though we can do all kinds of I/O through NodeJS, the actual I/O happens away from our application code: what our code actually does is schedule the work and register more code to run when the results are available. This kind of code is very fast to execute and hardly ever clogs the call stack. On the other hand, NodeJS can handle lots and lots of I/O at the same time, queuing the results to be consumed by our application as soon as these are available.

With the advent of async/await, writing code that reads synchronously but executes asynchronously (meaning it suspends execution when it can't move forward without a result that still hasn't arrived yet and resumes later when it does, releasing the call stack for other subroutine to execute in the meantime) became a standard. This is great because now we can write easier to understand, procedural code, without giving up on the advantages of being asynchronous and non-blocking. However, when writting this kind of code we tend to miss opportunities to parallelise I/O. This means that we might not reach the optimal throughput for our applications.

The paradigm that Vulpix brings forward encourages the segregation of more granular components in a data processing pipeline. These components (called processes from here on) communicate with each other by messages sent through channels. Each process might schedule several I/O operations on its own and should only take the call stack to forward results or schedule new I/O requests so that it does not starve the other processes. This means that even an I/O intensive application with a high number of processes should not have any starved by the others. (Note that this is already the paradigm used in NodeJS -- if you have a CPU-intensive you use you might want to look into other runtimes or solutions)

Process granularity helps increasing the number of I/O operations an application can be doing at a single point in time. Moreover, it enables more granular and testable components, as well as many other patterns that are harder to achieve under the conventional paradigm.

But enough with the chit-chat, let's look at an example and the observed results.

## Benchmarks

To test Vulpix we created a scenario inspired by a real-world use-case for data extraction, transformation (or aggregation) and sink. The scenario is as follows:

```
We need to extract all Post objects from a paginated API. Each page contains a set of identifiers for different Post objects.

For each identifier we need to grab both its full document information as well as the set of comments related to it.

Once we have these two pieces of data, we must combine them into a single document to store in our own database.
```

The API available to us is as follows:

```ts
type Post = {
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

type PostWithComments = Post & {
    comments: Array<PostComment>;
};

type PostID = Pick<Post, 'id'>;

function getPosts(page: number, pageSize: number): Promise<Array<PostID>>;
function getPost(id: number): Promise<Post>;
function getComments(id: number): Promise<Array<PostComment>>;
function savePostWithComments(post: PostWithComments): Promise<void>;
```

Seems easy enough, right?

We might start with the most straight-forward solution, where we process each Post object one-by-one:

```ts
(async function main() {
    for (let page = 1; ; page++) {
        const postsPage = await getPosts(page, PAGE_SIZE);
        for (const { id } of postsPage) {
            const post = await getPost(id);
            const comments = await getComments(id);

            const combined = {
                ...post,
                comments,
            };

            await savePostWithComments(combined);
        }
        if (postsPage.length < PAGE_SIZE) {
            break;
        }
    }
})();
```

This code is easy to read and does what we want. However, not only does it process each Post at a time, it also only schedules each I/O operation at a time. There is a clear opportunity for parallelisation.

**NOTE**: These are naive implementations. As we know, networks are not our friends and therefore this code can fail spectacularly may any of the involved request failed for any reason.

Since the `getPost` and `getComments` are the most obvious thing to parallelise, we can do just that:

```ts
(async function main() {
    for (let page = 1; ; page++) {
        const postsPage = await getPosts(page, PAGE_SIZE);
        for (const { id } of postsPage) {
            const [post, comments] = await Promise.all([getPost(id), getComments(id)]);

            const combined = {
                ...post,
                comments,
            };

            await savePostWithComments(combined);
        }
        if (postsPage.length < PAGE_SIZE) {
            break;
        }
    }
})();
```

For a single Post this is the most we can parallelise in a sequential process because there's a dependency between the steps:
1. Get the ID from the page response
2. Get the full Post data + its Comments
3. Combine the data and save it to our database

Since the Posts are completely independent from each other, we can also process more than one at the same time. We might need to be careful not to process the same Post more than once.

This is where the code stops reading so linearly:

```ts
(async function main() {
    for (let page = 1; ; page++) {
        const postsPage = await getPosts(page, PAGE_SIZE);
        const workers: Array<Promise<void>> = [];
        let postsProcessed = 0; // Can use this since runtime is single-thread so no sync needed
        for (let i = 0; i < NUM_OF_WORKERS; i++) {
            workers.push(
                (async function (startingIndex) {
                    for (
                        let j = startingIndex;
                        postsProcessed < postsPage.length && j < postsPage.length;
                        j = ++postsProcessed
                    ) {
                        const { id } = postsPage[j];
                        const [post, comments] = await Promise.all([getPost(id), getComments(id)]);

                        const combined = {
                            ...post,
                            comments,
                        };

                        await savePostWithComments(combined);
                    }
                })(i)
            );
        }
        await Promise.all(workers);
        if (postsPage.length < PAGE_SIZE) {
            break;
        }
    }
})();
```

Here we spawn `NUM_OF_WORKERS` worker processes to process Posts (i.e. schedule I/O operations and process results) at the same time. With this we can go from processing `1` Post at a time to processing `NUM_OF_WORKERS` Posts.

But now the code is harder to read, debug and test. Moreover, if we need to handle errors or other concerns, this might get unmanageable. It's also not the greatest degree of parallelism we can achieve in terms of I/O operations.

If we imagine each step as a stage in a pipeline, we can decouple them to a certain degree. The page iterator doesn't need to know anything about what happens next, only that it needs to emit Post ids. The same with the Posts and Comments aggregator, it simply needs to know that it has to retrieve both pieces of data for the received id, combine them and emit the result. This also allows us to scale each step individually, depending on our needs or downstream services limitations (i.e. rate limiting).

This is how the code might look like with Vulpix:

```ts
(async function main() {
    await workflow(async ({ launch }) => {
        const postIdsChannel = channel<PostID>(4 * NUM_OF_WORKERS);
        const postsWithCommentsChannel = channel<PostWithComments>(NUM_OF_WORKERS);

        const wg = new WaitingGroup(NUM_OF_WORKERS);
        wg.then(() => postsWithCommentsChannel.close());

        launch(async function postIdsProducerProcess() {
            for (let page = 1; ; page++) {
                const posts = await getPosts(page, PAGE_SIZE);
                for (const post of posts) {
                    await postIdsChannel.send(post);
                }
                if (posts.length < PAGE_SIZE) {
                    break;
                }
            }
            postIdsChannel.close();
        });

        for (let i = 0; i < NUM_OF_WORKERS; i++) {
            launch(async function postAndCommentsAggregatorProcess() {
                for await (const { id } of postIdsChannel) {
                    const [post, comments] = await Promise.all([getPost(id), getComments(id)]);

                    await postsWithCommentsChannel.send({
                        ...post,
                        comments,
                    });
                }
                wg.done();
            });
        }

        for (let i = 0; i < NUM_OF_WORKERS; i++) {
            launch(async function postWithCommentsSinkProcess() {
                for await (const post of postsWithCommentsChannel) {
                    await savePostWithComments(post);
                }
            });
        }
    });
})();
```

Throughput-wise, the advantage is that now we can have multiple processes for each step instead of just `NUM_OF_WORKERS` processes in total. If we compare the scenarios, the workers solution can have, at most, `2 * NUM_OF_WORKERS` I/O ops on-the-fly assuming each worker is at the Post & Comments fetching stage. With the presented Vulpix solution we can have `1 + 2 * NUM_OF_WORKERS + NUM_OF_WORKERS` I/O ops on the fly (page fetching + Post & Comments fetching + database saving). And because the whole workflow is more granual and decoupled, we can now define the number of processes for each stage depending on various factors, like how fast are the other processes producing or consuming the messages we receive/send, or if downstream services have some sort of rate limiting. This is an easy way to control the amount of I/O concurrency. We can also define a buffer capacity when creating a channel in case producers produce faster than consumers can handle. This serves as a backpressure mechanism.

### Results

We ran each of the presented cases with the same arguments in order to measure how much time it takes for each script to process every Post object. The test arguments were as follows:

* TOTAL_POSTS = 500
* PAGE_SIZE = 47
* BASE_LATENCY = 50ms
* MIN_LATENCY_INCREMENT = 0ms
* MAX_LATENCY_INCREMENT = 0ms

**NOTE**: `BASE_LATENCY`, `MIN_LATENCY_INCREMENT` and `MAX_LATENCY_INCREMENT` are a way to simulate network latency for each API call. We fixed the combination of these values at 50ms in order to avoid skewed results.

| **Benchmark #** | **# Configured Workers** | **Max Network I/O Pps On-The-Fly** | **Workflow Duration** |
|:---------------:|:------------------------:|:----------------------------------:|:---------------------:|
|        1        |             -            |                  1                 |        839348ms       |
|        2        |             -            |                  2                 |        544526ms       |
|        3        |             4            |                  4                 |        153953ms       |
|        4        |             4            |                 13                 |        67397ms        |

## Channels

TODO

## Workflow

TODO
