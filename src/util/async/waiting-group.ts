import { Deffered } from './deferred';

type Thenable<T> = Pick<Promise<T>, 'then'>;

class WaitingGroup implements Thenable<void> {
    private readonly deferred: Deffered<void>;
    private readonly size: number;
    private count: number;
    private isDone: boolean;

    constructor(size: number) {
        this.deferred = new Deffered();
        this.size = size;
        this.count = 0;
        this.isDone = false;
    }

    then<TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
    ): Promise<TResult1 | TResult2> {
        return this.deferred.toPromise().then(onfulfilled, onrejected);
    }

    done() {
        if (this.isDone) {
            return;
        }
        this.count++;
        if (this.count === this.size) {
            this.isDone = true;
            this.deferred.resolve();
        }
    }
}

export { WaitingGroup };
