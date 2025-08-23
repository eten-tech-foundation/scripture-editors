/**
 * Copied from https://github.com/facebook/lexical/blob/93cf85e12033b114ad347dcccf508c846a833731/packages/lexical-playground/src/utils/joinClasses.ts
 */

export default function joinClasses(...args: (string | boolean | null | undefined)[]) {
  return args.filter(Boolean).join(" ");
}
