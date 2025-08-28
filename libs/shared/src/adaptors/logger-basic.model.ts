// Taken methods in common with Console from: import type { LogFunctions } from "electron-log";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Basic logging interface providing standard log level methods.
 *
 * @remarks
 * This interface defines the contract for basic logging functionality with four standard log
 * levels: error, warn, info, and debug. Implementations should handle the variable arguments
 * appropriately for their logging backend.
 *
 * @example
 * ```typescript
 * const logger: LoggerBasic = new MyLogger();
 * logger.info('Application started');
 * logger.warn('Configuration missing, using defaults');
 * logger.error('Failed to connect to database');
 * ```
 *
 * @public
 */
export interface LoggerBasic {
  /** Log an error message */
  error(...params: any[]): void;

  /** Log a warning message */
  warn(...params: any[]): void;

  /** Log an informational message */
  info(...params: any[]): void;

  /** Log a debug message */
  debug(...params: any[]): void;
}
