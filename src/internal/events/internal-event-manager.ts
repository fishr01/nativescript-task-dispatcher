import {
  Observable,
  fromObject,
  EventData as NSEventData,
} from "@nativescript/core/data/observable";
import { EventCallback } from "./event-receivers";
import { DispatchableEvent } from "./events";

export class InternalEventManager {
  private notificationCenter: Observable;
  private listenerCounter: number;
  private callbacks: CallbackStore;

  constructor() {
    this.notificationCenter = fromObject({});
    this.listenerCounter = 0;
    this.callbacks = new CallbackStore();
  }

  on(eventName: string, callback: EventCallback): number {
    const callbackId: CallbackId = [eventName, this.listenerCounter];
    const internalCallback = (eventData: InternalEventData) =>
      callback(eventData.data);
    this.callbacks.set(callbackId, internalCallback);
    this.notificationCenter.on(eventName, internalCallback);

    return this.listenerCounter++;
  }

  off(eventName: string, listenerId?: number) {
    if (listenerId === undefined) {
      this.notificationCenter.off(eventName);
      this.callbacks.deleteCallbackMap(eventName);

      return;
    }
    const callbackId: CallbackId = [eventName, listenerId];
    const internalCallback = this.callbacks.get(callbackId);
    if (!internalCallback) {
      return;
    }
    this.notificationCenter.off(eventName, internalCallback);
    this.callbacks.delete(callbackId);
  }

  emit(dispatchableEvent: DispatchableEvent) {
    const internalEventData = {
      eventName: dispatchableEvent.name,
      object: this.notificationCenter,
      data: { ...dispatchableEvent },
    };
    try {
      this.notificationCenter.notify<InternalEventData>(internalEventData);
    } catch (err) {
      if (err instanceof TypeError) {
        // Notify seems not to be "async"-safe, and sometimes looses (undefined) some already-removed
        // callbacks during the event notification process. After throughout testing, this error is
        // known to have no impact on the expected functionality (registered callbacks are anyway
        // getting notified), that is why it is being discarded. Further investigation is needed, though
        return;
      }
      throw err;
    }
  }

  hasListeners(eventName: string): boolean {
    return this.notificationCenter.hasListeners(eventName);
  }
}

type CallbackId = [string, number];

interface InternalEventData extends NSEventData {
  data: DispatchableEvent;
}

type InternalEventCallback = (eventData: InternalEventData) => void;

// tslint:disable-next-line:max-classes-per-file
class CallbackStore {
  private callbackTree: Callbacks = {};

  set(callbackId: CallbackId, internalCallback: InternalEventCallback) {
    const [eventName, listenerId] = callbackId;
    if (!this.callbackTree[eventName]) {
      this.callbackTree[eventName] = new Map();
    }
    this.callbackTree[eventName].set(listenerId, internalCallback);
  }

  get(callbackId: CallbackId): InternalEventCallback {
    const [eventName, listenerId] = callbackId;
    const callbackMap = this.callbackTree[eventName];
    if (!callbackMap) {
      return null;
    }
    const internalCallback = callbackMap.get(listenerId);

    return internalCallback ? internalCallback : null;
  }

  delete(callbackId: CallbackId) {
    const [eventName, listenerId] = callbackId;
    const callbackMap = this.callbackTree[eventName];
    if (!callbackMap) {
      return;
    }
    callbackMap.delete(listenerId);
    if (callbackMap.size === 0) {
      delete this.callbackTree[eventName];
    }
  }

  deleteCallbackMap(eventName: string) {
    const callbackMap = this.callbackTree[eventName];
    if (!callbackMap) {
      return;
    }
    callbackMap.clear();
    delete this.callbackTree[eventName];
  }
}

interface Callbacks {
  [key: string]: Map<number, InternalEventCallback>;
}
