/**
 * Convert Scripture from USX to USJ.
 * Adapted to TypeScript from this file:
 * @see https://github.com/usfm-bible/usfmtc/blob/0afa385a1f282b286cc6bff7bbc953ae788aa10c/src/usfmtc/usjproc.py
 */

import { MarkerContent, MarkerObject, USJ_TYPE, USJ_VERSION, Usj } from "./usj.model.js";
import { USX_TYPE } from "./usx.model.js";
import { assertDomEnvironment, assertSafeKey } from "./converter.utils.js";

type Action = "append" | "merge" | "ignore";
interface Attribs {
  [name: string]: string;
}

/**
 * Converts a USX string to a USJ object.
 *
 * @remarks Uses the platform's native `DOMParser` (browsers, web views, jsdom). In Node.js,
 * provide a DOM implementation as globals before calling, e.g. from jsdom or `@xmldom/xmldom`.
 *
 * @param usxString - The USX string to convert.
 * @returns The converted USJ object.
 * @throws If no DOM environment is available or the USX is not well-formed XML.
 *
 * @public
 */
export function usxStringToUsj(usxString: string): Usj {
  assertDomEnvironment("usxStringToUsj");
  const parser = new DOMParser();
  const inputUsxDom = parser.parseFromString(usxString, "text/xml");
  // Native DOMParser reports malformed XML with a `parsererror` element instead of throwing.
  const parserError = inputUsxDom.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error(`Invalid USX: ${parserError.textContent}`);

  return usxDomToUsj(inputUsxDom.documentElement);
}

export function usxDomToUsj(inputUsxDom: Element | null): Usj {
  const [outputJson] = inputUsxDom
    ? convertUsxRecurse(inputUsxDom)
    : [{ content: [] as MarkerContent[] } as Usj];
  outputJson.type = USJ_TYPE;
  outputJson.version = USJ_VERSION;
  return outputJson;
}

function convertUsxRecurse<T extends Usj | MarkerObject = Usj>(
  inputUsxElement: Element,
): [outputJson: T, action: Action] {
  const attribs: Attribs = {};
  let type: string = inputUsxElement.tagName;
  let marker: string | undefined;
  let text: string | undefined;
  let action: Action = "append";

  if (["row", "cell"].includes(type)) type = "table:" + type;
  if (inputUsxElement.attributes) {
    for (const attrib of Array.from(inputUsxElement.attributes)) {
      assertSafeKey(attrib.name);
      attribs[attrib.name] = attrib.value;
    }
  }

  if (attribs.style) {
    marker = attribs.style;
    delete attribs.style;
  }
  // dropping because presence of vid in para elements is not consistent in USX
  if (attribs.vid) delete attribs.vid;
  // Not dropping `attribs.closed` for backwards compatibility.
  // dropping because it is nonstandard derived metadata that could get out of date
  if (attribs.status) delete attribs.status;

  let outObj: T = { type } as T;
  if (marker) (outObj as MarkerObject).marker = marker;
  outObj = { ...outObj, ...attribs };

  if (
    inputUsxElement.firstChild &&
    inputUsxElement.firstChild.nodeType === inputUsxElement.firstChild.TEXT_NODE &&
    inputUsxElement.firstChild.nodeValue &&
    isDocumentText(inputUsxElement.firstChild.nodeValue)
  ) {
    text = inputUsxElement.firstChild.nodeValue;
  }

  const children = Array.from(inputUsxElement.childNodes);
  outObj.content = [];

  if (text) {
    outObj.content.push(text);
  }

  for (const child of children) {
    // ChildNodes are Elements.
    if ((child as Element).tagName === undefined) {
      continue;
    }
    // ChildNodes are Elements.
    const [childDict, whatToDo] = convertUsxRecurse<MarkerObject>(child as Element);

    switch (whatToDo) {
      case "append":
        outObj.content.push(childDict);
        break;
      case "merge":
        outObj.content = outObj.content.concat(childDict);
        break;
      case "ignore":
        break;
      default:
        break;
    }

    // Handle tail text
    if (
      child.nextSibling &&
      child.nextSibling.nodeType === child.nextSibling.TEXT_NODE &&
      child.nextSibling.nodeValue &&
      isDocumentText(child.nextSibling.nodeValue)
    ) {
      outObj.content.push(child.nextSibling.nodeValue);
    }
  }

  // For backward compatibility, not deleting content for type: chapter, verse, optbreak, ms OR
  // marker: va, ca, b.
  if (outObj.content.length === 0 && outObj.type !== USX_TYPE) {
    delete outObj.content;
  }

  if ("eid" in outObj && ["verse", "chapter"].includes(type)) {
    action = "ignore";
  }

  return [outObj, action];
}

/**
 * Whether a USX text node's value is document content to keep, as opposed to XML formatting
 * whitespace to drop.
 *
 * A node with any non-whitespace character is always content and is kept verbatim. A
 * whitespace-only node is content iff it contains no line break: USX running text never contains
 * line breaks (USFM is line-based — a line break in the file introduces a marker), so a run of
 * plain spaces is document bytes (the space between two char spans, a note's leading space, an
 * empty span's single space — dropping one deletes text the serializer faithfully wrote), while a
 * whitespace-only node WITH a line break is pretty-printing (newline + indent between block
 * elements, or before a paragraph's first inline element) and must not become USJ text.
 * @param str - The text node value to classify.
 * @returns `true` when the value is document content, `false` when it is formatting whitespace.
 */
function isDocumentText(str: string): boolean {
  return asciiTrim(str) !== "" || !/[\r\n]/.test(str);
}

/**
 * Removes leading and trailing ASCII whitespace.
 *
 * Only trim ASCII whitespace characters: space, tab, line feed, carriage return, form feed,
 * vertical tab.
 * @param str - The string to remove whitespace from.
 * @returns the string with leading and trailing whitespace removed.
 */
function asciiTrim(str: string): string {
  return str.replace(/(^[ \t\n\r\f\v]+)|([ \t\n\r\f\v]+$)/g, "");
}
