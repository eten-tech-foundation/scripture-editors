import { $validateDocument, MarkerValidity } from "./markerValidation.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $getRoot, LexicalEditor, NodeKey } from "lexical";
import { useEffect } from "react";
import { defaultStyleInfo, LoggerBasic, StyleInfo } from "shared";
import { ViewOptions } from "shared-react";

const STATUS_CLASSES = ["status_unknown", "status_invalid"] as const;

/**
 * What each flag SAYS, for the readers the classes alone cannot reach: a screen-reader user
 * (the classes are presentation, and presentation is not announced) and a sighted user, who
 * otherwise sees red+bold vs red+underline with nothing naming the difference. Phrased like
 * `ImmutableUnmatchedNode`'s marker tooltip, the editor's other marker-problem message.
 */
const STATUS_DESCRIPTIONS: { [validity in MarkerValidity]: string } = {
  unknown: "This marker is not in the stylesheet!",
  invalid: "This marker is not valid here!",
};

const STATUS_DESCRIPTION_TEXTS: readonly string[] = Object.values(STATUS_DESCRIPTIONS);

/**
 * Flags one glyph element: the presentational classes plus the description that names the state.
 * `title` is the channel the editor already uses to explain a marker problem on hover, and it is
 * the accessible description of last resort; `aria-description` states the same text outright for
 * assistive tech that does not map `title` on a non-interactive span. The classes are rewritten
 * every pass (that is what self-heals a reconciler-recreated element), the attributes only when
 * they would change, since a title write is the more expensive of the two.
 */
function applyStatus(element: HTMLElement, validity: MarkerValidity): void {
  element.classList.toggle("status_unknown", validity === "unknown");
  element.classList.toggle("status_invalid", validity === "invalid");
  const description = STATUS_DESCRIPTIONS[validity];
  if (element.getAttribute("aria-description") === description) return;
  element.setAttribute("aria-description", description);
  element.title = description;
}

/** Unflags one glyph element - the flag and everything that reports it go away together. */
function clearStatus(element: HTMLElement): void {
  element.classList.remove(...STATUS_CLASSES);
  element.removeAttribute("aria-description");
  // Only a tooltip this plugin wrote is removed: a char span carries its own marker name in
  // `title` (`ViewOptions.showCharMarkerTitles`) and must keep it.
  if (STATUS_DESCRIPTION_TEXTS.includes(element.title)) element.removeAttribute("title");
}

/**
 * The top-level keys of the commit's dirty paragraphs — the scope a validation pass may restrict
 * its inline descent to — or `undefined` when only an UNSCOPED pass is sound: root-level
 * structure changed (a paragraph added/removed/reordered shifts the paragraph-stack context of
 * everything after it), which shows as the root being INTENTIONALLY dirty. The root riding along
 * unintentionally (ancestor propagation from any leaf edit — every keystroke) does not count.
 *
 * Removed nodes resolve to nothing here and are skipped: any removal marks the removed node's
 * surviving parent intentionally dirty, so the affected paragraph (or the root, for a removed
 * paragraph) is picked up through that entry instead.
 */
function computeDirtyParagraphScope(
  editor: LexicalEditor,
  dirtyElements: Map<NodeKey, boolean>,
  dirtyLeaves: Set<NodeKey>,
): Set<NodeKey> | undefined {
  return editor.getEditorState().read(() => {
    const rootKey = $getRoot().getKey();
    const scope = new Set<NodeKey>();
    const resolve = (key: NodeKey): void => {
      const node = $getNodeByKey(key);
      const topLevel = node?.getTopLevelElement();
      if (topLevel) scope.add(topLevel.getKey());
    };
    for (const [key, intentional] of dirtyElements) {
      if (key === rootKey) {
        if (intentional) return undefined;
        continue;
      }
      resolve(key);
    }
    for (const key of dirtyLeaves) resolve(key);
    return scope;
  });
}

/**
 * Marker validation decoration. Runs a
 * PT9-ValidateUsxStyles-shaped full-document pass after every committed update
 * and decorates marker glyph DOM elements with status_unknown/status_invalid,
 * each carrying a description of the state so the flag is not conveyed by
 * styling alone (see {@link applyStatus}).
 * Validity is DERIVED, VIEW-ONLY state: it lives in this plugin and the DOM,
 * never in the editor document (no undo pollution, no serialization, no collab
 * deltas). Decoration is (re)applied for every entry each pass, so reconciler
 * DOM re-creation self-heals; removal is diffed against the previous pass.
 *
 * PT9 revalidates the whole visible text on every reformat; this pass instead
 * scopes its per-leaf inline descent to the commit's dirty paragraphs
 * ({@link computeDirtyParagraphScope}), carrying the out-of-scope inline flags
 * forward, so a keystroke costs one paragraph. Root-level structural changes
 * (which shift the paragraph-stack context) fall back to the full walk.
 */
export function MarkerValidationPlugin({
  viewOptions,
  styleInfo,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  styleInfo?: StyleInfo;
  logger?: LoggerBasic;
}): null {
  const [editor] = useLexicalComposerContext();
  const isEnabled = viewOptions?.markerMode === "editable";

  useEffect(() => {
    if (!isEnabled) return;
    const effectiveStyleInfo = styleInfo ?? defaultStyleInfo;
    let decorated = new Map<NodeKey, MarkerValidity>();

    const applyPass = (onlyParagraphs?: Set<NodeKey>) => {
      if (editor.isComposing()) return; // next commit after composition covers it
      editor.getEditorState().read(() => {
        const fresh = $validateDocument(effectiveStyleInfo, onlyParagraphs);
        let next = fresh;
        if (onlyParagraphs) {
          // A scoped pass revalidated only the dirty paragraphs' inline content: keys under
          // those paragraphs are authoritative in `fresh` (absent = cleared), everything else
          // carries forward from the previous pass.
          next = new Map(fresh);
          for (const [key, validity] of decorated) {
            if (next.has(key)) continue;
            const topLevel = $getNodeByKey(key)?.getTopLevelElement();
            if (!topLevel || onlyParagraphs.has(topLevel.getKey())) continue;
            next.set(key, validity);
          }
        }
        for (const [key] of decorated) {
          if (next.has(key)) continue;
          const element = editor.getElementByKey(key);
          if (element) clearStatus(element);
        }
        for (const [key, validity] of next) {
          const element = editor.getElementByKey(key);
          if (!element) continue;
          applyStatus(element, validity);
        }
        decorated = next;
        logger?.debug(`[MarkerValidation] pass: ${next.size} flagged`);
      });
    };

    applyPass(); // initial pass: covers setEditorState loads (no transforms fire there)
    const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      applyPass(computeDirtyParagraphScope(editor, dirtyElements, dirtyLeaves));
    });
    return () => {
      unregister();
      // Leave no stale decoration behind when the plugin unmounts or styleInfo changes.
      for (const [key] of decorated) {
        const element = editor.getElementByKey(key);
        if (element) clearStatus(element);
      }
    };
  }, [editor, isEnabled, styleInfo, logger]);

  return null;
}
