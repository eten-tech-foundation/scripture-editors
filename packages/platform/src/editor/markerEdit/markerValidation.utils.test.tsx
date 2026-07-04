import { $validateDocument } from "./markerValidation.utils";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { $createTextNode, $getRoot } from "lexical";
import {
  $createBookNode,
  $createChapterNode,
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $createVerseNode,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  ParaNode,
  StyleInfo,
  VerseNode,
} from "shared";

/** The stylesheet from the brief, shared across cases. */
const sheet: StyleInfo = {
  markers: {
    id: { marker: "id", styleType: "paragraph" },
    c: { marker: "c", styleType: "paragraph", occursUnder: ["id"] },
    p: { marker: "p", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    s1: { marker: "s1", styleType: "paragraph", occursUnder: ["c"], rank: 3 },
    s2: { marker: "s2", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    v: { marker: "v", styleType: "character", occursUnder: ["p", "q1"] },
    nd: { marker: "nd", styleType: "character", endMarker: "nd*", occursUnder: ["p"] },
    ft: { marker: "ft", styleType: "character", endMarker: "ft*", occursUnder: ["f", "fe"] },
    f: { marker: "f", styleType: "note", endMarker: "f*", occursUnder: ["p"] },
    xq: { marker: "xq", styleType: "character", endMarker: "xq*" },
    free: { marker: "free", styleType: "character", endMarker: "free*" },
  },
};

/** A `\marker` paragraph with a single opener MarkerNode (no char content needed). */
function $appendPara(marker: string): { para: ParaNode; opener: MarkerNode } {
  const para = $createParaNode(marker);
  const opener = $createMarkerNode(marker);
  $getRoot().append(para.append(opener, $createTextNode(NBSP)));
  return { para, opener };
}

describe("$validateDocument — paragraph-level (TagValidator.IsParagraphTagValid port)", () => {
  it("case 1: flags an unknown para marker as unknown", async () => {
    let opener: MarkerNode;
    const { editor } = await baseTestEnvironment(() => ({ opener } = $appendPara("zfoo")));
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.get(opener.getKey())).toBe("unknown");
      expect(map.size).toBe(1);
    });
  });

  it("case 2: a known id/c/p sequence validates cleanly", async () => {
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      const chapter = $createChapterNode("1");
      $getRoot().append(
        book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))),
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP)),
      );
    });
    editor.getEditorState().read(() => {
      expect($validateDocument(sheet).size).toBe(0);
    });
  });

  it("case 3: a `p` at root with only `id` preceding it (no `c`) is invalid", async () => {
    let opener: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      $getRoot().append(book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))));
      ({ opener } = $appendPara("p"));
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.get(opener.getKey())).toBe("invalid");
      expect(map.size).toBe(1);
    });
  });

  it("case 4a: rank-descent c -> s2 -> s1 flags s1 invalid (matched ancestor, rank forbids)", async () => {
    let s1Opener: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      const chapter = $createChapterNode("1");
      const s2 = $createParaNode("s2");
      const s2Opener = $createMarkerNode("s2");
      const s1 = $createParaNode("s1");
      s1Opener = $createMarkerNode("s1");
      $getRoot().append(
        book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))),
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        s2.append(s2Opener, $createTextNode(NBSP)),
        s1.append(s1Opener, $createTextNode(NBSP)),
      );
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.get(s1Opener.getKey())).toBe("invalid");
      expect(map.size).toBe(1);
    });
  });

  it("case 4b: rank-ascent c -> s1 -> s2 validates cleanly (4 >= 3)", async () => {
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      const chapter = $createChapterNode("1");
      $getRoot().append(
        book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))),
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        $createParaNode("s1").append($createMarkerNode("s1"), $createTextNode(NBSP)),
        $createParaNode("s2").append($createMarkerNode("s2"), $createTextNode(NBSP)),
      );
    });
    editor.getEditorState().read(() => {
      expect($validateDocument(sheet).size).toBe(0);
    });
  });
});

