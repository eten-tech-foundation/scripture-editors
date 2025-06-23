# scripture-utilities

<div align="center">

[![Build Status][github-actions-status]][github-actions-url]
[![CodeQL][gitghub-codeql-status]][gitghub-codeql-url]
[![Github Tag][npm-version-image]][npm-version-url]

</div>

Utilities for working with Scripture data.

## Features

For data that conforms to [USX/USJ v3.1](https://docs.usfm.bible/usfm/3.1/):

- USJ to USX converter.
- USX to USJ converter.

## Install

```sh
npm install @eten-tech-foundation/scripture-utilities
```

## Usage

```ts
import { usxStringToUsj, usjToUsxString } from "@eten-tech-foundation/scripture-utilities";

const emptyUsx = '<usx version="3.1" />';
const usx = `
<?xml version="1.0" encoding="utf-8"?>
<usx version="3.1">
  <book code="PSA" style="id">World English Bible (WEB)</book>
  <para style="mt1">The Psalms</para>
  <chapter number="1" style="c" sid="PSA 1" />
  <para style="q1">
    <verse number="1" style="v" sid="PSA 1:1" />Blessed is the man who doesn’t walk in the counsel of the wicked,</para>
  <para style="q2" vid="PSA 1:1">nor stand on the path of sinners,</para>
  <para style="q2" vid="PSA 1:1">nor sit in the seat of scoffers;<verse eid="PSA 1:1" /></para>
</usx>
`;

const emptyUsj = usxStringToUsj(emptyUsx);
const usj = usxStringToUsj(usx);

const newUsx = usjToUsxString(usj);
```

## Building

Run `nx build utilities` to build the library.

## Running unit tests

Run `nx test utilities` to execute the unit tests via [Jest](https://jestjs.io).

## Develop in App

To develop these utilities in a target application you can use [yalc](https://www.npmjs.com/package/yalc) to link the editor in without having to publish to NPM every time something changes.

1. In this monorepo, publish the editor to `yalc`, e.g.:
   ```bash
   nx devpub utilities
   ```
2. In the target application repo, link from `yalc`:
   ```bash
   yalc link @eten-tech-foundation/scripture-utilities
   ```
3. In this monorepo, make changes and re-publish the editor (see step 1).
4. When you have finished developing in the target application repo, unlink from `yalc`:
   ```bash
   yalc remove @eten-tech-foundation/scripture-utilities && npm i
   ```

## License

[MIT][github-license] © [ETEN Tech Foundation](https://missionmutual.org)

<!-- define variables used above -->

[github-actions-status]: https://github.com/eten-tech-foundation/scripture-editors/actions/workflows/test-publish.yml/badge.svg
[github-actions-url]: https://github.com/eten-tech-foundation/scripture-editors/actions
[gitghub-codeql-status]: https://github.com/eten-tech-foundation/scripture-editors/actions/workflows/codeql.yml/badge.svg
[gitghub-codeql-url]: https://github.com/eten-tech-foundation/scripture-editors/actions/workflows/codeql.yml
[npm-version-image]: https://img.shields.io/npm/v/@eten-tech-foundation/scripture-utilities
[npm-version-url]: https://github.com/eten-tech-foundation/scripture-editors/releases
[github-license]: https://github.com/eten-tech-foundation/scripture-editors/blob/main/packages/utilities/LICENSE
