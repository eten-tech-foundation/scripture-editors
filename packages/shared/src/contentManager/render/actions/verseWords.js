import xre from "xregexp";

const verseWordsActions = {
  startDocument: [
    {
      description: "Set up storage",
      test: () => true,
      action: ({ workspace, output }) => {
        workspace.verseContent = [];
        workspace.chapter = null;
        workspace.verses = null;
        output.cv = {};
      },
    },
  ],
  mark: [
    {
      description: "Update CV state",
      test: () => true,
      action: ({ context, workspace, output }) => {
        const { element } = context.sequences[0];
        if (element.subType === "chapter") {
          workspace.chapter = element.atts["number"];
          workspace.verses = 0;
          if (output.cv[workspace.chapter]) {
            throw new Error(`Duplicate chapter ${workspace.chapter} in verseWords`);
          }
          output.cv[workspace.chapter] = {};
          output.cv[workspace.chapter][workspace.verses] = {};
        } else if (element.subType === "verses") {
          workspace.verses = element.atts["number"];
          if (output.cv[workspace.chapter][workspace.verses]) {
            throw new Error(
              `Duplicate verse ${workspace.chapter}:${workspace.verses} in verseWords`,
            );
          }
          output.cv[workspace.chapter][workspace.verses] = {};
        }
      },
    },
  ],
  text: [
    {
      description: "Log occurrences",
      test: () => true,
      action: ({ context, workspace, output }) => {
        const { chapter, verses } = workspace;
        const { text } = context.sequences[0].element;
        const re = xre("([\\p{Letter}\\p{Number}\\p{Mark}\\u2060]{1,127})");
        const words = xre.match(text, re, "all");
        for (const word of words) {
          output.cv[chapter][verses][word] ??= 0;
          output.cv[chapter][verses][word] += 1;
        }
      },
    },
  ],
};

module.exports = { verseWordsActions };
