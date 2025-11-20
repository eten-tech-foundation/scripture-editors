/**
 * Adapted from https://github.com/facebook/lexical/blob/92c47217244f9d3c22a59728633fb41a10420724/packages/lexical-mark/src/MarkNode.ts
 * This adaption allows for different types of marks while still only requiring one mark to enclose
 * a selection.
 */

import { assertSafeKey } from "../usj/node.utils.js";
import { addClassNamesToElement, removeClassNamesFromElement } from "@lexical/utils";
import type {
  BaseSelection,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  RangeSelection,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
  TextNode,
} from "lexical";
import {
  $applyNodeReplacement,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
} from "lexical";

export interface TypedIDs {
  [type: string]: string[];
}

/**
 * DOM mouse event type.
 * @public
 */
export type DomMouseEvent = globalThis.MouseEvent;

/**
 * A callback function type for handling click events.
 *
 * @param event - The native DOM mouse event containing event details.
 * @param type - The type of the associated annotation.
 * @param id - The ID of the associated annotation.
 * @param textContent - The text content that was annotated when the click occurred.
 *
 * @public
 */
export type TypedMarkOnClick = (
  event: DomMouseEvent,
  type: string,
  id: string,
  textContent: string,
) => void;

export interface TypedOnClicks {
  [type: string]: { [id: string]: TypedMarkOnClick };
}

/**
 * Typed mark removal cause types.
 * @public
 */
export type TypedMarkRemovalCause = "removed" | "destroyed";

/**
 * A callback function type for handling removal events.
 *
 * @param type - The type of the associated annotation.
 * @param id - The ID of the associated annotation.
 * @param cause - The cause of the removal.
 * @param textContent - The text content that was annotated when the removal occurred.
 *
 * @public
 */
export type TypedMarkOnRemove = (
  type: string,
  id: string,
  cause: TypedMarkRemovalCause,
  textContent: string,
) => void;

export interface TypedOnRemoves {
  [type: string]: { [id: string]: TypedMarkOnRemove };
}

export type SerializedTypedMarkNode = Spread<
  {
    typedIDs: TypedIDs;
  },
  SerializedElementNode
>;

/** Reserved mark type for CommentPlugin. */
export const COMMENT_MARK_TYPE = "internal-comment";

const reservedTypes = [COMMENT_MARK_TYPE];
const NO_IDS: TypedIDs = Object.freeze({});
const NO_ON_CLICKS: TypedOnClicks = Object.freeze({});
const NO_ON_REMOVES: TypedOnRemoves = Object.freeze({});
const TYPED_MARK_VERSION = 1;

const typedOnClickRegistry = new Map<NodeKey, TypedOnClicks>();
const typedOnRemoveRegistry = new Map<NodeKey, TypedOnRemoves>();

export class TypedMarkNode extends ElementNode {
  __typedIDs: TypedIDs;
  __typedOnClicks?: TypedOnClicks;
  __typedOnRemoves?: TypedOnRemoves;
  __domOnClickListener?: (event: DomMouseEvent) => void;
  __suppressOnRemoveCallbacks?: boolean;

  constructor(
    typedIds: TypedIDs = NO_IDS,
    typedOnClicks?: TypedOnClicks,
    typedOnRemoves?: TypedOnRemoves,
    key?: NodeKey,
  ) {
    super(key);
    this.__typedIDs = cloneTypedIDs(typedIds);
    this.__typedOnClicks = cloneTypedOnClicks(typedOnClicks);
    this.__typedOnRemoves = cloneTypedOnRemoves(typedOnRemoves);
    this.pruneTypedOnClicks();
    this.pruneTypedOnRemoves();
    this.syncTypedOnClicksToRegistry();
    this.syncTypedOnRemovesToRegistry();
  }

  static override getType(): string {
    return "typed-mark";
  }

  static override clone(node: TypedMarkNode): TypedMarkNode {
    const __typedIDs = cloneTypedIDs(node.__typedIDs);
    const __typedOnClicks = cloneTypedOnClicks(node.__typedOnClicks);
    const __typedOnRemoves = cloneTypedOnRemoves(node.__typedOnRemoves);
    return new TypedMarkNode(__typedIDs, __typedOnClicks, __typedOnRemoves, node.__key);
  }

  static isReservedType(type: string): boolean {
    return reservedTypes.includes(type);
  }

  static override importDOM(): null {
    return null;
  }

