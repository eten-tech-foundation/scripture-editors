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

/**
 * Ensure the platform's DOM XML APIs are available before converting.
 * @param caller - Name of the converter function, for the error message.
 */
export function assertDomEnvironment(caller: string): void {
  if (typeof DOMParser !== "undefined" && typeof XMLSerializer !== "undefined") return;

  throw new Error(
    `${caller} requires a DOM environment (DOMParser and XMLSerializer). In Node.js, provide ` +
      "DOM globals before calling, e.g. from jsdom or @xmldom/xmldom.",
  );
}
