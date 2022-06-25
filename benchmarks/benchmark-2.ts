import fs from 'fs';
import { duration } from './../src/util/time';
import { getPosts, getPost, getComments, savePostWithComments } from './lib';

(async function main() {
    const PAGE_SIZE = Number(process.env.PAGE_SIZE);

    const [ellapsedTimeMs] = await duration(async () => {
        for (let page = 1; ; page++) {
            const postsPage = await getPosts(page, PAGE_SIZE);
            for (const entry of postsPage) {
                const [post, comments] = await Promise.all([getPost(entry.id), getComments(entry.id)]);

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

    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
    fs.appendFileSync('results.txt', `Benchmark 2: ${ellapsedTimeMs}ms\n`);
})();
