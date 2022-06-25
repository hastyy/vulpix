type PromiseResolveFunction<T> = (value: T | PromiseLike<T>) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PromiseRejectFunction = (reason?: any) => void;

class Deffered<T> {
    private readonly promise: Promise<T>;
    private _resolve!: PromiseResolveFunction<T>; // lateinit field
    private _reject!: PromiseRejectFunction; // lateinit field

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    get resolve() {
        return this._resolve;
    }

    get reject() {
        return this._reject;
    }

    toPromise(): Promise<T> {
        return this.promise;
    }
}

export { Deffered };