  static override importJSON(serializedNode: SerializedTypedMarkNode): TypedMarkNode {
    return $createTypedMarkNode().updateFromJSON(serializedNode);
  }

  override exportJSON(): SerializedTypedMarkNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      typedIDs: this.getTypedIDs(),
      version: TYPED_MARK_VERSION,
    };
  }

  override createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const element = document.createElement("mark");
    for (const [type, ids] of Object.entries(this.__typedIDs)) {
      addClassNamesToElement(element, getTypedClassName(config.theme.typedMark, type));
      if (ids.length > 1) {
        addClassNamesToElement(element, getTypedClassName(config.theme.typedMarkOverlap, type));
      }
      for (const id of ids) {
        addClassNamesToElement(element, getTypedClassName("annotationId", id));
      }
    }
    const clickListener = this.getOrCreateDOMClickListener(editor);
    element.addEventListener("click", clickListener);
    return element;
  }

  override updateDOM(prevNode: TypedMarkNode, element: HTMLElement, config: EditorConfig): boolean {
    const types = new Set([
      ...Object.keys(prevNode.__typedIDs ?? {}),
      ...Object.keys(this.__typedIDs ?? {}),
    ]);

    for (const type of types) {
      const prevIDs = prevNode.__typedIDs[type] ?? [];
      const nextIDs = this.__typedIDs[type] ?? [];
      const prevIDsCount = prevIDs.length;
      const nextIDsCount = nextIDs.length;
      const markTheme = getTypedClassName(config.theme.typedMark, type);
      const overlapTheme = getTypedClassName(config.theme.typedMarkOverlap, type);

      if (prevIDsCount !== nextIDsCount) {
        if (prevIDsCount === 0) {
          if (nextIDsCount === 1) addClassNamesToElement(element, markTheme);
        } else if (nextIDsCount === 0) {
          removeClassNamesFromElement(element, markTheme);
        }

        if (prevIDsCount === 1) {
          if (nextIDsCount === 2) addClassNamesToElement(element, overlapTheme);
        } else if (nextIDsCount === 1) {
          removeClassNamesFromElement(element, overlapTheme);
        }
      }

      const prevIDsSet = new Set(prevIDs);
      const nextIDsSet = new Set(nextIDs);

      for (const id of prevIDs) {
        if (!nextIDsSet.has(id)) {
          removeClassNamesFromElement(element, getTypedClassName("annotationId", id));
        }
      }

      for (const id of nextIDs) {
        if (!prevIDsSet.has(id)) {
          addClassNamesToElement(element, getTypedClassName("annotationId", id));
        }
      }
    }

    return false;
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTypedMarkNode>): this {
    return super.updateFromJSON(serializedNode).setTypedIDs(serializedNode.typedIDs);
  }

  hasID(type: string, id: string): boolean {
    const typedIDs = this.getTypedIDs();
    const ids = typedIDs[type];
    if (!ids) return false;

    for (const existingId of ids) {
      if (id === existingId) {
        return true;
      }
    }
    return false;
  }

  getTypedIDs(): TypedIDs {
    const self = this.getLatest();
    return $isTypedMarkNode(self) ? self.__typedIDs : {};
  }

  setTypedIDs(ids: TypedIDs): this {
    const self = this.getWritable();
    const previousIDs = cloneTypedIDs(self.__typedIDs);
    self.__typedIDs = cloneTypedIDs(ids);
    self.dispatchRemovedIDs(previousIDs, self.__typedIDs, "removed");
    self.pruneTypedOnClicks();
    self.pruneTypedOnRemoves();
    self.syncTypedOnClicksToRegistry();
    self.syncTypedOnRemovesToRegistry();
    const mergedNode = self.mergeWithAdjacentTypedMarks();
    if (mergedNode.hasNoIDsForEveryType() && mergedNode.getParent() !== null)
      $unwrapTypedMarkNode(mergedNode);
    return mergedNode;
  }

  setTypedOnClicks(typedOnClicks: TypedOnClicks): this {
    const self = this.getWritable();
    self.__typedOnClicks = cloneTypedOnClicks(typedOnClicks);
    self.pruneTypedOnClicks();
    self.syncTypedOnClicksToRegistry();
    return self;
  }

  getTypedOnClicks(): TypedOnClicks {
    const self = this.getLatest();
    if (!$isTypedMarkNode(self)) return {};
    const stored = typedOnClickRegistry.get(self.getKey());
    return stored ?? {};
  }

  setTypedOnRemoves(typedOnRemoves: TypedOnRemoves): this {
    const self = this.getWritable();
    self.__typedOnRemoves = cloneTypedOnRemoves(typedOnRemoves);
    self.pruneTypedOnRemoves();
    self.syncTypedOnRemovesToRegistry();
    return self;
  }

  getTypedOnRemoves(): TypedOnRemoves {
    const self = this.getLatest();
    if (!$isTypedMarkNode(self)) return {};
    const stored = typedOnRemoveRegistry.get(self.getKey());
    return stored ?? {};
  }

  addID(type: string, id: string, onClick?: TypedMarkOnClick, onRemove?: TypedMarkOnRemove): void {
    const self = this.getWritable();
    if (!$isTypedMarkNode(self)) return;

    assertSafeKey(type);
    assertSafeKey(id);

    let ids = self.__typedIDs[type];
    if (!ids) {
      ids = [];
      self.__typedIDs[type] = ids;
    }
    for (const existingId of ids) {
      if (id === existingId) {
        if (onClick) self.setOnClickFor(type, id, onClick);
        if (onRemove) self.setOnRemoveFor(type, id, onRemove);
        return;
      }
    }
    ids.push(id);
    if (onClick) self.setOnClickFor(type, id, onClick);
    if (onRemove) self.setOnRemoveFor(type, id, onRemove);
  }

  deleteID(type: string, id: string): void {
    const self = this.getWritable();
    if (!$isTypedMarkNode(self)) return;

    const ids = self.__typedIDs[type];
    if (!ids || ids.length === 0) return;

    for (let i = 0; i < ids.length; i++) {
      if (id === ids[i]) {
        ids.splice(i, 1);
        self.invokeOnRemove(type, id, "removed");
        break;
      }
    }

    self.removeOnClickFor(type, id);
    self.removeOnRemoveFor(type, id);
    self.pruneTypedOnClicks();
    self.pruneTypedOnRemoves();
    const mergedNode = self.mergeWithAdjacentTypedMarks();
    if (mergedNode.hasNoIDsForEveryType() && mergedNode.getParent() !== null)
      $unwrapTypedMarkNode(mergedNode);
  }

  hasNoIDsForEveryType(): boolean {
    return Object.values(this.getTypedIDs()).every((ids) => ids === undefined || ids.length === 0);
  }

  override insertNewAfter(_selection: RangeSelection, restoreSelection = true): null | ElementNode {
    const node = $createTypedMarkNode(this.__typedIDs, this.getTypedOnClicks());
    this.insertAfter(node, restoreSelection);
    return node;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  override canBeEmpty(): false {
    return false;
  }

  override isInline(): true {
    return true;
  }

  override extractWithChild(
    _child: LexicalNode,
    selection: BaseSelection,
    destination: "clone" | "html",
  ): boolean {
    if (!$isRangeSelection(selection) || destination === "html") {
      return false;
    }
    const anchor = selection.anchor;
    const focus = selection.focus;
    const anchorNode = anchor.getNode();
    const focusNode = focus.getNode();
    const isBackward = selection.isBackward();
    const selectionLength = isBackward
      ? anchor.offset - focus.offset
      : focus.offset - anchor.offset;
    return (
      this.isParentOf(anchorNode) &&
      this.isParentOf(focusNode) &&
      this.getTextContent().length === selectionLength
    );
  }

  override excludeFromCopy(destination: "clone" | "html"): boolean {
    return destination !== "clone";
  }

  override remove(preserveEmptyParent?: boolean): void {
    const self = this.getWritable();
    const typedIDs = this.getTypedIDs();
    if (self.__suppressOnRemoveCallbacks) {
      self.__suppressOnRemoveCallbacks = undefined;
    } else {
      self.dispatchOnRemoveForTypedIDs(typedIDs, "destroyed");
    }

    typedOnClickRegistry.delete(self.getKey());
    typedOnRemoveRegistry.delete(self.getKey());
    self.__typedOnClicks = undefined;
    self.__typedOnRemoves = undefined;

    super.remove.call(self, preserveEmptyParent);
  }

  private getOrCreateDOMClickListener(editor: LexicalEditor): (event: DomMouseEvent) => void {
    if (!this.__domOnClickListener) {
      this.__domOnClickListener = (event: DomMouseEvent) => {
        this.handleDOMClick(event, editor);
      };
    }
    return this.__domOnClickListener;
  }

  private handleDOMClick(event: DomMouseEvent, editor: LexicalEditor): void {
    const typedOnClicks = typedOnClickRegistry.get(this.getKey());
    if (!typedOnClicks) return;

    const callbacks: [TypedMarkOnClick, string, string][] = [];
    for (const [type, callbacksById] of Object.entries(typedOnClicks)) {
      for (const [id, callback] of Object.entries(callbacksById)) {
        if (callback) callbacks.push([callback, type, id]);
      }
    }

    if (callbacks.length === 0) return;

    const textContent = editor.read(() => this.getTextContent());
    for (const [callback, type, id] of callbacks) {
      callback(event, type, id, textContent);
    }
  }

  private ensureOnClickMapMutable(): TypedOnClicks {
    if (this.__typedOnClicks === undefined || this.__typedOnClicks === NO_ON_CLICKS) {
      const existing = typedOnClickRegistry.get(this.getKey());
      this.__typedOnClicks = existing ?? {};
    }
    return this.__typedOnClicks;
  }

  private syncTypedOnClicksToRegistry(): void {
    if (!this.__typedOnClicks || Object.keys(this.__typedOnClicks).length === 0) {
      typedOnClickRegistry.delete(this.getKey());
      if (this.__typedOnClicks && Object.keys(this.__typedOnClicks).length === 0) {
        this.__typedOnClicks = undefined;
      }
      return;
    }
    typedOnClickRegistry.set(this.getKey(), this.__typedOnClicks);
  }

  private setOnClickFor(type: string, id: string, onClick: TypedMarkOnClick): void {
    assertSafeKey(type);
    assertSafeKey(id);

    const callbacks = this.ensureOnClickMapMutable();
    const typeCallbacks = callbacks[type] ?? (callbacks[type] = {});
    typeCallbacks[id] = onClick;
    this.syncTypedOnClicksToRegistry();
  }

  private removeOnClickFor(type: string, id: string): void {
    if (!this.__typedOnClicks) return;
    const typeCallbacks = this.__typedOnClicks[type];
    if (!typeCallbacks) return;

    const updatedTypeCallbacks = omitRecordKey(typeCallbacks, id);
    const hasRemainingCallbacks = Object.keys(updatedTypeCallbacks).length > 0;

    if (hasRemainingCallbacks) {
      this.__typedOnClicks = {
        ...this.__typedOnClicks,
        [type]: updatedTypeCallbacks,
      };
    } else {
      const remainingCallbacks = omitRecordKey(this.__typedOnClicks, type);
      this.__typedOnClicks =
        Object.keys(remainingCallbacks).length > 0 ? remainingCallbacks : undefined;
    }

    this.syncTypedOnClicksToRegistry();
  }

  private pruneTypedOnClicks(): void {
    if (!this.__typedOnClicks || this.__typedOnClicks === NO_ON_CLICKS) {
      this.__typedOnClicks = undefined;
      this.syncTypedOnClicksToRegistry();
      return;
    }

    const nextTypedOnClicks: TypedOnClicks = {};

    for (const [type, callbacks] of Object.entries(this.__typedOnClicks)) {
      const ids = this.__typedIDs[type];
      if (!ids || ids.length === 0) {
        continue;
      }
      const idSet = new Set(ids);
      const filteredCallbacks: { [id: string]: TypedMarkOnClick } = {};
      for (const [id, callback] of Object.entries(callbacks)) {
        if (idSet.has(id)) {
          filteredCallbacks[id] = callback;
        }
      }
      if (Object.keys(filteredCallbacks).length > 0) {
        nextTypedOnClicks[type] = filteredCallbacks;
      }
    }

    this.__typedOnClicks =
      Object.keys(nextTypedOnClicks).length > 0 ? nextTypedOnClicks : undefined;
    this.syncTypedOnClicksToRegistry();
  }

  private ensureOnRemoveMapMutable(): TypedOnRemoves {
    if (this.__typedOnRemoves === undefined || this.__typedOnRemoves === NO_ON_REMOVES) {
      const existing = typedOnRemoveRegistry.get(this.getKey());
      this.__typedOnRemoves = existing ?? {};
    }
    return this.__typedOnRemoves;
  }

  private syncTypedOnRemovesToRegistry(): void {
    if (!this.__typedOnRemoves || Object.keys(this.__typedOnRemoves).length === 0) {
      typedOnRemoveRegistry.delete(this.getKey());
      if (this.__typedOnRemoves && Object.keys(this.__typedOnRemoves).length === 0) {
        this.__typedOnRemoves = undefined;
      }
      return;
    }
    typedOnRemoveRegistry.set(this.getKey(), this.__typedOnRemoves);
  }

  private setOnRemoveFor(type: string, id: string, onRemove: TypedMarkOnRemove): void {
    assertSafeKey(type);
    assertSafeKey(id);

    const callbacks = this.ensureOnRemoveMapMutable();
    const typeCallbacks = callbacks[type] ?? (callbacks[type] = {});
    typeCallbacks[id] = onRemove;
    this.syncTypedOnRemovesToRegistry();
  }

  private removeOnRemoveFor(type: string, id: string): void {
    if (!this.__typedOnRemoves) return;
    const typeCallbacks = this.__typedOnRemoves[type];
    if (!typeCallbacks) return;

    const updatedTypeCallbacks = omitRecordKey(typeCallbacks, id);
    const hasRemainingCallbacks = Object.keys(updatedTypeCallbacks).length > 0;
    if (hasRemainingCallbacks) {
      this.__typedOnRemoves = {
        ...this.__typedOnRemoves,
        [type]: updatedTypeCallbacks,
      };
    } else {
      const remainingCallbacks = omitRecordKey(this.__typedOnRemoves, type);
      this.__typedOnRemoves =
        Object.keys(remainingCallbacks).length > 0 ? remainingCallbacks : undefined;
    }

    this.syncTypedOnRemovesToRegistry();
  }

  private pruneTypedOnRemoves(): void {
    if (!this.__typedOnRemoves || this.__typedOnRemoves === NO_ON_REMOVES) {
      this.__typedOnRemoves = undefined;
      this.syncTypedOnRemovesToRegistry();
      return;
    }

    const nextTypedOnRemoves: TypedOnRemoves = {};
    for (const [type, callbacks] of Object.entries(this.__typedOnRemoves)) {
      const ids = this.__typedIDs[type];
      if (!ids || ids.length === 0) continue;

      const idSet = new Set(ids);
      const filteredCallbacks: { [id: string]: TypedMarkOnRemove } = {};
      for (const [id, callback] of Object.entries(callbacks)) {
        if (idSet.has(id)) filteredCallbacks[id] = callback;
      }
      if (Object.keys(filteredCallbacks).length > 0) {
        nextTypedOnRemoves[type] = filteredCallbacks;
      }
    }

    this.__typedOnRemoves =
      Object.keys(nextTypedOnRemoves).length > 0 ? nextTypedOnRemoves : undefined;
    this.syncTypedOnRemovesToRegistry();
  }

  private invokeOnRemove(type: string, id: string, cause: TypedMarkRemovalCause): void {
    const callbacks = this.getTypedOnRemoves();
    const callback = callbacks[type]?.[id];
    if (!callback) return;

    callback(type, id, cause, this.getTextContent());
    this.removeOnRemoveFor(type, id);
  }

  private dispatchRemovedIDs(
    previous: TypedIDs,
    next: TypedIDs,
    cause: TypedMarkRemovalCause,
  ): void {
    const removedPairs = collectRemovedTypeIdPairs(previous, next);
    if (removedPairs.length === 0) return;

    for (const [type, id] of removedPairs) this.invokeOnRemove(type, id, cause);
  }

  private dispatchOnRemoveForTypedIDs(typedIDs: TypedIDs, cause: TypedMarkRemovalCause): void {
    for (const [type, ids] of Object.entries(typedIDs)) {
      if (!ids) continue;

      for (const id of ids) this.invokeOnRemove(type, id, cause);
    }
  }

  private mergeWithAdjacentTypedMarks(): this {
    if (this.hasNoIDsForEveryType()) return this;

    let previousSibling = this.getPreviousSibling();
    while (
      $isTypedMarkNode(previousSibling) &&
      typedIDsAreEqual(previousSibling.getTypedIDs(), this.getTypedIDs())
    ) {
      this.mergeWithPreviousTypedMark(previousSibling);
      previousSibling = this.getPreviousSibling();
    }

    let nextSibling = this.getNextSibling();
    while (
      $isTypedMarkNode(nextSibling) &&
      typedIDsAreEqual(this.getTypedIDs(), nextSibling.getTypedIDs())
    ) {
      this.mergeWithNextTypedMark(nextSibling);
      nextSibling = this.getNextSibling();
    }

    return this;
  }

  private mergeWithPreviousTypedMark(previous: TypedMarkNode): void {
    this.mergeOnClicksFrom(previous.getTypedOnClicks());
    this.mergeOnRemovesFrom(previous.getTypedOnRemoves());

    const previousChildren = previous.getChildren();
    if (previousChildren.length > 0) {
      this.splice(0, 0, previousChildren);
    }

    typedOnClickRegistry.delete(previous.getKey());
    typedOnRemoveRegistry.delete(previous.getKey());
    previous.getWritable().__suppressOnRemoveCallbacks = true;
    previous.remove();
  }

  private mergeWithNextTypedMark(next: TypedMarkNode): void {
    this.mergeOnClicksFrom(next.getTypedOnClicks());
    this.mergeOnRemovesFrom(next.getTypedOnRemoves());

    const nextChildren = next.getChildren();
    if (nextChildren.length > 0) {
      this.append(...nextChildren);
    }

    typedOnClickRegistry.delete(next.getKey());
    typedOnRemoveRegistry.delete(next.getKey());
    next.getWritable().__suppressOnRemoveCallbacks = true;
    next.remove();
  }

  private mergeOnClicksFrom(additional: TypedOnClicks): void {
    if (!additional || Object.keys(additional).length === 0) return;
    const merged = mergeTypedOnClickMaps(this.getTypedOnClicks(), additional);
    if (Object.keys(merged).length === 0) return;

    this.setTypedOnClicks(merged);
  }

  private mergeOnRemovesFrom(additional: TypedOnRemoves): void {
    if (!additional || Object.keys(additional).length === 0) return;
    const merged = mergeTypedOnRemoveMaps(this.getTypedOnRemoves(), additional);
    if (Object.keys(merged).length === 0) return;

    this.setTypedOnRemoves(merged);
  }
}

