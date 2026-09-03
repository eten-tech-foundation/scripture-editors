/**
 * Agreement pins between the editor's {@link ATTRIBUTE_MARKERS} table and paranext-core's
 * markers map — the two independent records of the attribute-marker relation.
 *
 * The editor's table models the PARSER (folding at parse time, deliberately matching
 * ParatextData) and keys host receptivity by USJ NODE TYPE. The markers map models the
 * SERIALIZER (USJ to USFM, spec-declarative) and keys the same relation by host MARKER NAME.
 * Neither can subsume the other, so the shared facts are duplicated by design — and duplication
 * drifts. These pins are the tripwire: they assert the two agree on every marker, attribute
 * name, shape, and host set, and they make the marker-name-versus-node-type keying difference
 * explicit instead of coincidental.
 *
 * The map side is a VENDORED SLICE of paranext-core's
 * `lib/platform-bible-utils/src/scripture/markers-maps/markers-map-3.0.model.ts`
 * (`USFM_MARKERS_MAP.markers`, verbatim fields, descriptions dropped) — the source of truth
 * lives there; re-copy when it changes (same convention as the vendored `testUsfmCorpus`
 * fixtures and the `tools/usfm-markers` usfm.sty). scripture-editors has no dependency on
 * `platform-bible-utils`, so a live import is not available to tests here.
 *
 * Parser-only behaviors the map cannot express (a same-line space before the attribute marker
 * blocks the fold; markup in the content aborts it; an empty span is never an empty attribute;
 * `cat` is receptive only directly after `\esb` or a note's caller) are deliberately NOT
 * asserted here — they live in `usfmFragmentToUsj.test.ts` beside the parser they describe.
 */
import { ATTRIBUTE_MARKERS } from "./usfmFragmentToUsj.js";

/** One attribute-marker entry of the vendored map slice. */
interface MapAttributeMarkerEntry {
  /** The marker's own shape: `char` folds via an explicit closer, `para` via a block boundary. */
  readonly type: "char" | "para";
  readonly attributeMarkerAttributeName: string;
  /** Host MARKER NAMES (the map's keying), not USJ node types (the editor's keying). */
  readonly isAttributeMarkerFor: readonly string[];
  /** Present (true) on `ca`/`va`/`vp`; ABSENT on `cp`/`cat` — the map-only serializer fact. */
  readonly hasStructuralSpaceAfterCloseAttributeMarker?: true;
}

/** One host entry of the vendored map slice. */
interface MapHostEntry {
  /** The host's USJ node type — the bridge between the two keyings. */
  readonly type: string;
  /** The host's attribute markers, ORDERED by required document order. */
  readonly attributeMarkers: readonly string[];
}

/** Vendored from `USFM_MARKERS_MAP.markers`: every attribute marker, verbatim fields. */
const MAP_ATTRIBUTE_MARKERS: { readonly [marker: string]: MapAttributeMarkerEntry } = {
  ca: {
    type: "char",
    attributeMarkerAttributeName: "altnumber",
    isAttributeMarkerFor: ["c"],
    hasStructuralSpaceAfterCloseAttributeMarker: true,
  },
  cat: {
    type: "char",
    attributeMarkerAttributeName: "category",
    isAttributeMarkerFor: ["ef", "efe", "esb", "ex", "f", "fe", "x"],
  },
  cp: {
    type: "para",
    attributeMarkerAttributeName: "pubnumber",
    isAttributeMarkerFor: ["c"],
  },
  va: {
    type: "char",
    attributeMarkerAttributeName: "altnumber",
    isAttributeMarkerFor: ["v"],
    hasStructuralSpaceAfterCloseAttributeMarker: true,
  },
  vp: {
    type: "char",
    attributeMarkerAttributeName: "pubnumber",
    isAttributeMarkerFor: ["v"],
    hasStructuralSpaceAfterCloseAttributeMarker: true,
  },
};

/** Vendored from `USFM_MARKERS_MAP.markers`: every host an attribute marker names, verbatim
 * `type` and `attributeMarkers` fields. `esbe` is `esb`'s independent closer, not a host. */
