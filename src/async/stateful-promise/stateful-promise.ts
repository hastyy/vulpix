import { Callback } from '../../auxiliary-types';
import { ExtensiblePromise } from '../extensible-promise';
import { type PromiseExecutor, type PromiseResolve, type PromiseReject } from '../promise-types';

type EventMap<Keys extends string> = {
    [K in Keys]: Callback;
};

type StatefulPromiseEvent = 'resolved' | 'rejected';

enum PromiseState {
    PENDING,
    RESOLVED,
    REJECTED,
}

class BufferedEventEmitter<T extends Record<string, Callback>> {
    private readonly buffer = new Set<keyof T>();
    private readonly listeners = new Map<keyof T, Callback>();

    on<K extends keyof T>(eventName: K, listener: Callback) {
        if (this.buffer.has(eventName)) {
            listener();
            this.buffer.delete(eventName);
            return;
        }
        this.listeners.set(eventName, listener);
    }

    removeListener<K extends keyof T>(eventName: K) {
        this.listeners.delete(eventName);
    }

    once<K extends keyof T>(eventName: K, listener: Callback) {
        this.on(eventName, () => {
            listener();
            this.removeListener(eventName);
        });
    }

    emit<K extends keyof T>(eventName: K) {
        const listener = this.listeners.get(eventName);
        if (!listener) {
            this.buffer.add(eventName);
            return;
        }
        listener();
    }

    removeAllListeners() {
        this.listeners.clear();
    }
}

class StatefulPromise<T> extends ExtensiblePromise<T> {
    private readonly eventEmitter: BufferedEventEmitter<EventMap<StatefulPromiseEvent>>;
    private state: PromiseState;

    constructor(executor: PromiseExecutor<T>) {
        const emitter = new BufferedEventEmitter<EventMap<StatefulPromiseEvent>>();
        super(
            new Promise((resolve, reject) => {
                const decoratedResolve: PromiseResolve<T> = (value) => {
                    emitter.emit('resolved');
                    resolve(value);
                };
                const decoratedReject: PromiseReject = (reason) => {
                    emitter.emit('rejected');
                    reject(reason);
                };
                executor(decoratedResolve, decoratedReject);
            })
        );
        this.state = PromiseState.PENDING;
        this.eventEmitter = emitter;
        this.eventEmitter.once('resolved', () => {
            this.state = PromiseState.RESOLVED;
            this.eventEmitter.removeAllListeners();
        });
        this.eventEmitter.once('rejected', () => {
            this.state = PromiseState.REJECTED;
            this.eventEmitter.removeAllListeners();
        });
    }

    get isPending() {
        return this.state === PromiseState.PENDING;
    }

    get isResolved() {
        return this.state === PromiseState.RESOLVED;
    }

    get isRejected() {
        return this.state === PromiseState.REJECTED;
    }

    get isFulfilled() {
        return !this.isPending;
    }
}

export { StatefulPromise };
