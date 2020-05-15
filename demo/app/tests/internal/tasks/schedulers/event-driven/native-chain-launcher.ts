import {
    android as androidApp,
    launchEvent,
} from "tns-core-modules/application/application";

import { setTasks } from "nativescript-task-dispatcher/internal/tasks/provider";
import { testTasks } from "../..";
import { TaskChainRunnerService } from "nativescript-task-dispatcher/internal/tasks/schedulers/event-driven/android/runner-service.android";
import { TaskChainLauncher } from "nativescript-task-dispatcher/internal/tasks/schedulers/event-driven";
import { AndroidTaskChainLauncher } from "nativescript-task-dispatcher/internal/tasks/schedulers/event-driven/android";
import { TaskScheduler } from "nativescript-task-dispatcher/internal/tasks/schedulers/time-based";
import { AndroidTaskScheduler } from "nativescript-task-dispatcher/internal/tasks/schedulers/time-based/android";

import {
    on,
    TaskDispatcherEvent,
    off,
} from "nativescript-task-dispatcher/internal/events";
import { run } from "nativescript-task-dispatcher/internal/tasks";
import { RunnableTask } from "nativescript-task-dispatcher/internal/tasks/runnable-task";
import { plannedTasksDB } from "nativescript-task-dispatcher/internal/persistence/planned-tasks-store";
import { setTaskSchedulerCreator } from "../../../../../../../src/internal/tasks/schedulers/time-based/common";

const MILLIS_BETWEEN = 100;

describe("Native task chain launcher", () => {
    setTasks(testTasks);
    let taskChainLauncher: TaskChainLauncher;
    let taskScheduler: TaskScheduler;

    beforeAll(() => {
        if (androidApp) {
            wireUpTaskChainRunnerService();
        }
    });

    beforeEach(() => {
        if (androidApp) {
            taskChainLauncher = new AndroidTaskChainLauncher();
            taskScheduler = new AndroidTaskScheduler();
        } else {
            taskChainLauncher = null; // TODO: Add iOS task chain launcher
            taskScheduler = null; // TODO: Add iOS task scheduler
        }
        setTaskSchedulerCreator(() => taskScheduler);
    });

    it("runs a single task dependant on a launch event", async () => {
        const chainId = "simpleTaskChain";
        const chainFinished = createTaskChainFinishedListener(chainId);
        const launchEventName = createSimpleTaskChain();

        taskChainLauncher.launch(launchEventName, {}, chainId);
        await chainFinished;

        unregisterEventListeners([launchEvent]);
    });

    it("runs a task chain composed by multiple tasks bootstrapped by a launch event", async () => {
        const chainId = "advancedTaskChain";
        const chainFinished = createTaskChainFinishedListener(chainId);
        const eventNames = createAdvancedTaskChain();

        taskChainLauncher.launch(eventNames[0], {}, chainId);
        await chainFinished;

        unregisterEventListeners(eventNames);
    });

    it("runs two task chains in parallel if they fit in the same time window", async () => {
        const simpleChainId = "anotherSimpleTaskChain";
        const simpleChainFinished = createTaskChainFinishedListener(
            simpleChainId
        );
        const simpleLaunchEventName = createSimpleTaskChain();

        const advancedChainId = "anotherAdvancedTaskChain";
        const advancedChainFinished = createTaskChainFinishedListener(
            advancedChainId
        );
        const advancedEventNames = createAdvancedTaskChain();

        taskChainLauncher.launch(simpleLaunchEventName, {}, simpleChainId);
        taskChainLauncher.launch(advancedEventNames[0], {}, advancedChainId);

        await Promise.all([simpleChainFinished, advancedChainFinished]);
        unregisterEventListeners([
            simpleLaunchEventName,
            ...advancedEventNames,
        ]);
    });

    it("schedules a task in time as a reaction to an external event", async () => {
        const [
            launchEventName,
            runnableDeferredTask,
        ] = createDeferredTaskChain();

        taskChainLauncher.launch(launchEventName, {});
        await milliseconds(500);

        const deferredTask = await plannedTasksDB.get(runnableDeferredTask);
        expect(deferredTask).not.toBeNull();
        taskScheduler.cancel(deferredTask.id);
    });

    afterEach(async () => await milliseconds(MILLIS_BETWEEN));
});

function wireUpTaskChainRunnerService() {
    const runnerService = new TaskChainRunnerService();
    es.uji.geotec.taskdispatcher.runners.TaskChainRunnerService.setTaskChainRunnerServiceDelegate(
        new es.uji.geotec.taskdispatcher.runners.TaskChainRunnerServiceDelegate(
            {
                onCreate: (nativeService) =>
                    runnerService.onCreate(nativeService),
                onStartCommand: (intent, flags, startId) =>
                    runnerService.onStartCommand(intent, flags, startId),
                onDestroy: () => runnerService.onDestroy(),
            }
        )
    );
}

function createSimpleTaskChain(): string {
    const launchEvent = "simpleTaskChainCanStart";
    on(launchEvent, run("timeoutTask"));
    return launchEvent;
}

function createAdvancedTaskChain(): Array<string> {
    const launchEvent = "advancedTaskChainCanStart";
    on(launchEvent, run("dummyTask"));
    const intermediateEvent = "dummyTaskFinished";
    on(intermediateEvent, run("emitterTask"));
    return [launchEvent, intermediateEvent];
}

function createDeferredTaskChain(): [string, RunnableTask] {
    const launchEvent = "deferredTaskChainCanStart";
    const taskName = "failedTask";
    const interval = 900;
    on(launchEvent, run(taskName).every(interval));
    return [
        launchEvent,
        {
            name: taskName,
            startAt: -1,
            interval: interval * 1000,
            recurrent: true,
            params: {},
        },
    ];
}

function createTaskChainFinishedListener(chainId: string): Promise<void> {
    return new Promise((resolve) => {
        const listenerId = on(TaskDispatcherEvent.TaskChainFinished, (evt) => {
            if (evt.id === chainId) {
                off(TaskDispatcherEvent.TaskChainFinished, listenerId);
                resolve();
            }
        });
    });
}

function unregisterEventListeners(eventNames: Array<string>) {
    eventNames.forEach((eventName) => off(eventName));
}

function milliseconds(millis: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(), millis);
    });
}
