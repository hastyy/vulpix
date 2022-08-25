type PromiseResolveFunction<T> = (value: T | PromiseLike<T>) => void;
type PromiseRejectFunction = (reason?: unknown) => void;
type Deferred<T> = ReturnType<typeof deferred<T>>;

function deferred<T>() {
    let resolve!: PromiseResolveFunction<T>;
    let reject!: PromiseRejectFunction;
    const p = new Promise<T>((...args) => ([resolve, reject] = args));

    return {
        ...p,
        resolve,
        reject,
    };
}

interface Queue<T> {
    enqueue(element: T): void;
    dequeue(): T | undefined;
    isNotEmpty(): this is NotEmptyQueue<T>;
}

interface NotEmptyQueue<T> extends Queue<T> {
    dequeue(): T;
}

function queue<T>(): Queue<T> {
    const array: Array<T> = [];

    return {
        enqueue(element: T) {
            array.push(element);
        },
        dequeue() {
            return array.shift();
        },
        isNotEmpty() {
            return array.length > 0;
        },
    };
}

type Result<T, E extends Error> = { ok: true; result: T } | { ok: false; err: E };

function ok<T>(result: T): Result<T, never> {
    return { ok: true, result };
}

function err<E>(err: E): Result<never, E> {
    return { ok: false, err };
}

class ChannelClosedError extends Error {
    constructor() {
        super('Channel is closed');
        Object.setPrototypeOf(this, ChannelClosedError.prototype);
    }
}

interface WriteChannel<M> {
    send(msg: M): Promise<Result<void, ChannelClosedError>>;
    close(): void;
}

type ReadChannel<M> = AsyncIterable<M>;

function pendingSend<M>(msg: M) {
    return {
        msg,
        ...deferred<Result<void, ChannelClosedError>>(),
    };
}

function pendingReceive<M>() {
    return deferred<Result<M, ChannelClosedError>>();
}

type PendingSend<M> = ReturnType<typeof pendingSend<M>>;
type PendingReceive<M> = ReturnType<typeof pendingReceive<M>>;

function channel<M>(): WriteChannel<M> & ReadChannel<M> {
    const pendingSends = queue<PendingSend<M>>();
    const pendingReceives = queue<PendingReceive<M>>();
    let closed = false;

    return {
        async send(msg) {
            if (closed) {
                return err(new ChannelClosedError());
            }
            if (pendingReceives.isNotEmpty()) {
                const receiver = pendingReceives.dequeue();
                receiver.resolve(ok(msg));
                return ok(void 0);
            } else {
                const ps = pendingSend(msg);
                pendingSends.enqueue(ps);
                return ps;
            }
        },
        async *[Symbol.asyncIterator]() {
            while (!closed) {
                if (pendingSends.isNotEmpty()) {
                    const pendingSend = pendingSends.dequeue();
                    pendingSend.resolve(ok(void 0));
                    yield pendingSend.msg;
                } else {
                    const pr = pendingReceive<M>();
                    pendingReceives.enqueue(pr);
                    const result = await pr;
                    if (result.ok) {
                        yield result.result;
                    }
                }
            }
        },
        close() {
            if (!closed) {
                closed = true;
                while (pendingSends.isNotEmpty()) {
                    const pendingSend = pendingSends.dequeue();
                    pendingSend.resolve(err(new ChannelClosedError()));
                }
                while (pendingReceives.isNotEmpty()) {
                    const pendingReceive = pendingReceives.dequeue();
                    pendingReceive.resolve(err(new ChannelClosedError()));
                }
            }
        },
    };
}

function waitGroup(size: number) {
    const def = deferred<void>();
    let count = 0;

    return {
        wait: def.then,
        done() {
            if (count < size) {
                ++count;
                if (count === size) {
                    def.resolve();
                }
            }
        },
    };
}
