import { channel } from '../../channel';

type Value<AsyncIt extends AsyncIterable<unknown>> = AsyncIt extends AsyncIterable<infer T> ? T : never;

type KeyValuePair<AsyncIterableMap extends Record<string, AsyncIterable<unknown>>> = {
    [K in keyof AsyncIterableMap]: {
        key: K;
        value: Value<AsyncIterableMap[K]>;
    };
}[keyof AsyncIterableMap];

function multiplex<AsyncIterableMap extends Record<string, AsyncIterable<unknown>>>(
    asyncIterableMap: AsyncIterableMap
): AsyncIterable<KeyValuePair<AsyncIterableMap>> {
    const numOfAsyncIterables = Object.keys(asyncIterableMap).length;
    const { $channel: $multiplexingPipe, waitGroup } = channel<KeyValuePair<AsyncIterableMap>>(numOfAsyncIterables);
    for (const [key, asyncIterable] of Object.entries(asyncIterableMap)) {
        /**
         * Launch a consumer routine for each iterable.
         *
         * We don't need to await these Promises because $multiplexingPipe completion depends
         * on their completion, meaning that $multiplexingPipe will only close after all these
         * consumers have finished.
         */
        (async function asyncIterableConsumer(key: string, asyncIterable: AsyncIterable<unknown>) {
            for await (const value of asyncIterable) {
                const result = await $multiplexingPipe.send({
                    key: key as keyof AsyncIterableMap,
                    value: value as Value<AsyncIterableMap[keyof AsyncIterableMap]>,
                });
                if (!result.ok) {
                    break;
                }
            }
            waitGroup.signal.done();
        })(key, asyncIterable);
    }
    return $multiplexingPipe;
}

export { multiplex };
