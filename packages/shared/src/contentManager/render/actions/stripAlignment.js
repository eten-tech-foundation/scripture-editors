// import xre from "xregexp";

// const stripMarkupActions = {
//     startDocument: [
//         {
//             description: "Set up",
//             test: () => true,
//             action: ({ workspace, output }) => {
//                 workspace.chapter = null;
//                 workspace.verses = null;
//                 workspace.lastWord = "";
//                 workspace.waitingMarkup = [];
//                 workspace.currentOccurrences = {};
//                 workspace.PendingStartMilestones = [];
//                 output.stripped = {};
//                 output.unalignedWords = {};
//                 return true;
//             },
//         },
//     ],
//     startMilestone: [
//         {
//             description: "Ignore zaln startMilestone events",
//             test: ({ context }) =>
//                 context.sequences[0].element.subType === "usfm:zaln",
//             action: ({ context, workspace }) => {
//                 const payload = context.sequences[0].element;
//                 payload.subtype = payload.subType;
//                 delete payload.subType;
//                 workspace.waitingMarkup.push(payload);
//                 workspace.PendingStartMilestones.push(payload);
//             },
//         },
//     ],
//     endMilestone: [
//         {
//             description: "Ignore zaln endMilestone events",
//             test: ({ context }) =>
//                 context.sequences[0].element.subType === "usfm:zaln",
//             action: ({ context, workspace, output, config }) => {
//                 const { chapter, verses, lastWord: word } = workspace;
//                 const { verseWords: totalOccurrences } = config;
//                 const strippedKey = [
//                     "after",
//                     word,
//                     workspace.currentOccurrences[word],
//                     totalOccurrences[chapter][verses][word],
//                 ].join("--");
//                 const payload = { ...context.sequences[0].element };
//                 payload.subtype = payload.subType;
//                 delete payload.subType;
//                 const record = {
//                     chapter: chapter,
//                     verses: verses,
//                     occurrence: workspace.currentOccurrences[word],
//                     occurrences: totalOccurrences[chapter][verses][word],
//                     position: "after",
//                     word,
//                     payload,
//                     startMilestone: workspace.PendingStartMilestones.shift(),
//                 };
//                 if (
//                     !output.stripped[workspace.chapter][workspace.verses][strippedKey]
//                 ) {
//                     output.stripped[workspace.chapter][workspace.verses][strippedKey] = [
//                         record,
//                     ];
//                 } else {
//                     output.stripped[workspace.chapter][workspace.verses][
//                         strippedKey
//                     ].push(record);
//                 }

//                 return false;
//             },
//         },
//     ],
//     startWrapper: [
//         {
//             description: "Ignore w startWrapper events",
//             test: ({ context }) => context.sequences[0].element.subType === "usfm:w",
//             action: ({ context, workspace }) => {
//                 const payload = { ...context.sequences[0].element };
//                 payload.subtype = payload.subType;
//                 delete payload.subType;
//                 workspace.waitingMarkup.push(payload);
//             },
//         },
//     ],
//     endWrapper: [
//         {
//             description: "Ignore w endWrapper events",
//             test: ({ context }) => context.sequences[0].element.subType === "usfm:w",
//             action: ({ context }) => { },
//         },
//     ],
//     text: [
//         {
//             description: "Log occurrences",
//             test: () => true,
//             action: ({ context, workspace, output, config }) => {
//                 try {
//                     const sequence = context.sequences[0];
//                     if (sequence.type !== 'main') return true;
//                     const text = sequence.element.text;
//                     const re = xre("([\\p{Letter}\\p{Number}\\p{Mark}\\u2060]{1,127})");
//                     const words = xre.match(text, re, "all");
//                     const { chapter, verses } = workspace;
//                     const { verseWords: totalOccurrences } = config;
//                     for (const word of words) {
//                         workspace.currentOccurrences[word] ??= 0;
//                         workspace.currentOccurrences[word]++;
//                         if (
//                             !workspace.PendingStartMilestones.length &&
//                             workspace.waitingMarkup.length
//                         ) {
//                             output.unalignedWords[chapter] ??= {};
//                             output.unalignedWords[chapter][verses] ??= [];
//                             output.unalignedWords[chapter][verses].push({
//                                 word,
//                                 occurrence: workspace.currentOccurrences[word],
//                                 totalOccurrences: totalOccurrences[chapter][verses][word],
//                             });
//                         }
//                         while (workspace.waitingMarkup.length) {
//                             const payload = workspace.waitingMarkup.shift();
//                             const strippedKey = [
//                                 "before",
//                                 word,
//                                 workspace.currentOccurrences[word],
//                                 totalOccurrences[chapter][verses][word],
//                             ].join("--");
//                             const record = {
//                                 chapter: chapter,
//                                 verses: verses,
//                                 occurrence: workspace.currentOccurrences[word],
//                                 occurrences: totalOccurrences[chapter][verses][word],
//                                 position: "before",
//                                 word,
//                                 payload: {
//                                     ...payload,
//                                     ...(payload.subtype === "usfm:w" && { content: [word] }),
//                                 },
//                             };
//                             if (
//                                 !output.stripped[workspace.chapter][workspace.verses][
//                                 strippedKey
//                                 ]
//                             ) {
//                                 output.stripped[workspace.chapter][workspace.verses][
//                                     strippedKey
//                                 ] = [record];
//                             } else {
//                                 output.stripped[workspace.chapter][workspace.verses][
//                                     strippedKey
//                                 ].push(record);
//                             }
//                         }
//                         workspace.lastWord = word;
//                     }
//                 } catch (err) {
//                     console.error(err);
//                     throw err;
//                 }
//                 return true;
//             },
//         },
//     ],
//     mark: [
//         {
//             description: "Update CV state",
//             test: () => true,
//             action: ({ context, workspace, output }) => {
//                 try {
//                     const element = context.sequences[0].element;
//                     if (element.subType === "chapter") {
//                         workspace.chapter = element.atts["number"];
//                         workspace.verses = 0;
//                         workspace.lastWord = "";
//                         workspace.currentOccurrences = {};
//                         output.stripped[workspace.chapter] = {};
//                         output.stripped[workspace.chapter][workspace.verses] = {};
//                     } else if (element.subType === "verses") {
//                         workspace.verses = element.atts["number"];
//                         workspace.lastWord = "";
//                         workspace.currentOccurrences = {};
//                         output.stripped[workspace.chapter][workspace.verses] = {};
//                     }
//                 } catch (err) {
//                     console.error(err);
//                     throw err;
//                 }
//                 return true;
//             },
//         },
//     ],
// };

// module.exports = { stripMarkupActions };
