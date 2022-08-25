# Vulpix

![Vulpix](https://archives.bulbagarden.net/media/upload/thumb/6/60/037Vulpix.png/200px-037Vulpix.png)

A small NodeJS library providing CSP-like channels for data exchange between application components.

## Installation

```
npm install vulpix
```

## Core Concepts

* **Channel**: message delivery pipe between two processes
* **Process**: (usually long-running) async function writing to and/or reading from channels
* **Workflow**: encapsulation of a coarse unit of work carried out by several processes

## How to Use

To get started, you can import the `channel` factory and use it to create a channel:

```ts
import { channel } from 'vulpix'

const numbers = channel<number>();
```

The channel `numbers` is of type `Channel<number>`.

After creating a channel you can use it to exchange messages between processes. Below is a quick example of how we could use the previously created channel:

### Quick Example #1

```ts
import { channel, WriteChannel, ReadChannel } from 'vulpix';

async function throttledNumberProducer(numbers: WriteChannel<number>) {
    for (let i = 0; i < 42; i++) {
        await sleep(1_000 /* milliseconds */);
        await numbers.send(i);
        
    }
    numbers.close();
}

async function numbersEchoer(numbers: ReadChannel<number>) {
    for await (const n of numbers) {
        console.log(`I have received the number ${n}!`);
    }
    console.log('No more numbers for me :(');
}

async function main() {
    const numbers = channel<number>();

    await Promise.all([
        throttledNumberProducer(numbers),
        numbersEchoer(numbers)
    ]);
}

main();
```

In this example we have two processes:

* `throttledNumberProducer` writing messages into the channel;
* `numbersEchoer` reading from the channel.

Note how `throttledNumberProducer` defines a parameter of type `WriteChannel<number>` whilst `numbersEchoer` expects a `ReadChannel<number>`. Any instance returned by the `channel` factory adheres to these interfaces. By specifying whether we intend to read from or write to a channel, we make the code more explicit. We also remove the chance of writting to and reading from the same channel, which would likely be an error on our side. **Processes writing to a channel should not read from it, and vice-versa.**

It is also a good practice to be the writer closing the channel when it's done writing. This will signal the reader(s) that there will be no more messages coming from that channel. In this sense, `WriteChannel<M>` exposes two methods:

* `send(message: M): void | Promise<void>`
* `close(): void`

On the reader side there are no explicitly exposed methods. However, `ReadChannel<M>` (and therefore `Channel<M>`) is an `AsyncIterable<M>`, meaning that we can iterate the incoming messages with a `for await (const msg of channel) {...}` loop. The body of the loop executes each time a new message arrives, and we break out of the loop when the channel is closed and there are no messages left to be received. If we ever need to break off the loop before the channel is closed, it is up to the application logic to do so.

Another thing to note is the return type of `send`, which is `void | Promise<void>`. The operation will return a Promise each time the channel cannot immediately accept the message. This is when the channel is out of buffering capacity and there are no pending readers on the other end. Because we are not sure the message can be delivered at this point, it is a good practice to call `send` with `await` as seen in the example. This means that the writing process will suspend execution until the message is accepted by the channel, so we can keep track of which messages were accepted. It is also good to suspend execution at these suspension points because are releasing the call stack and giving other processes the ooportunity to make progress.

We talked about buffering. By default, a channel returned by the `channel` factory has no buffering capacity, meaning that each writer will always receive a Promise by sending a message when there are no readers currently waiting for messages, and each reader will suspend in its loop until there are any new messages in the channel. But in specific situations where the writer might write messages quicker than the reader(s) can read, we might want to create a channel with a specific buffering capacity:

```ts
// Creates a channel with the capacity to buffer up to 10 messages
const numbers = channel<number>(10);
```

With this, even if there are no readers waiting for a new message, as long as there still is buffering capacity in the channel, it will automatically accept the message. In these cases, if you know the writer has more messages it can put in the channel, you might avoid suspending until either you run out of messages or buffer is full:

```ts
const sendOp = numbers.send(i);
if (sendOp instanceof Promise) {
    await sendOp;
}
```

It is important to know that it is safe to call `send` with `await` even when it returns `void`. This is equivalent to awaiting a resolved Promise. The writer will still suspend (release the call stack) but a new task will automatically be added to the runtime microTasks queue, meaning that the writer will resume execution as soon as we process any other Promise that might have resolved in the meantime.

A last remark to Example #1: notice the use of `Promise.all` to wrap the spawned processes. This is not required, but it is a good practice to only return out of an async function after all its spawned Promises have settled, otherwise we might have leaks in your application (memory, resources, you name it). We will see how we can handle this and other concerns with `workflow`.

A channel can be read and written to by several processes. It is usual for these processes to not know each each other.

### Quick Example #2

```ts
import { channel, WriteChannel, ReadChannel, WaitingGroup } from 'vulpix';

async function throttledNumberProducer(
    numbers: WriteChannel<number>,
    start: number,
    increment: number,
    wg: WaitingGroup
) {
    for (let i = start; i < 42; i += increment) {
        await sleep(1_000 /* milliseconds */);
        await numbers.send(i);
    }
    wg.done();
}

async function numbersEchoer(numbers: ReadChannel<number>, id: number) {
    for await (const n of numbers) {
        console.log(`Reader with id ${id} has received the number ${n}!`);
    }
    console.log(`No more numbers for reader with id ${id} :(`);
}

async function main() {
    const numbers = channel<number>();
    const processes: Array<Promise<void>> = [];
    const NUM_PRODUCERS = 4;
    const NUM_CONSUMERS = 2;

    const wg = new WaitingGroup(NUM_PRODUCERS);
    wg.then(() => numbers.close());

    for (let i = 0; i < NUM_PRODUCERS; i++) {
        processes.push(throttledNumberProducer(numbers, i, NUM_PRODUCERS, wg));
    }

    for (let i = 0; i < NUM_CONSUMERS; i++) {
        processes.push(numbersEchoer(numbers, i));
    }

    await Promise.all(processes);
}

main();
```

The writer should be the one closing the channel. But when we have multiple writers, which one should close it? Note that once a channel is closed, trying to send any message through it throws an Error. The answer is: none of the writer processes. For this we actually need a synchronization primitive: a WaitingGroup.

In the example we create `WaitingGroup` giving it the number of writer processes for the channel. After each writer is done, it should call `wg.done()` to let it know it is finished. After `NUM_PRODUCERS` call `wg.done()`, the waiting group resolves its internal promise and runs the code registered in `.then`.

**NOTE**: An instance of `WaitingGroup` is a `Thenable<T>`, meaning that it works like a Promise that can resolve but never reject. We can also use it with `await`.

When having multiple readers there is nothing new to worry about. The only thing to keep in mind are the channel guarantees:

* Each message is only delivered once, meaning that multiple readers will be competing for the messages since only one of them will receive each of the messages;
* The channel has FIFO guarantees, meaning that messages are delivered in the order that they are sent.

## Worflow

A workflow represents a unit of logic in your application involving multiple processes.

### Quick Example #3

```ts
async function throttledNumberProducer(ctx: Context, numbers: WriteChannel<number>, wg: WaitingGroup, id: number) {
    const UNLUCKY_NUMBER = 13;
    ctx.onCancel(() => wg.done());
    while (true) {
        await sleep(1_000 /* milliseconds */);
        const n = randomNumber(0, 42);
        console.log(`Producer ${id} drew number ${n}`);
        if (n === UNLUCKY_NUMBER) {
            ctx.cancel({ bubbleUp: true });
            break;
        }
        try {
            await numbers.send(n); // might interrupt if blocked and channel closes
            console.log(`Producer ${id} produced number ${n}`);
        } catch (e /* ChannelClosedException */) {
            break;
        }
    }
    console.log(`Producer ${id} is done`);
}

async function numbersEchoer(ctx: Context, numbers: ReadChannel<number>, id: number) {
    for await (const n of numbers) {
        console.log(`Reader ${id} has received the number ${n}!`);
    }
    console.log(`No more numbers for reader with id ${id} :(`);
}

async function main() {
    const NUM_PRODUCERS = 4;
    const NUM_CONSUMERS = 2;

    await workflow(async (ctx) => {
        const numbers = channel<number>();

        const wg = new WaitingGroup(NUM_PRODUCERS);
        wg.then(() => numbers.close());

        for (let i = 0; i < NUM_PRODUCERS; i++) {
            ctx.launch((ctx) => throttledNumberProducer(ctx, numbers, wg, i));
        }

        for (let i = 0; i < NUM_CONSUMERS; i++) {
            ctx.launch((ctx) => numbersEchoer(ctx, numbers, i));
        }
    });
    
    console.log('After workflow is finished');
}

main();
```

## Utilities

TODO

## Why

Given that NodeJS is a single-threaded runtime, channels - usually seen as a synchronization primitive for concurrent systems - might seem unnecessary at best. However, it is very suitable for I/O (filesystem, networking) intensive workflows. Even though we can do all kinds of I/O through NodeJS, the actual I/O happens away from our application code: what our code actually does is schedule the work and register more code to run when the results are available. This kind of code is very fast to execute and hardly ever clogs the call stack. On the other hand, NodeJS can handle lots and lots of I/O at the same time, queuing the results to be consumed by our application as soon as these are available.

With the advent of async/await, writing code that reads synchronously but executes asynchronously (meaning that it suspends execution when it can't move forward without a result that hasn't arrived yet, and resumes later when it arrives, releasing the call stack for other subroutine to execute in the meantime) became a standard. This is great because now we can write easier to understand, procedural code, without giving up on the advantages of asynchronous, non-blocking code. However, when writting this kind of code we tend to miss opportunities to parallelise I/O. This means that we might not reach the optimal throughput for our applications.

The paradigm that Vulpix brings forward encourages the segregation of more granular components in a data processing pipeline. These components (called processes from here on) communicate with each other by messages sent through channels. Each process might schedule several I/O operations on its own and should only take the call stack to forward results or schedule new I/O, so that it does not starve the other processes. This means that even with lots of processes, each one should get the chance to make progress every now and then. (Note that this is already the paradigm used in NodeJS -- if you have a CPU-intensive use-case you might want to look into other runtimes or solutions)

Process granularity helps increasing the number of I/O operations an application can be doing at a single point in time. Moreover, it enables more granular and testable components, as well as many other patterns that are harder to achieve under the conventional paradigm.

But enough with the chit-chat, let's look at an example and the observed results.

### Benchmarks

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

| **Benchmark #** | **# Configured Workers** | **Max Network I/O Ops On-The-Fly** | **Workflow Duration** |
|:---------------:|:------------------------:|:----------------------------------:|:---------------------:|
|        1        |             -            |                  1                 |        839348ms       |
|        2        |             -            |                  2                 |        544526ms       |
|        3        |             4            |                  8                 |        153953ms       |
|        4        |             4            |                 13                 |        67397ms        |

