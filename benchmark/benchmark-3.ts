import { getPosts, getPostDetails, getComments, savePostWithComments, type Post } from './lib';
import { duration } from './utils';

const PAGE_SIZE = Number(process.env.PAGE_SIZE);
const PARALLELISM = Number(process.env.PARALLELISM);

async function processPost({ id }: Post) {
    const [post, comments] = await Promise.all([getPostDetails(id), getComments(id)]);

    const combined = {
        ...post,
        comments,
    };

    await savePostWithComments(combined);
}

async function benchmark() {
    let page = 1;
    let posts: Array<Post>;
    do {
        posts = await getPosts(page, PAGE_SIZE);
        let processedPosts = 0;
        while (processedPosts < posts.length) {
            const remaining = posts.length - processedPosts;
            const postsToProcess = posts.slice(processedPosts, processedPosts + Math.min(PARALLELISM, remaining));
            await Promise.all(postsToProcess.map(processPost));
            processedPosts += Math.min(PARALLELISM, remaining);
        }
        page++;
    } while (posts.length === PAGE_SIZE);
}

(async function main() {
    const [ellapsedTimeMs] = await duration(benchmark)();
    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
})();
