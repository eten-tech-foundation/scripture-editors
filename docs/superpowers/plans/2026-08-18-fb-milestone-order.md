# Milestone attribute order: preserve the authored order end to end

Branch `sv/fb/milestone-order`. Follow-up to the whitespace/paste-tests group's Task 4, which
established that the loss is at LOAD and recorded it rather than fixing it.

Paratext 9 preserves the order an author wrote a milestone's attributes in. The USJ-to-USFM writer
emits a marker's attributes in object key order, so reordering them REWRITES BYTES in the file.
This editor normalized every milestone to `sid`-first. This track makes the authored order survive
load, settle, display, and save.

---

## 1. Where the order died

The order is carried the whole way in until the node model drops it. JS objects preserve string-key
insertion order, so every stage before the node model is already faithful:

| Stage | File | Order preserved? |
| --- | --- | --- |
| USX parse | `packages/utilities/src/converters/usj/usx-to-usj.ts` `convertUsxRecurse` | **yes** — iterates `element.attributes` in document order into `attribs`, then spreads it after `type`/`marker` |
| USFM re-tokenize (the settle's input) | `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts` `scanMilestone` → `parseAttributeText` | **yes** — assigns pairs in match order |
| **Load into the tree** | `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` `createMilestone` | **NO — dies here** |
| Display bytes | same file, `addAttributes` → `milestoneAttributes` | no (sid-first) |
| Self-heal | `libs/shared/src/displayRun/displayRunRegistry.ts` `expectedPieces` | no (sid-first) |
| Save | `packages/platform/src/editor/adaptors/editor-usj.adaptor.ts` `createMilestoneMarker` | no (sid-first) |

The killing line is the split in `createMilestone`: `sid`/`eid` are destructured into dedicated
`MilestoneNode` fields and everything else goes to `unknownAttributes` via `getUnknownAttributes`.
`unknownAttributes` keeps the unknowns' order relative to EACH OTHER (it is a shallow copy with the
known props deleted), so the single fact lost is **where `sid`/`eid` sat among them** — exactly the
fact `{ marker, sid, eid, unknownAttributes }` has no slot for. The other three rows are then
downstream consequences: with no order in the tree, every re-emission had to pick one, and all three
picked `sid`-first.

So the prior finding was right and the plan's originally-prescribed fix (fold in node-state
insertion order in the bytes builder) genuinely could not work: there was no insertion order left in
the node to fold in. The whole-document dirty pass was already a fixed point — the fold and settle
were exonerated, and still are.

## 2. The fix shape, and why this one

`MilestoneNode` gains one optional field, `attributeOrder?: string[]`, holding the authored order —
**and only when that order is not the canonical one**. Everything else routes through it:

- `milestoneAttributeOrder(markerObject)` (new, `attributeDisplay.utils.ts`) computes the authored
  order from the USJ marker object, returning `undefined` when it already equals canonical
  (`sid`, `eid`, then the rest in appearance order).
- `orderedAttributes(attributes, order)` (new, same file) re-keys an attribute object into that
  order, appending anything the order does not name.
- `milestoneAttributes(sid, eid, unknownAttributes, attributeOrder?)` gained the 4th parameter and
  is the single fold every byte-producing site already used, so load, display, heal, and save cannot
  disagree.
- `MS_NON_ATTRIBUTE_PROPS` (new, `MilestoneNode.ts`) is derived from `MS_MARKER_OBJECT_PROPS` by
  removing `sid`/`eid`, so the two lists cannot drift.

**Why not the cheaper no-schema option.** The instruction preferred deriving order from the USJ
attribute object's own insertion order with no schema change, if the order genuinely reaches the
builders. It reaches `createMilestone` — but the node cannot STORE it, and storage is required, not
optional, because the display-run self-heal (`expectedPieces`) re-derives the expected bytes from
NODE state on every dirtying. A load-only fix would paint the authored order at load and then have
the heal silently rewrite it to `sid`-first on the user's first keystroke anywhere in the paragraph.
The third pin exists specifically to hold that line.

**Why not an ordered attribute map replacing the fields.** Folding `sid`/`eid` into a single ordered
map would touch every `getSid()`/`getEid()` consumer (comments, annotations, the delta leg, verse
sid carry-over) for no fidelity gain over a 3-line order array.

