// 背景引擎（offscreen document，看不見的頁面）：擷取分頁聲音 → 語音辨識 → 翻譯 → 字幕資料。
// 不需要側邊欄開著。背景頁面只能用 chrome.runtime 傳話：
//   收 { to:'engine', cmd }：sw.js（capture、release、prefs、log）、側邊欄和懸浮框（toggle、stop、sync）
//   送 { type:'render', tabId, … }：sw.js 轉給網頁的懸浮框；側邊欄也直接收到
//   送 { type:'log', line }：側邊欄的除錯紀錄
//
// 全系統只有一種資料：segment = { id, src, raw, trans, final, seq }
//   id     「第幾輪:第幾句」。辨識器每次重啟，句子編號會從 0 重算，所以加上輪數
//   raw    辨識器原始輸出（詞之間有空格），只用來切句子；畫面顯示 src
//   trans  譯文（目標語言由設定決定；來源和目標相同時不翻譯）
//   q      trans 是不是品質優先重翻過的（畫面上標 ✨）
//   final  辨識器判定這句講完了沒。正在講的那句也是 segment，只是 final=false
//   seq    翻譯流水號。結果回來時號碼已不是最新，就丟掉（避免舊翻譯蓋掉新翻譯）

const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
const FATAL = new Set(['not-allowed', 'audio-capture', 'language-not-supported',
                       'service-not-allowed', 'aborted']);
const SPEED_MS = { realtime: 250, fast: 500, normal: 1000, slow: 2000, final: null };
const HISTORY_N = 50, LOG_N = 300;

let prefs = { ...TSPrefs.DEFAULT };   // 由 sw.js 送來最新的設定
const { t } = TSI18n;                 // 狀態、錯誤、紀錄的文字都查 i18n.js

// 換設定時，介面語言也跟著換
function usePrefs(p) {
  prefs = p;
  TSI18n.use(p.uiLang);
}
const translators = {};               // 「來源>目標」→ 已建立的 Translator
let rec = null, track = null, ctx = null, tabId = null, tabTitle = '', tabUrl = '';
let running = false;                  // 要不要辨識（暫停時為 false，但聲音軌保留）
let state = { status: 'idle', reason: '' };
let segs = [], gen = 0, seqNo = 0;
const logs = [];

// 語言都查 prefs.js 的語言表：prefs.lang 是辨識用代碼（ja-JP），prefs.target 是翻譯目標（zh-Hant）
const srcTr = () => TSPrefs.source(prefs.lang).tr;
const sameLang = () => srcTr() === prefs.target;   // 來源和目標同一種語言：不翻譯，只顯示原文
const pairKey = () => `${srcTr()}>${prefs.target}`;
const pairLabel = () => `${TSPrefs.source(prefs.lang).name} → ${TSPrefs.targetName(prefs.target)}`;
const srOpts = (l) => ({ langs: [l], processLocally: true });
const trOpts = () => ({ sourceLanguage: srcTr(), targetLanguage: prefs.target });

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.push(line);
  if (logs.length > LOG_N) logs.shift();
  chrome.runtime.sendMessage({ type: 'log', line }).catch(() => {});
}

// ---------- 文字與 segment ----------

// 刪空格、切句子、接回譯文都在共用的 split.js（側邊欄的實驗工具也用同一套）
const { tidy, splitSentences, joinParts } = TSSplit;

function upsert(id, src, raw, final) {
  let s = segs.find((x) => x.id === id);
  if (!s) {
    s = { id, src, raw, trans: '', final, seq: 0 };
    segs = [...segs, s].slice(-HISTORY_N);
  }
  s.src = src;
  s.raw = raw;
  s.final = final;
  return s;
}

// 沒定稿的句子只能是「這次辨識結果裡還沒定稿的那幾句」，
// 其他沒定稿的都是被辨識器收回的殘骸，刪掉。
function prune(results) {
  const live = new Set();
  for (let i = 0; i < results.length; i++)
    if (!results[i].isFinal) live.add(`${gen}:${i}`);
  segs = segs.filter((s) => s.final || live.has(s.id));
}

// ---------- 翻譯 ----------

