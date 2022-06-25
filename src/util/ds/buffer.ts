import { Queue } from './queue';

class FullBufferException extends Error {
    constructor() {
        super('Buffer is full');
    }
}

class EmptyBufferException extends Error {
    constructor() {
        super('Buffer is empty');
    }
}

class QBuffer<T> {
    private readonly queue: Queue<T>;
    private readonly capacity: number;

    constructor(capacity: number) {
        this.queue = new Queue<T>();
        this.capacity = capacity;
    }

    put(element: T) {
        if (this.isFull()) {
            throw new FullBufferException();
        }

        this.queue.enqueue(element);
    }

    next(): T {
        try {
            return this.queue.dequeue();
        } catch {
            throw new EmptyBufferException();
        }
    }

    isEmpty() {
        return this.queue.isEmpty();
    }

    isFull() {
        return this.queue.length === this.capacity;
    }
}

export { QBuffer as Buffer, FullBufferException, EmptyBufferException };
