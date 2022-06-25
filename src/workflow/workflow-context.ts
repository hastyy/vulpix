interface Context {
    launch(process: WorkflowProcess): Promise<void>;
    cancel(bubbleUp: boolean): Promise<void>;
    onCancel(task: CancellationTask): CancellationTask;
    removeCancellationTask(task: CancellationTask): void;
}

interface WorkflowProcess {
    (ctx: Context): Promise<void>;
}

interface CancellationTask {
    (): void | Promise<void>;
}

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

    async cancel(bubbleUp = true): Promise<void> {
        if (!this.cancelled) {
            this.cancelled = true;

            await this.executeCancellationTasks();
            await this.cancelConnectedContexts(bubbleUp);
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

    private cancelConnectedContexts(bubbleUp: boolean) {
        const connectedCancelOperations: Array<Promise<void>> = [];
        for (const child of this.children) {
            connectedCancelOperations.push(child.cancel(false));
        }
        if (bubbleUp && this.parent) {
            connectedCancelOperations.push(this.parent.cancel());
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
        const childCompletionTasks = this.children.map((child) => child.waitForCompletion());
        await Promise.all(this.processes.concat(childCompletionTasks));
    }
}

export { type Context, type WorkflowProcess, WorkflowContext };