function cloneTypedIDs(typedIds: TypedIDs = NO_IDS): TypedIDs {
  const clone: TypedIDs = {};
  for (const [type, ids] of Object.entries(typedIds)) {
    assertSafeKey(type);
    if (!Array.isArray(ids)) {
      clone[type] = [];
      continue;
    }

    const clonedIds: string[] = [];
    for (const id of ids) {
      assertSafeKey(id);
      clonedIds.push(id);
    }

    clone[type] = clonedIds;
  }
  return clone;
}

function cloneTypedOnClicks(typedOnClicks?: TypedOnClicks): TypedOnClicks | undefined {
  if (!typedOnClicks || typedOnClicks === NO_ON_CLICKS) return undefined;

  const clone: TypedOnClicks = {};
  for (const [type, callbacks] of Object.entries(typedOnClicks)) {
    assertSafeKey(type);
    const clonedCallbacks: { [id: string]: TypedMarkOnClick } = {};
    for (const [id, callback] of Object.entries(callbacks)) {
      assertSafeKey(id);
      clonedCallbacks[id] = callback;
    }
    if (Object.keys(clonedCallbacks).length > 0) clone[type] = clonedCallbacks;
  }

  return Object.keys(clone).length > 0 ? clone : undefined;
}

function cloneTypedOnRemoves(typedOnRemoves?: TypedOnRemoves): TypedOnRemoves | undefined {
  if (!typedOnRemoves || typedOnRemoves === NO_ON_REMOVES) return undefined;

  const clone: TypedOnRemoves = {};
  for (const [type, callbacks] of Object.entries(typedOnRemoves)) {
    assertSafeKey(type);
    const clonedCallbacks: { [id: string]: TypedMarkOnRemove } = {};
    for (const [id, callback] of Object.entries(callbacks)) {
      assertSafeKey(id);
      clonedCallbacks[id] = callback;
    }
    if (Object.keys(clonedCallbacks).length > 0) clone[type] = clonedCallbacks;
  }

  return Object.keys(clone).length > 0 ? clone : undefined;
}

