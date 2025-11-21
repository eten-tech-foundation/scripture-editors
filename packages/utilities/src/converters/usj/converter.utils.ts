/* Utility functions for converters */

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Avoid prototype pollution by disallowing unsafe keys.
 * @param key - The array key to validate.
 *
 * @public
 */
export function assertSafeKey(key: string): void {
  if (!UNSAFE_KEYS.has(key)) return;

  throw new Error(`The key "${key}" is not allowed to avoid prototype pollution.`);
}
