/* eslint-disable no-constant-condition */
import { channel, Context, ReadChannel, WaitingGroup, workflow, WriteChannel } from '../src';

// async function throttledNumberProducer(ctx: Context, numbers: WriteChannel<number>, wg: WaitingGroup, id: number) {
//     const UNLUCKY_NUMBER = 13;
//     let cancelled = false;
//     ctx.onCancel(() => {
//         cancelled = true;
//     });
//     while (!cancelled) {
//         const n = randomNumber(0, 42);
//         console.log(`Producer ${id} drew number ${n}`);
//         if (n === UNLUCKY_NUMBER) {
//             ctx.cancel({ bubbleUp: true });
//         } else {
//             await sleep(1_000 /* milliseconds */);
//             await numbers.send(n);
//             console.log(`Producer ${id} produced number ${n}`);
//         }
//     }
//     wg.done();
//     console.log(`Producer ${id} is done`);
// }

async function throttledNumberProducer(ctx: Context, numbers: WriteChannel<number>, wg: WaitingGroup, id: number) {
    const UNLUCKY_NUMBER = 13;
    ctx.onCancel(() => wg.done());
    while (true) {
        await sleep(1_000 /* milliseconds */);
        const n = randomNumber(0, 42);
        console.log(`Producer ${id} drew number ${n}`);
        if (n === UNLUCKY_NUMBER) {
            ctx.cancel({ bubbleUp: true });
            break;
        }
        try {
            await numbers.send(n); // might interrupt if blocked and channel closes
            console.log(`Producer ${id} produced number ${n}`);
        } catch (e /* ChannelClosedException */) {
            break;
        }
    }
    console.log(`Producer ${id} is done`);
}

async function numbersEchoer(ctx: Context, numbers: ReadChannel<number>, id: number) {
    for await (const n of numbers) {
        console.log(`Reader ${id} has received the number ${n}!`);
    }
    console.log(`No more numbers for reader with id ${id} :(`);
}

async function main() {
    const NUM_PRODUCERS = 4;
    const NUM_CONSUMERS = 2;

    await workflow(async (ctx) => {
        const numbers = channel<number>();

        const wg = new WaitingGroup(NUM_PRODUCERS);
        wg.then(() => numbers.close());

        for (let i = 0; i < NUM_PRODUCERS; i++) {
            ctx.launch((ctx) => throttledNumberProducer(ctx, numbers, wg, i));
        }

        for (let i = 0; i < NUM_CONSUMERS; i++) {
            ctx.launch((ctx) => numbersEchoer(ctx, numbers, i));
        }
    });

    console.log('After workflow is finished');
}

main();

// -------

function randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min);
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
