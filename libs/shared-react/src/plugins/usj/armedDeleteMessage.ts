import { ArmedDelete } from "./structureKeyboard.utils";

/**
 * The destructive-tooltip copy for an armed two-step delete: the key to press again and the rest
 * of the sentence. `para` is never shown a tooltip, so it maps to the verse-marker wording.
 */
export function armedDeleteMessage(
  kind: ArmedDelete["kind"],
  intent: ArmedDelete["intent"],
): { key: string; text: string } {
  const key = intent === "deleteBackward" ? "Backspace" : "Delete";
  const text = kind === "selection" ? "again to delete selection" : "again to remove verse marker";
  return { key, text };
}
