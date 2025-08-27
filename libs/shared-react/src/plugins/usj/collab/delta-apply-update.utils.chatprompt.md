---
mode: "agent"
---

I'm using Lexical React and writing the $applyUpdate method using TDD for applying updates from a ShareDB rich-text document.
The Lexical nodes used are listed in the const `usjReactNodes` in the `libs/shared-react/nodes/usj/index.ts` file.

SomeParaNodes and BookNodes have their OT length 1 on their close (not their open).
EmbedNodes have their OT length 1 on their open but don't have any content.
CharNodes have OT length of 0 itself but overall has the OT length of its contents.

Prefer undefined over null.
Avoid unnecessary type assertions.
Comments and code should be no longer than 100 characters per line.
I try to follow the SonarQube rules where appropriate.

You can run tests in the terminal.
For the whole delta utils suite:
`nx test platform --skip-nx-cache --testPathPattern=delta-apply-update.utils.test.tsx`
For an individual delta utils test:
`nx test platform --skip-nx-cache --testNamePattern="<test name>"`
If either of those tests don't run you may need to run:
`nx reset`
You can add `console.debug` to tests for debugging so that you can see the output.
