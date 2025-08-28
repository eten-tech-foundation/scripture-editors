/**
 * Minimun valid usfm for proskomma:
 * one "\mt#" is the only required tag,
 * though it makes sense to start with \c \p and \v tags too.
 */
export default String.raw`\id REV
\h REV
\mt REV
\c 1
\p
\v 1`;
