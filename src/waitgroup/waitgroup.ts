import { DeferredPromise } from '../async/deferred-promise';
import { Callback } from '../auxiliary-types';

/* eslint-disable-next-line @typescript-eslint/no-namespace */
namespace WaitGroup {
    export type DoneSignal = InstanceType<typeof DoneSignal>;
}

class DoneSignal {
    private isDone = false;

    constructor(private readonly onDone: Callback) {}

    done() {
        if (this.isDone) {
            throw new Error('WaitGroup.DoneSignal.done has already been called for this instance');
        }
        this.isDone = true;
        this.onDone();
    }
}

class WaitGroup {
    private size: number;
    private doneCount: number;
    private emittedSignals: number;
    private onCompletion?: Callback;
    private readonly completionPromise: DeferredPromise<void>;

    constructor(size: number, onCompletion?: Callback) {
        if (!(Number.isInteger(size) && size > 0)) {
            throw new RangeError(`WaitGroup size must be a positive integer. Got: ${size}`);
        }
        this.size = size;
        this.doneCount = 0;
        this.emittedSignals = 0;
        this.onCompletion = onCompletion;
        this.completionPromise = new DeferredPromise();
    }

    wait() {
        return this.completionPromise;
    }

    add(n: number) {
        if (!(Number.isInteger(n) && n > 0)) {
            throw new RangeError(`WaitGroup.add argument must be a positive integer. Got: ${n}`);
        }
        if (this.isComplete()) {
            throw new Error("Can't call WaitGroup.add when WaitGroup has already completed");
        }
        this.size += n;
    }

    isComplete() {
        return this.doneCount === this.size;
    }

    get signal() {
        if (this.isComplete()) {
            throw new Error("Can't get a signal from a WaitGroup that has already completed");
        }
        if (this.emittedSignals === this.size) {
            throw new Error('WaitGroup has no remaining signals');
        }
        this.emittedSignals++;
        return new DoneSignal(() => {
            this.doneCount++;
            if (this.isComplete()) {
                this.completionPromise.resolve();
                this.onCompletion?.();
            }
        });
    }
}

function waitGroup(size: number) {
    return new WaitGroup(size);
}

export { WaitGroup, waitGroup };
