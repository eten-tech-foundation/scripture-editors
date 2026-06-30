# Implemented Markers Inventory

Markers currently implemented by the Lexical nodes in `libs/shared/src/nodes/usj/`. Each row pairs a USFM/USJ marker with the Lexical node that handles it. The Section column uses the grouping comments in the source files; Notes flag end markers and deprecated markers.

End markers (`\*` suffix) apply to `CharNode` and `NoteNode`. Paragraph markers (`ParaNode`) terminate at the next paragraph and have no end form. Milestone markers carry their start/end indication in the marker name itself (`-s` / `-e`), and the `c`/`v` markers from `ChapterNode`/`ImmutableChapterNode`/`VerseNode` don't take end markers.

| Marker  | Node                 | Section             | Notes                                    |
| ------- | -------------------- | ------------------- | ---------------------------------------- |
| id      | BookNode             | Book                |                                          |
| c       | ImmutableChapterNode | Chapter             |                                          |
| c       | ChapterNode          | Chapter             |                                          |
| v       | VerseNode            | Verse               |                                          |
| ca      | CharNode             | Chapter & Verse     |                                          |
| ca\*    | CharNode             | Chapter & Verse     | End marker                               |
| cp      | CharNode             | Chapter & Verse     |                                          |
| cp\*    | CharNode             | Chapter & Verse     | End marker                               |
| va      | CharNode             | Chapter & Verse     |                                          |
| va\*    | CharNode             | Chapter & Verse     | End marker                               |
| vp      | CharNode             | Chapter & Verse     |                                          |
| vp\*    | CharNode             | Chapter & Verse     | End marker                               |
| add     | CharNode             | Text Features       |                                          |
| add\*   | CharNode             | Text Features       | End marker                               |
| bk      | CharNode             | Text Features       |                                          |
| bk\*    | CharNode             | Text Features       | End marker                               |
| dc      | CharNode             | Text Features       |                                          |
| dc\*    | CharNode             | Text Features       | End marker                               |
| em      | CharNode             | Text Features       |                                          |
| em\*    | CharNode             | Text Features       | End marker                               |
| jmp     | CharNode             | Text Features       |                                          |
| jmp\*   | CharNode             | Text Features       | End marker                               |
| k       | CharNode             | Text Features       |                                          |
| k\*     | CharNode             | Text Features       | End marker                               |
| nd      | CharNode             | Text Features       |                                          |
| nd\*    | CharNode             | Text Features       | End marker                               |
| ord     | CharNode             | Text Features       |                                          |
| ord\*   | CharNode             | Text Features       | End marker                               |
| pn      | CharNode             | Text Features       |                                          |
| pn\*    | CharNode             | Text Features       | End marker                               |
| png     | CharNode             | Text Features       |                                          |
| png\*   | CharNode             | Text Features       | End marker                               |
| qt      | CharNode             | Text Features       |                                          |
| qt\*    | CharNode             | Text Features       | End marker                               |
| rb      | CharNode             | Text Features       |                                          |
| rb\*    | CharNode             | Text Features       | End marker                               |
| rq      | CharNode             | Text Features       |                                          |
| rq\*    | CharNode             | Text Features       | End marker                               |
| sig     | CharNode             | Text Features       |                                          |
| sig\*   | CharNode             | Text Features       | End marker                               |
| sls     | CharNode             | Text Features       |                                          |
| sls\*   | CharNode             | Text Features       | End marker                               |
| tl      | CharNode             | Text Features       |                                          |
| tl\*    | CharNode             | Text Features       | End marker                               |
| w       | CharNode             | Text Features       |                                          |
| w\*     | CharNode             | Text Features       | End marker                               |
| wa      | CharNode             | Text Features       |                                          |
| wa\*    | CharNode             | Text Features       | End marker                               |
| wg      | CharNode             | Text Features       |                                          |
| wg\*    | CharNode             | Text Features       | End marker                               |
| wh      | CharNode             | Text Features       |                                          |
| wh\*    | CharNode             | Text Features       | End marker                               |
| wj      | CharNode             | Text Features       |                                          |
| wj\*    | CharNode             | Text Features       | End marker                               |
| addpn   | CharNode             | Text Features       | Deprecated                               |
| addpn\* | CharNode             | Text Features       | Deprecated, end marker                   |
| pro     | CharNode             | Text Features       | Deprecated                               |
| pro\*   | CharNode             | Text Features       | Deprecated, end marker                   |
| bd      | CharNode             | Text Formatting     |                                          |
| bd\*    | CharNode             | Text Formatting     | End marker                               |
| it      | CharNode             | Text Formatting     |                                          |
| it\*    | CharNode             | Text Formatting     | End marker                               |
| bdit    | CharNode             | Text Formatting     |                                          |
| bdit\*  | CharNode             | Text Formatting     | End marker                               |
| no      | CharNode             | Text Formatting     |                                          |
| no\*    | CharNode             | Text Formatting     | End marker                               |
| sc      | CharNode             | Text Formatting     |                                          |
| sc\*    | CharNode             | Text Formatting     | End marker                               |
| sup     | CharNode             | Text Formatting     |                                          |
| sup\*   | CharNode             | Text Formatting     | End marker                               |
| ior     | CharNode             | Introductions       |                                          |
| ior\*   | CharNode             | Introductions       | End marker                               |
| iqt     | CharNode             | Introductions       |                                          |
| iqt\*   | CharNode             | Introductions       | End marker                               |
| qac     | CharNode             | Poetry              |                                          |
| qac\*   | CharNode             | Poetry              | End marker                               |
| qs      | CharNode             | Poetry              |                                          |
| qs\*    | CharNode             | Poetry              | End marker                               |
| litl    | CharNode             | Lists               |                                          |
| litl\*  | CharNode             | Lists               | End marker                               |
| lik     | CharNode             | Lists               |                                          |
| lik\*   | CharNode             | Lists               | End marker                               |
| liv     | CharNode             | Lists               |                                          |
| liv\*   | CharNode             | Lists               | End marker                               |
| liv1    | CharNode             | Lists               |                                          |
| liv1\*  | CharNode             | Lists               | End marker                               |
| liv2    | CharNode             | Lists               |                                          |
| liv2\*  | CharNode             | Lists               | End marker                               |
| liv3    | CharNode             | Lists               |                                          |
| liv3\*  | CharNode             | Lists               | End marker                               |
| liv4    | CharNode             | Lists               |                                          |
| liv4\*  | CharNode             | Lists               | End marker                               |
| liv5    | CharNode             | Lists               |                                          |
| liv5\*  | CharNode             | Lists               | End marker                               |
| fr      | CharNode             | Footnote            |                                          |
| fr\*    | CharNode             | Footnote            | End marker                               |
| fq      | CharNode             | Footnote            |                                          |
| fq\*    | CharNode             | Footnote            | End marker                               |
| fqa     | CharNode             | Footnote            |                                          |
| fqa\*   | CharNode             | Footnote            | End marker                               |
| fk      | CharNode             | Footnote            |                                          |
| fk\*    | CharNode             | Footnote            | End marker                               |
| ft      | CharNode             | Footnote            |                                          |
| ft\*    | CharNode             | Footnote            | End marker                               |
| fl      | CharNode             | Footnote            |                                          |
| fl\*    | CharNode             | Footnote            | End marker                               |
| fw      | CharNode             | Footnote            |                                          |
| fw\*    | CharNode             | Footnote            | End marker                               |
| fp      | CharNode             | Footnote            |                                          |
| fp\*    | CharNode             | Footnote            | End marker                               |
| fv      | CharNode             | Footnote            |                                          |
| fv\*    | CharNode             | Footnote            | End marker                               |
| fm      | CharNode             | Footnote            |                                          |
| fm\*    | CharNode             | Footnote            | End marker                               |
| fdc     | CharNode             | Footnote            | Deprecated                               |
| fdc\*   | CharNode             | Footnote            | Deprecated, end marker                   |
| xo      | CharNode             | Cross Reference     |                                          |
| xo\*    | CharNode             | Cross Reference     | End marker                               |
| xop     | CharNode             | Cross Reference     |                                          |
| xop\*   | CharNode             | Cross Reference     | End marker                               |
| xk      | CharNode             | Cross Reference     |                                          |
| xk\*    | CharNode             | Cross Reference     | End marker                               |
| xq      | CharNode             | Cross Reference     |                                          |
| xq\*    | CharNode             | Cross Reference     | End marker                               |
| xt      | CharNode             | Cross Reference     |                                          |
| xt\*    | CharNode             | Cross Reference     | End marker                               |
| xta     | CharNode             | Cross Reference     |                                          |
| xta\*   | CharNode             | Cross Reference     | End marker                               |
| xot     | CharNode             | Cross Reference     |                                          |
| xot\*   | CharNode             | Cross Reference     | End marker                               |
| xnt     | CharNode             | Cross Reference     |                                          |
| xnt\*   | CharNode             | Cross Reference     | End marker                               |
| xdc     | CharNode             | Cross Reference     | Deprecated                               |
| xdc\*   | CharNode             | Cross Reference     | Deprecated, end marker                   |
| f       | NoteNode             | Footnote            |                                          |
| f\*     | NoteNode             | Footnote            | End marker                               |
| fe      | NoteNode             | Footnote            |                                          |
| fe\*    | NoteNode             | Footnote            | End marker                               |
| ef      | NoteNode             | Footnote            |                                          |
| ef\*    | NoteNode             | Footnote            | End marker                               |
| efe     | NoteNode             | Footnote            |                                          |
| efe\*   | NoteNode             | Footnote            | End marker                               |
| x       | NoteNode             | Cross Reference     |                                          |
| x\*     | NoteNode             | Cross Reference     | End marker                               |
| ex      | NoteNode             | Cross Reference     |                                          |
| ex\*    | NoteNode             | Cross Reference     | End marker                               |
| ts-s    | MilestoneNode        | Milestone           |                                          |
| ts-e    | MilestoneNode        | Milestone           |                                          |
| t-s     | MilestoneNode        | Milestone           |                                          |
| t-e     | MilestoneNode        | Milestone           |                                          |
| ts      | MilestoneNode        | Milestone           |                                          |
| qt1-s   | MilestoneNode        | Milestone           |                                          |
| qt1-e   | MilestoneNode        | Milestone           |                                          |
| qt2-s   | MilestoneNode        | Milestone           |                                          |
| qt2-e   | MilestoneNode        | Milestone           |                                          |
| qt3-s   | MilestoneNode        | Milestone           |                                          |
| qt3-e   | MilestoneNode        | Milestone           |                                          |
| qt4-s   | MilestoneNode        | Milestone           |                                          |
| qt4-e   | MilestoneNode        | Milestone           |                                          |
| qt5-s   | MilestoneNode        | Milestone           |                                          |
| qt5-e   | MilestoneNode        | Milestone           |                                          |
| qt-s    | MilestoneNode        | Milestone           |                                          |
| qt-e    | MilestoneNode        | Milestone           |                                          |
| zmsc-s  | MilestoneNode        | Annotation          | Custom milestone for comment annotations |
| zmsc-e  | MilestoneNode        | Annotation          | Custom milestone for comment annotations |
| ide     | ParaNode             | Identification      |                                          |
| sts     | ParaNode             | Identification      |                                          |
| rem     | ParaNode             | Identification      |                                          |
| h       | ParaNode             | Identification      |                                          |
| toc1    | ParaNode             | Identification      |                                          |
| toc2    | ParaNode             | Identification      |                                          |
| toc3    | ParaNode             | Identification      |                                          |
| toca1   | ParaNode             | Identification      |                                          |
| toca2   | ParaNode             | Identification      |                                          |
| toca3   | ParaNode             | Identification      |                                          |
| imt     | ParaNode             | Introductions       |                                          |
| imt1    | ParaNode             | Introductions       |                                          |
| imt2    | ParaNode             | Introductions       |                                          |
| imt3    | ParaNode             | Introductions       |                                          |
| imt4    | ParaNode             | Introductions       |                                          |
| is      | ParaNode             | Introductions       |                                          |
| is1     | ParaNode             | Introductions       |                                          |
| is2     | ParaNode             | Introductions       |                                          |
| ip      | ParaNode             | Introductions       |                                          |
| ipi     | ParaNode             | Introductions       |                                          |
| im      | ParaNode             | Introductions       |                                          |
| imi     | ParaNode             | Introductions       |                                          |
| ipq     | ParaNode             | Introductions       |                                          |
| imq     | ParaNode             | Introductions       |                                          |
| ipr     | ParaNode             | Introductions       |                                          |
| iq      | ParaNode             | Introductions       |                                          |
| iq1     | ParaNode             | Introductions       |                                          |
| iq2     | ParaNode             | Introductions       |                                          |
| iq3     | ParaNode             | Introductions       |                                          |
| ili     | ParaNode             | Introductions       |                                          |
| ili1    | ParaNode             | Introductions       |                                          |
| ili2    | ParaNode             | Introductions       |                                          |
| ib      | ParaNode             | Introductions       |                                          |
| iot     | ParaNode             | Introductions       |                                          |
| io      | ParaNode             | Introductions       |                                          |
| io1     | ParaNode             | Introductions       |                                          |
| io2     | ParaNode             | Introductions       |                                          |
| io3     | ParaNode             | Introductions       |                                          |
| io4     | ParaNode             | Introductions       |                                          |
| iex     | ParaNode             | Introductions       |                                          |
| imte    | ParaNode             | Introductions       |                                          |
| imte1   | ParaNode             | Introductions       |                                          |
| imte2   | ParaNode             | Introductions       |                                          |
| ie      | ParaNode             | Introductions       |                                          |
| mt      | ParaNode             | Titles and Headings |                                          |
| mt1     | ParaNode             | Titles and Headings |                                          |
| mt2     | ParaNode             | Titles and Headings |                                          |
| mt3     | ParaNode             | Titles and Headings |                                          |
| mt4     | ParaNode             | Titles and Headings |                                          |
| mte     | ParaNode             | Titles and Headings |                                          |
| mte1    | ParaNode             | Titles and Headings |                                          |
| mte2    | ParaNode             | Titles and Headings |                                          |
| cl      | ParaNode             | Titles and Headings |                                          |
| cd      | ParaNode             | Titles and Headings |                                          |
| ms      | ParaNode             | Titles and Headings |                                          |
| ms1     | ParaNode             | Titles and Headings |                                          |
| ms2     | ParaNode             | Titles and Headings |                                          |
| ms3     | ParaNode             | Titles and Headings |                                          |
| mr      | ParaNode             | Titles and Headings |                                          |
| s       | ParaNode             | Titles and Headings |                                          |
| s1      | ParaNode             | Titles and Headings |                                          |
| s2      | ParaNode             | Titles and Headings |                                          |
| s3      | ParaNode             | Titles and Headings |                                          |
| s4      | ParaNode             | Titles and Headings |                                          |
| sr      | ParaNode             | Titles and Headings |                                          |
| r       | ParaNode             | Titles and Headings |                                          |
| d       | ParaNode             | Titles and Headings |                                          |
| sp      | ParaNode             | Titles and Headings |                                          |
| sd      | ParaNode             | Titles and Headings |                                          |
| sd1     | ParaNode             | Titles and Headings |                                          |
| sd2     | ParaNode             | Titles and Headings |                                          |
| sd3     | ParaNode             | Titles and Headings |                                          |
| sd4     | ParaNode             | Titles and Headings |                                          |
| p       | ParaNode             | Body Paragraphs     |                                          |
| m       | ParaNode             | Body Paragraphs     |                                          |
| po      | ParaNode             | Body Paragraphs     |                                          |
| cls     | ParaNode             | Body Paragraphs     |                                          |
| pr      | ParaNode             | Body Paragraphs     |                                          |
| pc      | ParaNode             | Body Paragraphs     |                                          |
| pm      | ParaNode             | Body Paragraphs     |                                          |
| pmo     | ParaNode             | Body Paragraphs     |                                          |
| pmc     | ParaNode             | Body Paragraphs     |                                          |
| pmr     | ParaNode             | Body Paragraphs     |                                          |
| pi      | ParaNode             | Body Paragraphs     |                                          |
| pi1     | ParaNode             | Body Paragraphs     |                                          |
| pi2     | ParaNode             | Body Paragraphs     |                                          |
| pi3     | ParaNode             | Body Paragraphs     |                                          |
| mi      | ParaNode             | Body Paragraphs     |                                          |
| lit     | ParaNode             | Body Paragraphs     |                                          |
| nb      | ParaNode             | Body Paragraphs     |                                          |
| ph      | ParaNode             | Body Paragraphs     | Deprecated                               |
| ph1     | ParaNode             | Body Paragraphs     | Deprecated                               |
| ph2     | ParaNode             | Body Paragraphs     | Deprecated                               |
| ph3     | ParaNode             | Body Paragraphs     | Deprecated                               |
| q       | ParaNode             | Poetry              |                                          |
| q1      | ParaNode             | Poetry              |                                          |
| q2      | ParaNode             | Poetry              |                                          |
| q3      | ParaNode             | Poetry              |                                          |
| q4      | ParaNode             | Poetry              |                                          |
| qr      | ParaNode             | Poetry              |                                          |
| qc      | ParaNode             | Poetry              |                                          |
| qa      | ParaNode             | Poetry              |                                          |
| qm      | ParaNode             | Poetry              |                                          |
| qm1     | ParaNode             | Poetry              |                                          |
| qm2     | ParaNode             | Poetry              |                                          |
| qm3     | ParaNode             | Poetry              |                                          |
| qd      | ParaNode             | Poetry              |                                          |
| b       | ParaNode             | Poetry              |                                          |
| lh      | ParaNode             | Lists               |                                          |
| li      | ParaNode             | Lists               |                                          |
| li1     | ParaNode             | Lists               |                                          |
| li2     | ParaNode             | Lists               |                                          |
| li3     | ParaNode             | Lists               |                                          |
| li4     | ParaNode             | Lists               |                                          |
| lf      | ParaNode             | Lists               |                                          |
| lim     | ParaNode             | Lists               |                                          |
| lim1    | ParaNode             | Lists               |                                          |
| lim2    | ParaNode             | Lists               |                                          |
| lim3    | ParaNode             | Lists               |                                          |
| lim4    | ParaNode             | Lists               |                                          |
| pb      | ParaNode             | Breaks              |                                          |

## Notes

- `MilestoneNode.isValidMarker` also accepts any marker whose name starts with `z` (the USFM extension namespace). Such markers are valid at runtime but not enumerated here.
- `ImmutableChapterNode` and `ChapterNode` both implement the `c` marker; the immutable variant is used in read-only contexts.
- `ImpliedParaNode` registers as a replacement for Lexical's built-in `ParagraphNode` and reports its marker as `p`, matching `PARA_MARKER_DEFAULT`.
- Sources: `BookNode.ts`, `ChapterNode.ts`, `ImmutableChapterNode.ts`, `VerseNode.ts`, `CharNode.ts`, `NoteNode.ts`, `MilestoneNode.ts`, `ParaNode.ts`, `ImpliedParaNode.ts`.
