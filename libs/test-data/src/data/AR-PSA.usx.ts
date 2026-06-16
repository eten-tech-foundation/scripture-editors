/**
 * Arabic Psalm 1 (Smith-Van Dyke translation) — used to exercise RTL rendering
 * with genuine RTL content so Lexical's `dir="auto"` resolves to RTL.
 * Verses are split across q1/q2 paragraphs mirroring the WEB test data
 * structure so the gutter/indent codepaths are exercised identically.
 */
export const AR_PSA_CH1_USX = `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="PSA" style="id">Smith-Van Dyke (AR)</book>
  <para style="ide">UTF-8</para>
  <para style="h">مزامير</para>
  <para style="toc1">المزامير</para>
  <para style="toc2">مزامير</para>
  <para style="toc3">مز</para>
  <para style="mt1">المزامير</para>
  <para style="cl">مزمور</para>
  <chapter number="1" style="c" sid="PSA 1" />
  <para style="ms1">الكتاب الأول</para>
  <para style="q1">
    <verse number="1" style="v" sid="PSA 1:1" />طوبى للرجل الذي لم يسلك في مشورة الاشرار،</para>
  <para style="q2" vid="PSA 1:1">وفي طريق الخطاة لم يقف،</para>
  <para style="q2" vid="PSA 1:1">وفي مجلس المستهزئين لم يجلس.<verse eid="PSA 1:1" /></para>
  <para style="q1">
    <verse number="2" style="v" sid="PSA 1:2" />لكن في ناموس الرب مسرّته،</para>
  <para style="q2" vid="PSA 1:2">وفي ناموسه يلهج نهارا وليلا.<verse eid="PSA 1:2" /></para>
  <para style="q1">
    <verse number="3" style="v" sid="PSA 1:3" />فيكون كشجرة مغروسة عند مجاري المياه،</para>
  <para style="q2" vid="PSA 1:3">التي تعطي ثمرها في اوانه،</para>
  <para style="q2" vid="PSA 1:3">وورقها لا يذبل.</para>
  <para style="q2" vid="PSA 1:3">وكل ما يصنعه ينجح.<verse eid="PSA 1:3" /></para>
  <para style="q1">
    <verse number="4" style="v" sid="PSA 1:4" />ليس كذلك الاشرار،</para>
  <para style="q2" vid="PSA 1:4">لكنهم كالعصافة التي تذريها الريح.<verse eid="PSA 1:4" /></para>
  <para style="q1">
    <verse number="5" style="v" sid="PSA 1:5" />لذلك لا تقوم الاشرار في الدين،</para>
  <para style="q2" vid="PSA 1:5">ولا الخطاة في جماعة الابرار.<verse eid="PSA 1:5" /></para>
  <para style="q1">
    <verse number="6" style="v" sid="PSA 1:6" />لان الرب يعلم طريق الابرار،</para>
  <para style="q2" vid="PSA 1:6">اما طريق الاشرار فتهلك.<verse eid="PSA 1:6" /></para>
</usx>`;