// 講完的句子 → 每一段的原文和快速翻譯。品質重翻照這些段落一段一段翻，某段沒翻好就沿用它的快速翻譯。
const fastParts = new WeakMap();

async function translate(s) {
  const translator = translators[pairKey()];
  if (!translator) return;   // 來源和目標相同（不翻譯），或模型還沒準備好
  const my = (s.seq = ++seqNo);
  const parts = splitSentences(s.raw, srcTr());
  const outs = await Promise.all(parts.map((p) => translator.translate(p)));
  if (s.seq !== my) return;   // 這段期間又送出了更新的翻譯，這個結果作廢
  s.trans = joinParts(outs, prefs.target);
  s.q = false;
  if (s.final) fastParts.set(s, parts.map((src, k) => ({ src, fast: outs[k] })));
  if (s.final && parts.length > 1) log(t('log.split', { n: parts.length, parts: parts.join(' / ') }));
  render();
  if (s.final) enqueueQuality(s);
}
const errText = (e) => `${e.name}: ${e.message}`;
const translateLogged = (s) => translate(s).catch((e) => log(t('log.translateError', { err: errText(e) })));

// 正在講的句子最多每 SPEED_MS 翻一次。計時器到了才拿「當下最新」的文字去翻，
// 所以最後一次更新不會漏；句子已定稿就不必翻（定稿時已經立刻翻過）。
let interimSeg = null, interimTimer = null, lastInterimAt = 0;

function translateInterim(s) {
  const ms = SPEED_MS[prefs.speed];
  if (ms == null) return;   // 「只顯示講完的句子」：還沒講完的不翻
  interimSeg = s;
  if (interimTimer) return;
  const wait = Math.max(0, lastInterimAt + ms - performance.now());
  interimTimer = setTimeout(() => {
    interimTimer = null;
    lastInterimAt = performance.now();
    if (!interimSeg.final) translateLogged(interimSeg);
  }, wait);
}

// ---------- 品質優先：講完的句子再用 Gemini Nano 重翻 ----------

// 先顯示快速翻譯，品質翻譯好了再換掉；一次只翻一句，排隊最多 QUALITY_BACKLOG 句、新的先翻，
// 跟不上時舊句子就保留快速翻譯。Nano 不能用時在紀錄寫明原因，這個語言組合就只用快速翻譯。
// 路線（v0.12.1 用側邊欄實驗比較六種翻法後決定）：
//   目標是中文、英文（TSPrefs.qualityDirect）：Nano 直接翻成目標語言。不經英文，就沒有
//     「ご飯 → rice → 稻」「作ってくれた → made it → 成功了」這類中轉錯誤；有時輸出簡體字（使用者可接受）。
//   其他目標語言（沒有實測資料）：Nano 翻成英文 → Translator 翻成目標語言（有專用模型）。
// 不給前文，兩種給法都試過、都有害：
//   v0.12.0 放在同一則訊息的 <context> 區塊：短句被翻成前一句的內容。
//   v0.12.2 做成之前的問答：短句照抄上一句的句型（あインスタ →「我聽到了，這是 Instagram」），也沒看到前文幫上忙的例子。
// 長句：照快速翻譯切好的段落（fastParts）一段一段翻再接回去。整句交給 Nano 會被濃縮（400 字變兩句），
//   也容易沒翻完。段數太多（超過 QUALITY_MAX_PARTS）就不重翻，免得一句占住好幾秒。
// 檢查：某一段的回答混進假名或俄文字母（沒翻完）→ 那一段沿用快速翻譯；整句比快速翻譯短太多（不到 6 成）→ 不換。
//   「比快速翻譯長太多就不換」試過（v0.12.1），實際擋掉的都是比較完整的重翻，已拿掉。
const QUALITY_BACKLOG = 3;
const QUALITY_MAX_PARTS = 6;
const QUALITY_MIN_RATIO = 0.6;
// Nano 的回答只會是中文或英文，出現平假名、片假名、俄文字母就是沒翻完或亂掉
const FOREIGN = /[ぁ-ゖァ-ヺЀ-ӿ]/;
// 提示和側邊欄實驗的「無前文」路線一字不差（小模型對措辭敏感，改字要重新實測）
const nanoPrompt = (to) => `You translate live speech-recognition subtitles into ${TSPrefs.targetName(to)} (${to}). ` +
  'Each user message is one subtitle line; earlier turns are the lines just before it. ' +
  'The text comes from automatic speech recognition and may contain misheard words. ' +
  'Reply with the translation of the latest line only: no quotes, no notes.' +
  (to === 'en' ? " Your English will be machine-translated afterwards, so prefer specific, unambiguous words (for example 'TV show', not 'program')." : '');

