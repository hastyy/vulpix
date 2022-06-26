import fs from 'fs';
import { duration } from '../src/util/time';
import { getPosts, getPost, getComments, savePostWithComments } from './lib';

(async function main() {
    const PAGE_SIZE = Number(process.env.PAGE_SIZE);
    const NUM_OF_WORKERS = Number(process.env.NUM_OF_WORKERS);

    const [ellapsedTimeMs] = await duration(async () => {
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

    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
    fs.appendFileSync('benchmark/results.txt', `Benchmark 3: ${ellapsedTimeMs}ms\n`);
})();
