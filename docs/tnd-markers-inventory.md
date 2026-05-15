# Display for Translator’s Notes Series (7 May 2025) (TND) Markers Inventory

Copied from P9.5 Markers inventory.

| Markers | #       | Style name                                  |
| ------- | ------- | ------------------------------------------- |
| brk     | 165_346 | TN Text Implied Bracket                     |
| brk\*   | 165_342 | End Marker                                  |
| ml1     | 136_518 | TN Meaning Line L1                          |
| imp     | 83_209  | TN Implied Text                             |
| imp\*   | 83_197  | End Marker                                  |
| tbb     | 81_824  | TN Tab                                      |
| tbb\*   | 81_824  | End Marker                                  |
| mlor    | 70_062  | TN Display Or Para                          |
| sl1     | 66_490  | TN Source Line L1                           |
| v       | 24_004  | Verse Number                                |
| rgm     | 20_006  | TN Raised Grammar Marker                    |
| rgm\*   | 20_004  | End Marker                                  |
| p       | 15_297  | Paragraph - Normal - First Line Indent      |
| tei     | 12_652  | TN TextEmphItalic                           |
| tei\*   | 12_652  | End Marker                                  |
| +ver    | 12_585  | TN Special Blue                             |
| +ver\*  | 12_585  | End Marker                                  |
| b3      | 8_710   | Extra Small Blank Line                      |
| b       | 7_523   | Poetry - Stanza Break (Blank Line)          |
| nd      | 4_653   | Name of Diety                               |
| nd\*    | 4_653   | End Marker                                  |
| sbx     | 3_601   | TN Section Box Text                         |
| sbx\*   | 3_601   | End Marker                                  |
| tr      | 2_160   | Table - Row                                 |
| tc1     | 2_159   | Table - Column 1 Cell                       |
| +rgi\*  | 1_547   | End Marker                                  |
| +rgi    | 1_547   | TN Raised Gram.Marker Implied               |
| sla     | 1_542   | TN Alt Source Line                          |
| bk      | 1_074   | Special Text - Quoted book title            |
| bk\*    | 1_071   | End Marker                                  |
| mt9     | 1_046   | TN Title Page Notices                       |
| rgi     | 883     | TN Raised Gram.Marker Implied               |
| rgi\*   | 883     | End Marker                                  |
| c       | 882     | Chapter Number                              |
| ros     | 842     | TN Reordered Superscript                    |
| ros\*   | 842     | End Marker                                  |
| be      | 667     | Bibliographic Entry                         |
| ntn     | 625     | Normal TN Paragraph                         |
| gn      | 458     | Grammar Notation                            |
| +brk\*  | 372     | End Marker                                  |
| +brk    | 372     | TN Text Implied Bracket                     |
| tc2     | 289     | Table - Column 2 Cell                       |
| mt4     | 267     | TN TitleCenterNormal                        |
| rem     | 209     | File - Remark                               |
| f       | 190     | Footnote                                    |
| f\*     | 190     | End Marker                                  |
| fr      | 190     | Footnote - Reference                        |
| ft      | 187     | Footnote - Text                             |
| b2      | 168     | Small Blank Line                            |
| teb     | 152     | TN TextEmphBold                             |
| teb\*   | 152     | End Marker                                  |
| mt2     | 148     | TN TitleCenterMedium                        |
| mt4n    | 141     | TN TitleCenterNormal NoSpace                |
| jmp\*   | 139     | End Marker                                  |
| jmp     | 139     | Jump Link                                   |
| +rgm    | 138     | TN Raised Grammar Marker                    |
| +rgm\*  | 138     | End Marker                                  |
| fig     | 100     | Auxiliary - Figure/Illustration/Map         |
| fig\*   | 100     | End Marker                                  |
| +nd     | 86      | Name of Diety                               |
| +nd\*   | 86      | End Marker                                  |
| mt8     | 78      | TN Title8CenterTimes16                      |
| mt3     | 72      | TN Y-Author                                 |
| s4      | 69      | TN Heading4 Bold                            |
| mt5     | 66      | TN Title5 Series Name                       |
| mt      | 65      | TN TitleCenterLarge                         |
| mt10    | 65      | TN Reproduction Notice                      |
| id      | 64      | File - Identification                       |
| or\*    | 64      | End Marker                                  |
| or      | 64      | TN -OR-                                     |
| mt3n    | 59      | TN Y-Author NoSpace                         |
| li1     | 32      | TN List Indent L1                           |
| pvr     | 26      | TN Verse Reordered Para                     |
| pra     | 22      | TN Right Aligned Para                       |
| fq      | 20      | Footnote - Quotation or Alternate Rendering |
| mt6     | 6       | TN Revision Date                            |
| par     | 3       | Paragraph text                              |
| sc\*    | 2       | End Marker                                  |
| sc      | 2       | Character - Small Caps                      |
| teu     | 1       | TN TextEmphUline                            |
| +imp\*  | 1       | End Marker                                  |
| +imp    | 1       | TN Implied Text                             |
| x\*     | 1       | End Marker                                  |
| xo      | 1       | Cross Reference - Origin Reference          |
| x       | 1       | Cross Reference                             |
| add\*   | 1       | End Marker                                  |
| add     | 1       | Special Text - Translational Addition       |
| sl1Lord | 1       | Unknown                                     |
| tec     | 1       | Unknown                                     |
| xt      | 1       | Cross Reference - Target References         |
| teu\*   | 1       | End Marker                                  |

