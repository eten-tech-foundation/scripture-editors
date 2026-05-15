**Saroj uses Handbooks for Exegesis**

Product Requirements Document

| Owner                     | Ian                                         | Status           | Shaping     |
| :------------------------ | :------------------------------------------ | :--------------- | :---------- |
| **Appetite**              | 2 weeks                                     | **Last Updated** | 29 Apr 2026 |
| **Timing Considerations** | \[ Internal or External Commitments Made \] |                  |             |

_Appetite is a budget, not an estimate. It defines how much time this problem is worth._

# **1\. The Problem**

_What is the customer pain or opportunity? Ground this in real user behavior, not feature requests. A good problem statement makes the solution feel obvious._

Currently the handbooks do not display as expected because they use custom stylesheets, specific to them. Support for all of the required markers is not yet present in PT10 ([PT-3086](https://paratextstudio.atlassian.net/browse/PT-3086)). PT10 has been observed to crash when displaying the handbook, and at other times become inactive for long periods ([PT-3537](https://paratextstudio.atlassian.net/browse/PT-3537)).

## **Who has this problem?**

_Describe the specific users or segments affected. Be concrete._

All Paratext users who work in translation.

## **How do we know?**

_What evidence do we have? Support tickets, session recordings, user interviews, data. Link to sources. If the evidence is thin, say so._

It’s a documented deficiency of Paratext 10\.

[PT-3086: TND and HBK do not show well formatted](https://paratextstudio.atlassian.net/browse/PT-3086)

[PT-3537: Application hangs when UBS Handbook is open](https://paratextstudio.atlassian.net/browse/PT-3537)

## **What happens if we do nothing?**

_This forces honesty about urgency and helps with prioritization._

Translators will not have important textual commentaries – focused on the needs of translating accurately – available to them in Paratext. They will look elsewhere for help in understanding the source/model text for their project.

# **2\. Appetite & Boundaries**

**\*Shape Up concept:** We’re fixing the time and flexing the scope. This section defines the box we’re working inside.\*

**Appetite: 2 weeks**

If the solution can’t fit in this box, we narrow scope — not extend the timeline.

| Non-negotiables                                                                                                                                                                                                                                                                                                                | Nice-to-haves                                                                                                                                                                                                                                                                                                                                                    | No-gos                                                                                                                                                                        |
| :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Must be in any version we ship_                                                                                                                                                                                                                                                                                               | _Cut these first when time is tight_                                                                                                                                                                                                                                                                                                                             | _Explicitly out of scope_                                                                                                                                                     |
| Make an initial effort to ensure UBS Handbook in English renders as expected (parity with PT9 is the goal, but it is not expected in this 2 week effort): HBKENG                                                                                                                                                               | From [supporting doc](https://drive.google.com/file/d/1IVOrjq_tfw2GPR_nCPMPwMmsWwCrGRsR/view?usp=drive_link), HBKxxx in other languages also display as expected: HBKCS HBKCT HBKFRA HBKPT (That is, sections titled “**SIL Translator's Notes (TN series) \- 9**” and “**UBS Handbook Series \- 5**”, respectively)                                             |                                                                                                                                                                               |
| Make an initial effort to ensure SIL Translators Notes in English render as expected (parity with PT9 is the goal, but it is not expected in this 2 week effort): TNN TND (TNN and TND would benefit from being worked on together as they are intended to be viewed together. Though viewing them together is not essential.) | From [supporting doc](https://drive.google.com/file/d/1IVOrjq_tfw2GPR_nCPMPwMmsWwCrGRsR/view?usp=drive_link), TNN, TND in other languages also display as expected: TNNESP TNNPTG TNNFR (confirmed: there is no “TNDFR”) TNDESP TNDPTG (That is, sections titled “**SIL Translator's Notes (TN series) \- 9**” and “**UBS Handbook Series \- 5**”, respectively) | Displaying TNN and TND simultaneously is not initially possible in 10Simple. To do this we must wait until we have the facility to display a 4th column or a text collection. |
|                                                                                                                                                                                                                                                                                                                                | From [supporting doc](https://drive.google.com/file/d/1IVOrjq_tfw2GPR_nCPMPwMmsWwCrGRsR/view?usp=drive_link), items in the following categories also display as expected: Other Translation Helps TAZI Study Notes                                                                                                                                               |                                                                                                                                                                               |
|                                                                                                                                                                                                                                                                                                                                | Links which open [Quick Reference](https://jennibeadle.github.io/paratext-vidsum/Video-summaries/Introduction/0.2.Navigation/0.0.3) windows in PT9 open QR windows in PT10.                                                                                                                                                                                      | Resources linked in the UBS Handbook to unavailable resources are reported only as “Resource not downloaded”. (Don’t offer to auto-download or open Get resources.)           |
| Handbook content is available in all expected books i.e.: including FRT, BAK, INT, XXA, etc. Also DC books. NOTE: see no go column for overriding rules here, and rabbit hole \#1                                                                                                                                              | Determine whether navigation to all books is possible by selecting a BCV locations, including FRT, BAK, INT, XXA, etc. Also DC books. NOTE: see no go column for overriding rules here.                                                                                                                                                                          | No additional work on versification in this effort. If navigation doesn’t work, don’t add it in this epic, just report that it’s not working.                                 |
| Content in handbooks is displayed as expected by the user \- as specified in stylesheets (see rabbit hole 5\)                                                                                                                                                                                                                  | Custom Stylesheets for the handbooks are read and applied                                                                                                                                                                                                                                                                                                        |                                                                                                                                                                               |
|                                                                                                                                                                                                                                                                                                                                | Clicking on a \\jmp link in the handbook for a resource _which is installed in PT10_ displays the linked text to the user without navigating the whole workspace to the linked location/text. (see rabbit hole 6\)                                                                                                                                               |                                                                                                                                                                               |
|                                                                                                                                                                                                                                                                                                                                | Clicking on a \\jmp link in the handbook for a resource which is not yet on the user’s computer indicates to the user that the text is not available. (see rabbit hole 6\)                                                                                                                                                                                       | A download of the resource is offered to the user.                                                                                                                            |

# **3\. Shaped Solution**

_This is the shaped concept — enough direction to be useful, rough enough to leave room for builders to figure out the details. Think breadboard-level, not pixel-perfect._

1. Focus first on making the UBS translators Handbook display correctly.
2. Follow up with making the SIL TNN and TND resources display correctly.

We have reason to believe that the UBS Handbook is more widely used. Also, TNN/TND does not provide full coverage of notes for books of the old testament (17 books not yet available).

## **How it works**

_Describe the core flow in plain language. Use a simple numbered walkthrough, a rough sketch, or a breadboard diagram. Avoid specifying UI details unless they’re load-bearing._

Saroj sees the Handbook(s) Donna has specified for the team (and any he has added himself). The Handbook content is BCV based and scrolls in sync with the project. Saroj can navigate to specific books in the BCV control in order to review handbook content in places which may not yet (or ever) exist in the project.

## **Key interactions**

_Call out the 2–3 moments that matter most. Where does the user make a decision? Where could they get confused? Where does data flow between systems? Links to key UX mock-ups_

Selecting the handbook to show in the Handbook tab

Navigating to locations in the handbook which are not part of the current project, using BCV.

Viewing images which are referenced in the handbooks

Viewing quick reference links from the handbooks in specific linked translations.

## **Rabbit holes**

_Things that look simple but aren’t. Call these out so the team doesn’t get pulled in._

|     | Rabbit Hole                                                                                                                                                                                                                       | Why It’s Risky                                                                                                                                                                                                                                                                                                                                      | Suggested Approach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     | e.g. Syncing state across tabs                                                                                                                                                                                                    | Could burn a week on edge cases                                                                                                                                                                                                                                                                                                                     | Don’t support in v1 — show “refresh” message                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1   | The UBS Handbook contains introduction material for each biblical book in INT (67 chapters, 1 per biblical book \-some blank-) and in XXA. Also contains FRT, BAK and DC books                                                    | We may not be able to navigate to all of these books and chapters in PT10 yet. All of these books will need to be visible in the universal BCV control (when the handbook is focused?). Something reasonable should happen in the project when navigating to locations in the handbook which are not part of the current project and never will be. | Convert the material. Versification support will come later. Ensure something reasonable displays in the project window when the user visits “INT 63” in the handbook. Ensure a reasonable message appears in empty books when the user navigates to somewhere with no content (in the handbook, the project and other resource windows).                                                                                                                                                                                                                 |
| 2   | How TNN and TND work is somewhat complicated. They’re two separate resources which can be read together. There is significant reference material in XXB in TNN on how to read TNN and TND.                                        | We’re not sure of the value of providing TNN without TND. They seem to be complementary, not essential companions.                                                                                                                                                                                                                                  | Check XXB and GEN 1:0 in TNN for description of how to use TNN & TND together. Look for “Guidelines for using the translators notes series”. In PT9 this supplemental info will display in a quick reference window (goes to book XXB). Contact (Paul O’Rear) translators\_notes@sil.org for more info. Or Randy Groff. Logos may also have handbooks and translators notes \- this could help with display (I couldn’t find them in Logos \- Ian).                                                                                                       |
| 3   | Some markers used in handbooks are not yet supported in the Paratext 10 editor                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                     | Compare markers supported in editor with markers used in handbooks. Go for low hanging fruit. Support the most widely used markers first.From markers inventory in PT9:182 markers in HBKENG. 190 in TNN 91 in TND                                                                                                                                                                                                                                                                                                                                        |
| 4   | Tables, Figures and other complex-to-display arrangements of markers                                                                                                                                                              |                                                                                                                                                                                                                                                                                                                                                     | Again, focus on low hanging fruit. Check number of occurrences of tables vs. figures (and other markers) to see which occur more often and try to provide a solution for those, over less frequently used markers.                                                                                                                                                                                                                                                                                                                                        |
| 5   | UBS Handbook and TNN may have different custom stylesheets                                                                                                                                                                        | The editor currently does not support custom stylesheets. Markers are displayed uniformly across resources and projects.                                                                                                                                                                                                                            | Investigate whether the handbook and TNN/TND use custom stylesheets. Decide whether to support custom stylesheets or not.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | The handbook refers to texts which may not be on the user’s computer. In PT9 they provide links which open in Quick Reference windows. (It doesn’t seem like TNN/TND refer to other resources in the way that the handbook does). | We’ll need to either build a quick reference window, or provide a user friendly popover (e.g. shacdcn/ui hover card, popover, sheet, tooltip…)                                                                                                                                                                                                      | Prioritise displaying the linked content to the user without obscuring too much other content. Let the user know if the resource isn’t available and make it as easy as possible for the user to get that resource. We _could_ download all linked resources when downloading the handbook. It is not good UX for a resource to rely on several other texts but not disclose that to the user. Someone who downloads their resources and then travels to a remote project may discover that all texts referenced by the handbook are unavailable to them. |

# **4\. Risks**

**\*Inspired framework:** Every product idea has four categories of risk. Be honest about where this one is weakest.\*

| Risk Type                                          | Level | Notes                                                                                                     |
| :------------------------------------------------- | :---: | :-------------------------------------------------------------------------------------------------------- |
| **Value — Will users choose to use this?**         |  🟢   | Translators want to use the Handbooks                                                                     |
| **Usability — Can users figure it out?**           |  🟢   | If presented as expected, the Handbooks will make sense to translators.                                   |
| **Feasibility — Can we build it in the appetite?** | 🟡 🔴 | It may be challenging to add support for all of the necessary markers                                     |
| **Viability — Does it work for the business?**     |  🟡   | Without the UBS Handbook, and to a lesser extent TNN/TND, teams will be at a disadvantage in translation. |

## **What discovery have we done (or should we do)?**

_Prototype tests, technical spikes, competitor analysis, etc. If you skipped discovery, say why._

There has been no opportunity to do anything beyond Matt L investigating which resources ought to be available to download in the “Commentaries” section of the resources/tools panel:

[Supporting doc of non bible resources](https://drive.google.com/file/d/1IVOrjq_tfw2GPR_nCPMPwMmsWwCrGRsR/view?usp=drive_link%20) provided by [Matt L via Discord](https://discord.com/channels/892072317436448768/1498735306994614494)

# **5\. Technical Context**

_Just enough for engineering to start thinking — not a spec. The team will fill in the real details during build._

## **Systems involved**

_List services, databases, APIs, or third-party dependencies that will be touched._

DBL

Editor

## **Known constraints**

_Performance requirements, backward compatibility, migration needs, regulatory considerations._

## **Open technical questions**

_Things the team needs to investigate during build. It’s fine to have these — better to name them than pretend they don’t exist._

Whether to / how much to investigate the usage of markers in the different resources. i.e.: What can be gained by knowing which markers to make display correctly before other markers, versus getting on with just making all markers display correctly.

Whether there is any other way of displaying the handbooks other than in the Editor, by adding support for currently unsupported markers.

**Changelog**

| Date | Author | What Changed |
| :--- | :----- | :----------- |
|      |        |              |

**Template notes:** _This template borrows from two frameworks. [Shape Up](https://basecamp.com/shapeup/1.5-chapter-06) (Basecamp) contributes appetite over estimates, fixed-time/variable-scope, shaping before building, rabbit holes, and no-gos. [Inspired](https://www.svpg.com/books/inspired-how-to-create-tech-products-customers-love-2nd-edition/) (Marty Cagan) contributes the focus on outcomes over outputs, the four-risk framework, and the emphasis on discovery before delivery. The goal is a document light enough to actually get written, specific enough to align a team, and honest enough to surface risks early._
