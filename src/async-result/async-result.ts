import { Result } from '../result';

/**
 * Asynchronous Result wrapper which is equivalent to Result<T, E> but for async computations.
 * Replaces the use of Promise<Result<T, E>> and hides some Promise methods such as `catch` and `finally`
 * because it will always resolve.
 */
class AsyncResult<T, E extends Error = Error> implements PromiseLike<Result<T, E>> {
    private constructor(private readonly promiseLike: PromiseLike<Result<T, E>>) {}

    then<TResult1 = Result<T, E>, TResult2 = never>(
        onfulfilled?: ((value: Result<T, E>) => TResult1 | PromiseLike<TResult1>) | null | undefined,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
    ): PromiseLike<TResult1 | TResult2> {
        return this.promiseLike.then(onfulfilled, onrejected);
    }

    toPromise() {
        return Promise.resolve(this.promiseLike);
    }

    static ok(): AsyncResult<void>;
    static ok<T>(value: T): AsyncResult<T>;
    static ok<T>(value?: void | T): AsyncResult<void> | AsyncResult<T> {
        return value === null || value === undefined
            ? new AsyncResult(Promise.resolve(Result.ok()))
            : new AsyncResult(Promise.resolve(Result.ok(value)));
    }

    static error<E extends Error>(error: E): AsyncResult<never, E> {
        return new AsyncResult(Promise.resolve(Result.error(error)));
    }

    static of<T, E extends Error = Error>(promiseLike: PromiseLike<Result<T, E>>): AsyncResult<T, E> {
        return new AsyncResult(promiseLike);
    }
}

export { AsyncResult };