const quality = { key: '', session: null, enTr: null, blocked: '', busy: false, queue: [] };
const qualityKey = () => `${srcTr()}>${prefs.target}`;
// 來源是英文時本來就只有一步，品質優先沒有幫助
const qualityWanted = () => prefs.quality === 'quality' && !sameLang() && srcTr() !== 'en' && quality.blocked !== qualityKey();
const nanoOut = () => (TSPrefs.qualityDirect(prefs.target) ? prefs.target : 'en');   // Nano 要輸出的語言

// 翻譯不需要創意：每次都挑最可能的答案（topK 1），結果穩定、也比較不會自己加戲。
// 萬一這個 Chrome 不接受這兩個參數，就用預設值建立。
async function createNano(opts) {
  try {
    return await LanguageModel.create({ ...opts, temperature: 0.1, topK: 1 });
  } catch {
    return LanguageModel.create(opts);
  }
}

// 宣告輸入、輸出語言。官方沒宣告支援的輸出語言（例如中文）就不宣告，實測照樣能用。
async function nanoIO(out) {
  const input = { expectedInputs: [{ type: 'text', languages: [srcTr()] }] };
  const declared = { ...input, expectedOutputs: [{ type: 'text', languages: [out] }] };
  const known = await LanguageModel.availability(declared).catch(() => 'unavailable');
  const io = known === 'unavailable' ? input : declared;
  const state = await LanguageModel.availability(io);
  if (state !== 'available') throw new Error(t('err.nanoState', { state, hint: t('err.hint') }));
  return io;
}

async function ensureQuality() {
  if (quality.key === qualityKey() && quality.session) return;
  quality.session?.destroy();
  Object.assign(quality, { key: '', session: null, enTr: null });
  if (!('LanguageModel' in self)) throw new Error(t('err.noNano'));
  const out = nanoOut();
  const io = await nanoIO(out);
  if (out !== prefs.target) {
    const tr = { sourceLanguage: 'en', targetLanguage: prefs.target };
    const a = await Translator.availability(tr);
    if (a !== 'available') throw new Error(t('err.trModel', { pair: `English → ${TSPrefs.targetName(prefs.target)}`, state: a, hint: t('err.hint') }));
    quality.enTr = await Translator.create(tr);
  }
  quality.session = await createNano({ ...io, initialPrompts: [{ role: 'system', content: nanoPrompt(out) }] });
  quality.key = qualityKey();
  log(t('log.qualityOn', { pair: pairLabel(), route: quality.enTr ? 'Gemini Nano → English → Translator' : 'Gemini Nano' }));
  render();   // 側邊欄的「目前使用」改成品質優先
}

// 目前實際用哪種翻譯（側邊欄「目前使用」顯示這個，不是看設定猜）
function engineMode() {
  if (prefs.quality !== 'quality' || sameLang() || srcTr() === 'en') return 'fast';
  if (quality.blocked === qualityKey()) return 'blocked';
  return quality.key === qualityKey() && quality.session ? 'quality' : 'qualityPending';
}

function enqueueQuality(s) {
  const n = fastParts.get(s)?.length ?? 0;
  if (!qualityWanted() || !n || n > QUALITY_MAX_PARTS) return;
  quality.queue.push(s);
  quality.queue.splice(0, Math.max(0, quality.queue.length - QUALITY_BACKLOG));   // 跟不上：丟掉最舊的
  runQuality();
}

async function runQuality() {
  if (quality.busy) return;
  quality.busy = true;
  try {
    while (quality.queue.length && qualityWanted()) await improve(quality.queue.pop());   // 新的先翻
  } finally {
    quality.busy = false;
  }
}

