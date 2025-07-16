---
mode: "agent"
---

I'm using Lexical React and writing the $applyUpdate method using TDD for applying updates from a ShareDB rich-text document.
The Lexical nodes used are listed in `usjReactNodes` in the `packages/shared-react/nodes/usj/index.ts` file.
An example of a rich-text OT doc is in `initialDoc` in the `packages/platform/src/collab/delta-utils-test.data.tsx` file.

SomeParaNodes have their OT length 1 on their close (not their open).
ContainerEmbedNodes have their OT length 1 on their open and need to include the OT length of their contents to skip them.
AtomicEmbedNodes have their OT length 1 on their open but don't have any content.
CharNodes have OT length of 0 itself but overall has the OT length of its contents.

Prefer undefined over null.
Avoid unnecessary type assertions.
Comments and code should be no longer than 100 characters per line.
I try to follow the SonarQube rules where appropriate.

You can run tests in the terminal.
For the whole delta utils suite:
`nx test platform --skip-nx-cache --testPathPattern=delta-utils.test.tsx`
For an individual delta utils test:
`nx test platform --skip-nx-cache --testNamePattern="<test name>"`
If either of those tests don't run you may need to run:
`nx reset`
If you need to add console.log to tests for debugging you will need to set `silent` prop to false in the `test` section of `nx.json` so that you can see the output.