function omitRecordKey<T>(source: { [key: string]: T }, keyToOmit: string): { [key: string]: T } {
  const result: { [key: string]: T } = {};
  for (const [currentKey, value] of Object.entries(source)) {
    if (currentKey !== keyToOmit) {
      result[currentKey] = value;
    }
  }
  return result;
}

function normalizeTypedIDs(source: TypedIDs): { [type: string]: string[] } {
  const normalized: { [type: string]: string[] } = {};
  for (const [type, ids] of Object.entries(source)) {
    if (!ids || ids.length === 0) continue;
    normalized[type] = [...ids].sort();
  }
  return normalized;
}

function collectRemovedTypeIdPairs(previous: TypedIDs, next: TypedIDs): [string, string][] {
  const removed: [string, string][] = [];
  for (const [type, previousIds] of Object.entries(previous)) {
    const nextIds = new Set(next[type] ?? []);
    for (const id of previousIds ?? []) {
      if (!nextIds.has(id)) removed.push([type, id]);
    }
  }
  return removed;
}

function typedIDsAreEqual(a: TypedIDs, b: TypedIDs): boolean {
  const normalizedA = normalizeTypedIDs(a);
  const normalizedB = normalizeTypedIDs(b);

  const typesA = Object.keys(normalizedA).sort();
  const typesB = Object.keys(normalizedB).sort();
  if (typesA.length !== typesB.length) return false;

  for (let i = 0; i < typesA.length; i++) {
    const type = typesA[i];
    if (type !== typesB[i]) return false;

    const idsA = normalizedA[type];
    const idsB = normalizedB[type];
    if (!idsA || !idsB || idsA.length !== idsB.length) return false;
    for (let j = 0; j < idsA.length; j++) {
      if (idsA[j] !== idsB[j]) return false;
    }
  }

  return true;
}