// 每一段都從只有系統提示的對話複製一份來問，各段互不影響
async function askNano(src) {
  const session = await quality.session.clone();
  try {
    return (await session.prompt(src)).trim();
  } finally {
    session.destroy();
  }
}

// 重翻一段；沒翻好回傳 null（呼叫的人會沿用這一段的快速翻譯）
async function improvePart(p) {
  const raw = await askNano(p.src);
  if (!raw) return null;
  if (!FOREIGN.test(raw)) return quality.enTr ? quality.enTr.translate(raw) : raw;
  log(t('log.qualityForeign', { src: p.src, out: raw }));
  return null;
}

async function improve(s) {
  try {
    await ensureQuality();
  } catch (e) {
    quality.blocked = qualityKey();   // 這個語言組合不能用，換設定前不再重試
    quality.queue = [];
    log(t('log.qualityOff', { reason: e.message }));
    return render();
  }
  if (!segs.includes(s)) return;   // 已經被清掉了
  const parts = fastParts.get(s), my = s.seq, outs = [];
  try {
    for (const p of parts) {
      outs.push(await improvePart(p));
      if (s.seq !== my) return;   // 這段期間翻譯被更新了（例如換了目標語言），作廢
    }
    if (outs.every((o) => o === null)) return;   // 沒有一段翻好，保留快速翻譯
    const out = joinParts(outs.map((o, k) => o ?? parts[k].fast), prefs.target);
    if (out.length < s.trans.length * QUALITY_MIN_RATIO) return log(t('log.qualityShort', { src: s.src }));
    s.trans = out;
    s.q = true;
    render();
  } catch (e) {
    log(t('log.qualityFail', { err: errText(e) }));
  }
}

// ---------- 狀態與輸出 ----------

function setState(status, reason = '') {
  state = { status, reason };
  if (status === 'error') log(t('log.error', { reason }));
  render();
}

const label = () =>
  `${t(`status.${state.status}`)}・${pairLabel()}${state.reason ? `｜${state.reason}` : ''}`;
const visible = () => (prefs.speed === 'final' ? segs.filter((s) => s.final) : segs);
const snapshot = () => ({
  tabId, title: tabTitle, url: tabUrl, status: state.status, reason: state.reason, label: label(),
  translate: !sameLang(), mode: engineMode(), segs: visible(),
});

function render() {
  chrome.runtime.sendMessage({ type: 'render', ...snapshot() }).catch(() => {});
}

// ---------- 模型 ----------

// 背景頁面沒有「剛點過按鈕」，不能下載模型，只能使用已下載好的。
async function ensureModels() {
  const hint = t('err.hint');
  if (!sameLang() && !translators[pairKey()]) {
    const state = await Translator.availability(trOpts());
    if (state !== 'available') throw new Error(t('err.trModel', { pair: pairLabel(), state, hint }));
    translators[pairKey()] = await Translator.create(trOpts());
  }
  if (!prefs.local || typeof SR.available !== 'function') return;
  const state = await SR.available(srOpts(prefs.lang));
  if (state !== 'available') throw new Error(t('err.srModel', { lang: TSPrefs.source(prefs.lang).name, state, hint }));
}

// ---------- 擷取分頁聲音 ----------

// 放掉目前的聲音軌，同一個分頁才能再被擷取一次
function release() {
  halt('idle');
  track?.stop();
  track = null;
}

async function capture(m) {
  if (m.prefs) usePrefs(m.prefs);
  release();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: m.streamId } },
  });
  // 擷取後分頁會被靜音，在背景頁面把聲音播回去
  ctx ??= new AudioContext();
  ctx.createMediaStreamSource(stream).connect(ctx.destination);
  track = stream.getAudioTracks()[0];
  track.onended = () => halt('error', t('err.trackEnded'));
  if (m.tabId !== tabId) segs = [];   // 換到另一個分頁（通常是另一部影片）：舊字幕清掉
  tabId = m.tabId;
  tabTitle = m.title;
  tabUrl = m.url ?? '';
  log(t('log.captured', { title: m.title, state: ctx.state }));
  await start();
}

