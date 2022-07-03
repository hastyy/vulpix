function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export { sleep };
