import { CancelablePromise, CancelationError } from './cancelable-promise';

describe('CancelablePromise', () => {
    it('should cancel the promise', async () => {
        const spy = jest.fn();
        const p = new CancelablePromise<number>((resolve) => {
            const timeout = setTimeout(() => resolve(42), 100);
            return () => {
                clearTimeout(timeout);
                spy();
            };
        });
        setTimeout(() => p.cancel(), 0);
        await expect(p).rejects.toThrowError(new CancelationError());
        expect(spy).toHaveBeenCalledTimes(1);
    });
    it('should only cancel the promise once', async () => {
        const spy = jest.fn();
        const p = new CancelablePromise(() => spy);

        p.cancel();
        p.cancel();

        await expect(p).rejects.toThrowError(new CancelationError());
        expect(spy).toHaveBeenCalledTimes(1);
    });
    it('should not cancel a resolved promise', async () => {
        const spy = jest.fn();
        const p = new CancelablePromise((resolve) => {
            resolve(42);
            return spy;
        });

        p.cancel();

        const n = await p;
        expect(n).toBe(42);
        expect(spy).not.toHaveBeenCalled();
    });
    it('should not cancel a rejected promise', async () => {
        const spy = jest.fn();
        const errorMsg = 'test';
        const p = new CancelablePromise((_, reject) => {
            reject(new Error(errorMsg));
            return spy;
        });

        p.cancel();

        await expect(p).rejects.not.toThrowError(new CancelationError());
        await expect(p).rejects.toThrow(errorMsg);
        expect(spy).not.toHaveBeenCalled();
    });
});
