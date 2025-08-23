import { $isTextNode, $isRangeSelection, BaseSelection, TextNode, RangeSelection } from "lexical";
import { CURSOR_PLACEHOLDER_CHAR, CursorMovementDirection } from "./constants.js";

export enum CursorPosition {
  Start,
  Middle,
  End,
}

type Direction = CursorMovementDirection.LEFT | CursorMovementDirection.RIGHT | undefined;

interface PlaceholdersData {
  char: string;
  positions: number[];
  atStart: boolean;
  atEnd: boolean;
  count: number;
}

export interface CursorData {
  offset: number;
  /**
   * Some browsers have different cursor behavior around the edges of the node.
   * This is why start or end positions are set when cursor is at edge or one character away from edge.
   */
  position: CursorPosition;
  isAtEdge: boolean;
  isPlaceholder: boolean;
  isMovingRight: boolean;
  isMovingLeft: boolean;
  isAtStart: boolean;
  isAtEnd: boolean;
  isMovingFromStartToEnd: boolean;
  isMovingFromEndToStart: boolean;
  /**
   * @description This occurs when the selected node contains a single character and the cursor is moving from one edge to the opposite edge.
   * For example, moving right from the start of a single-character node, or moving left from the end of a single-character node.
   */
  isSwitchingEdge: boolean;
  isMovingTowardsLeftEdge: boolean;
  isMovingTowardsRightEdge: boolean;
  /**
   * @description This occurs when the cursor is positioned one character away from either the left or right edge of the node,
   * and is moving towards that edge.
   */
  isMovingTowardsEdge: boolean;
  /**
   * @description This occurs when the cursor is moving away from either the left or right edge of the node,
   * while remaining within the node's boundaries. It indicates that the cursor is transitioning from an edge
   * position (start or end) towards the interior of the node's content.
   */
  isMovingAwayFromEdge: boolean;
  isMovingToNextNode: boolean;
  isMovingToPreviousNode: boolean;
  isMovingOutwards: boolean;
}

interface LazyProcessedSelection {
  selection: RangeSelection;
  node: TextNode;
  content: {
    raw: string;
    clean: string;
    length: number;
    hasSingleCharacter: boolean;
    hasMultipleCharacters: boolean;
    isEmpty: boolean;
  };
  cursor: CursorData;
  placeholders: PlaceholdersData;
}

