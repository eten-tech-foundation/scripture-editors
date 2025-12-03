/**
 * Type guards for {@link UsjDocumentLocation} subtypes.
 *
 * These guards enable runtime type narrowing to distinguish between the different
 * location types in a USJ document.
 */

import type {
  UsjDocumentLocation,
  UsjMarkerLocation,
  UsjClosingMarkerLocation,
  UsjTextContentLocation,
  UsjPropertyValueLocation,
  UsjAttributeKeyLocation,
  UsjAttributeMarkerLocation,
  UsjClosingAttributeMarkerLocation,
} from "./usj-document-location.model.js";

/**
 * Type guard to check if a location is a {@link UsjMarkerLocation}.
 *
 * A marker location points to the very beginning of a marker (at the backslash in USFM).
 * It only has a `jsonPath` property with no offset properties.
 *
 * @param location - The location to check.
 * @returns `true` if the location is a `UsjMarkerLocation`, `false` otherwise.
 *
 * @public
 */
export function isUsjMarkerLocation(
  location: UsjDocumentLocation | undefined | null,
): location is UsjMarkerLocation {
  return (
    location != null &&
    "jsonPath" in location &&
    !("offset" in location) &&
    !("closingMarkerOffset" in location) &&
    !("propertyOffset" in location) &&
    !("keyName" in location)
  );
}

/**
 * Type guard to check if a location is a {@link UsjClosingMarkerLocation}.
 *
 * A closing marker location points to a specific point in the closing marker representation
 * of a marker object (e.g., `\nd*` in USFM).
 *
 * @param location - The location to check.
 * @returns `true` if the location is a `UsjClosingMarkerLocation`, `false` otherwise.
 *
 * @public
 */
export function isUsjClosingMarkerLocation(
  location: UsjDocumentLocation | undefined | null,
): location is UsjClosingMarkerLocation {
  return location != null && "jsonPath" in location && "closingMarkerOffset" in location;
}

/**
 * Type guard to check if a location is a {@link UsjTextContentLocation}.
 *
 * A text content location points to a specific character offset within a text content string
 * in a marker's content array.
 *
 * @param location - The location to check.
 * @returns `true` if the location is a `UsjTextContentLocation`, `false` otherwise.
 *
 * @public
 */
export function isUsjTextContentLocation(
  location: UsjDocumentLocation | undefined | null,
): location is UsjTextContentLocation {
  return (
    location != null &&
    "jsonPath" in location &&
    "offset" in location &&
    !("propertyOffset" in location) &&
    !("keyName" in location)
  );
}

/**
 * Type guard to check if a location is a {@link UsjPropertyValueLocation}.
 *
 * A property value location points to a specific character offset within a property value
 * (such as `marker` or an attribute value).
 *
 * @param location - The location to check.
 * @returns `true` if the location is a `UsjPropertyValueLocation`, `false` otherwise.
 *
 * @public
 */
export function isUsjPropertyValueLocation(
  location: UsjDocumentLocation | undefined | null,
): location is UsjPropertyValueLocation {
  return location != null && "jsonPath" in location && "propertyOffset" in location;
}

/**
 * Type guard to check if a location is a {@link UsjAttributeKeyLocation}.
 *
 * An attribute key location points to a specific character offset within an attribute's key string.
 *
 * @param location - The location to check.
 * @returns `true` if the location is a `UsjAttributeKeyLocation`, `false` otherwise.
 *
 * @public
 */
export function isUsjAttributeKeyLocation(
  location: UsjDocumentLocation | undefined | null,
): location is UsjAttributeKeyLocation {
  return (
    location != null && "jsonPath" in location && "keyName" in location && "keyOffset" in location
  );
}

/**
 * Type guard to check if a location is a {@link UsjAttributeMarkerLocation}.
 *
 * An attribute marker location points to the beginning of an attribute marker
 * (at the backslash in USFM, e.g., `\ca` for chapter alternate number).
 *
 * @param location - The location to check.
 * @returns `true` if the location is a `UsjAttributeMarkerLocation`, `false` otherwise.
 *
 * @public
 */
export function isUsjAttributeMarkerLocation(
  location: UsjDocumentLocation | undefined | null,
): location is UsjAttributeMarkerLocation {
  return (
    location != null &&
    "jsonPath" in location &&
    "keyName" in location &&
    !("keyOffset" in location) &&
    !("keyClosingMarkerOffset" in location)
  );
}

/**
 * Type guard to check if a location is a {@link UsjClosingAttributeMarkerLocation}.
 *
 * A closing attribute marker location points to a specific point in the closing marker
 * representation of an attribute marker (e.g., `\ca*` in USFM).
 *
 * @param location - The location to check.
 * @returns `true` if the location is a `UsjClosingAttributeMarkerLocation`, `false` otherwise.
 *
 * @public
 */
export function isUsjClosingAttributeMarkerLocation(
  location: UsjDocumentLocation | undefined | null,
): location is UsjClosingAttributeMarkerLocation {
  return (
    location != null &&
    "jsonPath" in location &&
    "keyName" in location &&
    "keyClosingMarkerOffset" in location
  );
}

/**
 * Gets a human-readable name for the type of a {@link UsjDocumentLocation}.
 *
 * Useful for error messages when an unsupported location type is encountered.
 *
 * @param location - The location to get the type name for.
 * @returns A string describing the location type, or "undefined" / "null" if the location is not
 *   provided.
 *
 * @public
 */
export function getUsjDocumentLocationTypeName(
  location: UsjDocumentLocation | undefined | null,
): string {
  if (location === undefined) return "undefined";
  if (location === null) return "null";
  if (isUsjClosingAttributeMarkerLocation(location)) return "UsjClosingAttributeMarkerLocation";
  if (isUsjAttributeKeyLocation(location)) return "UsjAttributeKeyLocation";
  if (isUsjAttributeMarkerLocation(location)) return "UsjAttributeMarkerLocation";
  if (isUsjPropertyValueLocation(location)) return "UsjPropertyValueLocation";
  if (isUsjClosingMarkerLocation(location)) return "UsjClosingMarkerLocation";
  if (isUsjTextContentLocation(location)) return "UsjTextContentLocation";
  if (isUsjMarkerLocation(location)) return "UsjMarkerLocation";
  return "Unknown";
}
