import { sleep } from '../util/async/sleep';
import { workflow } from './workflow';

describe('workflow', () => {
    it('should wait for all processes to complete before returning', async () => {
        const spy = jest.fn();
        const wf = workflow((ctx) => {
            ctx.launch(async () => {
                await sleep(0);
                spy();
            });
            ctx.launch(async () => {
                await sleep(0);
                throw new Error();
            });
            ctx.launch(async () => {
                await sleep(0);
                spy();
            });
        });

        await expect(wf).rejects.toThrowError();
        expect(spy).toHaveBeenCalledTimes(2);
    });
    describe('when it throws from the callback', () => {
        it('should throw that error', async () => {
            const error = new Error('From callback');
            const wf = workflow((ctx) => {
                ctx.launch(() => sleep(0));
                ctx.launch(() => sleep(0));
                throw error;
            });

            await expect(wf).rejects.toThrow(error);
        });
        it('should cancel the context', async () => {
            const error = new Error('From callback');
            const spy = jest.fn();
            const wf = workflow((ctx) => {
                ctx.onCancel(spy);
                ctx.launch(() => sleep(0));
                ctx.launch(() => sleep(0));
                throw error;
            });

            await expect(wf).rejects.toThrow(error);
            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('should wait for all processes to complete', async () => {
            const error = new Error('From callback');
            const processes: Array<Promise<void>> = [];
            const wf = workflow((ctx) => {
                processes.push(ctx.launch(() => sleep(0)));
                processes.push(ctx.launch(() => sleep(0)));
                throw error;
            });

            await expect(wf).rejects.toThrow(error);
            for (const process of processes) {
                expect(process).resolves.toBe(void 0);
            }
        });
    });
    describe('when it throws from an initialized process', () => {
        it('should throw that error', async () => {
            const error = new Error('From callback');
            const wf = workflow((ctx) => {
                ctx.launch(async () => {
                    await sleep(0);
                    throw error;
                });
                ctx.launch(() => sleep(0));
            });

            await expect(wf).rejects.toThrow(error);
        });
        it('should cancel the context', async () => {
            const error = new Error('From callback');
            const spy = jest.fn();
            const wf = workflow((ctx) => {
                ctx.onCancel(spy);
                ctx.launch(async () => {
                    await sleep(0);
                    throw error;
                });
                ctx.launch(() => sleep(0));
            });

            await expect(wf).rejects.toThrow(error);
            expect(spy).toHaveBeenCalledTimes(1);
        });
        it('should wait for all processes to complete', async () => {
            const error = new Error('From callback');
            const processes: Array<Promise<void>> = [];
            const wf = workflow((ctx) => {
                processes.push(
                    ctx.launch(async () => {
                        await sleep(0);
                        throw error;
                    })
                );
                processes.push(ctx.launch(() => sleep(0)));
            });

            await expect(wf).rejects.toThrow(error);
            expect(processes[0]).rejects.toThrow(error);
            expect(processes[1]).resolves.toBe(void 0);
        });
        it('should throw the 1st error even when it throws from more than one process', async () => {
            const error = new Error('From callback');
            const wf = workflow((ctx) => {
                ctx.launch(async () => {
                    await sleep(0);
                    throw error; // always throws 1st
                });
                ctx.launch(async () => {
                    await sleep(0);
                    throw new Error('Other error'); // always throws after the other process
                });
            });

            await expect(wf).rejects.toThrow(error);
        });
    });
});
