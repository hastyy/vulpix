/* eslint-disable @typescript-eslint/no-explicit-any */

export type Post = {
    id: number;
    author: string;
    date: Date;
    text: string;
};

export type PostID = Pick<Post, 'id'>;

export type PostComment = {
    id: number;
    post: number;
    comment: string;
};

export type PostWithComments = Post & {
    comments: Array<PostComment>;
};

export function getPosts(page: number, pageSize: number): Promise<Array<PostID>> {
    console.log(`Getting page ${page} with size ${pageSize}`);
    return withLatency(async () => {
        const TOTAL_POSTS = Number(process.env.TOTAL_POSTS);
        const results: Array<PostID> = [];

        for (let start = (page - 1) * pageSize, i = start; i < TOTAL_POSTS && i < start + pageSize; i++) {
            results.push({
                id: i,
            });
        }

        return results;
    })();
}

export function getPost(id: number): Promise<Post> {
    console.log(`Getting post ${id}`);
    return withLatency(async () => {
        return {
            id,
            author: 'foo@bar.com',
            date: new Date(),
            text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi ultrices tempus pulvinar. Aliquam volutpat sagittis tristique. In vitae neque augue. Vestibulum nec velit vulputate, sagittis diam eu, tincidunt odio. Nam vitae malesuada risus, a sagittis nibh. Quisque dignissim maximus erat non egestas. Nam ac aliquet urna. Quisque molestie luctus interdum. Nulla consectetur odio tempor elit semper, vitae finibus dolor tristique.',
        };
    })();
}

export function getComments(id: number): Promise<Array<PostComment>> {
    console.log(`Getting comments for post ${id}`);
    return withLatency(async () => {
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
    })();
}

export function savePostWithComments(post: PostWithComments): Promise<void> {
    console.log(`Saving post ${post.id}`);
    return withLatency(async () => {
        post; // no_op
    })();
}

// -----------

function withLatency<AsyncTask extends (...args: any[]) => Promise<any>>(task: AsyncTask): AsyncTask {
    const BASE_LATENCY = Number(process.env.BASE_LATENCY);
    const MIN_LATENCY_INCREMENT = Number(process.env.MIN_LATENCY_INCREMENT);
    const MAX_LATENCY_INCREMENT = Number(process.env.MAX_LATENCY_INCREMENT);

    return async function (...args: any[]) {
        const latency = BASE_LATENCY + randomNumber(MIN_LATENCY_INCREMENT, MAX_LATENCY_INCREMENT);
        await sleep(latency);
        return await task(...args);
    } as AsyncTask;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
}