function mergeTypedOnClickMaps(primary: TypedOnClicks, secondary: TypedOnClicks): TypedOnClicks {
  const merged: TypedOnClicks = {};
  const types = new Set([...Object.keys(primary), ...Object.keys(secondary)]);

  for (const type of types) {
    const primaryCallbacks = primary[type] ?? {};
    const secondaryCallbacks = secondary[type] ?? {};
    const ids = new Set([...Object.keys(primaryCallbacks), ...Object.keys(secondaryCallbacks)]);

    const mergedCallbacks: { [id: string]: TypedMarkOnClick } = {};
    for (const id of ids) {
      const callback = primaryCallbacks[id] ?? secondaryCallbacks[id];
      if (callback) mergedCallbacks[id] = callback;
    }

    if (Object.keys(mergedCallbacks).length > 0) merged[type] = mergedCallbacks;
  }

  return merged;
}

function mergeTypedOnRemoveMaps(
  primary: TypedOnRemoves,
  secondary: TypedOnRemoves,
): TypedOnRemoves {
  const merged: TypedOnRemoves = {};
  const types = new Set([...Object.keys(primary), ...Object.keys(secondary)]);

  for (const type of types) {
    const primaryCallbacks = primary[type] ?? {};
    const secondaryCallbacks = secondary[type] ?? {};
    const ids = new Set([...Object.keys(primaryCallbacks), ...Object.keys(secondaryCallbacks)]);

    const mergedCallbacks: { [id: string]: TypedMarkOnRemove } = {};
    for (const id of ids) {
      const callback = primaryCallbacks[id] ?? secondaryCallbacks[id];
      if (callback) mergedCallbacks[id] = callback;
    }

    if (Object.keys(mergedCallbacks).length > 0) merged[type] = mergedCallbacks;
  }

  return merged;
}

