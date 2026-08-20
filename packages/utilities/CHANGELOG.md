# Changelog

All notable changes to `@eten-tech-foundation/scripture-utilities` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries under **Unreleased** describe changes that are committed but not yet published. Move them
under a version heading when `Publish Scribe Package` runs for that version.

## [Unreleased]

### Added

- `MarkerObject.closed` — an optional marker attribute carrying a character span's explicit
  `closed="false"` state, so a span the author has not closed survives a USJ round trip instead of
  being silently normalized to closed.

### Changed

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
