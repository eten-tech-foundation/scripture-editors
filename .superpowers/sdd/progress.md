# SDD progress ledger — Standard view Phase 0+1 plan
Task 1: complete (commits a6d9b97..d108170, review clean; note: only platform+utilities have extract-api targets)
Task 2: complete (commits d108170..2aabcb9, review clean)
  Minor (for final review triage): redundant ' ' in regex class node.utils.ts:405 (plan-authored); single-letter segment cap noted as boundary
Task 3: complete (commits 2aabcb9..ffe09e4, review clean; 12/12 harness green)
  Plan corrections carried forward: Nx project name is @eten-tech-foundation/platform-editor (not "platform"); USX fixtures must be authored single-line where inter-element whitespace would become text nodes
  Minor (final review triage): findings-doc "Task 3 baseline run" narrative section deviates from finding-entry template shape (benign)
Task 4: complete (commits ffe09e4..057569a, review clean; 36/36, zero adaptor fixes needed — bridges/ca-cp-va-vp/ref/optbreak/ms/RTL all round-trip already)
Task 5: complete (commits 057569a..1ce5782, review clean; 56/56, acceptance criterion 5-of-5 lossless, vacuous-pass risk refuted by reviewer via converter source + scratch-script verification)
Task 6: complete (commits 1ce5782..54941d2, review clean; stale fixture corrected, circularity risk refuted by node-by-node trace)
  Minor (final review triage): book \id marker glyph absent from editable delta ops (pre-existing, confirm with collab adaptor owner); TODO aspiration to strip marker glyphs from ops = Phase 2 design question
Task 7: complete (commits 54941d2..3904573, review clean, zero findings; reverse adaptor needed no change; incidentally fixes latent caller-hidden-when-collapsed bug)
Task 8: complete (commits 3904573..1320947, 2 commits, approved after fix round)
  Fix round: plan's CSS assumed .marker class on MarkerNode — dead since commit 5ef9976 (#359); retargeted to .opening/.closing/.selfClosing + regression tests; class-drop recorded as phase-2-engine finding
  User-facing note: in-browser visual verification NOT performed (no Chrome for Playwright MCP in WSL, no sudo) — user should eyeball demo Standard view
Task 9: complete (commits 1320947..70a8b80, review clean; Unicode normalization verified already applied host-side at ScrText.PutText — spec §4 item resolved, no Phase 5 work needed)
Final whole-branch review (fable): READY TO MERGE. Important finding fixed in 23b4eaf (standard-view note delta ops pinned + comment fix + phase-2 follow-ups recorded); fix re-review approved, zero findings.
ALL 9 TASKS + FINAL REVIEW COMPLETE. Branch head: 23b4eaf.

# SDD progress ledger — Standard view Phase 2 plan (docs/superpowers/plans/2026-07-02-standard-view-phase-2.md, plan commit 784e6e6)
Task 1: complete (commits 784e6e6..717385d, review clean; note: test files need explicit .js import extensions for nodenext typecheck)
Task 2: complete (commits 717385d..1c7fe13, review clean; 14/14 + 124/124)
  Adaptations verified by reviewer: getMarker default import; NoteMarkerObject augments MarkerObject with closed?: string; regex classes behavior-preserving
  Minor (final review triage): dead CharFrame.container field (brief-verbatim); forward note — MARKER_OBJECT_PROPS whitelist could strip `closed` downstream, Task 3+ must confirm it survives serialization
Task 3: complete (commits 1c7fe13..60ed685, review clean; 23/23 + 133/133)
  Beyond-brief fixes verified: note-close now clears char stack; w/rb/jmp markers added via usfmMarkersOverwrites + getMarker overwrite-only path (generated file untouched)
  Minor (final review triage): getMarker overwrite-only guard checks only .type before `as Marker` cast; scanMilestone dead `between.includes("\\")` branch (plan-verbatim); milestone unmappable bare attribute silently dropped (plan-verbatim edge); note-close charstack tested only for note-internal spans
