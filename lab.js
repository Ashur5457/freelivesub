// 實驗：Gemini Nano（Chrome 內建 Prompt API，LanguageModel）能不能當翻譯引擎。
// 只是驗證用，不影響正式的翻譯流程；結果寫在側邊欄的除錯紀錄（log() 來自 panel.js）。
// 驗證完會移除或改成正式功能，所以這裡的文字先只寫繁中，沒有放進 i18n.js。
//   檢查：LanguageModel 有沒有、能不能輸出目標語言（不下載任何東西）
//   下載：按鈕本身寫明大小，按下就下載（需要「剛點過按鈕」，所以一定是使用者自己按）
//   比較：同一批句子用三條路線翻，並排記錄結果和時間（路線見 labRoutes）

const LAB_SAMPLES = [   // 沒有收藏時用的範例（來自先前實測時翻錯的句子）
  { src: '続きまして', before: [] },
  { src: 'はい以上です', before: [] },
  { src: '番組紹介しよっか', before: [] },
  { src: '投げ銭お願いします', before: [] },
  { src: 'そっから病院行くようになったんですよ', before: [{ src: '美容院とか行ってもいいよってお金をいただいて' }] },
];
const LAB_N = 5;
let labBusy = false;   // 比較進行中，再按一次不會重複跑

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

// 前文只給模型參考，要翻的只有 <line> 裡那一句（v0.10 實測：沒分清楚時 Nano 會把前文也翻進去）
const labPrompt = (to) => `You translate live speech-recognition subtitles into ${TSPrefs.targetName(to)} (${to}). ` +
  'Each message has optional <context> (earlier lines, for reference only, never translate them) and one <line> to translate. ' +
  'The text comes from automatic speech recognition and may contain misheard words; use the context to infer the intended meaning. ' +
  'Reply with the translation of <line> only: no quotes, no notes, no context.';
const labMessage = (m) => (m.before.length
  ? `<context>\n${m.before.map((x) => x.src).join('\n')}\n</context>\n<line>${m.src}</line>`
  : `<line>${m.src}</line>`);

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

// 先用宣告的輸出語言建立；不支援就退一步，不宣告輸出語言試試看
async function labSession(lang) {
  const init = { initialPrompts: [{ role: 'system', content: labPrompt(lang.to) }] };
  const declared = await LanguageModel.availability(labOpts(lang));
  if (declared !== 'unavailable') return LanguageModel.create({ ...labOpts(lang), ...init });
  log(`[實驗] 官方未宣告支援輸出 ${lang.to}，改用「不宣告輸出語言」模式測試（結果僅供參考）`);
  return LanguageModel.create({ ...labOpts(lang, false), ...init });
}

async function labTranslator(lang) {
  if (lang.from === lang.to) return null;
  const a = await Translator.availability({ sourceLanguage: lang.from, targetLanguage: lang.to });
  return a === 'available' ? Translator.create({ sourceLanguage: lang.from, targetLanguage: lang.to }) : null;
}

const labTime = async (fn) => {
  const t0 = performance.now();
  const out = await fn().catch((e) => `（失敗 ${e.message}）`);
  return `${out}（${Math.round(performance.now() - t0)} ms）`;
};

// 和正式字幕一樣：先切句子，每段分開翻再接回去（舊收藏沒有 raw，只能整句翻）
async function labSplitTranslate(translator, m, lang) {
  const parts = TSSplit.splitSentences(m.raw ?? m.src, lang.from);
  return TSSplit.joinParts(await Promise.all(parts.map((x) => translator.translate(x))), lang.to);
}

// 翻譯路線表：[名稱, (句子) => 譯文]。模型不能用的路線會被拿掉。
//   1. Translator（切句後）：目前正式字幕的做法（ja→zh-Hant 其實是 Chrome 自己經英文中轉）
//   2. Gemini Nano 直接翻成目標語言
//   3. Gemini Nano 先翻成英文（官方支援），再由 Translator 翻成目標語言（有專用的 en→目標 模型）
async function labRoutes(lang) {
  const viaEn = lang.to !== 'en' && lang.from !== 'en';
  const [direct, toEn, tr, enTr] = await Promise.all([
    labSession(lang),
    viaEn ? labSession({ ...lang, to: 'en' }) : null,
    labTranslator(lang),
    viaEn ? labTranslator({ from: 'en', to: lang.to }) : null,
  ]);
  const nano = (session) => async (m) => (await session.clone()).prompt(labMessage(m));
  return [
    ['Translator（切句後）', tr && ((m) => labSplitTranslate(tr, m, lang))],
    ['Gemini Nano 直接', nano(direct)],
    ['Nano→英文→Translator', toEn && enTr && (async (m) => enTr.translate(await nano(toEn)(m)))],
  ].filter(([, fn]) => fn);
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
  const picked = marks.length ? marks.slice(-LAB_N) : LAB_SAMPLES;
  log(`[實驗] 開始比較 ${picked.length} 句（${lang.from} → ${lang.to}）…`);
  const routes = await labRoutes(lang);
  log(`[實驗] 路線：${routes.map(([name]) => name).join('｜')}`);
  for (const m of picked) {
    const lines = [];
    for (const [name, fn] of routes) lines.push(`         ${name}：${await labTime(() => fn(m))}`);
    log(`[實驗] 原文：${m.src}\n${lines.join('\n')}`);
  }
  log('[實驗] 比較結束');
}

$('labCheck').onclick = guard(labCheck);
$('labDownload').onclick = guard(labDownload);
$('labCompare').onclick = guard(labCompare);
