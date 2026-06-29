// Polyfill browser globals missing from jsdom that @lexical/rich-text references at runtime.
// objectKlassEquals(event, DragEvent) and objectKlassEquals(event, ClipboardEvent) check
// objectClass.name, so these constructors must exist as named classes.

if (typeof globalThis.DragEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DragEvent = class DragEvent extends Event {};
}

if (typeof globalThis.ClipboardEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ClipboardEvent = class ClipboardEvent extends Event {};
}
