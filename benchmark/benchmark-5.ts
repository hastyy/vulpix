import { channel, type Context, type WaitGroup, type SendChannel, type ReceiveChannel, workflow } from '../src';
import { getPosts, getPostDetails, getComments, savePostWithComments, type Post, type PostWithComments } from './lib';
import { duration } from './utils';

const PAGE_SIZE = Number(process.env.PAGE_SIZE);
const NUM_OF_POST_PRODUCERS = Number(process.env.NUM_OF_POST_PRODUCERS);
const NUM_OF_POST_COMMENTS_AGGREGATORS = Number(process.env.NUM_OF_POST_COMMENTS_AGGREGATORS);
const NUM_OF_POST_COMMENTS_SAVERS = Number(process.env.NUM_OF_POST_COMMENTS_SAVERS);

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
            const result = await $posts.send(post);
            if (!result.ok) {
                break;
            }
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
        const result = await $postsWithComments.send({
            ...postDetails,
            comments,
        });
        if (!result.ok) {
            break;
        }
    }
    doneSignal.done();
}

async function postWithCommentsSaver(ctx: Context, $postsWithComments: ReceiveChannel<PostWithComments>) {
    for await (const postWithComments of $postsWithComments) {
        await savePostWithComments(postWithComments);
    }
}

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

async function benchmark() {
    await workflow(setup);
}

(async function main() {
    const [ellapsedTimeMs] = await duration(benchmark)();
    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
})();