**Why `MILESTONE_VERSION` stays 1, with no fixture regeneration.** The field is omitted whenever the
order is canonical, so *absent* means exactly what it always meant. Every state written before the
field existed reads back identically, and every canonically ordered milestone still serializes
byte-identically — which is why the 2SA lexical fixtures did not need regenerating and the corpus
milestones fixture stays byte-identical. This is a weaker change than the `ImmutableUnmatchedNode`
v2 precedent, which needed a bump because the MEANING of existing stored data changed; here it does
not.

## 3. The sid/eid order definition

**Order means the order among the attributes the display fold actually renders.**

In USJ a milestone is a flat marker object — `{type, marker, sid, who}` — and `sid`/`eid` are plain
keys of it exactly like `who` is. In USFM/USX they are written as ordinary attributes
(`\qt-s |sid="x" who="y"\*`), and `milestoneAttributes` already folded them into the same `|…` run
that `canonicalAttributeText` renders. So they order against the other attributes with **no special
case**: there is no "property vs attribute" distinction to honor at this level.

The names excluded from the order are `type`, `marker`, and `content` (`MS_NON_ATTRIBUTE_PROPS`) —
never attribute bytes. `closed` stays IN the order list: it is excluded at RENDER time by
`ATTRIBUTE_EXCLUDED_KEYS` but is still emitted as a USJ key, so keeping its authored slot is the
faithful choice.

Nothing about what ParatextData or the tokenizer ACCEPTS changed. This is purely order preservation
of what arrived.

## 4. Tests

Six pins, all red first, all green after.

Unit — `libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts` (the fold's home, and where
`canonicalAttributeText`'s insertion-order guarantee is already pinned):

1. folds in the authored order when given one, rather than sid-first
2. renders the authored order into the display bytes (`|who="Pilate" sid="qt_1"`)
3. appends attributes the order does not name, in canonical order (a stale name and a new name are
   both expected: the settle re-derives attributes from displayed bytes, so an edit can drop or add
   one)
4. ignores an order naming nothing the milestone carries

The pre-existing "folds sid then eid then unknownAttributes" pin was also strengthened from
`toEqual` (key-order blind) to an explicit `Object.keys` assertion.

Integration — `packages/platform/src/editor/markerEdit/milestoneAttributeSettle.test.tsx`, the two
pins the prior group left recording the defect, flipped to assert the fix, plus a third:

5. **load round trip, no edit** — a milestone authored `who` before `sid` serializes back
   byte-identically (compared as JSON text; `toEqual` ignores key order and would pass regardless)
6. **dirty-settle round trip** — the corpus fixed-point shape (`markDirty` every node, run the
   update, serialize) keeps the authored order
7. **display bytes** — the run reads `|who="Pilate" sid="qt_1"` at load AND after a dirty pass; the
   second read is the self-heal guard described above

## 5. Deviations and boundaries

- **Scribe untouched.** `attributeOrder` is optional, so scribe's three milestone builders compile
  and behave exactly as before. Per the repo convention (scribe is unmaintained; touch it only when
  a change explicitly targets it) the shared type did not force a mechanical edit, so none was made.
  Scribe keeps today's sid-first normalization.
- **The collab/OT leg keeps canonical order — deliberate, and a handoff.**
  `$getMilestoneOp` (`libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts`) emits
  `style, sid, eid, …unknowns`, and `OTMilestoneEmbed`
  (`collab/rich-text-ot.model.ts`) has no order slot; the materializer
  `$createMilestone` (`delta-apply-update.utils.ts`) therefore rebuilds milestones canonically.
  Adding an order to the embed is a WIRE-MODEL change shared with the host, so it was not made
  unilaterally. Impact is bounded: the save path is
  `editor USJ → usjToUsxString → setChapterUSX`, which goes through `createMilestoneMarker` and is
  now faithful. The gap is only that a non-canonically ordered milestone propagated over collab
  materializes canonically on the REMOTE peer. No fixture regeneration or version bump was needed,
  and nothing regressed — this is today's behavior, now written down.
- **No C# changes**, and no change to what ParatextData or the tokenizer accepts.
- **No fixture regeneration.** The canonical-order omission made `generate:test-data` unnecessary;
  the 2SA lexical fixtures and the corpus milestones fixture are untouched and byte-identical.
