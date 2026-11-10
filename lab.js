// 實驗：Gemini Nano（Chrome 內建 Prompt API，LanguageModel）怎麼用才翻得好。
// 只是驗證用，不影響正式的翻譯流程；結果寫在側邊欄的除錯紀錄（log() 來自 panel.js）。
// 驗證完會移除或改成正式功能，所以這裡的文字先只寫繁中，沒有放進 i18n.js。
//   檢查：LanguageModel 有沒有、能不能輸出目標語言（不下載任何東西）
//   下載：按鈕本身寫明大小，按下就下載（需要「剛點過按鈕」，所以一定是使用者自己按）
//   比較：同一批句子用幾條路線翻，並排記錄結果和時間（路線見 labRoutes）

// 內建測試句：連續的一段日文字幕。v0.12.0 實測時，品質優先把「前一句的內容」翻進了後面幾句短句。
const LAB_LINES = [
  '日本人の良くないところが出てる',
  'どっちかにしてあげてえ',
  'えご飯',
  'なんか私この前 X かなんかで三宅ちゃんとアフタヌーンティーってた写真が',
  '目に止まったというか見たから',
  'ご飯系の方がいいかなと大丈夫',
  'ご案件の方がいいかなと思って',
];
const LAB_N = 3;         // 另外加上最近幾句收藏
const LAB_CONTEXT = 2;   // 前文給幾句
let labBusy = false;     // 比較進行中，再按一次不會重複跑

const labLang = () => ({ from: TSPrefs.source(prefs.lang).tr, to: prefs.target });
// 宣告輸入、輸出語言；Chrome 會依此回答支不支援
const labOpts = ({ from, to }, declareOut = true) => ({
  expectedInputs: [{ type: 'text', languages: [from] }],
  ...(declareOut ? { expectedOutputs: [{ type: 'text', languages: [to] }] } : {}),
});

async function labCheck() {
  if (!('LanguageModel' in self)) return log('[實驗] 這個 Chrome 沒有 LanguageModel（Prompt API）');
  const lang = labLang();
  log(`[實驗] Gemini Nano（不指定語言）：${await LanguageModel.availability()}`);
  for (const to of [...new Set([lang.to, 'en', 'ja'])]) {
    const a = await LanguageModel.availability(labOpts({ ...lang, to })).catch((e) => `錯誤 ${e.message}`);
    log(`[實驗] ${lang.from} → ${to}：${a}`);
  }
  log('[實驗] available＝可以直接用、downloadable＝需要下載（約數 GB）、unavailable＝不支援');
}

const labMonitor = (m) => m.addEventListener('downloadprogress', (e) => {
  const p = Math.round(e.loaded * 100);
  if (p % 5 === 0) log(`[實驗] Gemini Nano 下載 ${p}%`);
});

async function labDownload() {
  if (!('LanguageModel' in self)) return log('[實驗] 這個 Chrome 沒有 LanguageModel（Prompt API）');
  const a = await LanguageModel.availability();
  log(`[實驗] 目前狀態：${a}`);
  if (a === 'available') return log('[實驗] Gemini Nano 已經下載好了，可以按「比較翻譯」');
  if (a === 'unavailable') return log('[實驗] 這台電腦的 Chrome 不能使用 Gemini Nano（硬體或設定不符合條件）');
  log('[實驗] 開始下載 Gemini Nano（約數 GB，可能要幾分鐘到幾十分鐘；可以繼續看影片，不要關掉這個側邊欄）…');
  const t0 = performance.now();
  const session = await LanguageModel.create({ monitor: labMonitor });
  session.destroy();
  log(`[實驗] Gemini Nano 下載完成（${Math.round((performance.now() - t0) / 1000)} 秒），可以按「比較翻譯」`);
}

// ---------- 給 Nano 的提示：兩種給前文的方式 ----------

// 舊（v0.12.0 引擎用的）：前文放在同一則訊息的 <context> 區塊，要求不要翻它。實測短句會被翻成前文的內容。
const labBlockPrompt = (to) => `You translate live speech-recognition subtitles into ${TSPrefs.targetName(to)} (${to}). ` +
  'Each message has optional <context> (earlier lines, for reference only, never translate them) and one <line> to translate. ' +
  'The text comes from automatic speech recognition and may contain misheard words; use the context to infer the intended meaning. ' +
  `Reply with the translation of <line> only: no quotes, no notes, no context.`;