function getTypedClassName(className: string, type: string): string {
  return `${className}-${type}`;
}

/**
 * Gets the external typed mark type.
 *
 * @remarks
 * This is used to ensure unique identification of external typed marks. Along with reserved types
 * prefaced with 'internal-' for internal typed marks @see {@link COMMENT_MARK_TYPE}.
 */
export function externalTypedMarkType(type: string): string {
  return `external-${type}`;
}

export function $createTypedMarkNode(
  typedIds?: TypedIDs,
  typedOnClicks?: TypedOnClicks,
  typedOnRemoves?: TypedOnRemoves,
): TypedMarkNode {
  return $applyNodeReplacement(new TypedMarkNode(typedIds, typedOnClicks, typedOnRemoves));
}

export function $isTypedMarkNode(node: LexicalNode | null | undefined): node is TypedMarkNode {
  return node instanceof TypedMarkNode;
}

export function isSerializedTypedMarkNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedTypedMarkNode {
  return node?.type === TypedMarkNode.getType();
}

// #region adapted from https://github.com/facebook/lexical/blob/92c47217244f9d3c22a59728633fb41a10420724/packages/lexical-mark/src/index.ts

export function $unwrapTypedMarkNode(node: TypedMarkNode): void {
  const children = node.getChildren();
  let target: LexicalNode | null = null;
  for (const child of children) {
    if (target === null) {
      node.insertBefore(child);
    } else {
      target.insertAfter(child);
    }
    target = child;
  }
  node.remove();
  typedOnClickRegistry.delete(node.getKey());
}