// ---------- 語音辨識 ----------

function makeRecognizer() {
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.processLocally = prefs.local;
  r.onstart = () => { if (r === rec && running) setState('listening'); };
  r.onresult = onResult;
  r.onerror = (e) => {
    if (r !== rec || !running) return;   // 是我們自己關掉的（暫停、停止、換分頁），不算錯誤
    log(t('log.srError', { err: e.error }));
    if (FATAL.has(e.error)) halt('error', t('err.sr', { err: e.error }));
  };
  r.onend = () => {
    if (r !== rec) return;
    prune([]);
    if (running) listen();   // 辨識會自己停（或因切換語言被停），自動接回
  };
  return r;
}

// 每次（重新）開始辨識都是新的一輪，句子編號從 0 重算。
function listen() {
  gen++;
  setState('connecting');
  rec.lang = prefs.lang;
  try {
    rec.start(track);
  } catch (e) {
    halt('error', t('err.srStart', { err: errText(e) }));
  }
}

function onResult(e) {
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const r = e.results[i];
    const raw = r[0].transcript;
    const src = tidy(raw, srcTr());
    if (!src) continue;
    const s = upsert(`${gen}:${i}`, src, raw, r.isFinal);
    r.isFinal ? translateLogged(s) : translateInterim(s);
  }
  prune(e.results);
  render();
}

// ---------- 控制 ----------

function halt(status, reason) {
  running = false;
  rec?.stop();
  setState(status, reason);
}

async function start() {
  if (running) return;
  if (track?.readyState !== 'live') return setState('error', t('err.noAudio'));
  try {
    await ensureModels();
  } catch (e) {
    return setState('error', e.message);
  }
  ctx.resume();
  rec = makeRecognizer();
  running = true;
  listen();
  log(t('log.start', { pair: pairLabel(), mode: t(prefs.local ? 'mode.local' : 'mode.cloud') }));
}

function pause() {
  if (!running) return;
  halt('paused');
  log(t('log.paused'));
}

const toggle = () => (running ? pause() : start());

function stop() {
  release();
  log(t('log.stopped'));
}

// 側邊欄「準備模型」下載完之後：如果正在擷取聲音卻停在錯誤（例如模型未下載），直接重新開始
function retry() {
  if (track?.readyState === 'live' && !running) start();
}

function clear() {
  segs = [];
  log(t('log.cleared'));
  render();
}

// 已有的字幕改翻成新的目標語言（都在本機，幾十句也很快）
function retranslate() {
  segs.forEach((s) => { s.trans = ''; s.q = false; });
  segs.filter((s) => s.final).forEach(translateLogged);
}

async function setPrefs(p) {
  const old = prefs;
  usePrefs(p);
  if (p.quality !== old.quality) quality.blocked = '';   // 重新切到品質優先時，再試一次 Gemini Nano
  // 更新速度、介面語言等設定：下一次翻譯就會套用，重畫一次讓狀態列換成新語言
  if (p.lang === old.lang && p.target === old.target) return render();
  log(t('log.switchLang', { pair: pairLabel() }));
  if (!running) return render();
  try {
    await ensureModels();
  } catch (e) {
    return halt('error', e.message);
  }
  if (p.target !== old.target) retranslate();
  if (p.lang !== old.lang) rec.stop();   // onend 會用新的辨識語言自動接回
  render();
}

// ---------- 接線 ----------

const COMMANDS = {
  capture, start, toggle, stop, clear, retry,
  prefs: (m) => setPrefs(m.prefs),
  log: (m) => log(m.msg),
};

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.to !== 'engine') return;
  if (m.cmd === 'sync') return reply({ ...snapshot(), logs });   // 側邊欄剛打開時要目前的狀態
  if (m.cmd === 'release') {   // 放掉後才回覆，sw.js 再去拿新通行證
    release();
    return reply(true);
  }
  Promise.resolve()
    .then(() => COMMANDS[m.cmd]?.(m))
    .catch((e) => log(t('log.errorGeneric', { err: errText(e) })));
  reply(true);   // 回覆「收到」，側邊欄才知道背景引擎在跑
});

log(t('log.engineStarted'));
