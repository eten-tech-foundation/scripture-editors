// Taken methods in common with Console from: import type { LogFunctions } from "electron-log";
/* eslint-disable @typescript-eslint/no-explicit-any */

export type LoggerBasic = {
  /** Log an error message */
  error(...params: any[]): void;

  /** Log a warning message */
  warn(...params: any[]): void;

  /** Log an informational message */
  info(...params: any[]): void;

  /** Log a debug message */
  debug(...params: any[]): void;
};
