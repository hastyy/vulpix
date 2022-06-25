import { Deffered } from '../util/async';
import { Queue, Buffer } from '../util/ds';
import { ChannelClosedException } from './channel-closed-exception';
import { ReadChannel } from './read-channel';
import { WriteChannel } from './write-channel';

class DeferredSend<M> extends Deffered<void> {
    public readonly message: M;

    constructor(message: M) {
        super();
        this.message = message;
    }
}

class DeferredReceive<M> extends Deffered<M> {}

class BufferedChannel<M> implements ReadChannel<M>, WriteChannel<M>, AsyncIterableIterator<M> {
    private closed: boolean;
    private readonly buffer: Buffer<M>;
    private readonly deferredSenders: Queue<DeferredSend<M>>;
    private readonly deferredReceivers: Queue<DeferredReceive<M>>;

    constructor(capacity: number) {
        this.closed = false;
        this.buffer = new Buffer(capacity);
        this.deferredSenders = new Queue();
        this.deferredReceivers = new Queue();
    }

    send(message: M): void | Promise<void> {
        if (this.closed) {
            throw new ChannelClosedException();
        }

        if (!this.deferredReceivers.isEmpty()) {
            const deferredReceive = this.deferredReceivers.dequeue();
            deferredReceive.resolve(message);
        } else if (!this.buffer.isFull()) {
            this.buffer.put(message);
        } else {
            const deferredSend = new DeferredSend(message);
            this.deferredSenders.enqueue(deferredSend);
            return deferredSend.toPromise();
        }
    }

    close(): void {
        if (this.closed) {
            throw new ChannelClosedException();
        }

        this.closed = true;

        while (!this.deferredSenders.isEmpty()) {
            const deferredSend = this.deferredSenders.dequeue();
            deferredSend.reject(new ChannelClosedException());
        }

        while (!this.deferredReceivers.isEmpty()) {
            const deferredReceive = this.deferredReceivers.dequeue();
            deferredReceive.reject(new ChannelClosedException());
        }
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<M> {
        return this;
    }

    async next(): Promise<IteratorResult<M>> {
        if (this.closed && this.buffer.isEmpty()) {
            return {
                value: undefined,
                done: true,
            };
        }

        if (!this.buffer.isEmpty()) {
            const message = this.buffer.next();
            if (!this.deferredSenders.isEmpty()) {
                const deferredSend = this.deferredSenders.dequeue();
                this.buffer.put(deferredSend.message);
                deferredSend.resolve();
            }
            return {
                value: message,
                done: false,
            };
        }

        if (!this.deferredSenders.isEmpty()) {
            const deferredSend = this.deferredSenders.dequeue();
            deferredSend.resolve();
            return {
                value: deferredSend.message,
                done: false,
            };
        }

        const deferredReceive = new DeferredReceive<M>();
        this.deferredReceivers.enqueue(deferredReceive);

        try {
            const message = await deferredReceive.toPromise();
            return {
                value: message,
                done: false,
            };
        } catch (e) {
            if (e instanceof ChannelClosedException) {
                return {
                    value: undefined,
                    done: true,
                };
            }
            throw e;
        }
    }
}

export { BufferedChannel };
