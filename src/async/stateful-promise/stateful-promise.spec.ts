import { StatefulPromise } from './stateful-promise';
import { type PromiseResolve, type PromiseReject } from '../promise-types';

describe('StatefulPromise', () => {
    it('should report the correct state', async () => {
        let resolve!: PromiseResolve<number>;
        const p1 = new StatefulPromise<number>((res) => {
            resolve = res;
        });

        expect(p1.isPending).toBe(true);
        expect(p1.isResolved).toBe(false);
        expect(p1.isRejected).toBe(false);
        expect(p1.isFulfilled).toBe(false);

        resolve(42);

        expect(p1.isPending).toBe(false);
        expect(p1.isResolved).toBe(true);
        expect(p1.isRejected).toBe(false);
        expect(p1.isFulfilled).toBe(true);

        const n = await p1;
        expect(n).toBe(42);

        let reject!: PromiseReject;
        const p2 = new StatefulPromise<number>((_, rej) => {
            reject = rej;
        });

        expect(p2.isPending).toBe(true);
        expect(p2.isResolved).toBe(false);
        expect(p2.isRejected).toBe(false);
        expect(p2.isFulfilled).toBe(false);

        reject(new Error('test'));

        expect(p2.isPending).toBe(false);
        expect(p2.isResolved).toBe(false);
        expect(p2.isRejected).toBe(true);
        expect(p2.isFulfilled).toBe(true);

        await expect(p2).rejects.toThrow();
    });
    it('should capture any state changes that happen synchronously in the construction of the native Promise', () => {
        const p = new StatefulPromise<void>((resolve) => resolve());

        expect(p.isPending).toBe(false);
        expect(p.isResolved).toBe(true);
        expect(p.isRejected).toBe(false);
        expect(p.isFulfilled).toBe(true);
    });
});
