# Changelog

All notable changes to `@eten-tech-foundation/scripture-utilities` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries under **Unreleased** describe changes that are committed but not yet published. Move them
under a version heading when that version of this package is published. (No workflow automates
this package's publish today — `Publish Scribe Package` publishes only `packages/scribe`.)

## [Unreleased]

### Added

- `MarkerObject.closed` — an optional marker attribute carrying a character span's explicit
  `closed="false"` state, so a span the author has not closed survives a USJ round trip instead of
  being silently normalized to closed.

### Changed

- **Breaking for Node consumers:** USX/USJ converters now use the runtime's DOM APIs instead of
  bundling `@xmldom/xmldom`. Node callers must provide `DOMParser` before parsing and additionally
  `XMLSerializer` before serializing; see the [environment setup](README.md#environment).
  Malformed XML throws an `Error` beginning with `Invalid USX:` across DOM implementations,
  retaining a parser exception as the cause when one is thrown.
- **`usxStringToUsj` keeps whitespace-only text.** A USX text node consisting only of whitespace is
  now retained as document text unless it contains a line break; previously any text that trimmed to
  the empty string was dropped (with a narrow exception for a single space between siblings). USFM
  treats that whitespace as content, so dropping it lost bytes the author typed. **Consumers parsing
  USX will see text nodes where none appeared before.**
- **`usjToUsxString` emits attributes that are present, not merely truthy.** An attribute whose value
  is the empty string (`\qt-s |who=""\*`) now round-trips instead of being dropped, because the check
  changed from a truthiness test to an explicit `undefined`/`null` test. An empty value is an
  unambiguous "present but not yet filled in", so parsing it loses nothing. **Consumers will see
  `attr=""` in output that previously omitted the attribute entirely.**
