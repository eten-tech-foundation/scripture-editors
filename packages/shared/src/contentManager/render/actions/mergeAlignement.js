// import { on } from "events";
// import xre from "xregexp";

// const lexingRegexes = [
//   ["printable", "wordLike", xre("([\\p{Letter}\\p{Number}\\p{Mark}\\u2060]{1,127})")],
//   ["printable", "lineSpace", xre("([\\p{Separator}\t]{1,127})")],
//   [
//     "printable",
//     "punctuation",
//     xre(
//       "([\\p{Punctuation}\\p{Math_Symbol}\\p{Currency_Symbol}\\p{Modifier_Symbol}\\p{Other_Symbol}])",
//     ),
//   ],
//   ["bad", "unknown", xre("(.)")],
// ];
// const re = xre.union(lexingRegexes.map((x) => x[2]));

// const endMilestone = {
//   type: "end_milestone",
//   subtype: "usfm:zaln",
// };

// function pushOnHoldChars(onHoldChars, workspace) {
//   while (onHoldChars.length) {
//     workspace.outputContentStack[0].push(onHoldChars.shift());
//   }
// }

// const mergeAlignmentActions = {
//   startDocument: [
//     {
//       description: "setup",
//       test: () => true,
//       action: ({ workspace, output }) => {
//         workspace.chapter = null;
//         workspace.verses = null;
//         workspace.currentOccurrences = {};
//         output.unalignedWords = {};
//         return true;
//       },
//     },
//   ],
//   text: [
//     {
//       description: "add-to-text",
//       test: () => true,
//       action: ({ config, context, workspace, output }) => {
//         try {
//           const sequence = context.sequences[0];
//           if (sequence.type !== "main") return true;

//           const text = context.sequences[0].element.text;
//           const words = xre.match(text, re, "all");
//           const { chapter, verses } = workspace;
//           if (!verses) return true;

//           const { totalOccurrences, strippedAlignment } = config;

//           const alignments = {
//             opened: null,
//           };

//           const addWrappers = ({ subtype, content = [], atts = {} }) => {
//             if (Object.keys(atts).length > 0) {
//               return {
//                 type: "wrapper",
//                 subtype,
//                 content,
//                 atts,
//               };
//             }
//             return {
//               type: "wrapper",
//               subtype,
//               content,
//             };
//           };

//           const onHoldChars = [];

//           for (const word of words) {
//             const isWord = xre.match(word, lexingRegexes[0][2], "all")?.length;
//             if (!isWord) {
//               onHoldChars.push(word);
//               continue;
//             }

//             workspace.currentOccurrences[word] ??= 0;
//             workspace.currentOccurrences[word]++;
//             const strippedKey = (position) => {
//               return [
//                 position,
//                 word,
//                 workspace.currentOccurrences[word],
//                 totalOccurrences[chapter][verses][word],
//               ].join("--");
//             };
//             const markupChapter = strippedAlignment[chapter];
//             const markup = markupChapter ? markupChapter[verses] || {} : {};
//             let skipStartMilestone = false;

//             const afterWord = markup[strippedKey("after")];
//             const beforeWord = markup[strippedKey("before")];

//             if (beforeWord?.length) pushOnHoldChars(onHoldChars, workspace);

//             if (afterWord?.length && !alignments.opened) {
//               afterWord.map(({ startMilestone }) =>
//                 workspace.outputContentStack[0].push(startMilestone),
//               );
//               skipStartMilestone = true;
//             }

//             //TODO: Count number of opened alignments, to close them when there is a modified/new word in the current iteration.
//             beforeWord?.forEach(({ payload }) => {
//               if (payload.type !== "start_milestone") {
//                 workspace.outputContentStack[0].push(payload);
//               }
//               if (payload.type === "start_milestone" && !skipStartMilestone) {
//                 workspace.outputContentStack[0].push(payload);
//                 alignments.opened = true;
//               }
//             });

//             //TODO: Decrease number of opened alignments as they are being pushed
//             afterWord?.forEach(({ payload }) => {
//               alignments.opened = false;
//               workspace.outputContentStack[0].push(payload);
//             });

//             //TODO: Add as many endMilestones as there are opened in alignments.opened, and set the later to 0.
//             if (!beforeWord?.length) {
//               if (alignments.opened) {
//                 workspace.outputContentStack[0].push(endMilestone);
//                 alignments.opened = false;
//               }
//               pushOnHoldChars(onHoldChars, workspace);
//               output.unalignedWords[chapter] ??= {};
//               output.unalignedWords[chapter][verses] ??= [];
//               output.unalignedWords[workspace.chapter][workspace.verses].push({
//                 word,
//                 occurrence: workspace.currentOccurrences[word],
//                 totalOccurrences: totalOccurrences[chapter][verses][word],
//               });
//               const wrappedWord = addWrappers({
//                 subtype: "usfm:w",
//                 content: [word],
//               });
//               workspace.outputContentStack[0].push(wrappedWord);
//             }
//           }
//           pushOnHoldChars(onHoldChars, workspace);
//           return false;
//         } catch (err) {
//           console.error(err);
//           throw err;
//         }
//       },
//     },
//   ],
//   mark: [
//     {
//       description: "mark-chapters",
//       test: ({ context }) => context.sequences[0].element.subType === "chapter",
//       action: ({ config, context, workspace, output }) => {
//         const element = context.sequences[0].element;
//         workspace.chapter = element.atts["number"];
//         workspace.verses = 0;
//         return true;
//       },
//     },
//     {
//       description: "mark-verses",
//       test: ({ context }) => context.sequences[0].element.subType === "verses",
//       action: ({ config, context, workspace, output }) => {
//         const element = context.sequences[0].element;
//         workspace.verses = element.atts["number"];
//         workspace.currentOccurrences = {};
//         return true;
//       },
//     },
//   ],
// };

// module.exports = { mergeAlignmentActions };
