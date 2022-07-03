import { WorkflowContext } from './workflow-context';
import { sleep } from '../util/async/sleep';

describe('WorkflowContext', () => {
    describe('when launching a process', () => {
        it('should call the process with a new context instance and return the promise reference to the process result', async () => {
            const root = new WorkflowContext();
            const spy = jest.fn();

            const ref = root.launch(async (ctx) => {
                spy(ctx);
            });

            await expect(ref).resolves.toBe(void 0);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][0]).toBeInstanceOf(WorkflowContext);
            expect(spy.mock.calls[0][0]).not.toBe(root);
        });
    });
    describe('when cancelling the context', () => {
        it('should call the registered cancellation tasks', async () => {
            const ctx = new WorkflowContext();
            const spy = jest.fn();

            ctx.onCancel(spy);

            await ctx.cancel();

            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('should not call the unregistered cancellation tasks', async () => {
            const ctx = new WorkflowContext();
            const spy1 = jest.fn();
            const spy2 = jest.fn();

            ctx.onCancel(spy1);
            ctx.onCancel(spy2);

            ctx.removeCancellationTask(spy2);

            await ctx.cancel();

            expect(spy1).toHaveBeenCalledTimes(1);
            expect(spy2).not.toHaveBeenCalled();
        });
        it('should not call the registered cancellation tasks again when cancel is called twice', async () => {
            const ctx = new WorkflowContext();
            const spy = jest.fn();

            ctx.onCancel(spy);

            await ctx.cancel();
            await ctx.cancel();

            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('should cancel child contexts as well', async () => {
            const root = new WorkflowContext();
            const child = root.spawnChild();
            const spy = jest.fn();

            child.onCancel(spy);

            await root.cancel();

            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('should cancel the parent context when bubbling up', async () => {
            const root = new WorkflowContext();
            const child = root.spawnChild();
            const spy = jest.fn();

            root.onCancel(spy);

            await child.cancel();

            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('should not cancel the parent context when not bubbling up', async () => {
            const root = new WorkflowContext();
            const child = root.spawnChild();
            const spy = jest.fn();

            root.onCancel(spy);

            await child.cancel({ bubbleUp: false });

            expect(spy).not.toHaveBeenCalled();
        });
        it('should cancel sibling contexts when bubbling up', async () => {
            const root = new WorkflowContext();
            const child1 = root.spawnChild();
            const child2 = root.spawnChild();
            const child2child1 = child2.spawnChild();
            const child2child2 = child2.spawnChild();
            const spy1 = jest.fn();
            const spy2 = jest.fn();
            const spy3 = jest.fn();

            child2.onCancel(spy1);
            child2child1.onCancel(spy2);
            child2child2.onCancel(spy3);

            await child1.cancel();

            expect(spy1).toHaveBeenCalledTimes(1);
            expect(spy2).toHaveBeenCalledTimes(1);
            expect(spy3).toHaveBeenCalledTimes(1);
        });
        it('should not cancel sibling contexts when not bubbling up', async () => {
            const root = new WorkflowContext();
            const child1 = root.spawnChild();
            const child2 = root.spawnChild();
            const child2child1 = child2.spawnChild();
            const child2child2 = child2.spawnChild();
            const spy1 = jest.fn();
            const spy2 = jest.fn();
            const spy3 = jest.fn();

            child2.onCancel(spy1);
            child2child1.onCancel(spy2);
            child2child2.onCancel(spy3);

            await child1.cancel({ bubbleUp: false });

            expect(spy1).not.toHaveBeenCalled();
            expect(spy2).not.toHaveBeenCalled();
            expect(spy3).not.toHaveBeenCalled();
        });
    });
    describe('when waiting for completion', () => {
        it('should only move forward after all launched processes and child contexts have completed', async () => {
            const ctx = new WorkflowContext();
            const child = ctx.spawnChild();

            const spy1 = jest.fn();
            const spy2 = jest.fn();

            let timestamp = 0;

            const promise1 = (async () => {
                await child.waitForCompletion();
                spy1(++timestamp);
            })();

            const promise2 = (async () => {
                await ctx.waitForCompletion();
                spy2(++timestamp);
            })();

            await expect(promise2).resolves.toBe(void 0);
            await expect(promise1).resolves.toBe(void 0);

            expect(spy1.mock.calls[0][0]).toBe(1);
            expect(spy2.mock.calls[0][0]).toBe(2);
        });
        describe('when processes throw', () => {
            it('should only throw the first error after all launched processes and child contexts have completed', async () => {
                const ctx = new WorkflowContext();
                const err1 = new Error('One');
                const err2 = new Error('Two');

                const p1 = ctx.launch(async () => {
                    await sleep(0);
                });
                const p2 = ctx.launch(async () => {
                    await sleep(0);
                    throw err1;
                });
                const p3 = ctx.launch(async () => {
                    await sleep(0);
                });
                const p4 = ctx.launch(async () => {
                    await sleep(0);
                    throw err2;
                });

                await expect(ctx.waitForCompletion()).rejects.toThrow(err1);
                expect(p1).resolves.toBe(void 0);
                expect(p2).rejects.toBe(err1);
                expect(p3).resolves.toBe(void 0);
                expect(p4).rejects.toBe(err2);
            });
        });
    });
});
