type Result<T, E extends Error = Error> = ResultOk<T> | ResultError<E>;
type ResultOk<T> = Readonly<{ ok: true; value: T }>;
type ResultError<E extends Error> = Readonly<{ ok: false; error: E }>;

function ok(): ResultOk<void>;
function ok<T>(value: T): ResultOk<T>;
function ok<T>(value?: void | T): ResultOk<void> | ResultOk<T> {
    return value === null || value === undefined ? { ok: true, value: void 0 } : { ok: true, value };
}

function error<E extends Error>(error: E): ResultError<E> {
    return { ok: false, error };
}

const Result = { ok, error };

export { Result };
