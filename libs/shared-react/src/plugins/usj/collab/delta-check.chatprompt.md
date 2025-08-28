---
mode: "agent"
---

For any existing test whose test description doesn't start with "(dc)" or "(dci)", add a Delta Check test such as the one below ("Delta Check 46 for the following test") above the existing test. The matching existing test example ("should replace 'brothers' with 'brethren'") is below the example Delta Check test.

A Delta Check test has:

- A `doc` that represents the initial editor state from `testEnvironment` in the existing test.
- It copies the `ops` as is from the existing test. It uses the Delta.compose() method to created the `updatedDoc`.
- The expected `updatedDoc.ops` is simply whatever the Delta.compose() method produces.

Note that a test that starts with an 'empty' editor using `const { editor } = await testEnvironment();` will have a `const doc = new Delta();` in the Delta check test for Insert Operations but will have `const doc = new Delta([{ insert: LF }]);` in the Delta check test for Retain Operations and Delete Operations.

```ts
it("Delta Check 46 for the following test", () => {
  const doc = new Delta([
    { insert: { chapter: { number: "1" } } },
    { insert: { verse: { number: "1" } } },
    {
      insert: "It is finished.",
      attributes: {
        char: { style: "wj", cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545" },
      },
    },
    { insert: { verse: { number: "2" } } },
    { insert: "and all the brothers who are with me" },
    { insert: LF, attributes: { para: { style: "p" } } },
  ]);
  const ops: DeltaOp[] = [
    { retain: 15 + 12 },
    { insert: "e" },
    { delete: 1 },
    { retain: 2 },
    { insert: "ren" },
    { delete: 3 },
  ];

  const updatedDoc = doc.compose(new Delta(ops));

  expect(updatedDoc.ops).toEqual([
    { insert: { chapter: { number: "1" } } },
    { insert: { verse: { number: "1" } } },
    {
      insert: "It is finished.",
      attributes: {
        char: { style: "wj", cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545" },
      },
    },
    { insert: { verse: { number: "2" } } },
    { insert: "and all the brethren who are with me" },
    { insert: LF, attributes: { para: { style: "p" } } },
  ]);
});
```

```ts
it("should replace 'brothers' with 'brethren'", async () => {
  const brothers = "brothers";
  const { editor } = await testEnvironment(() => {
    const char = $createCharNode("wj");
    $setState(char, charIdState, "afd886c6-2397-4e4c-8a94-696bf9f2e545");
    $getRoot().append(
      $createImmutableChapterNode("1"),
      $createImpliedParaNode().append(
        $createImmutableVerseNode("1"),
        char.append($createTextNode("It is finished.")), // length: 15
        $createImmutableVerseNode("2"),
        $createTextNode(
          // lengths: 12, 8, 16
          `and all the ${brothers} who are with me`,
        ),
      ),
    );
  });
  const ops: DeltaOp[] = [
    { retain: 15 + 12 },
    { insert: "e" },
    { delete: 1 },
    { retain: 2 },
    { insert: "ren" },
    { delete: 3 },
  ];

  await sutApplyUpdate(editor, ops);

  const brethren = "brethren";
  editor.getEditorState().read(() => {
    expect($getRoot().getChildrenSize()).toBe(2); // Chapter, ImpliedParaNode

    const impliedPara = $getRoot().getChildAtIndex(1);
    if (!$isImpliedParaNode(impliedPara)) throw new Error("Expected ImpliedParaNode");
    expect(impliedPara.getChildrenSize()).toBe(4); // VerseNode, CharNode, VerseNode, TextNode

    const t2 = impliedPara.getChildAtIndex(3);
    if (!$isTextNode(t2)) throw new Error("Expected TextNode");
    expect(t2.getTextContent()).toBe(
      `and all the ${brethren} who are with me, To the churches of Galatia: `,
    );
    expect($getState(t2, segmentState)).toBe("verse_1_2");
  });
});
```
