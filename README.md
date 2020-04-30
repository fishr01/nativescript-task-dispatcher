# nativescript-task-dispatcher

[![Build Status](https://travis-ci.com/GeoTecINIT/nativescript-task-dispatcher.svg?token=cYMN5eetmCX8aPqFVaQb&branch=master)](https://travis-ci.com/GeoTecINIT/nativescript-task-dispatcher)

NativeScript Task Dispatcher is a NativeScript plugin aimed to ease the execution of mobile app's task definition and execution workflows in the background.

It abstracts all the platform-specific details, leaving a clear and easy-to-use, yet powerful, API for task development and the definition of dependencies between them by means of an event-driven software architecture.

## How it works?

This plugin bases its way of working in three software primitives:

- **Tasks:** Small pieces of software meant to do only one job. Examples of tasks are:
  - A software fragment in charge of reading data from a sensor (e.g. user location).
  - Another code fragment in charge of doing some processing with the collected measurement (e.g. calculate the distance to a concrete venue).
  - Also user-visible actions, like a code snippet in charge of regularly delivering a notification to the user informing about the distance to the venue.
- **Task graph:** A semantic way of describing how tasks relate to each other. Which tasks depend on an external event (an event not generated by a task) being triggered or in the output (in form of an event) of another tasks. Also which tasks are triggered by time events like:
  - At a certain time
  - In a certain amount of minutes
  - In a recurrent interval
  - At a certain time and in a specified recurrent interval since that time
- **Task schedulers:** These are completely transparent to the user of the plugin, right now there are two schedulers and another three planned:
  - _Immediate tasks scheduler (Android/iOS):_ in charge of running tasks that have to run a task immediately, with zero delay. This scheduler is in charge of running tasks whose execution has been triggered by another task.
  - _> 1 minute tasks scheduler (Android only):_ An alarm-based task scheduler. In charge of running tasks whose execution window falls in a minute or more in the future.
  - _**(Planned)** < 1 minute tasks scheduler (Android only):_ A background service-based tasks scheduler. That will be in charge of running time-critical tasks that need to run bellow a 1 minute period (e.g. tasks running every 15 seconds)
  - _**(Planned)** Delayed tasks scheduler (iOS only):_ Will allow running time-triggered tasks in iOS. We cannot make any promises about its time accuracy or its possibilities. We are still studying how to implement this (**PRs are welcome!**)
  - _**(Planned)** Event-driven tasks scheduler (Android/iOS):_ Two implementations, identical functionality. Will reliably run tasks triggered by external events in the background (e.g. a change in the activity of the user, a server-sent event, a system event, etc.). A basic multi-platform version of this scheduler is already running but can only execute tasks reliably when the app is visible to the user or another scheduler is already running.

To illustrate how the three aforementioned components link together, let's present the following simple (yet relatively complex) use case. Let's say that we want to wake-up our app every minute. To run a dummy task, collect the battery level of the device and log the task execution. In parallel, we want to follow the same workflow but with a task that collects user location, another task which collects battery level and finally another tasks that logs the execution of the whole pipeline branch. The following figure depicts the whole process:

![](./img/alarm-scheduler-lifecycle.png)

Here **_> 1 minute tasks scheduler_** and **_Immediate tasks scheduler_** take place. The first scheduler bootstraps both task chains every minute, running them in parallel and waiting for them to finish before putting the device again to sleep. The task which logs the execution of a task chain depends on the battery (%) collection task successfully finishing in order to run. At the same time, battery level collection task won't run if the dummy task or the GPS task don't run before.

## Prerequisites

### Android

Plugin supports devices running Android 4.2 Jelly Bean (SDK 17) to Android 10 Q (SDK 29). Given that this plugin supports last Android 10 changes in foreground services, **Android Build Tools 29.x.x+ is required**.

### iOS

**This plugin does not support iOS at its full extent**. In order to enable iOS support, this plugin requires a mechanism able to schedule tasks in time. We are evaluating how to do that, but cannot make any promises about when this functionality will be available. Sadly, it is not our priority to give a solution to this soon, but PRs are welcome in order to address this shortcoming.

## Installation

Run the following command in your project's root folder:

```javascript
tns plugin add nativescript-task-dispatcher
```

### Android-specific steps

#### Running tasks in foreground

If one or more of your app tasks require to run in foreground (while in background), for example if one of your tasks requires to access user location on a regular basis (more than once per hour) while in background ([more info here](https://developer.android.com/about/versions/oreo/background-location-limits)), please ensure the following keys are included in your app's `strings.xml` file (located in: `App_Resources -> Android -> src -> main -> res -> values`):

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <!--> Other strings <-->

  <!-->
    The notification channel used in Android 8.0 and upper to deliver foreground service sticky notifications.
    (more info here: https://developer.android.com/training/notify-user/channels)
  <-->
  <string name="task_dispatcher_location_usage_channel_name">"Background location"</string>
  <string name="task_dispatcher_location_usage_channel_description">"Indicates when the app is accessing your location in background"</string>
  <!-->
    The notification title and content that your user will see in the status bar while the service is running in foreground.
    (more info here: https://developer.android.com/guide/components/services#Foreground)
  <-->
  <string name="task_dispatcher_location_usage_notification_title">"demo app is using your location"</string>
  <string name="task_dispatcher_location_usage_notification_content">""</string>

  <!--> Other strings <-->
</resources>
```

#### Running tasks at intervals below _15 minutes_? See here

This plugin has been highly optimized to get over one of the biggest shortcomings in Android, **running tasks reliably at < 15 minutes intervals** (and >= 1 minute) without resorting to always running battery-consuming background services.

In order to do so, first you'll have to check if you meet one of the requirements to be whitelisted by the OS as an app that does not have to be bothered by the system's energy optimizer: [https://developer.android.com/training/monitoring-device-state/doze-standby#whitelisting-cases](https://developer.android.com/training/monitoring-device-state/doze-standby#whitelisting-cases)

If your meets the requirements to be whitelisted, then you'll need to add the following permission in your app's AndroidManifest.xml file (located in: `App_Resources -> Android -> src -> main`):

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
	package="__PACKAGE__" ...>

	<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>

</manifest>
```

We'll handle the rest for you :)

> **Disclaimer**: Google regularly checks its store for apps that have declared the indicated permission. If you claim that your app should be whitelisted but in the end it turns out not, your app could end up banned from the Play Store. We advise you to thoroughly evaluate this.

## Usage

### Quick start

First of all you'll need to start defining some tasks and make them globally accessible. As a matter of an example, here you can see some tasks that we have defined for our demo app (located in: `demo/app/tasks/index.ts`):

```ts
// tasks.ts;
import { Task, SimpleTask } from "nativescript-task-dispatcher/tasks";
import { toSeconds } from "nativescript-task-dispatcher/utils/time-converter";

export const appTasks: Array<Task> = [
  // The "hello world" of the tasks
  new SimpleTask("fastTask", async ({ log }) => log("Fast task run!")),
  // A task which takes 2 seconds to complete
  new SimpleTask(
    "mediumTask",
    ({ log, onCancel }) =>
      new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          log("Medium task run!");
          resolve();
        }, 2000);
        onCancel(() => {
          clearTimeout(timeoutId);
          resolve();
        });
      })
  ),
  // A really slow task, which takes 30 seconds to complete
  new SimpleTask(
    "slowTask",
    ({ log, onCancel }) =>
      new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          log("Slow task run!");
          resolve();
        }, 30000);
        onCancel(() => {
          clearTimeout(timeoutId);
          resolve();
        });
      }),
    { foreground: true }
  ),

  // A task meant to be run repeatedly at different rates
  // (always incrementing in 1 the number of minutes between executions).
  // This can be taken as an starting point for retry strategies.
  new SimpleTask("incrementalTask", async ({ params, log, runAgainIn }) => {
    const execCount = params.execCount ? params.execCount : 1;
    const execTime = toSeconds(execCount, "minutes");

    log(`Incremental task: Task run after ${execTime} seconds`);

    runAgainIn(toSeconds(execCount + 1, "minutes"), {
      execCount: execCount + 1,
    });
  }),
];
```

Explanation of the example tasks:

- **fastTask:** A task that just runs. The "hello world" of the tasks. It has zero temporal cost and complexity. Runs and logs something.
- **mediumTask:** An example of a task which takes a barely small amount of time to do some work. It uses NativeScript `setTimeout()` proxy to simulate that the task is running for 2 seconds.
- **slowTask:** An example of a task which takes a life to complete. It simulates a slow behavior, like when the location provider is taking more time than usual to get a coordinate fix.
- **incrementalTask:** A task meant to accumulatively delay its execution after each run.

Next you will need a way to describe how all the defined tasks work together. In order to do so, you will have to define your app's task graph. Again, as a mater of an example, we have created an example task graph in the demo application for you (located in: `demo/app/tasks/graph.ts`):

```ts
// graph.ts;
import {
  TaskGraph,
  EventListenerGenerator,
  RunnableTaskDescriptor,
} from "nativescript-task-dispatcher/tasks/graph";

class DemoTaskGraph implements TaskGraph {
  async describe(
    on: EventListenerGenerator,
    run: RunnableTaskDescriptor
  ): Promise<void> {
    // Time triggered tasks
    on("startEvent", run("fastTask").every(1, "minutes").cancelOn("stopEvent"));
    on(
      "startEvent",
      run("mediumTask").every(2, "minutes").cancelOn("stopEvent")
    );
    on("startEvent", run("slowTask").every(4, "minutes").cancelOn("stopEvent"));

    // Event-driven tasks
    on("slowTaskFinished", run("mediumTask"));
    on("mediumTaskFinished", run("fastTask"));

    // Example about how to run incrementalTask
    // on("startEvent", run("incrementalTask").in(1, "minutes"));
  }
}

export const demoTaskGraph = new DemoTaskGraph();
```

Explanation of the task graph:

- _By time the external event "startEvent" gets triggered_ 3 task instances are scheduled to run:
  - fastTask every minute
  - mediumTask every two minutes
  - slowTask every four minutes
- _After 1 minute_ fastTask runs immediately and logs its message through the console
- _After 2 minutes_ fast and medium tasks run. fastTask runs immediately, mediumTask takes 2 seconds to run. After mediumTask finishes, fastTask runs again. Then, the device goes to sleep.
- _After 3 minutes_ fastTask runs again
- _After 4 minutes_ fast, medium and slow tasks run. fastTask runs immediately, mediumTask takes 2 seconds to run and slowTask takes 30 seconds to run. After mediumTask finishes, fastTask runs again. After slowTask finishes, mediumTask runs again and takes 2 seconds to run, after those 2 seconds, fastTask runs for a third time in this task chain. Then, the device goes to sleep.
- And so on, _until external event "stopEvent" gets triggered_. By this time, all scheduled tasks get cancelled and no task runs from here, due the event driven nature of the task graph.

As you can see, task graphs can get as complicated as you want (or need, for your application). There are some [limitations](#limitations) though.

> **Note**: By default all the tasks produce an event with the format: `{task-name}finished` upon completion. This behavior can be overridden in order to generate custom events.

The next thing to do is to initialize task's dispatcher object globally passing by the previously-defined app tasks and task graph. You will have to do that in app's `app.ts` file (or `main.ts` file in an Angular application):

```ts
// app.ts / main.ts
// TypeScript App:
import * as app from "tns-core-modules/application";
// or Angular App:
import { platformNativeScriptDynamic } from "nativescript-angular/platform";
import { AppModule } from "./app/app.module";

// NativeScript Task Dispatcher plugin imports
// (always between imports and app initialization)
import { taskDispatcher } from "nativescript-task-dispatcher";
import { appTasks } from "./tasks";
import { demoTaskGraph } from "./tasks/graph";

taskDispatcher.init(appTasks, demoTaskGraph, {
  // Recommended, to see debug and info messages while developing
  enableLogging: true,
});

// TypeScript App:
app.run({ moduleName: "app-root" });
// Angular App:
platformNativeScriptDynamic().bootstrapModule(AppModule);
```

Finally, you'll need to decide where does your app generate the external event that starts your task graph. As a matter of an example, in our demo app it is placed inside `home-page.ts` (home page's controller). We emit the `"startEvent"` when the user navigates to this view:

```ts
// home-page.ts
import { taskDispatcher } from "nativescript-task-dispatcher";
import { emit, createEvent } from "nativescript-task-dispatcher/events";

import { NavigatedData, Page } from "tns-core-modules/ui/page";
import { HomeViewModel } from "./home-view-model";

export function onNavigatingTo(args: NavigatedData) {
  const page = <Page>args.object;

  page.bindingContext = new HomeViewModel();

  emitStartEvent();
}

async function emitStartEvent() {
  const isReady = await taskDispatcher.isReady();
  if (!isReady) {
    await taskDispatcher.prepare();
  }
  emit(createEvent("startEvent"));
}
```

## API

### taskDispatcher

### Task ([see code](https://github.com/GeoTecINIT/nativescript-task-dispatcher/blob/master/src/internal/tasks/task.ts#L10))

### SimpleTask ([see code](https://github.com/GeoTecINIT/nativescript-task-dispatcher/blob/master/src/internal/tasks/simple-task.ts#L6))

### TaskGraph ([see code](https://github.com/GeoTecINIT/nativescript-task-dispatcher/blob/master/src/internal/tasks/graph/index.ts#L16))

#### EventListenerGenerator

#### RunnableTaskDescriptor

##### RunnableTaskBuilder ([see code](https://github.com/GeoTecINIT/nativescript-task-dispatcher/blob/master/src/internal/tasks/runnable-task/builder.ts#L24))

### Events

Describe your plugin methods and properties here. See [nativescript-feedback](https://github.com/EddyVerbruggen/nativescript-feedback) for example.

| Property         | Default                | Description                                 |
| ---------------- | ---------------------- | ------------------------------------------- |
| some property    | property default value | property description, default values, etc.. |
| another property | property default value | property description, default values, etc.. |

## Limitations

- **No support for scheduled tasks on iOS**. We currently cannot commit to an estimated time until this limitation gets addressed.
- **Scheduled tasks can run in parallel, in contrast _an event cannot spawn the execution of multiple tasks at the same time._** We are aware of that this might pose severe constraints for certain setups. That's why solving this limitation is one of our priorities
- **Task chains initiated by external events might not be able to finish its execution at some point if the user switches to a different app or the task chain starts in background.** Again, we are aware of that this can pose a problem for executing tasks reliably under certain circumstances. That's why solving this limitation is another of our priorities.
- **Trying to stop and start scheduled tasks in the same app run will lead to latest planning being ignored**. This was thought as a feature to avoid event-driven tasks being triggered after its cancellation, but we can understand that it can be understood as a bug. We'll fix this limitation by following a different convention: in order to stop an event-driven task, stop the event source instead. Addressing this limitation is our top priority.

## License

Apache License Version 2.0, January 2004