## Missing TND Markers

TND markers from the table above that are **not** listed in [implemented-markers-inventory.md](implemented-markers-inventory.md) for any Lexical node in `libs/shared/src/nodes/usj/`. Some may still be accepted at runtime (for example via the `z`-prefix extension namespace on `MilestoneNode`) but are not explicitly enumerated. End markers (`\*` suffix) are omitted — they share status with their start markers.

`+`-prefixed markers indicate USFM nested character markers; they are listed only when their base marker is also unimplemented (`+nd` is omitted because `nd` is implemented).

| Markers | #       | Style name                          |
| ------- | ------- | ----------------------------------- |
| brk     | 165_346 | TN Text Implied Bracket             |
| ml1     | 136_518 | TN Meaning Line L1                  |
| imp     | 83_209  | TN Implied Text                     |
| tbb     | 81_824  | TN Tab                              |
| mlor    | 70_062  | TN Display Or Para                  |
| sl1     | 66_490  | TN Source Line L1                   |
| rgm     | 20_006  | TN Raised Grammar Marker            |
| tei     | 12_652  | TN TextEmphItalic                   |
| +ver    | 12_585  | TN Special Blue                     |
| b3      | 8_710   | Extra Small Blank Line              |
| sbx     | 3_601   | TN Section Box Text                 |
| tr      | 2_160   | Table - Row                         |
| tc1     | 2_159   | Table - Column 1 Cell               |
| +rgi    | 1_547   | TN Raised Gram.Marker Implied       |
| sla     | 1_542   | TN Alt Source Line                  |
| mt9     | 1_046   | TN Title Page Notices               |
| rgi     | 883     | TN Raised Gram.Marker Implied       |
| ros     | 842     | TN Reordered Superscript            |
| be      | 667     | Bibliographic Entry                 |
| ntn     | 625     | Normal TN Paragraph                 |
| gn      | 458     | Grammar Notation                    |
| +brk    | 372     | TN Text Implied Bracket             |
| tc2     | 289     | Table - Column 2 Cell               |
| b2      | 168     | Small Blank Line                    |
| teb     | 152     | TN TextEmphBold                     |
| mt4n    | 141     | TN TitleCenterNormal NoSpace        |
| +rgm    | 138     | TN Raised Grammar Marker            |
| fig     | 100     | Auxiliary - Figure/Illustration/Map |
| mt8     | 78      | TN Title8CenterTimes16              |
| mt5     | 66      | TN Title5 Series Name               |
| mt10    | 65      | TN Reproduction Notice              |
| or      | 64      | TN -OR-                             |
| mt3n    | 59      | TN Y-Author NoSpace                 |
| pvr     | 26      | TN Verse Reordered Para             |
| pra     | 22      | TN Right Aligned Para               |
| mt6     | 6       | TN Revision Date                    |
| par     | 3       | Paragraph text                      |
| teu     | 1       | TN TextEmphUline                    |
| +imp    | 1       | TN Implied Text                     |
| sl1Lord | 1       | Unknown                             |
| tec     | 1       | Unknown                             |

### Unlisted

