/**
 * Convert Scripture from USJ to USX.
 * Adapted to TypeScript from this file:
 * @see https://github.com/usfm-bible/usfmtc/blob/0afa385a1f282b286cc6bff7bbc953ae788aa10c/src/usfmtc/usjproc.py
 */

import { DOMImplementation, Document, Element, Text } from "@xmldom/xmldom";
import { MarkerContent, MarkerObject, Usj } from "./usj.model.js";
import { USX_TYPE, USX_VERSION } from "./usx.model.js";

let chapterEid: string | undefined;
let verseEid: string | undefined;

/**
 * Converts a USJ object to a USX string.
 *
 * @param usj - The USJ object to convert
 * @returns The converted USX string.
 *
 * @public
 */
export function usjToUsxString(usj: Usj): string {
  const usxDoc = new DOMImplementation().createDocument("", USX_TYPE);
  if (usxDoc.documentElement) {
    usxDoc.documentElement.setAttribute("version", USX_VERSION);
    usjToUsxDom(usj, usxDoc);
  }
  return usxDoc.toString();
}

export function usjToUsxDom(usj: Usj, usxDoc: Document): Element | undefined {
  if (!usxDoc.documentElement) return undefined;

  for (const [index, markerContent] of usj.content.entries()) {
    const isLastItem = index === usj.content.length - 1;
    convertUsjRecurse(markerContent, usxDoc.documentElement, usxDoc, isLastItem);
  }
  return usxDoc.documentElement ?? undefined;
}

function convertUsjRecurse(
  markerContent: MarkerContent,
  parentElement: Element,
  usxDoc: Document,
  isLastItem: boolean,
) {
  let element: Text | Element;
  let type: string | undefined;
  let eidElement: Element | undefined;
  if (typeof markerContent === "string") element = usxDoc.createTextNode(markerContent);
  else {
    type = markerContent.type.replace("table:", "");
    element = usxDoc.createElement(type);
    setAttributes(element, markerContent);
    if (markerContent.content) {
      for (const [index, item] of markerContent.content.entries()) {
        const _isLastItem = index === markerContent.content.length - 1;
        convertUsjRecurse(item, element, usxDoc, _isLastItem);
      }
    }
  }

  // Create chapter and verse end elements from SID attributes.
  if (verseEid && (type === "verse" || (parentElement.tagName === "para" && isLastItem))) {
    eidElement = createVerseEndElement(usxDoc, verseEid);
    verseEid = undefined;
  }
  if (type === "verse" && typeof markerContent !== "string" && markerContent.sid !== undefined)
    verseEid = markerContent.sid;

  if (chapterEid && (type === "chapter" || (type === "para" && isLastItem))) {
    eidElement = createChapterEndElement(usxDoc, chapterEid);
    chapterEid = undefined;
  }
  if (type === "chapter" && typeof markerContent !== "string" && markerContent.sid !== undefined)
    chapterEid = markerContent.sid;

  // Append to parent.
  const isVerseInImpliedPara =
    parentElement.nodeName === USX_TYPE && eidElement?.tagName === "verse";
  if (eidElement && (!isLastItem || isVerseInImpliedPara)) parentElement.appendChild(eidElement);
  parentElement.appendChild(element);
  if (eidElement && isLastItem && !isVerseInImpliedPara) parentElement.appendChild(eidElement);

  // Allow for final chapter and verse end elements at the end of an implied para.
  if (isLastItem && parentElement.nodeName === USX_TYPE) {
    if (verseEid) parentElement.appendChild(createVerseEndElement(usxDoc, verseEid));
    if (chapterEid) parentElement.appendChild(createChapterEndElement(usxDoc, chapterEid));
    verseEid = undefined;
    chapterEid = undefined;
  }
}

function setAttributes(element: Element, markerContent: MarkerObject) {
  if (markerContent.marker) {
    if (markerContent.type === "unmatched") element.setAttribute("marker", markerContent.marker);
    else element.setAttribute("style", markerContent.marker);
  }
  for (const [key, value] of Object.entries(markerContent)) {
    if (value && !["type", "marker", "content"].includes(key)) {
      element.setAttribute(key, value as string);
    }
  }
}

function createVerseEndElement(usxDoc: Document, verseEid: string): Element {
  const eidElement = usxDoc.createElement("verse");
  eidElement.setAttribute("eid", verseEid);
  return eidElement;
}

function createChapterEndElement(usxDoc: Document, chapterEid: string): Element {
  const eidElement = usxDoc.createElement("chapter");
  eidElement.setAttribute("eid", chapterEid);
  return eidElement;
}
