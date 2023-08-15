import assert from 'assert';
import { ChannelClosedError, channel } from './channel';

describe('channel', () => {
    it('should wait for a receiver to fulfill a send', async () => {
        const ch = channel<number>();
        const sendPromise = ch.send(42);
        const receiveResult = await ch.receive();
        assert(receiveResult.ok);
        expect(receiveResult.value).toBe(42);
        const sendResult = await sendPromise;
        expect(sendResult.ok).toBe(true);
    });
    it('should immediately fulfill a pending receive', async () => {
        const ch = channel<number>();
        ch.send(42); // enqueue a value
        const result = await ch.receive();
        assert(result.ok);
        expect(result.value).toBe(42);
    });
    it('should receive a channel closed error when channel is closed before the sent value is consumed', async () => {
        const ch = channel<number>();
        setTimeout(() => ch.close(), 100);
        const result = await ch.send(42);
        assert(!result.ok);
        expect(result.error).toBeInstanceOf(ChannelClosedError);
    });
    it('should receive a channel closed error when sending on a closed channel', async () => {
        const ch = channel<number>();
        ch.close();
        const result = await ch.send(42);
        assert(!result.ok);
        expect(result.error).toBeInstanceOf(ChannelClosedError);
    });
    it('should receive a channel closed error when channel is closed before the receive is fulfilled', async () => {
        const ch = channel<number>();
        setTimeout(() => ch.close(), 100);
        const result = await ch.receive();
        assert(!result.ok);
        expect(result.error).toBeInstanceOf(ChannelClosedError);
    });
    it('should receive a channel closed error when calling receive on a closed channel', async () => {
        const ch = channel<number>();
        ch.close();
        const result = await ch.receive();
        assert(!result.ok);
        expect(result.error).toBeInstanceOf(ChannelClosedError);
    });
    it('should receive multiple values sent values through the channel async iterator and exit successfully when channel is closed', async () => {
        const ch = channel<number>();
        const valuesToSend = [1, 2, 3];
        async function sender() {
            for (const value of valuesToSend) {
                await ch.send(value);
            }
            ch.close();
        }
        setTimeout(sender, 0);
        const receivedValues = [] as Array<number>;
        for await (const value of ch) {
            receivedValues.push(value);
        }
        expect(receivedValues).toEqual(valuesToSend);
    });
    it('should close the channel when all senders signal that they are done', async () => {
        const nSenders = 2;
        const { $channel, waitGroup: wg } = channel<number>(nSenders);

        expect($channel.isClosed).toBe(false);

        for (let i = 0; i < nSenders; i++) {
            wg.signal.done();
        }

        await wg.wait();
        expect($channel.isClosed).toBe(true);
    });
});
