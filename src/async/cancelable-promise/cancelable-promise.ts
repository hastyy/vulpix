import { type Callback } from '../../auxiliary-types';
import { ExtensiblePromise } from '../extensible-promise';
import { type PromiseReject, type PromiseExecutor } from '../promise-types';
import { StatefulPromise } from '../stateful-promise';

interface CancelablePromiseExecutor<T> {
    (...args: Parameters<PromiseExecutor<T>>): CleanupFunction;
}

type CleanupFunction = Callback;

class CancelationError extends Error {
    constructor() {
        super('Canceled promise');
    }
}

/* ALTERNATIVE IMPLEMENTATION

function createCancelablePromise<T>(executor: CancelablePromiseExecutor<T>) {
    let cleanupFunction!: CleanupFunction;
    let reject!: PromiseReject;
    let isFulfilled = false;

    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        const decoratedResolve: PromiseResolve<T> = (value) => {
            isFulfilled = true;
            return promiseResolve(value);
        };
        const decoratedReject: PromiseReject = (reason) => {
            isFulfilled = true;
            return promiseReject(reason);
        };

        reject = decoratedReject;

        cleanupFunction = executor(decoratedResolve, decoratedReject);
    });

    function cancel() {
        if (isFulfilled) {
            return;
        }

        reject(new CancelationError());
        cleanupFunction();
    }

    return Object.assign(promise, { cancel });
}
*/
class CancelablePromise<T> extends ExtensiblePromise<T, StatefulPromise<T>> {
    private readonly reject: PromiseReject;
    private readonly cleanupFunction: CleanupFunction;

    constructor(executor: CancelablePromiseExecutor<T>) {
        let promiseReject!: PromiseReject;
        let cleanupFunction!: CleanupFunction;
        super(
            new StatefulPromise((resolve, reject) => {
                promiseReject = reject;
                cleanupFunction = executor(resolve, reject);
            })
        );
        this.reject = promiseReject;
        this.cleanupFunction = cleanupFunction;
    }

    cancel(error: Error = new CancelationError()) {
        if (this.promise.isFulfilled) {
            return;
        }
        this.reject(error);
        this.cleanupFunction();
    }
}

export { CancelablePromise, CancelationError };
