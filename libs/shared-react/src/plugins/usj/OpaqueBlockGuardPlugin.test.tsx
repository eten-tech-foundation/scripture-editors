import { isEditingKey } from "./OpaqueBlockGuardPlugin";

/** Build a keydown the guard can judge, defaulting the modifier state to "nothing held". */
function keyEvent(key: string, init: Partial<KeyboardEvent> = {}): KeyboardEvent {
  const modifiers = new Set<string>((init as { modifierStates?: string[] }).modifierStates ?? []);
  return {
    key,
    keyCode: 0,
    isComposing: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    getModifierState: (name: string) => modifiers.has(name),
    ...init,
  } as unknown as KeyboardEvent;
}

describe("isEditingKey", () => {
  it("counts plain typing and the text-removing keys", () => {
    expect(isEditingKey(keyEvent("a"))).toBe(true);
    expect(isEditingKey(keyEvent(" "))).toBe(true);
    expect(isEditingKey(keyEvent("Backspace"))).toBe(true);
    expect(isEditingKey(keyEvent("Delete"))).toBe(true);
    expect(isEditingKey(keyEvent("Enter"))).toBe(true);
  });

  it("does not count navigation or a modifier chord as typing", () => {
    expect(isEditingKey(keyEvent("ArrowLeft"))).toBe(false);
    expect(isEditingKey(keyEvent("c", { ctrlKey: true }))).toBe(false);
    expect(isEditingKey(keyEvent("z", { metaKey: true }))).toBe(false);
    expect(isEditingKey(keyEvent(" ", { ctrlKey: true }))).toBe(false);
  });

  it("counts an AltGr character as typing even though it reports Ctrl+Alt", () => {
    // AltGr+Q is "@" on a German keyboard; without this the character reaches a read-only block.
    const altGr = keyEvent("@", {
      ctrlKey: true,
      altKey: true,
      modifierStates: ["AltGraph"],
    } as Partial<KeyboardEvent>);

    expect(isEditingKey(altGr)).toBe(true);
  });

  it("still refuses a real Ctrl+Alt chord, which sets no AltGraph state", () => {
    expect(isEditingKey(keyEvent("c", { ctrlKey: true, altKey: true }))).toBe(false);
  });

  it("counts an IME composition keystroke as typing", () => {
    expect(isEditingKey(keyEvent("Process", { keyCode: 229 }))).toBe(true);
    expect(isEditingKey(keyEvent("a", { isComposing: true }))).toBe(true);
  });
});
