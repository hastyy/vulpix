import { WorkflowContext, WorkflowProcess } from './workflow-context';

async function workflow(mainProcess: WorkflowProcess) {
    const ctx = new WorkflowContext();
    try {
        await mainProcess(ctx);
    } catch (error) {
        await ctx.cancel();
        throw error;
    } finally {
        await ctx.waitForCompletion();
    }
}

export { workflow };
