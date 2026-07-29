/**
 * Structure-protection mode for paragraph/verse markers via keyboard, paste, and drop.
 * - "off": fully native editing, no protection or delete confirmation.
 * - "guarded": two-step intentional delete (first press arms the marker, second press deletes
 *   it); no hard blocking of paste/drop/typing.
 * - "protected": structural keystrokes and paste/drop of structural markers are blocked outright.
 *
 * @public
 */
export type StructureProtectionMode = "off" | "guarded" | "protected";
