// This was added to silence a warning from `api-extractor`.
declare module "rollup/parseAst" {
  export function parseAst(...args: unknown[]): unknown;
  export function parseAstAsync(...args: unknown[]): unknown;
}
