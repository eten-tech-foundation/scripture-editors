# Standard-View Clipboard USFM Semantics (PT-4201)

## Overview

This document specifies the copy/paste behavior for USFM content in Platform.Bible's Standard-view scripture editor. These semantics ensure that clipboard operations preserve USFM fidelity, allowing users to copy from the Standard view, paste into external editors, and vice versa while maintaining marker integrity and positional accuracy.

---

## Semantics Decisions (S1–S7)

### S1. Copy (Standard view) — `text/plain` is valid USFM of the selection

Already ~true because markers are real text nodes; this plan closes the exceptions:

- **Note callers:** `\f` + caller + content + `\f*` with the note's USJ `caller` value (`+`, `-`, or literal) — currently the caller is silently dropped (and rewrites to `+` on re-paste). This deliberately *exceeds* P9, where plain-text copy carries only the caller glyph and full notes survive only in CF_HTML. Rationale: in P10 there is no CF_HTML fidelity carrier for external apps, and the ticket requires "copy from Standard → paste into a plain-text editor: markers present and correctly placed".

- **Collapsed notes** contribute their full (visually hidden) `\f …\f*` bytes. "What you copy" > "what you see", for fidelity. This is documented, not changed.

- **Display-NBSP handling:** Display-NBSP → space; data-NBSP → `~`; `text/html` and `application/x-lexical-editor` stay unnormalized (existing, pinned).

- **Byte fidelity around note-internal markers:** Copied text must not contain spaces the source USFM lacks. Live repro (2026-08-07): copying `\x - \xo 1:3: \xo*\xt 2Cor 4:6\xt*\x*Den` produced `… \xo* \xt 2Cor 4:6\xt* \x*Den` — phantom spaces after each closing marker (display-separator NBSPs leaking through the blanket NBSP→space mapping). The copy walker must be source-faithful, mirroring the serialization inverse, not a blanket `replaceAll`.

- **Multi-block selections:** One `\n` between blocks; a selection starting mid-paragraph omits that paragraph's own `\p ` glyph (matches P9's rendered-text copy). Pinned, not changed.

### S2. Paste (Standard view, internal) — same-namespace `application/x-lexical-editor` payload reconstructs the exact node tree (existing)

