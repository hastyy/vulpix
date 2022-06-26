import fs from 'fs';
import { channel } from '../src/channel';
import { WaitingGroup } from '../src/util/async';
import { duration } from '../src/util/time';
import { workflow } from '../src/workflow';
import { getPosts, getPost, getComments, savePostWithComments, PostID, PostWithComments } from './lib';

(async function main() {
    const PAGE_SIZE = Number(process.env.PAGE_SIZE);
    const NUM_OF_WORKERS = Number(process.env.NUM_OF_WORKERS);

    const [ellapsedTimeMs] = await duration(async () =>
        workflow(async ({ launch }) => {
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
                        const getPostRequest = getPost(id);
                        const getCommentsRequest = getComments(id);
                        const [post, comments] = await Promise.all([getPostRequest, getCommentsRequest]);

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
        })
    )();

    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
    fs.appendFileSync('benchmark/results.txt', `Benchmark 4: ${ellapsedTimeMs}ms\n`);
})();