Task 4: complete (commits 60ed685..2887dc1, review clean; 137/137 + 1060/1060 + 176/176)
  Minor (final review triage): report cites TypedMarkNode.test.ts guard pattern imprecisely (guard placement differs; typecheck verified green regardless)
Task 4 fix round: closure-narrowing typecheck errors fixed in 6735763 (Task 4/5 "typecheck clean" claims were Nx cache hits — ALL later verification gates must use --skip-nx-cache)
Task 5: complete (commits 2887dc1..144d8a7, review clean; corpus 60/60 all modes)
  Beyond-brief fix verified correct: isCharChild separator strip ordering in reverse adaptor (provably cannot mis-strip: data NBSP pre-encodes to ~)
  Minor (final review triage): no focused unit test for isCharChild strip; para-leading rule untested in corpus; redundant isSerializedMarkerNode guard in createPara (plan-verbatim)
Task 6: complete (commits 6735763..28549f1, review clean; 10/10, platform 194/194, all gates cache-bypassed)
  Reviewer proved: FFFC count can only stay equal or decrease -> symmetry guard converts any tokenizer anomaly to zero-mutation refusal (no data-loss path); textType state survives $parseSerializedNode
  Minor (final review triage): multi-para caret drift after literal-\p split (cosmetic, untested); $requestTier2ForNode untested directly; rebuild regularizes whitespace runs (intended PT9 semantics)
Task 7: complete (commits 28549f1..22b1fbe, review clean; 8/8, platform 202/202)
  Deviations verified correct: local milestone check (MilestoneNode.isValidMarker z-wildcard would block \zed test); update-listener SELECTION_CHANGE self-dispatch (ScriptureReferencePlugin precedent, convergence airtight)
  Minor (final review triage): self-dispatch fires every commit while pendings non-empty — gate on anchor-key change would cut redundant broadcasts
Task 8: complete (commits 22b1fbe..25ca8a2, approved after fix round; 15/15, platform 209/209)
  Fix round: closer lookup mis-mirrored on collab-flattened nested spans -> marker-matched last-closer + parent-marker guard routing mismatched shapes to Tier 2; regression tests load-bearing
  Minor (final review triage): note-opener invalid renames no-op via $requestTier2ForNode note-scope skip (Phase 3 scope, pre-existing); isPara/isCharKindMarker duplicate shape
Task 9: complete (commits 25ca8a2..afc60ee, review clean; shared 138/138, platform 214/214)
  Adaptations verified (incl. Lexical-source trace of text-merge + caret survival): extraction test asserts merged-node outcome; regex NBSP escapes; _context rename
  Minor (final review triage): caret-after-extraction untested (depends on Lexical merge ordering); $chapterNodeTransform has zero direct test coverage (live registered code); dead conjunct in verse unterminated check (plan-verbatim)
Task 10: complete (commits afc60ee..42b04be, review clean; 6/6 new, platform 222/222)
  Adaptations verified: scoped jsdom Range polyfill (test-env artifact); tsconfig lib-exclude/spec-include mirrors shared/shared-react precedent; helper extraction complete
  Minor (final review triage): no-previous-para fallback can leave stray double-NBSP (plan-verbatim, cosmetic); merge test doesn't exercise the by-state orphan drop branch
Task 11: complete (commits 42b04be..504fd93, review clean; 5/5, platform 227/227)
  Beyond-brief loop-breaker verified: rebuildAttempted per-commit content-keyed dedup (only invariant across rebuilds; convergence proven; cleared before Task 7 self-dispatch)
  Minor (final review triage + Task 16 known-limitations): dedup can skip a would-succeed rebuild when two scopes share byte-identical trigger content in one commit — recovery needs a DIRECT content re-edit (Enter/blur do NOT retrigger terminated-skipped nodes; implementer report overstated self-heal); note-skip test partly vacuous (double-guarded)
