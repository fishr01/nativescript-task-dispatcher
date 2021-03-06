import { PlannedTask, PlanningType } from "./planner/planned-task";
import { PlannedTasksStore } from "../persistence/planned-tasks-store";
import { now } from "../utils/time";
import { ForegroundChecker } from "./foreground-checker";

export class TaskManager {
  private _allTasks: Array<PlannedTask>;

  constructor(
    private planningType: PlanningType,
    private plannedTasksStore: PlannedTasksStore,
    private foregroundChecker: ForegroundChecker,
    private intervalOffset: number,
    private currentTime = now()
  ) {}

  async tasksToRun(): Promise<Array<PlannedTask>> {
    const allTasks = await this.allTasks();

    return allTasks.filter((task) => this.determineIfTaskShouldBeRun(task));
  }

  async requiresForeground(): Promise<boolean> {
    const tasksToRun = await this.tasksToRun();
    for (let task of tasksToRun) {
      const requiresForeground = this.foregroundChecker.requiresForegroundThroughChain(
        task.name
      );
      if (requiresForeground) {
        return true;
      }
    }
    return false;
  }

  async willContinue(): Promise<boolean> {
    return (await this.nextInterval()) !== -1;
  }

  async nextInterval(): Promise<number> {
    const allTasks = await this.allTasks();

    if (allTasks.length === 0) {
      return -1;
    }

    const tasksToRunInTheFuture = allTasks.filter(
      (task) => task.recurrent || !this.determineIfTaskShouldBeRun(task)
    );

    if (tasksToRunInTheFuture.length === 0) {
      return -1;
    }

    const nextIntervals = tasksToRunInTheFuture.map((task) => {
      let next = task.nextRun(this.currentTime);
      if (next < this.intervalOffset) {
        next += task.interval;
      }

      return next;
    });

    const sortedIntervals = nextIntervals.sort((i1, i2) => i1 - i2);

    return sortedIntervals[0];
  }

  private determineIfTaskShouldBeRun(task: PlannedTask): boolean {
    if (this.currentTime < task.startAt - this.intervalOffset) {
      return false;
    } else if (task.lastUpdate < task.startAt) {
      return true;
    }

    return (
      this.currentTime >= task.lastUpdate + task.interval - this.intervalOffset
    );
  }

  private async allTasks(): Promise<Array<PlannedTask>> {
    if (!this._allTasks) {
      this._allTasks = await this.plannedTasksStore.getAllSortedByNextRun(
        this.planningType
      );
    }

    return this._allTasks;
  }
}
