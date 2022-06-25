interface WriteChannel<M> {
    send(message: M): void | Promise<void>;
    close(): void;
}

export { type WriteChannel };
