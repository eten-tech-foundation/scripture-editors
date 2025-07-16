/**
 * this module provides utility functions for the Perf plugin.
 * @module
 */
import { ElementNode, LexicalNode } from "lexical";
import { PerfKind } from "./types";

/**
 * Function to determine the perf node kind based on the node.
 * @param node - The node to determine the kind for.
 * @param parent - The parent node of the given node.
 * @returns The kind of the node.
 */
export function getPerfKindFromNode(node: LexicalNode | ElementNode) {
  if (node && checkIsSequence(node)) return PerfKind.Sequence; // If the node is a sequence, return "sequence"
  const parent = node.getParent();
  if (parent && (checkIsSequence(parent) || parent.getType() === "graft")) return PerfKind.Block; // If the parent is a sequence, return PerfKind.Block
  return PerfKind.ContentElement; // Otherwise, return "content"
}

/**
 * Function to check if a node is a sequence.
 * @param node - The node to check.
 * @returns A boolean indicating whether the node is a sequence.
 */
export function checkIsSequence(node: LexicalNode | ElementNode) {
  return ["root"].includes(node.getType() ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepEqual(objA: any, objB: any, keysToExclude: string[] = []): boolean {
  // If both objects are the same object or are equal primitives, return true
  if (objA === objB) return true;

  // If either object is null or not an object, they're not deeply equal
  if (objA === null || typeof objA !== "object" || objB === null || typeof objB !== "object")
    return false;

  // Get the keys of each object
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  // If they have a different number of keys, they're not deeply equal
  if (keysA.length !== keysB.length) {
    if (keysToExclude.length === 0) return false;
    // If the number of keys is different, check if the keys that are unique to one object are in the keysToExclude array
    const uniqueKeys = keysA.filter((key) => !keysB.includes(key));
    if (uniqueKeys.length > keysToExclude.length) return false;
    if (!uniqueKeys.every((key) => keysToExclude.includes(key))) return false;
  }

  // Check if every key in objA also exists in objB and if the values are deeply equal
  return keysA.every((key) => {
    if (keysToExclude.includes(key)) return true;
    const areEqual = keysB.includes(key) && deepEqual(objA[key], objB[key], keysToExclude);
    if (!areEqual) console.log(key);
    return areEqual;
  });
}