Task 12: complete (commits 504fd93..6ffd0fc, review clean; 4/4, platform 231/231; @lexical/clipboard added as explicit dep)
  IMPORTANT record correction (for Task 16): §5.6 clipboard normalization is effectively UNREACHABLE in-app (Ctrl+C/ContextMenuPlugin/EditorRef.copy all dispatch null payloads; native context menu suppressed) — only out-of-band native ClipboardEvents engage it. Wire-or-accept decision deferred to Task 16/Phase 5. Task 15 QA check #9 must test copy via a path that actually works and note behavior.
  Minor: report's no-ping-pong justification imprecise (real mechanism: node detachment + adaptor pre-substitution); guard-rail-rejected rebuild + whitespace transform costs one extra rejected attempt (finite)
Task 13: complete (commits 6ffd0fc..382f982, approved after 2 fix rounds; 6/6, platform 236/236)
  Fix rounds: interior-range styled-plain-styled split (split-end-before-start ordering); in-span space reuse must still SPLIT (PT9 blank-style outcome) — plan's own test-3 assertion was the misleading culprit, rewritten structural
  Minor (final review triage): range end at offset===size unwraps whole span (over-conservative edge); benign Lexical DOMException warn in unwrap test; preventDefault before delegation on non-range ctrl+space
Task 14: complete (commits 382f982..b60bce8, review clean; 3/3, platform 239/239)
  Minor (final review triage): dirty-after-mount test docstring overstates re-render coverage (in-place text edits never recreate the classed element; created-mutation path is the real protection)
Task 15: complete (commits b60bce8..ae83555 [4], approved; whole-repo suites green cache-bypassed; browser QA 11/11 real-input PASS after two fix rounds)
  Fix 1: CommandMenuPlugin (sole purpose: block \ and / input) gated off when markerMode==="editable" (Editor.tsx) — engine-symmetric complement; scribe still mounts it unconditionally (latent if scribe gains editable modes)
  Fix 2: real-paste undo gap root-caused to ScriptureReferencePlugin dispatching SELECTION_CHANGE synchronously from a mutation listener mid-commit (advanced undo baseline past pre-paste state); fixed via queueMicrotask deferral (LoadStatePlugin precedent); regression test pins deferral ordering; browser-verified undo/redo single-step
  Minor (final review triage): gate test covers 2/4 view modes (unformatted untested); Editor.tsx gate comment omits that / is also unblocked; queueMicrotask unguarded on unmount (harmless, precedented); findings addendum dated 2026-07-03 vs session 2026-07-02 (cosmetic)
Task 16: complete (docs-only; no commit range — wrap-up). Final sweep re-run at branch head ae83555, all cache-bypassed: shared 138/138, shared-react 1060/2skip, platform 242/3skip, usfm-markers 19/19, utilities 3/3; lint/typecheck/format:check/extract-api all clean across 10 projects; git status --short empty (no API-report drift). Wrote: findings-doc "Phase 2 completion summary" (top of 2026-07-01-standard-view-phase0-findings.md); new 2026-07-02-standard-view-phase2-notes.md (Phase 3/4/5 handoff + known-limitations, corrected/expanded beyond the task-16 brief's seed content per progress.md's own record — clipboard gap severity, rebuildAttempted recovery semantics, CommandMenuPlugin/scribe latent gap, ScriptureReferencePlugin queueMicrotask fix, sentinel/refusal exact function list).
ALL 15 PHASE-2 TASKS + WRAP-UP COMPLETE. Branch head: ae83555 (docs commit for Task 16 lands after this line is written). Phase 2 engine is sound end-to-end (Task 15 browser QA, real keyboard/paste input, post-fix); two items deferred to Phase 5 with recorded candidate designs (clipboard wire-or-accept; Enter-menu). Phase 3 (footnote UX) and Phase 4 (StyleInfo) needs are enumerated in docs/superpowers/specs/2026-07-02-standard-view-phase2-notes.md with exact function-level swap/extension points.
