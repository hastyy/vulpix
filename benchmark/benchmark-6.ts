import { WaitGroup, waitGroup } from '../src';
import { getPosts, getPostDetails, getComments, savePostWithComments, type Post } from './lib';
import { duration } from './utils';
import { Duplex } from 'stream';

const PAGE_SIZE = Number(process.env.PAGE_SIZE);
const NUM_OF_POST_PRODUCERS = Number(process.env.NUM_OF_POST_PRODUCERS);
const NUM_OF_POST_COMMENTS_AGGREGATORS = Number(process.env.NUM_OF_POST_COMMENTS_AGGREGATORS);
const NUM_OF_POST_COMMENTS_SAVERS = Number(process.env.NUM_OF_POST_COMMENTS_SAVERS);

const startWaitGroup = waitGroup(
    NUM_OF_POST_PRODUCERS + NUM_OF_POST_COMMENTS_AGGREGATORS + NUM_OF_POST_COMMENTS_SAVERS
);

class ObjectStream extends Duplex {
    constructor() {
        super({
            objectMode: true,
        });
    }
    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
        this.push(chunk);
        callback();
    }

    _read(size: number): void {
        // empty
    }

    _final(callback: (error?: Error | null | undefined) => void): void {
        callback();
    }
}

async function postProducer(
    $posts: ObjectStream,
    startingPage = 1,
    pageIncrement = 1,
    doneSignal: WaitGroup.DoneSignal
) {
    await startWaitGroup.wait();
    let page = startingPage;
    let posts: Array<Post>;
    do {
        posts = await getPosts(page, PAGE_SIZE);
        for (const post of posts) {
            $posts.write(post);
        }
        page += pageIncrement;
    } while (posts.length === PAGE_SIZE);
    //$posts.push(null);
    doneSignal.done();
}

async function postCommentsAggregator(
    $posts: ObjectStream,
    $postsWithComments: ObjectStream,
    doneSignal: WaitGroup.DoneSignal
) {
    await startWaitGroup.wait();
    for await (const { id } of $posts) {
        const [postDetails, comments] = await Promise.all([getPostDetails(id), getComments(id)]);
        $postsWithComments.write({
            ...postDetails,
            comments,
        });
    }
    doneSignal.done();
}

async function postWithCommentsSaver($postsWithComments: ObjectStream) {
    await startWaitGroup.wait();
    for await (const postWithComments of $postsWithComments) {
        await savePostWithComments(postWithComments);
    }
}

async function benchmark() {
    const promises: Array<Promise<void>> = [];

    const $posts = new ObjectStream();
    const $postsWithComments = new ObjectStream();

    const postsWaitGroup = waitGroup(NUM_OF_POST_PRODUCERS);
    const postsWithCommentsWaitGroup = waitGroup(NUM_OF_POST_COMMENTS_AGGREGATORS);

    postsWaitGroup.wait().then(() => $posts.push(null));
    postsWithCommentsWaitGroup.wait().then(() => $postsWithComments.push(null));

    for (let i = 0; i < NUM_OF_POST_PRODUCERS; i++) {
        promises.push(postProducer($posts, i + 1, NUM_OF_POST_PRODUCERS, postsWaitGroup.signal));
        startWaitGroup.signal.done();
    }

    let readStreams: Array<ObjectStream> = [];
    for (let i = 0; i < NUM_OF_POST_COMMENTS_AGGREGATORS; i++) {
        const $readStream = new ObjectStream();
        readStreams.push($readStream);
        promises.push(postCommentsAggregator($readStream, $postsWithComments, postsWithCommentsWaitGroup.signal));
        startWaitGroup.signal.done();
    }
    // Distribute main stream objects through receiver read streams
    promises.push(
        (async (readStreams: Array<ObjectStream>) => {
            let i = 0;
            $posts.on('end', () => {
                readStreams.forEach((stream) => stream.push(null));
            });
            for await (const obj of $posts) {
                readStreams[i++ % readStreams.length].write(obj);
            }
        })([...readStreams])
    );

    readStreams = [];
    for (let i = 0; i < NUM_OF_POST_COMMENTS_SAVERS; i++) {
        const $readStream = new ObjectStream();
        readStreams.push($readStream);
        promises.push(postWithCommentsSaver($readStream));
        startWaitGroup.signal.done();
    }
    // Distribute main stream objects through receiver read streams
    promises.push(
        (async (readStreams: Array<ObjectStream>) => {
            let i = 0;
            $postsWithComments.on('end', () => {
                readStreams.forEach((stream) => stream.push(null));
            });
            for await (const obj of $postsWithComments) {
                readStreams[i++ % readStreams.length].write(obj);
            }
        })([...readStreams])
    );

    await Promise.all(promises);
}

(async function main() {
    const [ellapsedTimeMs] = await duration(benchmark)();
    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
})();
