import fs from 'fs';
import { duration } from './../src/util/time';
import { getPosts, getPost, getComments, savePostWithComments } from './lib';

(async function main() {
    const PAGE_SIZE = Number(process.env.PAGE_SIZE);

    const [ellapsedTimeMs] = await duration(async () => {
        for (let page = 1; ; page++) {
            const postsPage = await getPosts(page, PAGE_SIZE);
            for (const entry of postsPage) {
                const post = await getPost(entry.id);
                const comments = await getComments(entry.id);

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
    fs.appendFileSync('results.txt', `Benchmark 1: ${ellapsedTimeMs}ms\n`);
})();
