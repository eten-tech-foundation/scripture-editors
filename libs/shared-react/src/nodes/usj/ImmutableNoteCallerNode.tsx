/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/note/index.html */

import { $getParticularNodeOps } from "../../plugins/usj/collab/editor-delta.adaptor";
import { DeltaOpInsertNoteEmbed } from "../../plugins/usj/collab/rich-text-ot.model";
import {
  $applyNodeReplacement,
  $getNodeByKey,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  isHTMLElement,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { MouseEvent, ReactElement, ReactNode } from "react";
import { $isNoteNode, GENERATOR_NOTE_CALLER, NoteNode } from "shared";

/**
 * A callback function type for handling click events.
 *
 * @param event - The synthetic event object from React containing event details.
 * @param noteNodeKey - The Lexical key of the associated NoteNode.
 * @param isCollapsed - A boolean indicating whether the note is collapsed or expanded.
 * @param getCaller - A function to retrieve the current caller string.
 * @param setCaller - A function to update the caller string. Valid callers are '+'
 *   (auto-generated caller), '-' (hidden caller), or a custom value.
 * @param getNoteOps - A function to retrieve the Operational Transform delta ops of the note.
 *
 * @public
 */
export type NoteCallerOnClick = (
  event: MouseEvent<HTMLButtonElement>,
  noteNodeKey: string,
  isCollapsed: boolean | undefined,
  getCaller: () => string,
  setCaller: (caller: string) => void,
  getNoteOps: () => DeltaOpInsertNoteEmbed[] | undefined,
) => void;

export type SerializedImmutableNoteCallerNode = Spread<
  {
    caller: string;
    previewText: string;
    onClick?: NoteCallerOnClick;
  },
  SerializedLexicalNode
>;

export const IMMUTABLE_NOTE_CALLER_VERSION = 1;

export class ImmutableNoteCallerNode extends DecoratorNode<ReactNode> {
  __caller: string;
  __previewText: string;
  __onClick: NoteCallerOnClick | undefined;

  constructor(
    caller = GENERATOR_NOTE_CALLER,
    previewText = "",
    onClick?: NoteCallerOnClick,
    key?: NodeKey,
  ) {
    super(key);
    this.__caller = caller;
    this.__previewText = previewText;
    this.__onClick = onClick ?? (() => undefined);
  }

  static override getType(): string {
    return "immutable-note-caller";
  }

  static override clone(node: ImmutableNoteCallerNode): ImmutableNoteCallerNode {
    const { __caller, __previewText, __onClick, __key } = node;
    return new ImmutableNoteCallerNode(__caller, __previewText, __onClick, __key);
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) => {
        if (!isNoteCallerElement(node)) return null;

        return {
          conversion: $convertNoteCallerElement,
          priority: 1,
        };
      },
    };
  }

  static override importJSON(
    serializedNode: SerializedImmutableNoteCallerNode,
  ): ImmutableNoteCallerNode {
    return $createImmutableNoteCallerNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedImmutableNoteCallerNode>,
  ): this {
    return super
      .updateFromJSON(serializedNode)
      .setCaller(serializedNode.caller)
      .setPreviewText(serializedNode.previewText)
      .setOnClick(serializedNode.onClick);
  }

  setCaller(caller: string): this {
    if (this.__caller === caller) return this;

    const self = this.getWritable();
    self.__caller = caller;
    return self;
  }

  getCaller(): string {
    const self = this.getLatest();
    return self.__caller;
  }

  setPreviewText(previewText: string): this {
    if (this.__previewText === previewText) return this;

    const self = this.getWritable();
    self.__previewText = previewText;
    return self;
  }

  getPreviewText(): string {
    const self = this.getLatest();
    return self.__previewText;
  }

  setOnClick(onClick: NoteCallerOnClick | undefined): this {
    if (this.__onClick === onClick) return this;

    const self = this.getWritable();
    self.__onClick = onClick;
    return self;
  }

  getOnClick(): NoteCallerOnClick | undefined {
    const self = this.getLatest();
    return self.__onClick;
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("span");
    dom.classList.add(this.__type);
    dom.setAttribute("data-caller", this.__caller);
    dom.setAttribute("data-preview-text", this.__previewText);
    return dom;
  }

  override updateDOM(prevNode: ImmutableNoteCallerNode): boolean {
    if (prevNode.__caller !== this.__caller) return true;

    return false;
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    if (element && isHTMLElement(element)) {
      element.classList.add(this.getType());
      element.setAttribute("data-caller", this.getCaller());
      element.setAttribute("data-preview-text", this.getPreviewText());
    }

    return { element };
  }

  override decorate(editor: LexicalEditor): ReactElement | null {
    const noteNode = this.getParent<NoteNode>();
    if (!noteNode) return null;

    const noteNodeKey = noteNode.getKey();
    const noteIsCollapsed = noteNode.getIsCollapsed();
    const callerNodeKey = this.__key;
    const onClick = (event: MouseEvent<HTMLButtonElement>) =>
      this.__onClick?.(
        event,
        noteNodeKey,
        noteIsCollapsed,
        () => getNoteCaller(editor, noteNodeKey),
        (caller) => setNoteCaller(editor, noteNodeKey, callerNodeKey, caller),
        () => getNoteOps(editor, noteNodeKey),
      );
    const callerId = `${this.__caller}_${this.__previewText}}`.replace(/\s+/g, "").substring(0, 25);
    return (
      <button onClick={onClick} title={this.__previewText} data-caller-id={callerId}>
        {this.__caller === GENERATOR_NOTE_CALLER && noteIsCollapsed
          ? // Caller is generated by CSS
            ""
          : this.__caller}
      </button>
    );
  }

  override exportJSON(): SerializedImmutableNoteCallerNode {
    return {
      type: this.getType(),
      caller: this.getCaller(),
      previewText: this.getPreviewText(),
      onClick: this.getOnClick(),
      version: IMMUTABLE_NOTE_CALLER_VERSION,
    };
  }

  // Mutation

  override isKeyboardSelectable(): false {
    return false;
  }
}

