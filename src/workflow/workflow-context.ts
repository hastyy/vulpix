interface CancellationOptions {
    bubbleUp: boolean;
}

interface Context {
    launch(process: WorkflowProcess): Promise<void>;
    cancel(options?: CancellationOptions): Promise<void>;
    onCancel(task: CancellationTask): CancellationTask;
    removeCancellationTask(task: CancellationTask): void;
}

interface WorkflowProcess {
    (ctx: Context): Promise<void>;
}

interface CancellationTask {
    (): void | Promise<void>;
}

const defaultCancellationOptions: CancellationOptions = {
    bubbleUp: true,
};

class WorkflowContext implements Context {
    private readonly parent: WorkflowContext | null;
    private readonly children: Array<WorkflowContext>;
    private readonly processes: Array<Promise<void>>;
    private readonly cancellationTasks: Array<CancellationTask>;
    private cancelled: boolean;

    constructor(parent: WorkflowContext | null = null) {
        this.parent = parent;
        this.children = [];
        this.processes = [];
        this.cancellationTasks = [];
        this.cancelled = false;

        this.parent?.children.push(this);

        // Needed to keep 'this' reference bound to instance
        this.launch = this.launch.bind(this);
        this.cancel = this.cancel.bind(this);
        this.onCancel = this.onCancel.bind(this);
        this.removeCancellationTask = this.removeCancellationTask.bind(this);
        this.spawnChild = this.spawnChild.bind(this);
        this.waitForCompletion = this.waitForCompletion.bind(this);
        this.executeCancellationTasks = this.executeCancellationTasks.bind(this);
        this.cancelConnectedContexts = this.cancelConnectedContexts.bind(this);
    }

    launch(process: WorkflowProcess): Promise<void> {
        const childCtx = this.spawnChild();
        const proc = process(childCtx);
        this.processes.push(proc);
        return proc;
    }

    spawnChild() {
        const child = new WorkflowContext(this);
        return child;
    }

    async cancel(options = defaultCancellationOptions): Promise<void> {
        if (!this.cancelled) {
            this.cancelled = true;

            await this.cancelConnectedContexts(options);
            await this.executeCancellationTasks();
        }
    }

    private executeCancellationTasks() {
        const executingCancellationTasks: Array<Promise<void>> = [];
        for (const task of this.cancellationTasks) {
            const ref = task();
            if (ref instanceof Promise) {
                executingCancellationTasks.push(ref);
            }
        }
        return Promise.all(executingCancellationTasks);
    }

    private cancelConnectedContexts(options: CancellationOptions) {
        const connectedCancelOperations: Array<Promise<void>> = [];
        for (const child of this.children) {
            connectedCancelOperations.push(child.cancel({ bubbleUp: false }));
        }
        if (options.bubbleUp && this.parent) {
            connectedCancelOperations.push(this.parent.cancel(options));
        }
        return Promise.all(connectedCancelOperations);
    }

    onCancel(task: CancellationTask): CancellationTask {
        this.cancellationTasks.push(task);
        return task;
    }

    removeCancellationTask(task: CancellationTask): void {
        const index = this.cancellationTasks.indexOf(task);
        if (index > -1) {
            this.cancellationTasks.splice(index, 1);
        }
    }

    async waitForCompletion(): Promise<void> {
        const childCompletionProcesses = this.children.map((child) => child.waitForCompletion());
        const processes = childCompletionProcesses.concat(this.processes);

        let error: Error | null = null;
        for (const process of processes) {
            try {
                await process;
            } catch (e) {
                if (error === null) {
                    error = e as Error;
                }
                if (!this.cancelled) {
                    this.cancel();
                }
            }
        }

        if (error !== null) {
            throw error;
        }
    }
}

export { type Context, type WorkflowProcess, WorkflowContext };
