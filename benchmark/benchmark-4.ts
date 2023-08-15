import { getPosts, getPostDetails, getComments, savePostWithComments, type Post } from './lib';
import { duration } from './utils';

const PAGE_SIZE = Number(process.env.PAGE_SIZE);
const PARALLELISM = Number(process.env.PARALLELISM);

function createSemaphore(concurrency: number) {
    const waitQueue: Array<() => void> = [];
    let count = 0;

    function acquire() {
        if (count < concurrency) {
            count++;
            return Promise.resolve();
        }
        return new Promise<void>((resolve) =>
            waitQueue.push(() => {
                count++;
                resolve();
            })
        );
    }

    function release() {
        count--;
        if (waitQueue.length > 0) {
            const resolve = waitQueue.shift();
            resolve!();
        }
    }

    return { acquire, release };
}

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
    const semaphore = createSemaphore(PARALLELISM);
    do {
        posts = await getPosts(page, PAGE_SIZE);
        await Promise.all(
            posts.map(async (post) => {
                await semaphore.acquire();
                await processPost(post);
                semaphore.release();
            })
        );
        page++;
    } while (posts.length === PAGE_SIZE);
}

(async function main() {
    const [ellapsedTimeMs] = await duration(benchmark)();
    console.log(`Whole process took ${ellapsedTimeMs}ms to run.`);
})();