export function $wrapSelectionInTypedMarkNode(
  selection: RangeSelection,
  type: string,
  id: string,
  onClick?: TypedMarkOnClick,
  onRemove?: TypedMarkOnRemove,
): void {
  const nodes = selection.getNodes();
  const anchorOffset = selection.anchor.offset;
  const focusOffset = selection.focus.offset;
  const nodesLength = nodes.length;
  const isBackward = selection.isBackward();
  const startOffset = isBackward ? focusOffset : anchorOffset;
  const endOffset = isBackward ? anchorOffset : focusOffset;
  let currentNodeParent;
  let lastCreatedMarkNode;

  // We only want wrap adjacent text nodes, line break nodes and inline element nodes. For decorator
  // nodes and block element nodes, we step out of their boundary and start again after, if there
  // are more nodes.
  for (let i = 0; i < nodesLength; i++) {
    const node = nodes[i];
    if ($isElementNode(lastCreatedMarkNode) && lastCreatedMarkNode.isParentOf(node)) {
      // If the current node is a child of the last created mark node, there is nothing to do here
      continue;
    }
    const isFirstNode = i === 0;
    const isLastNode = i === nodesLength - 1;
    let targetNode: LexicalNode | null = null;

    if ($isTextNode(node)) {
      // Case 1: The node is a text node and we can split it
      const textContentSize = node.getTextContentSize();
      const startTextOffset = isFirstNode ? startOffset : 0;
      const endTextOffset = isLastNode ? endOffset : textContentSize;
      if (startTextOffset === 0 && endTextOffset === 0) {
        continue;
      }
      const splitNodes = node.splitText(startTextOffset, endTextOffset);
      targetNode =
        splitNodes.length > 1 &&
        (splitNodes.length === 3 ||
          (isFirstNode && !isLastNode) ||
          endTextOffset === textContentSize)
          ? splitNodes[1]
          : splitNodes[0];
    } else if ($isTypedMarkNode(node)) {
      // Case 2: the node is a mark node and we can ignore it as a target, moving on to its
      // children. Note that when we make a mark inside another mark, it may ultimately be un-nested
      // by a call to `registerNestedElementResolver<TypedMarkNode>` somewhere else in the
      // codebase.

      continue;
    } else if ($isElementNode(node) && node.isInline()) {
      // Case 3: inline element nodes can be added in their entirety to the new mark
      targetNode = node;
    }

    if (targetNode !== null) {
      // Now that we have a target node for wrapping with a mark, we can run through special cases.
      if (targetNode && targetNode.is(currentNodeParent)) {
        // The current node is a child of the target node to be wrapped, there is nothing to do
        // here.
        continue;
      }
      const parentNode = targetNode.getParent();
      if (parentNode == null || !parentNode.is(currentNodeParent)) {
        // If the parent node is not the current node's parent node, we can clear the last created
        // mark node.
        lastCreatedMarkNode = undefined;
      }

      currentNodeParent = parentNode;

      if (lastCreatedMarkNode === undefined) {
        lastCreatedMarkNode = $createTypedMarkNode();
        lastCreatedMarkNode.addID(type, id, onClick, onRemove);
        targetNode.insertBefore(lastCreatedMarkNode);
      }

      // Add the target node to be wrapped in the latest created mark node
      lastCreatedMarkNode.append(targetNode);
    } else {
      // If we don't have a target node to wrap we can clear our state and continue on with the next
      // node
      currentNodeParent = undefined;
      lastCreatedMarkNode = undefined;
    }
  }
  // Make selection collapsed at the end for comments.
  if (type === COMMENT_MARK_TYPE && $isElementNode(lastCreatedMarkNode)) {
    if (isBackward) lastCreatedMarkNode.selectStart();
    else lastCreatedMarkNode.selectEnd();
  }
}

export function $getMarkIDs(node: TextNode, type: string, offset: number): string[] | undefined {
  let currentNode: LexicalNode | null = node;
  while (currentNode !== null) {
    if ($isTypedMarkNode(currentNode)) {
      return currentNode.getTypedIDs()[type];
    } else if ($isTextNode(currentNode) && offset === currentNode.getTextContentSize()) {
      const nextSibling = currentNode.getNextSibling();
      if ($isTypedMarkNode(nextSibling)) {
        return nextSibling.getTypedIDs()[type];
      }
    }
    currentNode = currentNode.getParent();
  }
  return undefined;
}

// #endregion
