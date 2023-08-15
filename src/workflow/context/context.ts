import { DeferredPromise } from '../../async/deferred-promise';
import { multiplex } from '../../async/multiplex';
import { type Callback } from '../../auxiliary-types';
import { isPromise } from '../../util';

interface Context {
    launch<Args extends readonly unknown[]>(routine: Routine<Args>, ...args: Args): RoutineRef;
    launchWithCancelationOptions<Args extends readonly unknown[]>(
        routine: Routine<Args>,
        cancelationOptions: Partial<CancelationOptionsWithoutError>,
        ...args: Args
    ): RoutineRef;
    cancel(options?: Partial<CancelationOptions>): void;
    addCancelationEventListener(listener: CancelationEventListener): CancelationEventListener;
    removeCancelationEventListener(listener: CancelationEventListener): void;
    withCancelation<T>(iterable: AsyncIterable<T>): AsyncIterable<T>;
    withCancelation<T>(promise: Promise<T>, abortController: AbortController): Promise<T>;
}

interface ContextWithError extends WorkflowContext {
    getError(): Error;
}

type CancelationOptions = {
    bubbleUp: boolean;
    error: Error;
};

type CancelationOptionsWithoutError = Omit<CancelationOptions, 'error'>;

interface Routine<Args extends readonly unknown[]> {
    (ctx: Context, ...args: Args): Promise<void>;
}

type RoutineRef = ReturnType<Routine<unknown[]>>;

type CancelationEventListener = Callback;

class ContextCancelationError extends Error {
    constructor() {
        super('Context was canceled');
    }
}

const defaultCancelationOptions: CancelationOptions = {
    bubbleUp: true,
    error: new ContextCancelationError(),
};

/**
 * Routines are either waiting for channel writes to complete, for channel reads to complete, or for I/O ops to complete.
 * We want to cancel on these scenarios.
 * We might also want to cancel a branch without canceling the whole thing, provided that it can complete without that branch.
 * Therefore we want a ctx hierarchy instead of just a single ctx.
 *
 * Cancelation features:
 *  - idempontent cancel
 *  - register/deregister cancelation callbacks
 *  - wrap an async op with cancelable ctx (given an abort controller)
 *  - wrap an async iterable with cancelable ctx
 */
class WorkflowContext implements Context {
    private readonly parent: WorkflowContext | null;
    private readonly children: Array<WorkflowContext>;
    private readonly cancelationEventListeners: Set<CancelationEventListener>;
    private routine: RoutineRef | null;
    private error: Error | null;
    private isCanceled: boolean;

    constructor(parent: WorkflowContext | null = null) {
        this.parent = parent;
        this.children = [];
        this.cancelationEventListeners = new Set();
        this.routine = null;
        this.error = null;
        this.isCanceled = false;
    }

    launch<Args extends readonly unknown[]>(routine: Routine<Args>, ...args: Args): RoutineRef {
        return this.launchWithCancelationOptions(routine, {}, ...args);
    }

    launchWithCancelationOptions<Args extends readonly unknown[]>(
        routine: Routine<Args>,
        cancelationOptions: Partial<CancelationOptionsWithoutError>,
        ...args: Args
    ): RoutineRef {
        if (this.isCanceled) {
            throw new Error('Cannot launch a routine on a canceled Context');
        }
        const childCtx = new WorkflowContext(this);
        this.children.push(childCtx);
        const routineRef = childCtx.setRoutine(
            (async () => {
                try {
                    await routine(childCtx, ...args);
                } catch (error) {
                    if (error instanceof Error) {
                        childCtx.cancel({ ...cancelationOptions, error });
                        return;
                    }
                    childCtx.cancel(cancelationOptions);
                    throw error;
                }
            })()
        );
        return routineRef;
    }

    cancel(options: Partial<CancelationOptions> = {}): void {
        if (this.isCanceled) {
            return;
        }
        this.isCanceled = true;
        const cancelationOptions = {
            ...defaultCancelationOptions,
            ...options,
        };
        this.error = cancelationOptions.error;
        for (const childCtx of this.children) {
            childCtx.cancel({ ...cancelationOptions, bubbleUp: false });
        }
        if (cancelationOptions.bubbleUp) {
            this.parent?.cancel(cancelationOptions);
        }
        for (const listener of this.cancelationEventListeners) {
            listener();
        }
    }

    addCancelationEventListener(listener: CancelationEventListener): CancelationEventListener {
        this.cancelationEventListeners.add(listener);
        return listener;
    }

    removeCancelationEventListener(listener: CancelationEventListener): void {
        this.cancelationEventListeners.delete(listener);
    }

    withCancelation<T>(iterable: AsyncIterable<T>): AsyncIterable<T>;
    withCancelation<T>(promise: Promise<T>, abortController: AbortController): Promise<T>;
    withCancelation<T>(
        asyncConstruct: AsyncIterable<T> | Promise<T>,
        abortController?: AbortController
    ): AsyncIterable<T> | Promise<T> {
        if (isPromise(asyncConstruct)) {
            if (!abortController) {
                throw new Error(
                    'Context.withCancelation requires an AbortController as 2nd argument when 1st is a Promise'
                );
            }
            return this.promiseWithCancelation(asyncConstruct, abortController);
        }
        return this.asyncIterableWithCancelation(asyncConstruct);
    }

    private async promiseWithCancelation<T>(promise: Promise<T>, abortController: AbortController): Promise<T> {
        const requestCancelationListener = this.addCancelationEventListener(() => abortController.abort());
        try {
            const result = await promise;
            return result;
        } finally {
            this.removeCancelationEventListener(requestCancelationListener);
        }
    }

    private async *asyncIterableWithCancelation<T>(iterable: AsyncIterable<T>): AsyncIterable<T> {
        const deferred = new DeferredPromise<void>();
        const cancelationEventListener = this.addCancelationEventListener(() => deferred.resolve());
        async function* cancelSignal() {
            await deferred;
            yield void 0;
        }
        const removeCancelationEventListener = this.removeCancelationEventListener.bind(this);
        async function* consumer() {
            for await (const value of iterable) {
                yield value;
            }
            removeCancelationEventListener(cancelationEventListener);
        }
        const mux = multiplex({
            main: consumer(),
            cancel: cancelSignal(),
        });
        mainLoop: for await (const { key, value } of mux) {
            switch (key) {
                case 'main':
                    yield value;
                    break;
                case 'cancel':
                    break mainLoop;
            }
        }
    }

    hasError(): this is ContextWithError {
        return this.error !== null;
    }

    getError() {
        return this.error;
    }

    async waitForCompletion() {
        const childrenCompletion = this.children.map((childCtx) => childCtx.waitForCompletion());
        const dependencies = this.routine ? [this.routine].concat(childrenCompletion) : childrenCompletion;
        await Promise.allSettled(childrenCompletion.concat(dependencies));
    }

    private setRoutine(routine: RoutineRef) {
        this.routine = routine;
        return routine;
    }
}

export { type Context, WorkflowContext, ContextCancelationError };
