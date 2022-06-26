import { BufferedChannel } from './buffered-channel';
import { type ReadChannel } from './read-channel';
import { type WriteChannel } from './write-channel';

type Channel<M> = ReadChannel<M> & WriteChannel<M>;

function channel<M>(capacity = 0): Channel<M> {
    return new BufferedChannel(capacity);
}

export { type Channel, channel };