Unchanged, EXCEPT: a paste whose selection touches an attribute display run (a char span's `|attrs`
list, a milestone's attribute run, or a verse's `\va`/`\vp` value) never takes this path, even when
the clipboard carries the same-namespace flavor — attribute-context paste always claims plain-text
insertion instead (see S3's "Paste inside an attribute display run" subsection below). This closes a
gap the fact recorded in S3 ("the private Lexical flavor is dead on Ctrl+V") does not cover: that
fact is about the RECONSTRUCTED `DataTransfer` a programmatic/reconstructed paste dispatch uses
(`clipboard.utils.ts`'s `pasteSelection`), not about a genuine LIVE NATIVE `paste` event, whose
`clipboardData` is the browser's own and can still carry the flavor for a same-page/session copy —
this is the same "live native paste event that still has it" case S2's own node-tree fast path is
written to keep for ordinary content.

### S3. Paste (Standard view, external) — plain text IS the fidelity carrier

Any paste without a same-namespace Lexical payload is treated as a USFM text fragment: take `text/plain` (fall back to text derived from `text/html` with block boundaries → `\n`), normalize NBSPs **positionally**, insert as text, let Tier 2 re-tokenize markers. Foreign HTML formatting is dropped by design — Standard view is markers-as-text, exactly like P9's Standard view where the reformat pipeline re-tokenizes everything. This generalizes the existing NBSP-gated handler and kills both live-observed corruptions plus the latent doubled-glyph path (re-imported Standard-view HTML producing a `CharNode` via `data-marker` importDOM *and* literal `\nd` text, since MarkerNode has no importDOM).

- **Positional NBSP normalization (replaces the blanket NBSP→`~`), three-part rule:** (1) a leading NBSP — string-start or right after a newline — is a structural separator with nothing in front of it to match against and becomes a space; (2) an NBSP immediately FOLLOWING a marker token (`\marker`, nested `\+marker`, either's closer, or a milestone's anonymous `\*` self-closer) is the required opener/closer separator and becomes a space; (3) an NBSP immediately PRECEDING a marker token is a structural spacer with no source counterpart and is DROPPED entirely (neither spaced nor kept as data) — `createNote` (`usj-editor.adaptor.ts`) appends a spacer after EVERY note child, not just the first, so one sits directly before `\ft`/`\f*` and every other child after the caller; a browser-hop/html-derived copy of a collapsed note therefore carries structural NBSPs on BOTH sides of its interior markers, not only after the opener. Every remaining NBSP is user data → `~`. This is P9's `PostprocessUsfm` model. Live repro that mandates it (2026-08-07): pasting P10's own copied footnote back produced `\f~ \fr~1:1 ~ \ft~Caller test.~ \f*` (every display-NBSP became `~`, breaking marker recognition); a browser-hop paste of `\nd …\nd*` produced `\nd~light … \nd*` with an unmatched pair. **Rule precedence when both position rules match the same NBSP:** a closed-children note shape (`\xo*` immediately followed by NBSP immediately followed by `\xt`) sits after a closing marker AND before the next opening marker at once; the after-marker rule wins and the NBSP becomes a space rather than being dropped, because `$normalizePastedNbsp`'s `.replace` chain applies `AFTER_MARKER_NBSP` before `BEFORE_MARKER_NBSP`, consuming the NBSP into a space before the before-marker pass ever sees it. The tie-break is correct, not incidental: an after-closer NBSP in ordinary body text (`\nd*<NBSP>and`) is a real content space that dropping would silently lose, and the case is reachable only via a foreign NBSP-preserving carrier — P10's own `text/plain` copy (S1) never emits an NBSP in this position to begin with.

- **The private Lexical flavor is dead on Ctrl+V — mechanically verified, not inferred:** `pasteSelection` (`clipboard.utils.ts`) rebuilds its `DataTransfer` from `navigator.clipboard.read()`, Chromium's async Clipboard-API read. That API, with no `unsanitized`/custom-format opt-in (none is used here), exposes only a fixed, sanctioned MIME allow-list (`text/plain`, `text/html`, and a short list of others) — `application/x-lexical-editor` is not one of them, so the rebuilt `DataTransfer` a real Ctrl+V dispatches can **never** contain it, by construction of the read API itself. This is a static fact about the code path (confirmed by reading `clipboard.utils.ts`), not an inference from the live tilde-corruption symptom — that symptom is merely consistent with it. Consequence: the USFM text carrier IS the internal path too — acceptable once S1's copy is byte-faithful — and the sync `ClipboardEvent` path keeps the node-tree fast path when the flavor is present (S2).

- **Recorded limitation — structure-protected editors get no NBSP normalization:** `$handlePasteForStandardView` declines outright when the document is structure-protected, so `StructureProtectionPlugin`'s HTML sanitizer governs the paste instead (both register `PASTE_COMMAND` at the same priority; the marker-edit engine mounts first, so an explicit decline is required or it would starve the sanitizer). A structure-protected editor's external plain-text pastes therefore receive NO positional NBSP normalization at all — protection governs, and this trade-off is accepted rather than teaching the sanitizer path a second NBSP policy.

- **Marker-bearing lines own their markers:** A pasted line starting with a paragraph-marker literal does NOT also get the host paragraph's cloned prefix (no doubled/empty paragraphs). Marker-free lines inherit the host marker. **Live-verified correct on c7e666fa (2026-08-07)** — `\p one\n\p two` and `tail\n\q1 line` both produced exactly the target structure.

- **Pasted `\c` / `\id`:** Strip during paste normalization (approved). Live-verified harm (2026-08-07): pasting `\c 2` mid-chapter put a chapter node in the editor and poisoned the save loop — PDP rejects every save with "Multiple chapter markers present", the error surfaces only in the renderer log, disk and other editors silently stop updating. (P9 destroys pasted `\c` at save with a user-facing error.)

- **Paste inside an attribute display run — paste ≡ typing:** a selection that TOUCHES attribute-display text at either end — a char span's bare `|attrs` list, a milestone's attribute run, or a verse's `\va`/`\vp` value — is inserted exactly as the SAME characters typed at the SAME caret (or over the same selection) would be: each `\n` becomes a single space, per-newline, not run-collapsed (attribute values are single-line; there is no multi-line attribute byte shape to collapse INTO — `"a\n\nb"` pastes as `"a  b"`, two spaces), and NO chapter/book-id strip, NO positional NBSP mapping, and NO marker tokenization run against the pasted bytes — a pasted `\c 5` or `\p` here is literal value text, not a structural marker, and a pasted NBSP passes through unchanged (matching `$displayWhitespaceTransform`'s own skip of attribute-tagged text). A selection that only PARTLY sits inside attribute-display text (one end in, one end out) is included too — see below. The existing attribute pend/settle machinery (`$textNodeTier2Transform`'s attribute-tagged early return, `$resolvePendingMarkers`) then re-tokenizes the displayed bytes back into node state identically whether they arrived by typing or paste.

  TJ's live repro (filed 2026-08-11, against a pre-branch build): existing span `\nd asdf|who="hi"\nd*`, caret at the end of the `who="hi"` run, paste plain text `sid="things"` — the `who` attribute display and the closing `\nd*` glyph both vanished from the editor, the pasted text rendered outside the span, and the saved file diverged from the editor. `sid="things"` carries no NBSP; the pre-branch build's paste handler still had its OLD NBSP-gated form (see the "positional NBSP normalization" bullet above — that gate was generalized to claim every external paste, NBSP or not, on 2026-08-07), so the most plausible mechanism is that OLD gate declining an NBSP-free paste outright and falling through to Lexical's own default rich-paste node insertion — NOT a same-namespace `application/x-lexical-editor` flavor on the clipboard (this document's own "private Lexical flavor is dead on Ctrl+V" fact, above, still holds for the reconstructed-`DataTransfer` paste path this repro most likely used).

  What matters for THIS branch's code is the SHAPE the corruption takes once ANY handler declines an attribute-context paste to Lexical's default rich-paste node insertion — reproduced directly here (`attributeContextPasteFidelity.test.tsx`'s "root cause" describe): it has no notion that an attribute run's text must stay inside its one tagged TextNode, and merges the run, the closing glyph, and even the FOLLOWING paragraph's sibling text into one plain node, destroying the attribute display and the closing marker and leaving the pasted bytes loose in body content. On this branch's CURRENT code (a single-line, NBSP-free, flavor-free external paste is already safe since 2026-08-07's generalization), the confirmed regression classes this paste-≡-typing rule closes are: (1) a live native paste event that still carries a same-namespace `application/x-lexical-editor` flavor (S2's own documented case for when that reaches a real handler); (2) a multi-line plain-text payload, which the ordinary pipeline would split via `selection.insertParagraph()`; (3) a marker-bearing payload (`\c 5`), which the ordinary pipeline's `\c`/`\id` strip would eat bytes out of an attribute VALUE that were never a chapter token; (4) a MIXED selection (one end in the run, one end out) combined with either (1) or (2) — the selection touches attribute context, so it must not reach either risky branch merely because its other end sits outside.

  Pre-existing precedence, UNCHANGED by this rule: the CRITICAL-priority in-note multi-line `PASTE_COMMAND` claim (`MarkerEditPlugin.tsx`) still runs before the Standard-view external-paste handler and still wins for a multi-line payload whose selection touches EXPANDED note content — an attribute run that happens to sit inside an expanded note's content is reached by this rule only when that in-note claim itself declines. See `$handlePasteForStandardView`'s doc comment (`whitespaceDisplay.plugin.utils.ts`) for the full mechanism.

### S4. Paste-as-plain-text (Ctrl+Shift+V / context menu) — narrows the payload to `text/plain`

Under S3 this is semantically identical to a normal external paste in Standard view. There is NO "paste literally, don't tokenize" mode; P9 has none either (no Paste Special exists in P9). Live-confirmed identical 2026-08-07. Documented + pinned as equivalence, no new UI. TJ note: the equivalence is Standard-view-scoped — other views may legitimately differentiate the two commands later; out of scope here.

### S5. Hidden-marker views (`formatted`, `paragraph-structure`)

- **Copy-out is prose** (no marker text) — existing, gets a gate test protecting Standard-view handlers from leaking there.

- **The paste gate** (swallow anything containing `\` **or `/`**) is over-broad — it eats URLs, dates, "and/or" (live-confirmed 2026-08-07). **Pre-existing upstream behavior** (`CommandMenuPlugin` on `origin/main`, predates the standard-view branches) — per TJ, NOT fixed here; recorded in the semantics doc's deferred list. Structural apply-markers-on-paste in formatted views likewise out of scope.

### S6. Cut = copy + `removeText()` (existing)

The WI-2 filed quirk — a selection-delete ending exactly at a just-settled char-span boundary absorbing one adjacent character — gets a targeted regression pin. **Outcome (2026-08-07):** does NOT reproduce at the Lexical selection level. Pinned as regression armor for both `CUT_COMMAND` and a plain `removeText()`, each given a selection whose focus is an element point mirroring DOM `range.setEndAfter(spanElement)` — the exact boundary shape the live repro's programmatic DOM selection used. Both variants produced byte-exact, correctly-scoped results, narrowing the live repro's root cause to the DOM Range → Lexical selection-resolution layer (`applyDOMRange`/`$internalResolveSelectionPoints`), which is not exercised by a Lexical-level `RangeSelection` and so remains covered only by the E2E selection steps (Task 8).

### S7. Undo — every paste, including rebuilds it triggers, is one undo step (existing pins extended to the new paths)

---

## Paratext 9 Reference Behavior

Understanding P9's clipboard model provides context for P10's design decisions:

- **Data formats:** P9 writes three clipboard formats: (1) `text/plain` containing the rendered selection text; in Standard view, markers are rendered as literal text, so plain-text copy includes markers; (2) `CF_HTML` (or `text/html`), which is the fidelity carrier — contains a DOM fragment where notes travel only as HTML comments with USFM syntax (`<!--usfm:\f + \ft ...\f*-->`), while plain text receives only the caller glyph; (3) a private `ParatextLanguageId` format for app-internal use.

- **Paste workflow:** P9's paste is HTML-first and unsanitized. All normalization happens in a subsequent reformat pipeline: `CleanHtml` → Unicode NFC/NFD per project settings → reverse XSLT → `PostprocessUsfm` (removing FEFF marks; applying NBSP policy — token-leading NBSP → space, interior kept per `AllowInvisibleChars` setting) → `UsfmToken.NormalizeUsfm` (full re-tokenization: whitespace collapse, newlines inserted before paragraph/verse markers, RTL mark handling).

- **Paste Special:** P9 has no Paste Special command. Both normal paste and plain-text paste ride the same normalization path.

- **Structural errors:** P9 destroys pasted `\c` markers at save time with a user-facing error message: "You cannot put a \c marker in the middle of a chapter".

- **Unknown markers:** Pasted unknown USFM markers are kept and flagged red in the UI, never stripped.

---

## Known Accepted Asymmetries vs Paratext 9

These differences are documented and intentional; they are not implemented as workarounds:

1. **P9→P10 paste from P9's Formatted view:** P9's Formatted-view copy carries markers only in `CF_HTML` using P9-specific CSS classes, which P10 does not parse. When P10 pastes this content, it receives it as prose (markers are lost). P9's Standard-view copy, by contrast, pastes into P10 perfectly via plain text.

2. **P10 formatted-view copy loses note callers in plain text:** P9 Standard-view copy preserved the caller glyph in plain text (though full notes survived only in `CF_HTML`). P10's formatted-view copy produces prose-only output, so note callers do not appear in plain text. This is acceptable — prose copy stays clean and users can switch to Standard view for marker-aware copy.

3. **Standard-view external paste from an html-only clipboard payload (no `text/plain`) loses the note caller:** P9's fidelity carrier is `CF_HTML` (footnotes travel as HTML-comment USFM); P10's is `text/plain` (S3). `ImmutableNoteCallerNode`'s own DOM export carries a collapsed note's caller only as a `data-caller` attribute, never as visible text, so `htmlPasteText`'s plain `body.textContent` read (used only when `text/plain` is absent) can't recover it — a genuinely html-only round trip loses the caller entirely. The gap is narrow: a real Ctrl+V of P10's own copy always carries `text/plain` alongside `text/html` (S1/S2), so it is reachable only via a foreign clipboard source that supplies `text/html` without `text/plain`. Currently documented only as a test comment (`whitespaceDisplay.plugin.utils.test.tsx`, the "browser-hop/html-derived collapsed-footnote shape" test).

---

## Known Lossy Constructs — Copy→Paste Round Trip

Found by a corpus-style sweep (`clipboardCorpusRoundTrip.test.tsx`): for every fixture in the
shared USJ round-trip corpus (`corpus-data.ts`), select the chapter's content, copy, paste into a
fresh editor holding the same chapter header, and compare the resulting USJ to the source. Two of
the four failures below are INHERENT — the plain-text `text/plain` carrier (S3) has no bytes
capable of representing the construct, so no paste-side fix is possible without a different
carrier. One is a real, out-of-scope structural gap in how a paste's rebuild is scoped. One is
ACCEPTED normalization that matches Paratext 9's own behavior, not a bug at all. All four fixtures
stay in the sweep as `it.skip`, not deleted, so a future engine change un-skips them automatically
instead of the gap going unnoticed.

1. **Cross-reference `<ref>` target wrapper (inherent):** USJ's `ref` element is a wrapper USFM
   itself never carried (`unknownUsfm.utils.ts`'s own doc comment: "USJ invented this container,
   USFM never carried it... only its child text renders"). Source content
   `["See ", {type:"ref", loc:"GEN 1:1", content:["Genesis 1:1"]}, " for details."]` copies as
   plain `"See Genesis 1:1 for details."` with no marker bytes anywhere marking the wrapper's
   extent; paste re-tokenizes it as ordinary prose (`["See Genesis 1:1 for details."]`, the `ref`
   wrapper gone). A raw USFM export of this same fixture has the identical gap — not specific to
   clipboard mechanics.

2. **Sidebar `\esb`/`\esbe` (structural — a paste-rebuild SCOPING gap, not a missing tokenizer
   rule; out of scope here):** the tokenizer itself is not the problem — `usfmFragmentToUsj.ts`
   already implements the `\esb`/`\esbe` pairing (its `SIDEBAR_MARKER`/`SIDEBAR_END_MARKER`
   assembly case tracks an open sidebar across tokens and closes it on `\esbe`). The real mechanism
   is upstream and structural: a sidebar's nested `\p` child is a real `ParaNode`, and the copy
   walker (`$selectionToUsfmText`) inserts a `\n` before any non-inline `ElementNode` boundary it
   crosses — a `ParaNode` is non-inline, so a `\n` lands between `\esb \cat History\cat*` and the
   nested paragraph's own content, even though both came from ONE sidebar. On paste,
   `$insertPastedText` splits on every `\n` via `selection.insertParagraph()`, so that single `\n`
   turns into TWO sibling `ParaNode`s where the source had one sidebar wrapping one paragraph. Tier
   2 then re-tokenizes strictly per paragraph — `$requestTier2ForNode` (`tier2Rebuild.utils.ts`),
   the only production call site, always invokes `$rebuildParas([current], context)` with a
   single-element array — so the tokenizer's "current open sidebar" state can never span the two
   separate `$rebuildParas` calls the two now-sibling paragraphs each trigger; the pairing that DOES
   exist in `usfmFragmentToUsj.ts` never gets the chance to run across both lines at once. Result:
   an UNCLOSED sidebar (`closed:"false"`, no content), the inner paragraph hoisted out to become a
   top-level sibling, and a stray EMPTY paragraph with marker `"esbe"`. Table rows/cells dodge this
   specific failure mode only because `TableNode`'s row/cell children are themselves `UnknownNode`
   instances, and `UnknownNode.isInline()` unconditionally returns `true` regardless of visual/CSS
   classification — so the copy walker's non-inline-boundary `\n`-insertion rule never fires for
   them, and a table stays byte-contiguous within one paste-insertion unit while a sidebar's nested
   block-level paragraph does not. A real fix means grouping a paste's newly-inserted SIBLING
   paragraphs that originated from one selection back into a single rebuild fragment before Tier 2
   tokenizes — a Tier-2 rebuild-granularity change, genuinely out of this work item's scope. The
   byte-level corruption stays pinned by the skip rather than fixed.

3. **`closed="false"` char span followed by more paragraph content (inherent):** a `closed="false"`
   span has, by definition, no closing marker byte anywhere in its own USFM. When such a span is
   not the last thing in its paragraph (`Tell the <char closed="false">Lord</char> plainly.`), the
   copied text (`\nd Lord plainly.`) carries no byte marking where the span's content ends and the
   trailing prose resumes, so paste has nothing to stop at "Lord" on — it swallows the rest of the
   paragraph into the span (`{marker:"nd", content:["Lord plainly."]}`, the top-level `" plainly."`
   string gone). The sibling `"unclosed note (closed=false)"` fixture, whose unclosed span IS the
   last thing in its paragraph, has no such trailing content to lose and round-trips clean —
   confirming the ambiguity is specifically about trailing content after an implicit close, not
   `closed="false"` itself.

4. **Paragraph-leading space swallowed on paste (ACCEPTED normalization — matches Paratext 9, not a
   bug):** isolated with a minimal non-corpus repro: pasting the literal text `"\p  X"` (marker, its
   own required separator, and a SECOND, real content-leading space) into a fresh empty `"\p"` host
   produces `"\p X"` — one space, not two. The mechanism is `consumeSeparator()`
   (`usfmFragmentToUsj.ts`), whose own comment states exactly this: "Consume the separator
   whitespace after an opening marker (PT9 skips it) — all leading whitespace, not just a single
   space." That mirrors Paratext 9's own `NormalizeUsfm` re-tokenization pass (see "Paratext 9
   Reference Behavior" above: "whitespace collapse, newlines inserted before paragraph/verse
   markers"), which likewise collapses a whitespace run after a marker during its own paste reformat
   pipeline — P10 doing the same is parity with P9, not a divergence from it. Corpus symptom:
   copying `<para style="p"> Leading space precedes this text.</para>` (source content
   `" Leading space precedes this text."`) round-trips through paste to
   `"Leading space precedes this text."` — the leading space is gone, the same as it would be in
   P9. Kept in the sweep's skip list (the byte-level comparison genuinely differs from the source)
   but is NOT a fix candidate.

---

## Deferred / Out of Scope

The following items are recorded as deferred and not addressed in this plan:

1. **Pre-existing upstream CommandMenuPlugin `/`-swallow:** The paste gate in hidden-marker views inspects only `text/plain` (`event.clipboardData?.getData("text/plain")`) and blocks the whole paste — no partial insertion — whenever that string contains `\` or `/`, so it also eats URLs, dates, and common phrases like "and/or" outright; the only feedback is a `logger?.info(...)` call, which never reaches the user (no toast, no visible indication the paste was dropped). The check is `text/plain`-only, so a clipboard payload carrying **just** `text/html` (no `text/plain` key at all) skips the gate entirely — confirmed by exercising the paste path directly (2026-08-07): an html-only, backslash-bearing payload reaches Lexical's own HTML-import fallback instead of being blocked, unlike the byte-identical `text/plain` payload. This behavior originates in the `CommandMenuPlugin` on `origin/main` and predates the standard-view branches. As of 2026-08-07, this is not fixed here per TJ's guidance; it belongs to a separate upstream cleanup task.

2. **Typing `\c` mid-chapter poisons the save loop:** If a user manually types `\c 2` in the middle of a chapter, it corrupts the editor state. The PDP error "Multiple chapter markers present" surfaces only in the renderer log, and disk/other editors silently stop updating. This is a data-fidelity issue tracked separately (WI-10's data-fidelity audit) and is not addressed by paste normalization.

3. **Structural marker application on paste in hidden-marker views:** When a user pastes USFM markers into a hidden-marker (formatted/paragraph-structure) view, there is no logic to apply those markers as structural elements. This is by design — hidden-marker views are not marker-aware and should reject or convert marker input. Implementation is out of scope.

4. **P9-style CF_HTML class parsing:** When P9's Formatted-view copy (which uses CSS classes to encode markers in `CF_HTML`) is pasted into P10, the classes are ignored because P10 does not parse P9's class-based marker encoding. This is an asymmetry vs P9; users should switch to Standard view for marker-aware copy from P9 into P10.

5. **Custom `text/usfm` MIME type / "Copy as USFM" command:** A dedicated `text/usfm` MIME type or separate "Copy as USFM" command was considered and rejected. Once `text/plain` IS USFM (S1), a separate command adds no value; the existing single-copy-format approach is sufficient.

6. **Popover expanded-note `isStandardView` gating issue:** An issue with note-expansion behavior in popovers has an open tracking document at `docs/superpowers/specs/2026-07-07-standard-view-followups.md`. This is not addressed in the current plan.

7. **Paste-rebuild scoping loses a sidebar's `\esb`/`\esbe` pairing across a copy-introduced paragraph split (corpus-found 2026-08-07):** a sidebar's nested paragraph is a real `ParaNode`, so copying a sidebar inserts a `\n` before it and pasting that `\n` splits one sidebar into two sibling paragraphs; Tier 2 rebuilds strictly per paragraph (`$requestTier2ForNode` always calls `$rebuildParas` with a single-element array), so the `\esb`/`\esbe` pairing `usfmFragmentToUsj.ts` already implements never sees both halves in the same tokenize pass. See "Known Lossy Constructs — Copy→Paste Round Trip" above (item 2) for the full mechanism. A real fix means grouping a paste's newly-split sibling paragraphs back into one rebuild fragment — a Tier-2 rebuild-granularity change, out of scope for this test-only task.

8. **2SA corpus (`libs/test-data/src/data/2sa.usj.ts`) not included in the copy→paste corpus sweep:** this fixture IS single-chapter (one top-level chapter object), so the earlier "multi-chapter/book-level" exclusion reason recorded in an earlier draft of this work was wrong. It was tried against the sweep's harness directly and does not round-trip clean: it hits the sidebar gap above three times, plus several additional, unrelated fidelity gaps (an empty `\b` blank-line paragraph, a verse's derived `sid` attribute, a `\ref` target) that this sweep's one-construct-per-fixture design has no clean way to itemize as a single byte diff. `tier2Rebuild.corpus.test.tsx` already exercises this fixture, but for a narrower, different property (an unedited `$rebuildParas` call refusing as a fixed point) that does not cover the paste path this sweep does — so the exclusion is a real coverage gap, not a redundant re-test. Recorded here rather than force-fit into the sweep.

9. **Formatted-view copy includes CSS-hidden collapsed-note content as plain prose:** hidden-marker views (S5) hide a collapsed note's content — `\ft` text and the rest — from view with CSS; the content stays in the DOM/editor state rather than being excluded from it. A prose copy in these views is not scoped to only the visibly-rendered text, so the hidden collapsed-note body is included in the copied prose alongside the surrounding paragraph's own text. This is a pre-existing consequence of how hidden-marker views render (CSS-hide, not exclude) rather than something introduced by this plan, and is out of scope here.

---

## Test Mapping (S1–S7)

| Semantic | Pinning Test |
|----------|--------------|
| **S1** Copy (Standard view) — `text/plain` is valid USFM | `packages/platform/src/editor/markerEdit/clipboardCopyFidelity.test.tsx` — `"note caller fidelity"`, `"phantom-space live-repro pins (2026-08-07)"`, `"multi-paragraph selections"`, `"AttributeRunNode traversal"` describes; `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx` — `"clipboard normalization"` and `"copy across an UnknownNode (figure)"` describes (display-NBSP→space, `~` data-NBSP preserved, full-USFM figure byte display) |
| **S2** Paste (Standard view, internal) — Lexical node tree reconstruction | `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx` — `"declines internal pastes (a same-namespace \`application/x-lexical-editor\` payload is present)"` and `"keeps current behavior (declines) when an \`application/x-lexical-editor\` payload is present, even if \`text/html\` carries NBSP"` (external-paste handler steps aside so the Lexical fast path owns the node-tree reconstruction); `packages/platform/src/editor/markerEdit/markerPasteFidelity.test.tsx` equivalence pins exercise the resulting tokenized tree shape end-to-end |
| **S3** Paste (Standard view, external) — plain text as fidelity carrier | `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx` — `"paste normalization ($handlePasteForStandardView)"` describe, including its `"positional NBSP normalization"`, `"multi-line paste interplay (splitExpected arming)"`, `"structure protection"`, and `"tilde-corruption regression (2026-08-07 live repro)"` sub-describes; `packages/platform/src/editor/markerEdit/markerPasteFidelity.test.tsx` — `"multi-line marker-bearing paste semantics (live-verified 2026-08-07)"` and `"\\c/\\id strip on paste"` describes |
| **S3 (attribute-context paste)** Paste inside a char/milestone/verse attribute display run — paste ≡ typing | `packages/platform/src/editor/markerEdit/attributeContextPasteFidelity.test.tsx` — `"typed characterization (baseline)"`, `"paste ≡ typed (TJ's repro shape)"` (undo pinned), `"root cause: a native paste event carrying a same-namespace application/x-lexical-editor flavor must not corrupt the run"` (confirmed regression class on this branch, not TJ's literal pre-branch mechanism — see the S3 subsection above), `"leading-space payload"`, `"replace-selection paste inside the attribute value"` (undo pinned), `"multi-line payload collapses to a single space, per newline"` (undo pinned), `"marker-bearing payload"`, `"CUT of a selection inside the attribute value"`, `"mixed selection"` (now claims the attribute path — both the flavor and multi-line corruption shapes pinned), `"milestone attribute run paste"`, and `"verse \\va run paste"` describes |
| **S4** Paste-as-plain-text (Ctrl+Shift+V) — equivalence to external paste | `packages/platform/src/editor/markerEdit/markerPasteFidelity.test.tsx` — `"paste-as-plain-text equivalence (S4): no literal mode, plain always wins"` describe |
| **S5** Hidden-marker views — prose copy, paste gate preservation | `packages/platform/src/editor/CommandMenuPlugin.gate.test.tsx` — `"CommandMenuPlugin editable-mode gate"` and `"MarkerEditPlugin's Standard-view clipboard handlers do not leak into Formatted view"` describes |
| **S6** Cut = copy + `removeText()` — WI-2 regression pin | `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.test.tsx` — `"selection-delete at a settled char-span boundary (WI-2 filed)"` (does not reproduce at the Lexical level; pinned as regression armor); `packages/platform/src/editor/markerEdit/clipboardCopyFidelity.test.tsx` — `"cut = copy + removeText"` describe pins the byte-fidelity half of the semantic (cut's clipboard bytes match copy's, and the source is removed) |
| **S7** Undo — paste and rebuilds as single step | `packages/platform/src/editor/markerEdit/markerPasteFidelity.test.tsx` — the `undoAndSettle`-based pins (multi-line marker-bearing paste, `\c`/`\id` strip, no-op `\c` paste) each asserting one `UNDO_COMMAND` dispatch restores the exact pre-paste USJ |
| **Corpus sweep** Copy→paste round trip across the shared USJ fixture corpus | `packages/platform/src/editor/markerEdit/clipboardCorpusRoundTrip.test.tsx` — `"corpus copy/paste round trip (Standard view)"` describe; four known-lossy fixtures kept as `it.skip` (see "Known Lossy Constructs" above) |
| **E2E** Real-browser clipboard round trip (Standard view, written, not yet run in this task) | `e2e-tests/tests/isolated/scripture-editor/clipboard-usfm-round-trip.spec.ts` (paranext-core repo) |

---
