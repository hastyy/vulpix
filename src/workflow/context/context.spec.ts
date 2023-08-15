import { setTimeout } from 'timers/promises';
import { DeferredPromise } from '../../async/deferred-promise';
import { type Context, WorkflowContext, ContextCancelationError } from './context';
import assert from 'assert';
import { channel } from '../../channel';
import { isPromise } from '../../util';

describe('WorkflowContext', () => {
    it('should properly launch a routine', async () => {
        const rootCtx = new WorkflowContext();
        const deferred = new DeferredPromise<void>();
        const routine = rootCtx.launch((ctx, n) => {
            expect(ctx).not.toBe(rootCtx);
            expect(n).toBe(1);
            return deferred;
        }, 1);
        expect(routine).toBeInstanceOf(Promise);
        await expect(withTimeout(rootCtx.waitForCompletion(), 50)).rejects.toThrow('Timed out');
        deferred.resolve();
        await rootCtx.waitForCompletion();
    });
    it('should add a cancelation event listener', () => {
        const ctx = new WorkflowContext();
        const spy = jest.fn();
        const listener = ctx.addCancelationEventListener(spy);
        expect(listener).toBe(spy);
        ctx.cancel();
        expect(spy).toHaveBeenCalledTimes(1);
    });
    it('should remove a cancelation event listener', () => {
        const ctx = new WorkflowContext();
        const spy = jest.fn();
        const listener = ctx.addCancelationEventListener(spy);
        ctx.removeCancelationEventListener(listener);
        ctx.cancel();
        expect(spy).not.toHaveBeenCalled();
    });
    it('should wait for the whole context hierarchy to complete', async () => {
        const rootCtx = new WorkflowContext();
        const resolvedQueue: Array<Context> = [];
        const expectedOrderQueue: Array<Context> = [];
        expectedOrderQueue[3] = rootCtx;
        rootCtx.launch(async (ctx) => {
            expectedOrderQueue[2] = ctx;
            ctx.launch(async (ctx) => {
                expectedOrderQueue[1] = ctx;
                await setTimeout(20);
            });
            await setTimeout(10);
        });
        rootCtx.launch(async (ctx) => {
            expectedOrderQueue[0] = ctx;
            await setTimeout(10);
        });
        const ctxCompletions = expectedOrderQueue.map((ctx) =>
            (ctx as WorkflowContext).waitForCompletion().then(() => resolvedQueue.push(ctx))
        );
        await Promise.all(ctxCompletions);
        for (let i = 0; i < resolvedQueue.length; i++) {
            expect(resolvedQueue[i]).toBe(expectedOrderQueue[i]);
        }
    });
    describe('cancelation', () => {
        it('should cancel all contexts down the hierarchy', async () => {
            const rootCtx = new WorkflowContext();
            const rootSpy = jest.fn();
            rootCtx.addCancelationEventListener(rootSpy);

            const child_1_spy = jest.fn();
            const child_1_1_spy = jest.fn();
            rootCtx.launch(async (ctx) => {
                ctx.addCancelationEventListener(child_1_spy);
                ctx.launch(async (ctx) => {
                    ctx.addCancelationEventListener(child_1_1_spy);
                });
            });

            const child_2_spy = jest.fn();
            rootCtx.launch(async (ctx) => {
                ctx.addCancelationEventListener(child_2_spy);
            });

            rootCtx.cancel();
            await rootCtx.waitForCompletion();

            expect(rootSpy).toHaveBeenCalledTimes(1);
            expect(child_1_spy).toHaveBeenCalledTimes(1);
            expect(child_1_1_spy).toHaveBeenCalledTimes(1);
            expect(child_2_spy).toHaveBeenCalledTimes(1);
        });
        it('should cancel all contexts up the hierarchy (parent relationship)', async () => {
            const rootCtx = new WorkflowContext();
            const rootSpy = jest.fn();
            const child_1_spy = jest.fn();
            const child_1_1_spy = jest.fn();
            rootCtx.addCancelationEventListener(rootSpy);
            rootCtx.launch(async (ctx) => {
                ctx.addCancelationEventListener(child_1_spy);
                ctx.launch(async (ctx) => {
                    ctx.addCancelationEventListener(child_1_1_spy);
                    await setTimeout(10);
                    ctx.cancel();
                });
            });
            await rootCtx.waitForCompletion();
            expect(rootSpy).toHaveBeenCalledTimes(1);
            expect(child_1_spy).toHaveBeenCalledTimes(1);
            expect(child_1_1_spy).toHaveBeenCalledTimes(1);
        });
        it('should cancel with an error and have the error available at the root', async () => {
            const rootCtx = new WorkflowContext();
            const error = new Error('Canceled from child_1_1');
            rootCtx.launch(async (ctx) => {
                ctx.launch(async (ctx) => {
                    await setTimeout(10);
                    ctx.cancel({ error });
                });
            });
            await rootCtx.waitForCompletion();
            assert(rootCtx.hasError());
            expect(rootCtx.getError()).toBe(error);
        });
        it('should only cancel once (idempotency)', () => {
            const ctx = new WorkflowContext();
            const spy = jest.fn();
            ctx.addCancelationEventListener(spy);
            ctx.cancel();
            ctx.cancel();
            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('should abort the outgoing I/O operation in a routine when context is canceled', async () => {
            const rootCtx = new WorkflowContext();
            const moreThanEnoughTimeForTestToTimeout = 1_000_000;
            rootCtx.launch(async (ctx) => {
                const abortController = new AbortController();
                const { signal } = abortController;
                await ctx.withCancelation(
                    setTimeout(moreThanEnoughTimeForTestToTimeout, void 0, { signal }),
                    abortController
                );
            });
            rootCtx.cancel(); // Hint: remove this line to see the test block
            await rootCtx.waitForCompletion();
            assert(rootCtx.hasError());
            expect(rootCtx.getError()).toBeInstanceOf(ContextCancelationError);
        });
        it('should finish the async iteration over an async iterable when context is canceled', async () => {
            const rootCtx = new WorkflowContext();
            const $channel = channel<number>();
            rootCtx.launch(async (ctx) => {
                /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
                for await (const _ of ctx.withCancelation($channel)) {
                    // never enters the body, could wait forever for values to come in
                }
            });
            rootCtx.cancel(); // Hint: remove this line to see the test block
            await rootCtx.waitForCompletion();
            $channel.close();
            assert(rootCtx.hasError());
            expect(rootCtx.getError()).toBeInstanceOf(ContextCancelationError);
        });
        it('should catch any unexpected error coming from the launched routine and cancel the context hierarchy down below', async () => {
            const rootCtx = new WorkflowContext();
            const child_1_spy_success = jest.fn();
            const child_1_1_spy_success = jest.fn();
            const child_2_spy_success = jest.fn();
            const root_spy_failure = jest.fn();
            const child_1_spy_failure = jest.fn();
            const child_1_1_spy_failure = jest.fn();
            const child_2_spy_failure = jest.fn();
            const error = new Error('Simulated unexpected error');

            rootCtx.addCancelationEventListener(root_spy_failure);

            rootCtx.launchWithCancelationOptions(
                async (ctx) => {
                    ctx.addCancelationEventListener(child_1_spy_failure);
                    ctx.launch(async (ctx) => {
                        ctx.addCancelationEventListener(child_1_1_spy_failure);
                        const abortController = new AbortController();
                        const { signal } = abortController;
                        await ctx.withCancelation(setTimeout(20, void 0, { signal }), abortController);
                        child_1_1_spy_success();
                    });
                    await setTimeout(10);
                    if (Math.random() < 2) {
                        // always true
                        throw error;
                    }
                    child_1_spy_success();
                },
                { bubbleUp: false }
            );

            rootCtx.launch(async (ctx) => {
                ctx.addCancelationEventListener(child_2_spy_failure);
                await setTimeout(10);
                child_2_spy_success();
            });

            await rootCtx.waitForCompletion();

            assert(!rootCtx.hasError());
            expect(child_1_spy_success).not.toHaveBeenCalled();
            expect(child_1_1_spy_success).not.toHaveBeenCalled();
            expect(child_2_spy_success).toHaveBeenCalledTimes(1);
            expect(root_spy_failure).not.toHaveBeenCalled();
            expect(child_1_spy_failure).toHaveBeenCalledTimes(1);
            expect(child_1_1_spy_failure).toHaveBeenCalledTimes(1);
            expect(child_2_spy_failure).not.toHaveBeenCalled();
        });
        it('should catch any unexpected error coming from the launched routine and cancel the whole context hierarchy when we launch with bubbleUp option', async () => {
            const rootCtx = new WorkflowContext();
            const child_1_spy_success = jest.fn();
            const child_1_1_spy_success = jest.fn();
            const child_2_spy_success = jest.fn();
            const root_spy_failure = jest.fn();
            const child_1_spy_failure = jest.fn();
            const child_1_1_spy_failure = jest.fn();
            const child_2_spy_failure = jest.fn();
            const error = new Error('Simulated unexpected error');

            rootCtx.addCancelationEventListener(root_spy_failure);

            rootCtx.launchWithCancelationOptions(
                async (ctx) => {
                    ctx.addCancelationEventListener(child_1_spy_failure);
                    ctx.launch(async (ctx) => {
                        ctx.addCancelationEventListener(child_1_1_spy_failure);
                        const abortController = new AbortController();
                        const { signal } = abortController;
                        await ctx.withCancelation(setTimeout(20, void 0, { signal }), abortController);
                        child_1_1_spy_success();
                    });
                    await setTimeout(10);
                    if (Math.random() < 2) {
                        // always true
                        throw error;
                    }
                    child_1_spy_success();
                },
                { bubbleUp: true }
            );

            rootCtx.launch(async (ctx) => {
                ctx.addCancelationEventListener(child_2_spy_failure);
                const abortController = new AbortController();
                const { signal } = abortController;
                await ctx.withCancelation(setTimeout(20, void 0, { signal }), abortController);
                child_2_spy_success();
            });

            await rootCtx.waitForCompletion();

            assert(rootCtx.hasError());
            expect(rootCtx.getError()).toBe(error);
            expect(child_1_spy_success).not.toHaveBeenCalled();
            expect(child_1_1_spy_success).not.toHaveBeenCalled();
            expect(child_2_spy_success).not.toHaveBeenCalled();
            expect(root_spy_failure).toHaveBeenCalledTimes(1);
            expect(child_1_spy_failure).toHaveBeenCalledTimes(1);
            expect(child_1_1_spy_failure).toHaveBeenCalledTimes(1);
            expect(child_2_spy_failure).toHaveBeenCalledTimes(1);
        });
    });
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>;
function withTimeout<T>(asyncFn: () => Promise<T>, ms: number): Promise<T>;
async function withTimeout<T>(promiseOrAsyncFn: Promise<T> | (() => Promise<T>), ms: number): Promise<T> {
    const promise = typeof promiseOrAsyncFn === 'function' ? promiseOrAsyncFn() : promiseOrAsyncFn;
    if (!isPromise(promise)) {
        throw new Error('Timeout should receive a Promise or a function that returns a Promise');
    }
    const abortController = new AbortController();
    const { signal } = abortController;
    const timeoutResult = Symbol('timeout');
    const result = await Promise.race([promise, setTimeout(ms, timeoutResult, { signal })]);
    if (result === timeoutResult) {
        throw new Error('Timed out');
    }
    abortController.abort(); // cleanup timer
    return result;
}
