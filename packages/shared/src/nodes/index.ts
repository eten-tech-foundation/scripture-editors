import { WrapperNode } from "./WrapperNode";
import { DivisionMarkNode } from "./DivisionMarkNode";
import { GraftNode } from "./GraftNode";
import { InlineNode } from "./InlineNode";
import { UsfmParagraphNode } from "./UsfmParagraphNode";
import { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";

const nodes = [WrapperNode, DivisionMarkNode, GraftNode, InlineNode, UsfmParagraphNode];

export const scripturePerfNodes = <Array<Klass<LexicalNode> | LexicalNodeReplacement>>[...nodes];

export default nodes;
