type AnyExceptNullOrUndefined = NonNullable<unknown>;

interface Callback {
    (): void;
}

export { type AnyExceptNullOrUndefined, type Callback };
