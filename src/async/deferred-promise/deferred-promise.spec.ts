import { DeferredPromise } from './deferred-promise';

describe('DeferredPromise', () => {
    it('should allow outside logic to resolve the promise', async () => {
        const deferredNumber = new DeferredPromise<number>();
        setTimeout(() => deferredNumber.resolve(42), 0);
        const n = await deferredNumber;
        expect(n).toBe(42);
    });
    it('should allow outside logic to reject the promise', async () => {
        const deferred = new DeferredPromise<void>();
        const err = new Error();
        setTimeout(() => deferred.reject(err), 0);
        await expect(deferred).rejects.toThrow(err);
    });
});
