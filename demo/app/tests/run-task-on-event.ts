import { taskDispatcher } from "nativescript-task-dispatcher";
import {
    TaskGraph,
    EventListenerGenerator,
    RunnableTaskDescriptor,
} from "nativescript-task-dispatcher/internal/tasks/graph";

import { setTasks } from "nativescript-task-dispatcher/internal/tasks/provider";
import { testTasks } from "./internal/tasks";

import {
    on,
    off,
    createEvent,
} from "nativescript-task-dispatcher/internal/events";

import { plannedTasksDB } from "nativescript-task-dispatcher/internal/persistence/planned-tasks-store";

describe("Event-based task runner", () => {
    const startEvent = "e2eStartEvent";
    const stopEvent = "e2eStopEvent";
    const expectedEvent = createEvent("patataCooked", {
        data: { status: "slightlyBaked" },
    });
    const expectedEventSlicer = createEvent("patataSliced", {
        data: { status: "sliced" },
    });

    let initPromise: Promise<void>;

    beforeAll(() => {
        initPromise = taskDispatcher.init([], testTaskGraph);
        setTasks(testTasks);
    });

    it("runs a task at the moment an event rises", async () => {
        await initPromise;
        const callbackPromise = new Promise((resolve, reject) => {
            const listenerId = on(expectedEvent.name, (evt) => {
                off(expectedEvent.name, listenerId);
                if (evt.name === expectedEvent.name) {
                    resolve(evt.data);
                } else {
                    reject("Event name did not match");
                }
            });
        });

        taskDispatcher.emitEvent(startEvent);
        const data = await callbackPromise;

        expect(data).toEqual(expectedEvent.data);
    });

    it("removes a delayed task if it has been canceled", async () => {
        await initPromise;

        taskDispatcher.emitEvent(stopEvent);
        await new Promise((resolve) => setTimeout(resolve, 500));

        const plannedTask = await plannedTasksDB.get({
            name: "dummyTask",
            startAt: -1,
            interval: 60000,
            recurrent: true,
            params: {},
        });
        expect(plannedTask).toBeNull();
    });

    it("runs a chained tasks secuence", async () => {
        await initPromise;

        const chainedEventCallbackPromise = new Promise((resolve, reject) => {
            const listenerId = on(expectedEventSlicer.name, (evt) => {
                off(expectedEventSlicer.name, listenerId);
                if (evt.name === expectedEventSlicer.name) {
                    resolve(evt.data);
                } else {
                    reject("Event name did not match");
                }
            });
        });

        taskDispatcher.emitEvent(startEvent);
        const data = await chainedEventCallbackPromise;

        expect(data).toEqual(expectedEventSlicer.data);
    });

    afterAll(() => {
        taskDispatcher.emitEvent(stopEvent);
    });
});

const testTaskGraph: TaskGraph = {
    async describe(onEvt: EventListenerGenerator, run: RunnableTaskDescriptor) {
        onEvt("e2eStartEvent", run("emitterTask"));
        onEvt(
            "e2eStartEvent",
            run("dummyTask").every(1, "minutes").cancelOn("e2eStopEvent")
        );
        onEvt("emitterTaskFinished", run("dummyTask"));
        onEvt("patataCooked", run("patataSlicer"));
    },
};