const labBlockMessage = (src, before) => (before.length
  ? `<context>\n${before.join('\n')}\n</context>\n<line>${src}</line>`
  : `<line>${src}</line>`);

// 新：一則訊息就是一句字幕；前文做成「之前的問答」（原文 → 這條路線當時的回答），模型照樣子只回最新一句。
//   翻成英文時，英文之後還要給 Translator，所以要求用不會有歧義的字（番組 → program →「程式」）。
const labChatPrompt = (to) => `You translate live speech-recognition subtitles into ${TSPrefs.targetName(to)} (${to}). ` +
  'Each user message is one subtitle line; earlier turns are the lines just before it. ' +
  'The text comes from automatic speech recognition and may contain misheard words. ' +
  'Reply with the translation of the latest line only: no quotes, no notes.' +
  (to === 'en' ? " Your English will be machine-translated afterwards, so prefer specific, unambiguous words (for example 'TV show', not 'program')." : '');
const labTurns = (hist) => hist.flatMap((h) => [{ role: 'user', content: h.src }, { role: 'assistant', content: h.out }]);

// Chrome 有沒有宣告支援這個輸出語言；沒有就不宣告輸出語言試試看
async function labIo(lang) {
  const declared = await LanguageModel.availability(labOpts(lang)) !== 'unavailable';
  if (!declared) log(`[實驗] 官方未宣告支援輸出 ${lang.to}，改用「不宣告輸出語言」模式測試（結果僅供參考）`);
  return labOpts(lang, declared);
}

// 和引擎一樣：每次都挑最可能的答案；這個 Chrome 不接受這兩個參數就用預設值
async function labNano(io, system, turns = []) {
  const opts = { ...io, initialPrompts: [{ role: 'system', content: system }, ...turns] };
  try {
    return await LanguageModel.create({ ...opts, temperature: 0.1, topK: 1 });
  } catch {
    return LanguageModel.create(opts);
  }
}

async function labAsk(session, text) {
  try {
    return (await session.prompt(text)).trim();
  } finally {
    session.destroy();
  }
}

// 兩種問法：(句子, 這條路線前面幾句的問答 hist) => Nano 的回答
const labBlock = (io, system) => async (m, hist) =>
  labAsk(await labNano(io, system), labBlockMessage(m.src, hist.slice(-LAB_CONTEXT).map((h) => h.src)));
const labChat = (io, system, n) => async (m, hist) =>
  labAsk(await labNano(io, system, labTurns(n ? hist.slice(-n) : [])), m.src);

async function labTranslator(lang) {
  if (lang.from === lang.to) return null;
  const a = await Translator.availability({ sourceLanguage: lang.from, targetLanguage: lang.to });
  return a === 'available' ? Translator.create({ sourceLanguage: lang.from, targetLanguage: lang.to }) : null;
}

// 和正式字幕一樣：先切句子，每段分開翻再接回去（舊收藏沒有 raw，只能整句翻）
async function labSplitTranslate(translator, m, lang) {
  const parts = TSSplit.splitSentences(m.raw ?? m.src, lang.from);
  return TSSplit.joinParts(await Promise.all(parts.map((x) => translator.translate(x))), lang.to);
}

// 直接翻的結果要檢查：混進別種文字就不能用（簡體字使用者可以接受，不算問題）
const LAB_BAD = [['日文假名', /[ぁ-ゖァ-ヺ]/], ['俄文字母', /[Ѐ-ӿ]/]];
function labFlag(out) {
  const bad = LAB_BAD.filter(([, re]) => re.test(out)).map(([name]) => name);
  return bad.length ? `${out} ⚠ 含${bad.join('、')}（正式使用時會退回快速翻譯）` : out;
}

