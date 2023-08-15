function isPromise(subject: unknown): subject is Promise<unknown> {
    return (
        subject instanceof Promise ||
        (subject !== null &&
            typeof subject === 'object' &&
            typeof (subject as Record<string, unknown>).then === 'function')
    );
}

export { isPromise };