describe("$validateDocument — character-level (ValidateUsxStyles node-set port)", () => {
  it("case 5: a `\\ft` char span inside a `p` para flags both opener and closer invalid", async () => {
    let opener: MarkerNode, closer: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("p");
      const ft = $createCharNode("ft");
      opener = $createMarkerNode("ft");
      closer = $createMarkerNode("ft", "closing");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          ft.append(opener, $createTextNode(`${NBSP}text`), closer),
        ),
      );
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.get(opener.getKey())).toBe("invalid");
      expect(map.get(closer.getKey())).toBe("invalid");
      expect(map.size).toBe(2);
    });
  });

  it("case 6: a `\\ft` char inside an `f` note validates against the note's marker", async () => {
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f");
      const ft = $createCharNode("ft");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          note.append(
            ft.append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}text`),
              $createMarkerNode("ft", "closing"),
            ),
          ),
        ),
      );
    });
    editor.getEditorState().read(() => {
      expect($validateDocument(sheet).size).toBe(0);
    });
  });

  it("case 7a: a nested `nd` inside `nd` inside `p` validates against the PARA (both valid)", async () => {
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("p");
      const outerNd = $createCharNode("nd");
      const innerNd = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          outerNd.append(
            $createMarkerNode("nd"),
            $createTextNode(NBSP),
            innerNd.append(
              $createMarkerNode("nd"),
              $createTextNode(`${NBSP}text`),
              $createMarkerNode("nd", "closing"),
            ),
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
    });
    editor.getEditorState().read(() => {
      expect($validateDocument(sheet).size).toBe(0);
    });
  });

  it("case 7b: a `ft` nested inside `nd` inside `p` is invalid (context stays `p`, not `nd`)", async () => {
    let ftOpener: MarkerNode, ftCloser: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("p");
      const nd = $createCharNode("nd");
      const ft = $createCharNode("ft");
      ftOpener = $createMarkerNode("ft");
      ftCloser = $createMarkerNode("ft", "closing");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          nd.append(
            $createMarkerNode("nd"),
            $createTextNode(NBSP),
            ft.append(ftOpener, $createTextNode(`${NBSP}text`), ftCloser),
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.get(ftOpener.getKey())).toBe("invalid");
      expect(map.get(ftCloser.getKey())).toBe("invalid");
      expect(map.size).toBe(2);
    });
  });

  it("case 8: a char with empty occursUnder (`free`) is valid anywhere", async () => {
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("s1");
      const free = $createCharNode("free");
      $getRoot().append(
        para.append(
          $createMarkerNode("s1"),
          $createTextNode(NBSP),
          free.append(
            $createMarkerNode("free"),
            $createTextNode(`${NBSP}text`),
            $createMarkerNode("free", "closing"),
          ),
        ),
      );
    });
    editor.getEditorState().read(() => {
      expect($validateDocument(sheet).size).toBe(0);
    });
  });

  it("case 9: an unknown char (`zxx`) is flagged unknown (wins over invalid)", async () => {
    let opener: MarkerNode, closer: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("p");
      const zxx = $createCharNode("zxx");
      opener = $createMarkerNode("zxx");
      closer = $createMarkerNode("zxx", "closing");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          zxx.append(opener, $createTextNode(`${NBSP}text`), closer),
        ),
      );
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.get(opener.getKey())).toBe("unknown");
      expect(map.get(closer.getKey())).toBe("unknown");
      expect(map.size).toBe(2);
    });
  });
});

describe("$validateDocument — verse validation", () => {
  it("case 10a: a verse inside an `s1` para is invalid", async () => {
    let verse: VerseNode;
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("s1");
      verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
      $getRoot().append(para.append($createMarkerNode("s1"), $createTextNode(NBSP), verse));
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.get(verse.getKey())).toBe("invalid");
      expect(map.size).toBe(1);
    });
  });

  it("case 10b: a verse inside a `p` para is absent from the map", async () => {
    let verse: VerseNode;
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("p");
      verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), verse));
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(sheet);
      expect(map.has(verse.getKey())).toBe(false);
      expect(map.size).toBe(0);
    });
  });
});

describe("$validateDocument — xq exemption and note exclusion", () => {
  it("case 11: a `ft` nested inside an `xq` char is skipped entirely; the `xq` itself is still validated", async () => {
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("p");
      const xq = $createCharNode("xq");
      const ft = $createCharNode("ft");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          xq.append(
            $createMarkerNode("xq"),
            $createTextNode(NBSP),
            ft.append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}text`),
              $createMarkerNode("ft", "closing"),
            ),
            $createMarkerNode("xq", "closing"),
          ),
        ),
      );
    });
    editor.getEditorState().read(() => {
      expect($validateDocument(sheet).size).toBe(0);
    });
  });

  it("case 12: an `f` note inside an `s1` para is not itself flagged; its `ft` child validates against `f`", async () => {
    const { editor } = await baseTestEnvironment(() => {
      const para = $createParaNode("s1");
      const note = $createNoteNode("f");
      const ft = $createCharNode("ft");
      $getRoot().append(
        para.append(
          $createMarkerNode("s1"),
          $createTextNode(NBSP),
          note.append(
            ft.append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}text`),
              $createMarkerNode("ft", "closing"),
            ),
          ),
        ),
      );
    });
    editor.getEditorState().read(() => {
      // The note itself (occursUnder f = [p], context s1) would be invalid if validated —
      // proving it produces no flag demonstrates the PT9 //note exclusion, not a coincidence.
      expect($validateDocument(sheet).size).toBe(0);
    });
  });
});

describe("$validateDocument — paragraph stack semantics (PT9 discriminators)", () => {
  it("an unknown para does NOT join the stack (PT9 TagValidator.cs:28-30)", async () => {
    const probeSheet: StyleInfo = {
      markers: {
        id: { marker: "id", styleType: "paragraph" },
        probe: { marker: "probe", styleType: "paragraph", occursUnder: ["zfoo"] },
      },
    };
    let unknownOpener: MarkerNode, probeOpener: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      const unknown = $createParaNode("zfoo");
      const probe = $createParaNode("probe");
      unknownOpener = $createMarkerNode("zfoo");
      probeOpener = $createMarkerNode("probe");
      $getRoot().append(
        book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))),
        unknown.append(unknownOpener, $createTextNode(NBSP)),
        probe.append(probeOpener, $createTextNode(NBSP)),
      );
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(probeSheet);
      // The unknown para itself is flagged unknown and stays valid-anywhere...
      expect(map.get(unknownOpener.getKey())).toBe("unknown");
      // ...but it never joined the stack: `probe` (occursUnder ["zfoo"]) finds no `zfoo`
      // ancestor and is invalid. Had zfoo been (wrongly) pushed, probe would be clean.
      expect(map.get(probeOpener.getKey())).toBe("invalid");
      expect(map.size).toBe(2);
    });
  });

  it("a known empty-occursUnder para does NOT join the stack (PT9 TagValidator.cs:28-30)", async () => {
    const noPushSheet: StyleInfo = {
      markers: {
        id: { marker: "id", styleType: "paragraph" },
        c: { marker: "c", styleType: "paragraph", occursUnder: ["id"] },
        x: { marker: "x", styleType: "paragraph", rank: 5 },
        s1: { marker: "s1", styleType: "paragraph", occursUnder: ["c"], rank: 3 },
      },
    };
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      const chapter = $createChapterNode("1");
      $getRoot().append(
        book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))),
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        $createParaNode("x").append($createMarkerNode("x"), $createTextNode(NBSP)),
        $createParaNode("s1").append($createMarkerNode("s1"), $createTextNode(NBSP)),
      );
    });
    editor.getEditorState().read(() => {
      // `x` (empty occursUnder, rank 5) is valid anywhere but must NOT be pushed: `s1`
      // (occursUnder ["c"], rank 3) then finds `c` at the top of the stack and is valid.
      // Under push-on-empty-occursUnder semantics the stack would be [id, c, x] and the
      // `c` match would be rank-forbidden (x.rank 5 > 3) with nothing lower — invalid.
      expect($validateDocument(noPushSheet).size).toBe(0);
    });
  });

  it("a rank-forbidden ancestor match keeps scanning lower stack entries (PT9 continues, no break)", async () => {
    const rescanSheet: StyleInfo = {
      markers: {
        id: { marker: "id", styleType: "paragraph" },
        c: { marker: "c", styleType: "paragraph", occursUnder: ["id"] },
        s1: { marker: "s1", styleType: "paragraph", occursUnder: ["c"], rank: 3 },
        s2: { marker: "s2", styleType: "paragraph", occursUnder: ["s1"], rank: 4 },
        t: { marker: "t", styleType: "paragraph", occursUnder: ["s1", "c"], rank: 3 },
      },
    };
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      const chapter = $createChapterNode("1");
      $getRoot().append(
        book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))),
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        $createParaNode("s1").append($createMarkerNode("s1"), $createTextNode(NBSP)),
        $createParaNode("s2").append($createMarkerNode("s2"), $createTextNode(NBSP)),
        $createParaNode("t").append($createMarkerNode("t"), $createTextNode(NBSP)),
      );
    });
    editor.getEditorState().read(() => {
      // Stack when validating `t` is [id, c, s1, s2]. The first occursUnder match scanning
      // top-down is `s1` (i=2) — rank-forbidden (stack[3]=s2 rank 4 > t.rank 3). PT9 keeps
      // scanning and accepts at `c` (i=1: stack[2]=s1 rank 3 <= 3), so `t` is valid. An
      // implementation that breaks on the first rank-forbidden match would flag it invalid.
      expect($validateDocument(rescanSheet).size).toBe(0);
    });
  });

  it("an invalid para is NOT pushed onto the stack (a later para can't match against it)", async () => {
    const stackProbeSheet: StyleInfo = {
      markers: {
        id: { marker: "id", styleType: "paragraph" },
        bad: { marker: "bad", styleType: "paragraph", occursUnder: ["nonexistent"] },
        probe: { marker: "probe", styleType: "paragraph", occursUnder: ["bad"] },
      },
    };
    let badOpener: MarkerNode, probeOpener: MarkerNode;
    const { editor } = await baseTestEnvironment(() => {
      const book = $createBookNode("RUT");
      const bad = $createParaNode("bad");
      const probe = $createParaNode("probe");
      badOpener = $createMarkerNode("bad");
      probeOpener = $createMarkerNode("probe");
      $getRoot().append(
        book.append($createTextNode(getVisibleOpenMarkerText("id", "RUT"))),
        bad.append(badOpener, $createTextNode(NBSP)),
        probe.append(probeOpener, $createTextNode(NBSP)),
      );
    });
    editor.getEditorState().read(() => {
      const map = $validateDocument(stackProbeSheet);
      expect(map.get(badOpener.getKey())).toBe("invalid");
      // If `bad` had been pushed despite being invalid, `probe` (occursUnder ["bad"]) would find
      // it as an ancestor and validate cleanly. It doesn't: `bad` was never on the stack.
      expect(map.get(probeOpener.getKey())).toBe("invalid");
      expect(map.size).toBe(2);
    });
  });
});
