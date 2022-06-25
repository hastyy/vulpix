class ChannelClosedException extends Error {
    constructor() {
        super('Channel is closed');

        Object.setPrototypeOf(this, ChannelClosedException.prototype);
    }
}

export { ChannelClosedException };
