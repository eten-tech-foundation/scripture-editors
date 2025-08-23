import lexicalPlugin from "@lexical/eslint-plugin";
import nx from "@nx/eslint-plugin";
import tseslint from "typescript-eslint";

export default [
  ...nx.configs["flat/base"],
  ...nx.configs["flat/typescript"],
  ...nx.configs["flat/javascript"],
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    ignores: [
      "**/build",
      "**/dist",
      "**/out-tsc",
      "**/temp",
      "**/tmp",
      "**/coverage",
      "**/vite.config.*.timestamp*",
      "**/vitest.config.*.timestamp*",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: { "@lexical": lexicalPlugin },
    rules: {
      "@lexical/rules-of-lexical": "error",
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          allow: ["^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"],
          depConstraints: [
            {
              sourceTag: "*",
              onlyDependOnLibsWithTags: ["*"],
            },
          ],
        },
      ],
      // Add a few key rules from other standards:
      eqeqeq: ["error", "always", { null: "ignore" }], // We added `null: "ignore"`.
      "prefer-const": "error",
      "no-var": "error",
      "no-console": "warn",
      // Our custom overrides:
      // Prefer index-signature `{ [projectId: string]: number }` over `Record<string, number>`
      // since the additional information of the key name gives a hint to its usage.
      "@typescript-eslint/consistent-indexed-object-style": ["error", "index-signature"],
    },
  },
  {
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.cts",
      "**/*.mts",
      "**/*.js",
      "**/*.jsx",
      "**/*.cjs",
      "**/*.mjs",
    ],
    // Override or add rules here
    rules: {},
  },
  {
    files: ["**/*.json"],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parser: await import("jsonc-eslint-parser"),
    },
  },
];