Missing markers whose stylesheet `\StyleType` maps to a Lexical node whose implementation matches the marker's intent — character-style inline spans (CharNode) or generic block paragraphs (ParaNode). These would render today via the warn-and-continue path; they just aren't enumerated in the node's `isValidMarker` list, so they emit a warning when encountered.

| Markers | #       | Style name                          | Node     |
| ------- | ------- | ----------------------------------- | -------- |
| brk     | 165_346 | TN Text Implied Bracket             | CharNode |
| ml1     | 136_518 | TN Meaning Line L1                  | ParaNode |
| imp     | 83_209  | TN Implied Text                     | CharNode |
| tbb     | 81_824  | TN Tab                              | CharNode |
| mlor    | 70_062  | TN Display Or Para                  | ParaNode |
| sl1     | 66_490  | TN Source Line L1                   | ParaNode |
| rgm     | 20_006  | TN Raised Grammar Marker            | CharNode |
| tei     | 12_652  | TN TextEmphItalic                   | CharNode |
| +ver    | 12_585  | TN Special Blue                     | CharNode |
| b3      | 8_710   | Extra Small Blank Line              | ParaNode |
| sbx     | 3_601   | TN Section Box Text                 | CharNode |
| +rgi    | 1_547   | TN Raised Gram.Marker Implied       | CharNode |
| sla     | 1_542   | TN Alt Source Line                  | ParaNode |
| mt9     | 1_046   | TN Title Page Notices               | ParaNode |
| rgi     | 883     | TN Raised Gram.Marker Implied       | CharNode |
| ros     | 842     | TN Reordered Superscript            | CharNode |
| be      | 667     | Bibliographic Entry                 | ParaNode |
| ntn     | 625     | Normal TN Paragraph                 | ParaNode |
| gn      | 458     | Grammar Notation                    | ParaNode |
| +brk    | 372     | TN Text Implied Bracket             | CharNode |
| b2      | 168     | Small Blank Line                    | ParaNode |
| teb     | 152     | TN TextEmphBold                     | CharNode |
| mt4n    | 141     | TN TitleCenterNormal NoSpace        | ParaNode |
| +rgm    | 138     | TN Raised Grammar Marker            | CharNode |
| fig     | 100     | Auxiliary - Figure/Illustration/Map | CharNode |
| mt8     | 78      | TN Title8CenterTimes16              | ParaNode |
| mt5     | 66      | TN Title5 Series Name               | ParaNode |
| mt10    | 65      | TN Reproduction Notice              | ParaNode |
| or      | 64      | TN -OR-                             | CharNode |
| mt3n    | 59      | TN Y-Author NoSpace                 | ParaNode |
| pvr     | 26      | TN Verse Reordered Para             | ParaNode |
| pra     | 22      | TN Right Aligned Para               | ParaNode |
| mt6     | 6       | TN Revision Date                    | ParaNode |
| par     | 3       | Paragraph text                      | CharNode |
| teu     | 1       | TN TextEmphUline                    | CharNode |
| +imp    | 1       | TN Implied Text                     | CharNode |

### Potentially unimplemented

Missing markers where the implementation likely doesn't render the marker's intent — table structure isn't implemented (tables render as bare spans/paragraphs, losing rows/columns), or no `\StyleType` could be resolved from the project's `custom.sty` or the default `usfm.sty`. These warrant investigation before assuming runtime support.

| Markers | #     | Style name            | Reason                          |
| ------- | ----- | --------------------- | ------------------------------- |
| tr      | 2_160 | Table - Row           | table structure not implemented |
| tc1     | 2_159 | Table - Column 1 Cell | table structure not implemented |
| tc2     | 289   | Table - Column 2 Cell | table structure not implemented |
| sl1Lord | 1     | Unknown               | not in stylesheet               |
| tec     | 1     | Unknown               | not in stylesheet               |

### Biggest gaps

- **Display-specific high-volume**: `brk` (165k), `ml1`/`mlor` (Meaning Line), `imp`, `tbb`, `sl1`/`sla` (Source Line), `rgm`/`rgi` (raised grammar markers), `tei`, `sbx`, `ros`
- **Tables**: `tr`, `tc1`/`tc2`
- **Stray oddballs**: `sl1Lord`, `tec` (Unknown styles — likely data anomalies worth flagging to whoever maintains the source data)
