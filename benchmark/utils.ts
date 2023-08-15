/* eslint-disable @typescript-eslint/no-explicit-any */

function duration<AsyncTask extends (...args: any[]) => Promise<any>>(
    task: AsyncTask
): (...args: Parameters<AsyncTask>) => Promise<[number, Awaited<ReturnType<AsyncTask>>]> {
    return async function (...args: any[]) {
        const startTime = process.hrtime();

        const result = await task(...args);

        const endTime = process.hrtime(startTime);
        const [seconds, nanoseconds] = endTime;
        const ellapsedTimeMs = seconds * 1e3 + nanoseconds / 1e6;

        return [ellapsedTimeMs, result];
    };
}

export { duration };
