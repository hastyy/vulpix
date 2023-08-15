import { WaitGroup, waitGroup } from './waitgroup';

describe('WaitGroup', () => {
    it('should allow the creation of a WaitGroup with 1 or more participants', () => {
        expect(() => waitGroup(1)).not.toThrow();
        expect(() => waitGroup(2)).not.toThrow();
    });
    it('should not allow the creation of a WaitGroup with 0 or less participants', () => {
        expect(() => waitGroup(0)).toThrow();
        expect(() => waitGroup(-1)).toThrow();
    });
    it('should wait for all participants to signal done before it completes', async () => {
        const size = 2;
        const wg = waitGroup(size);
        setTimeout(() => {
            for (let i = 0; i < size; i++) {
                wg.signal.done();
            }
        }, 100);
        await wg.wait();
    });
    it('should only allow using the same signal once', () => {
        const wg = waitGroup(2);
        const signal = wg.signal;
        signal.done();
        expect(() => signal.done()).toThrow();
    });
    it('should not dispatch more signals than its size', () => {
        const wg = waitGroup(1);
        wg.signal; // dispatched one signal
        expect(() => wg.signal).toThrow();
    });
    it('should only allow adding more participants before it has completed', () => {
        const wg = waitGroup(1);
        wg.add(1);

        wg.signal.done();
        wg.signal.done();

        expect(() => wg.add(1)).toThrow();
    });
    it('should only add a number of participants that is > 0', () => {
        const wg = waitGroup(1);
        expect(() => wg.add(0)).toThrow();
    });
    it('should invoke the completion callback once it completes', async () => {
        let i = 0;
        const wg = new WaitGroup(1, () => {
            i = 1;
        });
        setTimeout(() => wg.signal.done(), 0);
        await wg.wait();
        expect(i).toBe(1);
    });
});
