import { BufferedChannel } from './buffered-channel';
import { ReadChannel } from './read-channel';
import { WriteChannel } from './write-channel';

type Channel<M> = ReadChannel<M> & WriteChannel<M>;

function channel<M>(capacity = 0): Channel<M> {
    return new BufferedChannel(capacity);
}

export { type Channel, channel };
