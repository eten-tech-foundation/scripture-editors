import { NodeKey } from "lexical";
type IntentionallyMarkedAsDirtyElement = boolean;

type LeavesSet = Set<NodeKey>;
type ElementsMap = Map<NodeKey, IntentionallyMarkedAsDirtyElement>;

export class DirtyNodes {
  private leaves: LeavesSet;
  private elements: ElementsMap;

  constructor(leaves: LeavesSet | null = null, elements: ElementsMap | null = null) {
    this.leaves = leaves ?? new Set<NodeKey>();
    this.elements = elements ?? new Map<NodeKey, IntentionallyMarkedAsDirtyElement>();
  }

  public reset(): void {
    console.warn("resetting dirty nodes");
    this.leaves.clear();
    this.elements.clear();
  }

  public merge(leaves: LeavesSet, elements: ElementsMap): void {
    for (const leaf of leaves) {
      this.leaves.add(leaf);
    }
    for (const [key, value] of elements) {
      this.elements.set(key, value);
    }
  }

  public getLeaves(): LeavesSet {
    return this.leaves;
  }

  public getElements(): ElementsMap {
    return this.elements;
  }

  public getAll(): { elements: ElementsMap; leaves: LeavesSet } {
    return { elements: this.elements, leaves: this.leaves };
  }
}
