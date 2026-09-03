// CSS-only build entry: emits dist/nodes-menu.css. See the note in styles.ts.
//
// The marker menu's stylesheet lives in the `shared` lib, so it comes in through the workspace
// alias like the TS in this package does. `shared` only exported "." and "./package.json", which
// made `shared/src/styles/nodes-menu.css` fail with `Missing "./src/styles/nodes-menu.css"
// specifier in "shared" package`; it now exports "./styles/*" as well.
import "shared/styles/nodes-menu.css";
