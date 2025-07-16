import { createBasicTestEnvironment } from "../usj/test.utils";
import { $createTypedMarkNode, TypedMarkNode } from "./TypedMarkNode";

const testType1 = "testType1";
const testType2 = "testType2";
const testID1 = "testID1";
const testID2 = "testID2";

describe("TypedMarkNode", () => {
  describe("hasID()", () => {
    it("should work the specified type", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [testID1, testID2],
          [testType2]: [testID2],
        });
        expect(node).toBeDefined();

        expect(node.hasID(testType1, testID1)).toBe(true);
        expect(node.hasID(testType1, testID2)).toBe(true);
        expect(node.hasID(testType2, testID2)).toBe(true);
        expect(node.hasID(testType1, "unknownID")).toBe(false);
        expect(node.hasID(testType1, undefined as unknown as string)).toBe(false);
        expect(node.hasID(testType1, null as unknown as string)).toBe(false);
        expect(node.hasID("noType", testID1)).toBe(false);
        expect(node.hasID(undefined as unknown as string, testID1)).toBe(false);
        expect(node.hasID(null as unknown as string, testID1)).toBe(false);
      });
    });
  });

  describe("addID()", () => {
    it("should add IDs to the specified type", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({});
        expect(node).toBeDefined();

        node.addID(testType1, testID1);

        expect(node.getTypedIDs()).toEqual({ [testType1]: [testID1] });

        node.addID(testType2, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [testID1],
          [testType2]: [testID2],
        });

        node.addID(testType1, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [testID1, testID2],
          [testType2]: [testID2],
        });
      });
    });
  });

  describe("deleteID()", () => {
    it("should delete IDs from the specified type", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [testID1, testID2],
          [testType2]: [testID2],
        });
        expect(node).toBeDefined();

        node.deleteID(testType1, testID1);

        expect(node.getTypedIDs()).toEqual({ [testType1]: [testID2], [testType2]: [testID2] });

        node.deleteID(testType2, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [testID2],
          [testType2]: [],
        });

        node.deleteID(testType1, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [],
          [testType2]: [],
        });
      });
    });
  });

  describe("hasNoIDsForEveryType()", () => {
    it("should work if has no types", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({});
        expect(node).toBeDefined();

        expect(node.hasNoIDsForEveryType()).toBe(true);
      });
    });

    it("should work if has types but no IDs", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [],
          [testType2]: undefined as unknown as string[],
        });
        expect(node).toBeDefined();

        expect(node.hasNoIDsForEveryType()).toBe(true);
      });
    });

    it("should work if has types and IDs", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [],
          [testType2]: [testID2],
        });
        expect(node).toBeDefined();

        expect(node.hasNoIDsForEveryType()).toBe(false);
      });
    });
  });
});
