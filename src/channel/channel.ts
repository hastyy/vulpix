import { AsyncResult } from '../async-result';
import { DeferredPromise } from '../async/deferred-promise';
import { type AnyExceptNullOrUndefined } from '../auxiliary-types';
import { Result } from '../result';
import { WaitGroup } from '../waitgroup';

interface SendChannel<T extends AnyExceptNullOrUndefined> {
    readonly isClosed: boolean;
    send(value: T): AsyncResult<void, ChannelClosedError>;
}

interface ReceiveChannel<T extends AnyExceptNullOrUndefined> extends AsyncIterable<T> {
    readonly isClosed: boolean;
    receive(): AsyncResult<T, ChannelClosedError>;
}

interface CloseableSendChannel<T extends AnyExceptNullOrUndefined> extends SendChannel<T> {
    close(): void;
}

type Channel<T extends AnyExceptNullOrUndefined> = SendChannel<T> & ReceiveChannel<T>;
type CloseableChannel<T extends AnyExceptNullOrUndefined> = CloseableSendChannel<T> & ReceiveChannel<T>;

type ChannelWithWaitGroup<T extends AnyExceptNullOrUndefined> = {
    $channel: Channel<T>;
    waitGroup: WaitGroup;
};

class ChannelClosedError extends Error {
    constructor() {
        super('Channel is closed');
    }
}

class PendingSend<T> extends DeferredPromise<Result<void, ChannelClosedError>> {
    constructor(public readonly value: T) {
        super();
    }
}

class PendingReceive<T> extends DeferredPromise<Result<T, ChannelClosedError>> {
    constructor() {
        super();
    }
}

interface NotEmptyQueue<E> extends Queue<E> {
    dequeue(): E;
}

class Queue<E> {
    private readonly elements: Array<E> = [];

    get length() {
        return this.elements.length;
    }

    enqueue(element: E) {
        this.elements.push(element);
    }

    dequeue() {
        return this.elements.shift();
    }

    isNotEmpty(): this is NotEmptyQueue<E> {
        return this.elements.length > 0;
    }
}

class SendReceiveChannel<T extends AnyExceptNullOrUndefined> implements CloseableSendChannel<T>, ReceiveChannel<T> {
    private readonly pendingSends = new Queue<PendingSend<T>>();
    private readonly pendingReceives = new Queue<PendingReceive<T>>();
    private _isClosed = false;

    get isClosed() {
        return this._isClosed;
    }

    send(value: T): AsyncResult<void, ChannelClosedError> {
        if (this.isClosed) {
            return AsyncResult.error(new ChannelClosedError());
        }
        if (this.pendingReceives.isNotEmpty()) {
            const pendingReceive = this.pendingReceives.dequeue();
            pendingReceive.resolve(Result.ok(value));
            return AsyncResult.ok();
        }
        const pendingSend = new PendingSend(value);
        this.pendingSends.enqueue(pendingSend);
        return AsyncResult.of(pendingSend);
    }

    receive(): AsyncResult<T, ChannelClosedError> {
        if (this.isClosed) {
            return AsyncResult.error(new ChannelClosedError());
        }
        if (this.pendingSends.isNotEmpty()) {
            const pendingSend = this.pendingSends.dequeue();
            pendingSend.resolve(Result.ok());
            return AsyncResult.ok(pendingSend.value);
        }
        const pendingReceive = new PendingReceive<T>();
        this.pendingReceives.enqueue(pendingReceive);
        return AsyncResult.of(pendingReceive);
    }

    close() {
        if (this.isClosed) {
            return;
        }
        this._isClosed = true;
        while (this.pendingSends.isNotEmpty()) {
            const pendingSend = this.pendingSends.dequeue();
            pendingSend.resolve(Result.error(new ChannelClosedError()));
        }
        while (this.pendingReceives.isNotEmpty()) {
            const pendingReceive = this.pendingReceives.dequeue();
            pendingReceive.resolve(Result.error(new ChannelClosedError()));
        }
    }

    async *[Symbol.asyncIterator](): AsyncIterator<T> {
        while (!this.isClosed) {
            const result = await this.receive();
            if (!result.ok) {
                break;
            }
            yield result.value;
        }
    }
}

function channel<T extends AnyExceptNullOrUndefined>(): CloseableChannel<T>;
function channel<T extends AnyExceptNullOrUndefined>(nSenders: number): ChannelWithWaitGroup<T>;
function channel<T extends AnyExceptNullOrUndefined>(nSenders?: number): CloseableChannel<T> | ChannelWithWaitGroup<T> {
    const channel = new SendReceiveChannel<T>();
    if (typeof nSenders === 'undefined') {
        return channel;
    }
    if (!(Number.isInteger(nSenders) && nSenders > 0)) {
        throw new RangeError(
            `The specified number of senders for a channel factory must be a positive integer. Got: ${nSenders}`
        );
    }
    return {
        $channel: channel,
        waitGroup: new WaitGroup(nSenders, () => channel.close()),
    };
}

export {
    type SendChannel,
    type ReceiveChannel,
    type CloseableSendChannel,
    type Channel,
    type CloseableChannel,
    type ChannelWithWaitGroup,
    channel,
    ChannelClosedError,
};
