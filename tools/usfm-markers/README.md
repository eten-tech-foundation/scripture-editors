# usfm-markers

This library was generated with [Nx](https://nx.dev).

## Usage

Run `nx generate markers-data` and when prompted give it a USFM style file URL (e.g. `https://raw.githubusercontent.com/ubsicap/usfm/refs/heads/master/sty/usfm.sty`) or a workspace-relative path to a vendored `.sty` file (e.g. `tools/usfm-markers/src/generators/markers-data/data/usfm.sty`, the deterministic default — no network required).

```bash
nx g usfm-markers:markers-data tools/usfm-markers/src/generators/markers-data/data/usfm.sty --outputPath=libs/shared/src/utils/usfm
```

This writes `usfmMarkers.ts`, `usfmTypes.ts`, and `defaultStyleInfo.ts` directly into `outputPath` (no manual copy step). `usfmMarkers.ts`/`usfmTypes.ts` are then reverted (`git checkout --`) if unchanged from the currently-committed, hand-curated simplified table — only `defaultStyleInfo.ts` (the full stylesheet table, with no category exclusion) is meant to be regenerated freely.

## Building

Run `nx build usfm-markers` to build the library.
