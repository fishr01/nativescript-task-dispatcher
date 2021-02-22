import { android as androidApp } from "@nativescript/core/application/application";

export function now(): number {
  if (androidApp) {
    return java.lang.System.currentTimeMillis();
  } else {
    return Math.round(NSDate.date().timeIntervalSince1970 * 1000.0);
  }
}
