type PromiseExecutor<T> = ConstructorParameters<typeof Promise<T>>[0];
type PromiseResolve<T> = Parameters<PromiseExecutor<T>>[0];
type PromiseReject = Parameters<PromiseExecutor<never>>[1];

export { type PromiseExecutor, type PromiseResolve, type PromiseReject };
