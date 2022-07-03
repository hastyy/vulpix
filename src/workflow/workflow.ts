import { Context, WorkflowContext } from './workflow-context';

interface WorkflowCallback {
    (ctx: Context): void | Promise<void>;
}

async function workflow(cb: WorkflowCallback) {
    const ctx = new WorkflowContext();
    let error: Error | null = null;
    try {
        await cb(ctx);
    } catch (e) {
        await ctx.cancel();
        error = e as Error;
    } finally {
        try {
            await ctx.waitForCompletion();
        } catch (e) {
            if (error === null) {
                error = e as Error;
            }
        }
    }
    if (error !== null) {
        throw error;
    }
}

export { workflow };
