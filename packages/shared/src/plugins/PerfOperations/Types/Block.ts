import { Content } from "./ContentElement";
import { ExistingGraft, Graft, NewGraft } from "./Graft";
import Hook from "./Hook";
import { Atts, UsfmSubtype, XSubtype } from "./common";
import { Props, getPerfProps } from "./utils";

export type Block = Paragraph | BlockGraft | Row | Node | Lookup;

export default Block;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBlockIfValid(obj: any) {
  if (typeof obj !== "object" || obj === null) {
    return undefined;
  }
  return isParagraph(obj) || isBlockGraft(obj) || isRow(obj) || isNode(obj) || isLookup(obj)
    ? obj
    : undefined;
}
export type BlockProps = Props<Block>;

export const getBlockProps = <T extends Block>(element: T): BlockProps => {
  return getPerfProps(element);
};

export type BlockTypeMap<Type> = Type extends "paragraph"
  ? Paragraph
  : Type extends "graft"
    ? BlockGraft
    : Type extends "row"
      ? Row
      : Type extends "node"
        ? Node
        : Type extends "lookup"
          ? Lookup
          : Block;

// PARAGRAPH -----------------------------------

type ParagraphType = "paragraph";

interface BaseParagraph {
  type: ParagraphType;
  subtype: XSubtype | UsfmSubtype;
  meta_content?: Content;
}

export type Paragraph = BaseParagraph & {
  atts?: Atts;
  hooks?: Hook;
  content: Content;
};

// GRAFT -----------------------------------

type BlockGraftSubtype =
  | "introduction"
  | "intro_title"
  | "intro_end_title"
  | "title"
  | "end_title"
  | "heading"
  | "remark"
  | "sidebar"
  | "table"
  | "tree"
  | "kv";

export function isBlockGraftSubtype(subtype: string): subtype is BlockGraftSubtype {
  const blockGraftSubtypes: BlockGraftSubtype[] = [
    "introduction",
    "intro_title",
    "intro_end_title",
    "title",
    "end_title",
    "heading",
    "remark",
    "sidebar",
    "table",
    "tree",
    "kv",
  ];
  return blockGraftSubtypes.includes(subtype as BlockGraftSubtype);
}

export type BlockGraft = Graft<BlockGraftSubtype>;

// ROW -----------------------------------

type RowSubtype = "row:heading" | "row:body";

type RowType = "row";

interface BaseRow {
  type: RowType;
  subtype: RowSubtype;
  meta_content?: Content;
}

export type Row = BaseRow & {
  atts?: Atts;
  hooks?: Hook;
  content: Content;
};

// NODE -----------------------------------

type NodeType = "node";

type NodeSubtype = "node";

interface BaseNode {
  type: NodeType;
  subtype: NodeSubtype | XSubtype;
  meta_content?: Content;
}

export type Node = BaseNode & {
  atts: {
    id: string;
    parent?: string;
    children?: string[];
  };
  hooks?: Hook;
  content?: Content;
};

// LOOKUP -----------------------------------

type LookupType = "lookup";

type LookupSubtype = "lookup";

interface BaseLookup {
  type: LookupType;
  subtype: LookupSubtype | XSubtype;
  meta_content?: Content;
}

export type Lookup = BaseLookup & {
  atts: {
    primary: string;
    secondary?: string[];
  };
  hooks?: Hook;
  content?: Content;
};

// TYPE GUARDS -----------------------------------

export function isParagraph(block: Block): block is Paragraph {
  return block.type === "paragraph";
}

export function isBlockGraft(block: Block): block is BlockGraft {
  return block.type === "graft";
}

export function isRow(block: Block): block is Row {
  return block.type === "row";
}

export function isNode(block: Block): block is Node {
  return block.type === "node";
}

export function isLookup(block: Block): block is Lookup {
  return block.type === "lookup";
}

export function isNewGraft(block: BlockGraft): block is NewGraft<BlockGraftSubtype> {
  return "new" in block && block.new === true;
}

export function isExistingGraft(block: BlockGraft): block is ExistingGraft<BlockGraftSubtype> {
  return !isNewGraft(block);
}
