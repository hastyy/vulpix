import { ExtensiblePromise } from '../extensible-promise';
import { type PromiseResolve, type PromiseReject } from '../promise-types';

/* ALTERNATIVE IMPLEMENTATION
type Deferred<T> = ReturnType<typeof Deferred<T>>;

function Deferred<T>() {
    let resolve!: PromiseResolve<T>, reject!: PromiseReject;
    return Object.assign(new Promise<T>((...args) => [resolve, reject] = args), { resolve, reject });
}
*/
class DeferredPromise<T> extends ExtensiblePromise<T> {
    private readonly _resolve: PromiseResolve<T>;
    private readonly _reject: PromiseReject;

    constructor() {
        let promiseResolve!: PromiseResolve<T>;
        let promiseReject!: PromiseReject;

        super(
            new Promise((resolve, reject) => {
                promiseResolve = resolve;
                promiseReject = reject;
            })
        );

        this._resolve = promiseResolve;
        this._reject = promiseReject;
    }

    get resolve() {
        return this._resolve;
    }

    get reject() {
        return this._reject;
    }
}

export { DeferredPromise };
