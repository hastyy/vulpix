import { BufferedChannel } from './buffered-channel';
import { ChannelClosedException } from './channel-closed-exception';

describe('BufferedChannel', () => {
    describe('when writting to the channel', () => {
        it('should immediately accept the message when there is room in the buffer', () => {
            const bufferedChannel = new BufferedChannel<number>(1);

            const send = bufferedChannel.send(42);

            expect(send).not.toBeInstanceOf(Promise);
        });
        it('should immediately accept the message when there is at least one pending receiver', async () => {
            const unbufferedChannel = new BufferedChannel<number>(0);
            const spy = jest.fn();

            const receiver = (async function () {
                for await (const _ of unbufferedChannel) {
                    spy(_);
                    break;
                }
            })();

            const send = unbufferedChannel.send(42);

            expect(send).not.toBeInstanceOf(Promise);

            await receiver;
            expect(spy).toBeCalledTimes(1);
        });
        it('should block when the buffer is full and there are no pending receivers', () => {
            const unbufferedChannel = new BufferedChannel<number>(0);

            const send = unbufferedChannel.send(42);

            expect(send).toBeInstanceOf(Promise);
        });
        it('should immediately reject the message when the channel is already closed', () => {
            const channel = new BufferedChannel<number>(0);

            channel.close();

            expect(() => channel.send(42)).toThrow(new ChannelClosedException());
        });
    });
    describe('when reading from the channel', () => {
        it('should receive a message when there is at least one in the buffer', async () => {
            const bufferedChannel = new BufferedChannel<number>(1);

            bufferedChannel.send(42);

            const spy = jest.fn();

            const receiver = (async function () {
                for await (const _ of bufferedChannel) {
                    spy(_);
                    break;
                }
            })();

            await expect(receiver).resolves.toBe(void 0);
            expect(spy).toBeCalledTimes(1);
        });
        it('should receive a message when there is at least one pending sender', async () => {
            const unbufferedChannel = new BufferedChannel<number>(0);

            const send = unbufferedChannel.send(42);

            const spy = jest.fn();

            const receiver = (async function () {
                for await (const _ of unbufferedChannel) {
                    spy(_);
                    break;
                }
            })();

            expect(send).toBeInstanceOf(Promise);
            await expect(receiver).resolves.toBe(void 0);
            expect(spy).toBeCalledTimes(1);
            await expect(send).resolves.toBe(void 0);
        });
        it('should not poll for new messages when the channel is closed and the buffer is empty', async () => {
            const channel = new BufferedChannel<number>(0);

            channel.close();

            const spy = jest.fn();

            const receiver = (async function () {
                for await (const _ of channel) {
                    spy(_);
                    break;
                }
            })();

            await expect(receiver).resolves.toBe(void 0);
            expect(spy).not.toHaveBeenCalled();
        });
        it('should still poll for messages on a closed channel if there are any left in the buffer', async () => {
            const bufferedChannel = new BufferedChannel<number>(2);

            bufferedChannel.send(1);
            bufferedChannel.send(2);

            bufferedChannel.close();

            const spy = jest.fn();

            const receiver = (async function () {
                for await (const _ of bufferedChannel) {
                    spy(_);
                }
            })();

            await expect(receiver).resolves.toBe(void 0);
            expect(spy).toBeCalledTimes(2);
        });
    });
    describe('when closing the channel', () => {
        it('should reject all pending senders', async () => {
            const unbufferedChannel = new BufferedChannel<number>(0);

            const send = unbufferedChannel.send(42);

            unbufferedChannel.close();

            await expect(send).rejects.toThrow(new ChannelClosedException());
        });
        it('should unblock all pending receivers without providing any value', async () => {
            const unbufferedChannel = new BufferedChannel<number>(0);

            const spy = jest.fn();

            const receiver = (async function () {
                for await (const _ of unbufferedChannel) {
                    spy(_);
                }
            })();

            unbufferedChannel.close();

            await expect(receiver).resolves.toBe(void 0);
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