const MAP_HOSTS: { readonly [marker: string]: MapHostEntry } = {
  c: { type: "chapter", attributeMarkers: ["ca", "cp"] },
  ef: { type: "note", attributeMarkers: ["cat"] },
  efe: { type: "note", attributeMarkers: ["cat"] },
  esb: { type: "sidebar", attributeMarkers: ["cat"] },
  ex: { type: "note", attributeMarkers: ["cat"] },
  f: { type: "note", attributeMarkers: ["cat"] },
  fe: { type: "note", attributeMarkers: ["cat"] },
  v: { type: "verse", attributeMarkers: ["va", "vp"] },
  x: { type: "note", attributeMarkers: ["cat"] },
};

describe("ATTRIBUTE_MARKERS agrees with paranext-core's markers map on every shared fact", () => {
  it("covers exactly the same marker set", () => {
    expect(Object.keys(ATTRIBUTE_MARKERS).sort()).toEqual(
      Object.keys(MAP_ATTRIBUTE_MARKERS).sort(),
    );
  });

  it.each(Object.keys(MAP_ATTRIBUTE_MARKERS))("%s: same attribute name", (marker) => {
    expect(ATTRIBUTE_MARKERS[marker].attrName).toBe(
      MAP_ATTRIBUTE_MARKERS[marker].attributeMarkerAttributeName,
    );
  });

  it.each(Object.keys(MAP_ATTRIBUTE_MARKERS))("%s: same shape", (marker) => {
    expect(ATTRIBUTE_MARKERS[marker].shape).toBe(MAP_ATTRIBUTE_MARKERS[marker].type);
  });

  // The keying difference, pinned rather than left implicit: the map lists host MARKER NAMES;
  // the editor lists host USJ NODE TYPES. The bridge is each host's own `type` in the map, so
  // the editor's set must equal the image of the map's host list under that lookup. Note the
  // asymmetry this hides: `cat`'s six note hosts collapse into the editor's single "note"
  // target, so a NEW note marker added to the map would fold in the editor with no table change
  // here — by type-keyed design, matching ParatextData's own type-keyed parse — while a new
  // non-note host would need both sides updated.
  it.each(Object.keys(MAP_ATTRIBUTE_MARKERS))(
    "%s: same host set across the keying gap",
    (marker) => {
      const hostTypes = new Set(
        MAP_ATTRIBUTE_MARKERS[marker].isAttributeMarkerFor.map((host) => {
          const entry = MAP_HOSTS[host];
          if (!entry) throw new Error(`vendored slice is missing host "${host}" — re-copy it`);
          return entry.type;
        }),
      );
      expect(new Set(ATTRIBUTE_MARKERS[marker].targetTypes)).toEqual(hostTypes);
    },
  );

  it("every host lists back exactly the markers that claim it, in document order", () => {
    for (const [host, entry] of Object.entries(MAP_HOSTS)) {
      const claimants = Object.keys(MAP_ATTRIBUTE_MARKERS).filter((marker) =>
        MAP_ATTRIBUTE_MARKERS[marker].isAttributeMarkerFor.includes(host),
      );
      expect(new Set(entry.attributeMarkers), `host ${host}`).toEqual(new Set(claimants));
    }
    // The two-marker hosts order alt before pub — the document order ParatextData preserves on
    // disk (the capture pins in paranext-core show emptying \va must not let \vp fold past it).
    expect(MAP_HOSTS.c.attributeMarkers).toEqual(["ca", "cp"]);
    expect(MAP_HOSTS.v.attributeMarkers).toEqual(["va", "vp"]);
  });

  it("the serializer-only structural-space fact stays where the invariants put it", () => {
    // True for ca/va/vp, ABSENT for cp/cat. The editor never consumes this field (the parser
    // treats a space after any closer as content, matching ParatextData) — this pin exists so a
    // vendored re-copy that flips it is noticed, not silently absorbed.
    expect(
      Object.keys(MAP_ATTRIBUTE_MARKERS).filter(
        (marker) => MAP_ATTRIBUTE_MARKERS[marker].hasStructuralSpaceAfterCloseAttributeMarker,
      ),
    ).toEqual(["ca", "va", "vp"]);
  });
});
