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

Unchanged.

### S3. Paste (Standard view, external) — plain text IS the fidelity carrier

Any paste without a same-namespace Lexical payload is treated as a USFM text fragment: take `text/plain` (fall back to text derived from `text/html` with block boundaries → `\n`), normalize NBSPs **positionally**, insert as text, let Tier 2 re-tokenize markers. Foreign HTML formatting is dropped by design — Standard view is markers-as-text, exactly like P9's Standard view where the reformat pipeline re-tokenizes everything. This generalizes the existing NBSP-gated handler and kills both live-observed corruptions plus the latent doubled-glyph path (re-imported Standard-view HTML producing a `CharNode` via `data-marker` importDOM *and* literal `\nd` text, since MarkerNode has no importDOM).

- **Positional NBSP normalization (replaces the blanket NBSP→`~`), three-part rule:** (1) a leading NBSP — string-start or right after a newline — is a structural separator with nothing in front of it to match against and becomes a space; (2) an NBSP immediately FOLLOWING a marker token (`\marker`, nested `\+marker`, either's closer, or a milestone's anonymous `\*` self-closer) is the required opener/closer separator and becomes a space; (3) an NBSP immediately PRECEDING a marker token is a structural spacer with no source counterpart and is DROPPED entirely (neither spaced nor kept as data) — `createNote` (`usj-editor.adaptor.ts`) appends a spacer after EVERY note child, not just the first, so one sits directly before `\ft`/`\f*` and every other child after the caller; a browser-hop/html-derived copy of a collapsed note therefore carries structural NBSPs on BOTH sides of its interior markers, not only after the opener. Every remaining NBSP is user data → `~`. This is P9's `PostprocessUsfm` model. Live repro that mandates it (2026-08-07): pasting P10's own copied footnote back produced `\f~ \fr~1:1 ~ \ft~Caller test.~ \f*` (every display-NBSP became `~`, breaking marker recognition); a browser-hop paste of `\nd …\nd*` produced `\nd~light … \nd*` with an unmatched pair.

- **The private Lexical flavor is dead on Ctrl+V — mechanically verified, not inferred:** `pasteSelection` (`clipboard.utils.ts`) rebuilds its `DataTransfer` from `navigator.clipboard.read()`, Chromium's async Clipboard-API read. That API, with no `unsanitized`/custom-format opt-in (none is used here), exposes only a fixed, sanctioned MIME allow-list (`text/plain`, `text/html`, and a short list of others) — `application/x-lexical-editor` is not one of them, so the rebuilt `DataTransfer` a real Ctrl+V dispatches can **never** contain it, by construction of the read API itself. This is a static fact about the code path (confirmed by reading `clipboard.utils.ts`), not an inference from the live tilde-corruption symptom — that symptom is merely consistent with it. Consequence: the USFM text carrier IS the internal path too — acceptable once S1's copy is byte-faithful — and the sync `ClipboardEvent` path keeps the node-tree fast path when the flavor is present (S2).

- **Recorded limitation — structure-protected editors get no NBSP normalization:** `$handlePasteForStandardView` declines outright when the document is structure-protected, so `StructureProtectionPlugin`'s HTML sanitizer governs the paste instead (both register `PASTE_COMMAND` at the same priority; the marker-edit engine mounts first, so an explicit decline is required or it would starve the sanitizer). A structure-protected editor's external plain-text pastes therefore receive NO positional NBSP normalization at all — protection governs, and this trade-off is accepted rather than teaching the sanitizer path a second NBSP policy.

- **Marker-bearing lines own their markers:** A pasted line starting with a paragraph-marker literal does NOT also get the host paragraph's cloned prefix (no doubled/empty paragraphs). Marker-free lines inherit the host marker. **Live-verified correct on c7e666fa (2026-08-07)** — `\p one\n\p two` and `tail\n\q1 line` both produced exactly the target structure.

- **Pasted `\c` / `\id`:** Strip during paste normalization (approved). Live-verified harm (2026-08-07): pasting `\c 2` mid-chapter put a chapter node in the editor and poisoned the save loop — PDP rejects every save with "Multiple chapter markers present", the error surfaces only in the renderer log, disk and other editors silently stop updating. (P9 destroys pasted `\c` at save with a user-facing error.)