export function $getCursorSelectionContext(
  selection: BaseSelection | null,
  targetDirection?: Direction,
): LazyProcessedSelection | null {
  if (!selection?.isCollapsed() || !$isRangeSelection(selection)) {
    return null;
  }

  const node = selection.anchor.getNode();

  if (!$isTextNode(node)) {
    return null;
  }

  const rawContent = node.getTextContent();
  const placeholderRegex = new RegExp(CURSOR_PLACEHOLDER_CHAR, "g");

  let _placeholders: PlaceholdersData | null = null;
  let _offset: number | null = null;
  let _position: CursorPosition | null = null;
  let _isAtEdge: boolean | null = null;
  let _isPlaceholder: boolean | null = null;
  let _contentLength: number | null = null;
  let _cleanContent: string | null = null;

  function getContentLength(): number {
    if (_contentLength === null) {
      _contentLength = getCleanContent().length;
    }
    return _contentLength;
  }

  function getCleanContent(): string {
    if (_cleanContent === null) {
      _cleanContent = rawContent.replace(placeholderRegex, "");
    }
    return _cleanContent;
  }

  function hasSingleCharacter(): boolean {
    return getContentLength() === 1;
  }

  function hasMultipleCharacters(): boolean {
    return getContentLength() > 1;
  }

  function isEmpty(): boolean {
    return getContentLength() === 0;
  }

  const getPlaceholders = () => {
    if (_placeholders === null) {
      _placeholders = getPlaceholderData(rawContent, placeholderRegex);
    }
    return _placeholders;
  };

  const getOffset = () => {
    if (_offset === null) {
      _offset = calculateOffset(selection.anchor.offset, getPlaceholders().positions);
    }
    return _offset;
  };

  const getPosition = () => {
    if (_position === null) {
      _position = calculatePosition(getOffset(), getContentLength());
    }
    return _position;
  };

  const contentInfo = {
    get raw() {
      return rawContent;
    },
    get clean() {
      return getCleanContent();
    },
    get length() {
      return getContentLength();
    },
    get hasSingleCharacter() {
      return hasSingleCharacter();
    },
    get hasMultipleCharacters() {
      return hasMultipleCharacters();
    },
    get isEmpty() {
      return isEmpty();
    },
  };

  return {
    selection,
    node,
    content: contentInfo,
    cursor: {
      get offset() {
        return getOffset();
      },
      get position() {
        return getPosition();
      },
      get isAtEdge() {
        if (_isAtEdge === null) {
          const offset = getOffset();
          const contentLength = getContentLength();
          _isAtEdge = offset === 0 || offset === contentLength || this.isPlaceholder;
        }
        return _isAtEdge;
      },
      get isPlaceholder() {
        if (_isPlaceholder === null) {
          const placeholders = getPlaceholders();
          _isPlaceholder =
            (this.isAtStart && placeholders.atStart) || (this.isAtEnd && placeholders.atEnd);
        }
        return _isPlaceholder;
      },
      get isMovingRight() {
        return targetDirection === CursorMovementDirection.RIGHT;
      },
      get isMovingLeft() {
        return targetDirection === CursorMovementDirection.LEFT;
      },
      get isAtStart() {
        return getPosition() === CursorPosition.Start;
      },
      get isAtEnd() {
        return getPosition() === CursorPosition.End;
      },
      get isMovingFromStartToEnd() {
        return this.isAtStart && this.isMovingRight && contentInfo.hasSingleCharacter;
      },
      get isMovingFromEndToStart() {
        return this.isAtEnd && this.isMovingLeft && contentInfo.hasSingleCharacter;
      },
      get isSwitchingEdge() {
        return this.isMovingFromStartToEnd || this.isMovingFromEndToStart;
      },
      get isMovingTowardsLeftEdge() {
        return !this.isAtEdge && this.isAtStart && this.isMovingLeft;
      },
      get isMovingTowardsRightEdge() {
        return !this.isAtEdge && this.isAtEnd && this.isMovingRight;
      },
      get isMovingTowardsEdge() {
        return this.isMovingTowardsLeftEdge || this.isMovingTowardsRightEdge;
      },
      get isMovingAwayFromEdge() {
        return (
          contentInfo.hasMultipleCharacters &&
          ((this.isAtStart && this.isMovingRight) || (this.isAtEnd && this.isMovingLeft))
        );
      },
      get isMovingToNextNode() {
        return this.isMovingRight && this.isAtEdge && this.isAtEnd;
      },
      get isMovingToPreviousNode() {
        return this.isMovingLeft && this.isAtEdge && this.isAtStart;
      },
      get isMovingOutwards() {
        return this.isMovingToNextNode || this.isMovingToPreviousNode;
      },
    },
    placeholders: {
      get char() {
        return CURSOR_PLACEHOLDER_CHAR;
      },
      get positions() {
        return getPlaceholders().positions;
      },
      get atStart() {
        return getPlaceholders().atStart;
      },
      get atEnd() {
        return getPlaceholders().atEnd;
      },
      get count() {
        return getPlaceholders().count;
      },
    },
  };
}

function calculateOffset(anchorOffset: number, placeholderPositions: number[]): number {
  return placeholderPositions.reduce(
    (offset, placeholderPos) => (placeholderPos < anchorOffset ? offset - 1 : offset),
    anchorOffset,
  );
}

function calculatePosition(offset: number, contentLength: number): CursorPosition {
  if (contentLength === 1) {
    return offset === 0 ? CursorPosition.Start : CursorPosition.End;
  }
  if (offset <= 1) return CursorPosition.Start;
  if (offset >= contentLength - 1) return CursorPosition.End;
  return CursorPosition.Middle;
}

function getPlaceholderData(content: string, regex: RegExp): PlaceholdersData {
  const matches = content.matchAll(regex);
  const positions = Array.from(matches, (match) => match.index ?? -1);
  const count = positions.length;
  return {
    char: CURSOR_PLACEHOLDER_CHAR,
    positions,
    atStart: count > 0 && positions[0] === 0,
    atEnd: count > 0 && positions[count - 1] === content.length - 1,
    count,
  };
}
