class EmptyQueueException extends Error {
    constructor() {
        super('Queue is empty');
    }
}

class Queue<T> {
    private readonly array: Array<T> = [];

    enqueue(element: T) {
        this.array.push(element);
    }

    dequeue(): T {
        const element = this.array.shift();
        if (element === undefined) {
            throw new EmptyQueueException();
        }
        return element;
    }

    isEmpty() {
        return this.array.length === 0;
    }

    get length() {
        return this.array.length;
    }
}

export { Queue, EmptyQueueException };
