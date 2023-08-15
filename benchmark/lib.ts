const TOTAL_POSTS = Number(process.env.TOTAL_POSTS);

export type Post = Pick<PostDetails, 'id'>;

export type PostDetails = {
    id: number;
    author: string;
    date: Date;
    text: string;
};

export type PostComment = {
    id: number;
    post: number;
    comment: string;
};

export type PostWithComments = PostDetails & {
    comments: Array<PostComment>;
};

export function getPosts(page: number, pageSize: number, signal?: AbortSignal): Promise<Array<Post>> {
    console.log(`Getting page ${page} with size ${pageSize}`);
    return withLatency(() => {
        return getPageIds(page, pageSize).map((id) => ({ id }));
    }, signal)();
}

export function getPostDetails(id: number, signal?: AbortSignal): Promise<PostDetails> {
    console.log(`Getting post ${id}`);
    return withLatency(() => {
        return {
            id,
            author: 'foo@bar.com',
            date: new Date(),
            text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi ultrices tempus pulvinar. Aliquam volutpat sagittis tristique. In vitae neque augue. Vestibulum nec velit vulputate, sagittis diam eu, tincidunt odio. Nam vitae malesuada risus, a sagittis nibh. Quisque dignissim maximus erat non egestas. Nam ac aliquet urna. Quisque molestie luctus interdum. Nulla consectetur odio tempor elit semper, vitae finibus dolor tristique.',
        };
    }, signal)();
}

export function getComments(id: number, signal?: AbortSignal): Promise<Array<PostComment>> {
    console.log(`Getting comments for post ${id}`);
    return withLatency(() => {
        return [
            {
                id: 1,
                post: id,
                comment: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
            },
            {
                id: 2,
                post: id,
                comment: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
            },
            {
                id: 3,
                post: id,
                comment: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
            },
        ];
    }, signal)();
}

export function savePostWithComments(post: PostWithComments, signal?: AbortSignal): Promise<void> {
    console.log(`Saving post ${post.id}`);
    return withLatency(noop, signal)();
}

function noop() {
    // no-op
}

function getPageIds(page: number, pageSize: number) {
    const initialId = (page - 1) * pageSize;
    const idUpperBound = Math.min(TOTAL_POSTS, initialId + pageSize);
    const ids: Array<number> = [];
    for (let id = initialId; id < idUpperBound; id++) {
        ids.push(id);
    }
    return ids;
}

function withLatency<F extends (...args: unknown[]) => unknown>(fn: F, signal?: AbortSignal) {
    const BASE_LATENCY = Number(process.env.BASE_LATENCY);
    const MIN_LATENCY_INCREMENT = Number(process.env.MIN_LATENCY_INCREMENT);
    const MAX_LATENCY_INCREMENT = Number(process.env.MAX_LATENCY_INCREMENT);

    return async function (...args: Parameters<F>) {
        const latency = BASE_LATENCY + randomInteger(MIN_LATENCY_INCREMENT, MAX_LATENCY_INCREMENT);
        await sleep(latency, signal);
        return fn(...args) as ReturnType<F>;
    };
}

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Canceled'));
        });
    });
}

function randomInteger(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
}
