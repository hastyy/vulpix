/**
 * Wraps a native Promise object and exposes its interface.
 * Makes it possible to extend Promise without having to worry about the downfalls of native Promise extension, such as:
 *  - having the correct prototype set on instances (ES5 problem);
 *  - not having to worry about Symbol.toStringTag;
 *  - not having to worry about Symbol.species;
 *  - not having to worry about returning the executor call from the constructor.
 */
abstract class ExtensiblePromise<T, P extends Promise<T> = Promise<T>> implements Promise<T> {
    constructor(protected readonly promise: P) {}

    get [Symbol.toStringTag]() {
        return this.promise[Symbol.toStringTag];
    }

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
    ): Promise<TResult1 | TResult2> {
        return this.promise.then(onfulfilled, onrejected);
    }

    catch<TResult = never>(
        onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined
    ): Promise<T | TResult> {
        return this.promise.catch(onrejected);
    }

    finally(onfinally?: (() => void) | null | undefined): Promise<T> {
        return this.promise.finally(onfinally);
    }
}

export { ExtensiblePromise };