// 翻譯路線表：ask＝問出這條路線的答案（也是下一句的前文），post＝把答案變成畫面上的譯文。
// 模型不能用的路線會被拿掉。
//   1. 目前的快速翻譯（ja→zh-Hant 其實是 Chrome 自己經英文中轉）
//   2. v0.12.0 的品質優先，用來重現「把前文翻進來」的問題
//   3、4. Nano 先翻成英文，再由 Translator 翻成目標語言；差別是有沒有給前文
//   5、6. Nano 直接翻成目標語言（不經英文）；差別是有沒有給前文
async function labRoutes(lang) {
  const viaEn = lang.to !== 'en' && lang.from !== 'en';
  const en = { ...lang, to: 'en' };
  const [io, ioEn, tr, enTr] = await Promise.all([
    labIo(lang),
    viaEn ? labIo(en) : null,
    labTranslator(lang),
    viaEn ? labTranslator({ from: 'en', to: lang.to }) : null,
  ]);
  const same = (x) => x;
  const toTarget = (x) => enTr.translate(x);
  const enOk = ioEn && enTr;
  return [
    { name: '1 快速（Translator）', ask: tr && ((m) => labSplitTranslate(tr, m, lang)), post: same },
    { name: '2 舊品質（前文區塊→英文）', ask: enOk && labBlock(ioEn, labBlockPrompt('en')), post: toTarget },
    { name: '3 英文中轉・無前文', ask: enOk && labChat(ioEn, labChatPrompt('en'), 0), post: toTarget },
    { name: '4 英文中轉・問答前文', ask: enOk && labChat(ioEn, labChatPrompt('en'), LAB_CONTEXT), post: toTarget },
    { name: '5 直接翻・無前文', ask: labChat(io, labChatPrompt(lang.to), 0), post: labFlag },
    { name: '6 直接翻・問答前文', ask: labChat(io, labChatPrompt(lang.to), LAB_CONTEXT), post: labFlag },
  ].filter((r) => r.ask);
}

// 一組＝連續的幾句（前文要連續才有意義）；show 的句子才記到紀錄，其他只是用來當前文
const labGroups = (lang) => [
  ...(lang.from === 'ja' ? [LAB_LINES.map((src) => ({ src, show: true }))] : []),
  ...marks.slice(-LAB_N).map((m) => [...m.before.map((x) => ({ src: x.src })), { src: m.src, raw: m.raw, show: true }]),
];

// 跑一條路線的一句：答案記進 hist（給下一句當前文），回傳要顯示的文字
async function labRun(route, m, hist) {
  const t0 = performance.now();
  try {
    const out = await route.ask(m, hist);
    hist.push({ src: m.src, out });
    return `${await route.post(out)}（${Math.round(performance.now() - t0)} ms）`;
  } catch (e) {
    return `（失敗 ${e.message}）`;
  }
}

async function labRunGroup(routes, group) {
  const hists = routes.map(() => []);
  for (const m of group) {
    const lines = [];
    for (const [k, route] of routes.entries()) lines.push(`         ${route.name}：${await labRun(route, m, hists[k])}`);
    if (m.show) log(`[實驗] 原文：${m.src}\n${lines.join('\n')}`);
  }
}

async function labCompare() {
  if (labBusy) return log('[實驗] 比較進行中，請稍候');
  labBusy = true;
  try {
    await labCompareOnce();
  } finally {
    labBusy = false;
  }
}

async function labCompareOnce() {
  if (!('LanguageModel' in self)) return log('[實驗] 這個 Chrome 沒有 LanguageModel（Prompt API）');
  const lang = labLang();
  const a = await LanguageModel.availability();
  if (a === 'unavailable') return log('[實驗] 這台電腦的 Chrome 不能使用 Gemini Nano');
  if (a !== 'available') return log(`[實驗] Gemini Nano 還沒準備好（${a}），請先按「下載 Gemini Nano」`);
  const groups = labGroups(lang);
  if (!groups.length) return log('[實驗] 沒有可以比較的句子：內建測試句是日文，其他語言請先收藏幾句（⭐）');
  const routes = await labRoutes(lang);
  const total = groups.flat().length;
  log(`[實驗] 開始比較（${lang.from} → ${lang.to}）：${groups.flat().filter((m) => m.show).length} 句、${routes.length} 條路線，` +
    `大約要 ${Math.ceil(total * routes.length * 1.5 / 60)} 分鐘，結果會一句一句出現…`);
  for (const group of groups) await labRunGroup(routes, group);
  log('[實驗] 比較結束，請把上面 [實驗] 的紀錄整段貼回去');
}

$('labCheck').onclick = guard(labCheck);
$('labDownload').onclick = guard(labDownload);
$('labCompare').onclick = guard(labCompare);
