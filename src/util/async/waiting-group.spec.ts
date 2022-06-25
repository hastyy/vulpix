import { WaitingGroup } from './waiting-group';

describe('WaitingGroup', () => {
    it('should only resolve when done is called "size" times', async () => {
        const size = 2;
        const wg = new WaitingGroup(size);

        setTimeout(() => {
            for (let i = 0; i < size; i++) {
                wg.done();
            }
        }, 0);

        await wg;

        expect(1 + 1).toBe(2); // reached this line, test did not timeout
    });
});