function $convertNoteCallerElement(element: HTMLElement): DOMConversionOutput {
  const caller = element.getAttribute("data-caller") ?? "";
  const previewText = element.getAttribute("data-preview-text") ?? "";
  const node = $createImmutableNoteCallerNode(caller, previewText);
  return { node };
}

export function $createImmutableNoteCallerNode(
  caller?: string,
  previewText?: string,
  onClick?: NoteCallerOnClick,
): ImmutableNoteCallerNode {
  return $applyNodeReplacement(new ImmutableNoteCallerNode(caller, previewText, onClick));
}

function isNoteCallerElement(node: HTMLElement | null | undefined): boolean {
  if (!node) return false;

  return node.classList.contains(ImmutableNoteCallerNode.getType());
}

export function $isImmutableNoteCallerNode(
  node: LexicalNode | null | undefined,
): node is ImmutableNoteCallerNode {
  return node instanceof ImmutableNoteCallerNode;
}

export function isSerializedImmutableNoteCallerNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableNoteCallerNode {
  return node?.type === ImmutableNoteCallerNode.getType();
}

function getNoteCaller(editor: LexicalEditor, noteNodeKey: NodeKey): string {
  return editor.read(() => {
    const noteNode = $getNodeByKey<NoteNode>(noteNodeKey);
    if (!$isNoteNode(noteNode))
      throw new Error(`getNoteCaller: Note node not found: ${noteNodeKey}`);

    return noteNode.getCaller();
  });
}

function setNoteCaller(
  editor: LexicalEditor,
  noteNodeKey: NodeKey,
  callerNodeKey: NodeKey,
  caller: string,
): void {
  editor.update(() => {
    const noteNode = $getNodeByKey<NoteNode>(noteNodeKey);
    if (!$isNoteNode(noteNode))
      throw new Error(`setNoteCaller: Note node not found: ${noteNodeKey}`);

    noteNode.setCaller(caller);
    const callerNode = $getNodeByKey<ImmutableNoteCallerNode>(callerNodeKey);
    if (!$isImmutableNoteCallerNode(callerNode))
      throw new Error(`setNoteCaller: Caller node not found: ${callerNodeKey}`);

    callerNode.setCaller(caller);
  });
}

function getNoteOps(
  editor: LexicalEditor,
  noteNodeKey: NodeKey,
): DeltaOpInsertNoteEmbed[] | undefined {
  return editor.read(() => {
    const noteNode = $getNodeByKey<NoteNode>(noteNodeKey);
    if (!$isNoteNode(noteNode)) throw new Error(`getNoteOps: Note node not found: ${noteNodeKey}`);

    return $getParticularNodeOps(noteNode) as DeltaOpInsertNoteEmbed[];
  });
}

/** Possible note callers to use when caller is '+'. Up to 2 characters are used, e.g. a-zz */
export const defaultNoteCallers = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
];
