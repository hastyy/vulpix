import { workflow } from './workflow';
import { StatefulPromise } from '../async/stateful-promise';
import assert from 'assert';
import { setTimeout } from 'timers/promises';

describe('workflow', () => {
    it('should wait for all routines to finish', async () => {
        const routines: Array<StatefulPromise<void>> = [];
        const result = await workflow((ctx) => {
            for (let i = 0; i < 3; i++) {
                ctx.launch(() => {
                    const promise = new StatefulPromise<void>((resolve) => {
                        global.setTimeout(resolve, i * 10 + 10);
                    });
                    routines.push(promise);
                    return promise;
                });
            }
        });
        assert(result.ok);
        for (const routine of routines) {
            expect(routine.isResolved).toBe(true);
        }
    });
    it('should immediately return an error if workflow has already been canceled', async () => {
        const abortController = new AbortController();
        const { signal } = abortController;
        const spy = jest.fn();
        const error = new Error('Aborted');
        abortController.abort(error); // abort is called even before we start the workflow
        const result = await workflow(spy, { signal });
        expect(spy).not.toHaveBeenCalled();
        assert(!result.ok);
        expect(result.error).toBe(error);
    });
    it('should return an error if one is thrown from setup', async () => {
        const spy = jest.fn();
        const error = new Error('Setup error');
        const result = await workflow(() => {
            if (Math.random() < 2) {
                throw error;
            }
            spy();
        });
        assert(!result.ok);
        expect(result.error).toBe(error);
        expect(spy).not.toHaveBeenCalled();
    });
    it('should throw if something other than an Error object is thrown from setup', async () => {
        const spy = jest.fn();
        const str = 'not an Error object';
        try {
            await workflow(() => {
                if (Math.random() < 2) {
                    throw str;
                }
                spy();
            });
        } catch (err) {
            expect(err).toBe(str);
        }
        expect(spy).not.toHaveBeenCalled();
    });
    it('should throw if something other than an Error object is thrown from a routine', async () => {
        const spy = jest.fn();
        const str = 'not an Error object';
        try {
            await workflow((ctx) => {
                ctx.launch(async () => {
                    if (Math.random() < 2) {
                        throw str;
                    }
                    spy();
                });
            });
        } catch (err) {
            expect(err).toBe(str);
        }
        expect(spy).not.toHaveBeenCalled();
    });
    it('should return an error if the context has been canceled', async () => {
        const error = new Error('Aborted');
        const spy = jest.fn();
        const abortController = new AbortController();
        const { signal } = abortController;
        global.setTimeout(() => abortController.abort(error), 10);
        const result = await workflow(
            (ctx) => {
                ctx.launch(async (ctx) => {
                    const abortController = new AbortController();
                    const { signal } = abortController;
                    await ctx.withCancelation(setTimeout(100, void 0, { signal }), abortController);
                });
                spy();
            },
            { signal }
        );
        assert(!result.ok);
        expect(result.error).toBe(error);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
