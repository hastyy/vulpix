import { getPosts, getPostDetails, getComments, savePostWithComments, type Post } from './lib';
import { duration } from './utils';

const PAGE_SIZE = Number(process.env.PAGE_SIZE);

async function benchmark() {
    let page = 1;
    let posts: Array<Post>;
    do {
        posts = await getPosts(page, PAGE_SIZE);
        for (const { id } of posts) {
            const [post, comments] = await Promise.all([getPostDetails(id), getComments(id)]);

            const combined = {
                ...post,
                comments,
            };

            await savePostWithComments(combined);
        }
        page++;
    } while (posts.length === PAGE_SIZE);
}

(async function main() {
    const [ellapsedTimeMs] = await duration(benchmark)();
    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
})();
