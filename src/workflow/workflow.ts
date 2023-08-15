/* eslint-disable no-unsafe-finally */

import { Result } from '../result';
import { type Context, WorkflowContext } from './context';

interface WorkflowSetup {
    (ctx: Context): void;
}

type WorkflowOptions = {
    signal: AbortSignal;
};

async function workflow(setup: WorkflowSetup, options: Partial<WorkflowOptions> = {}): Promise<Result<void>> {
    if (options.signal?.aborted) {
        return Result.error(options.signal.reason);
    }
    const rootCtx = new WorkflowContext();
    const abortEventListener = () => {
        const errorOptions = options.signal?.reason instanceof Error ? { error: options.signal.reason } : {};
        rootCtx.cancel(errorOptions);
    };
    options.signal?.addEventListener('abort', abortEventListener, { once: true });
    try {
        setup(rootCtx);
    } catch (err) {
        if (err instanceof Error) {
            return Result.error(err);
        }
        throw err;
    } finally {
        try {
            await rootCtx.waitForCompletion();
        } catch (err) {
            if (err instanceof Error) {
                // Might never hit this branch since all Error objects thrown from
                // routines are wrapped in ctx cancelation.
                return Result.error(err);
            }
            throw err;
        } finally {
            options.signal?.removeEventListener('abort', abortEventListener);
        }
    }
    return rootCtx.hasError() ? Result.error(rootCtx.getError()) : Result.ok();
}

export { workflow };