### S4. Paste-as-plain-text (Ctrl+Shift+V / context menu) — narrows the payload to `text/plain`

Under S3 this is semantically identical to a normal external paste in Standard view. There is NO "paste literally, don't tokenize" mode; P9 has none either (no Paste Special exists in P9). Live-confirmed identical 2026-08-07. Documented + pinned as equivalence, no new UI. TJ note: the equivalence is Standard-view-scoped — other views may legitimately differentiate the two commands later; out of scope here.

### S5. Hidden-marker views (`formatted`, `paragraph-structure`)

- **Copy-out is prose** (no marker text) — existing, gets a gate test protecting Standard-view handlers from leaking there.

- **The paste gate** (swallow anything containing `\` **or `/`**) is over-broad — it eats URLs, dates, "and/or" (live-confirmed 2026-08-07). **Pre-existing upstream behavior** (`CommandMenuPlugin` on `origin/main`, predates the standard-view branches) — per TJ, NOT fixed here; recorded in the semantics doc's deferred list. Structural apply-markers-on-paste in formatted views likewise out of scope.

### S6. Cut = copy + `removeText()` (existing)

The WI-2 filed quirk — a selection-delete ending exactly at a just-settled char-span boundary absorbing one adjacent character — gets a targeted regression pin.

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

---

## Deferred / Out of Scope

The following items are recorded as deferred and not addressed in this plan:

1. **Pre-existing upstream CommandMenuPlugin `/`-swallow:** The paste gate in hidden-marker views that blocks any paste containing `\` or `/` also eats URLs, dates, and common phrases like "and/or" without visible feedback. This behavior originates in the `CommandMenuPlugin` on `origin/main` and predates the standard-view branches. As of 2026-08-07, this is not fixed here per TJ's guidance; it belongs to a separate upstream cleanup task.

2. **Typing `\c` mid-chapter poisons the save loop:** If a user manually types `\c 2` in the middle of a chapter, it corrupts the editor state. The PDP error "Multiple chapter markers present" surfaces only in the renderer log, and disk/other editors silently stop updating. This is a data-fidelity issue tracked separately (WI-10's data-fidelity audit) and is not addressed by paste normalization.

3. **Structural marker application on paste in hidden-marker views:** When a user pastes USFM markers into a hidden-marker (formatted/paragraph-structure) view, there is no logic to apply those markers as structural elements. This is by design — hidden-marker views are not marker-aware and should reject or convert marker input. Implementation is out of scope.

4. **P9-style CF_HTML class parsing:** When P9's Formatted-view copy (which uses CSS classes to encode markers in `CF_HTML`) is pasted into P10, the classes are ignored because P10 does not parse P9's class-based marker encoding. This is an asymmetry vs P9; users should switch to Standard view for marker-aware copy from P9 into P10.

5. **Custom `text/usfm` MIME type / "Copy as USFM" command:** A dedicated `text/usfm` MIME type or separate "Copy as USFM" command was considered and rejected. Once `text/plain` IS USFM (S1), a separate command adds no value; the existing single-copy-format approach is sufficient.

6. **Popover expanded-note `isStandardView` gating issue:** An issue with note-expansion behavior in popovers has an open tracking document at `docs/superpowers/specs/2026-07-07-standard-view-followups.md`. This is not addressed in the current plan.

---

## Test Mapping (S1–S7)

| Semantic | Pinning Test |
|----------|--------------|
| **S1** Copy (Standard view) — `text/plain` is valid USFM | (filled as implementation lands) |
| **S2** Paste (Standard view, internal) — Lexical node tree reconstruction | (filled as implementation lands) |
| **S3** Paste (Standard view, external) — plain text as fidelity carrier | (filled as implementation lands) |
| **S4** Paste-as-plain-text (Ctrl+Shift+V) — equivalence to external paste | (filled as implementation lands) |
| **S5** Hidden-marker views — prose copy, paste gate preservation | (filled as implementation lands) |
| **S6** Cut = copy + `removeText()` — WI-2 regression pin | (filled as implementation lands) |
| **S7** Undo — paste and rebuilds as single step | (filled as implementation lands) |

---
