// 側邊欄：設定、準備模型、字幕紀錄、除錯紀錄。
// 辨識和翻譯都在背景引擎（offscreen.js），這裡只負責顯示和送指令，關掉也不影響字幕。

const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
const { SOURCES, TARGETS } = TSPrefs;
const $ = (id) => document.getElementById(id);
const { t } = TSI18n;

let prefs = { ...TSPrefs.DEFAULT };
let segs = [], showTrans = true;

const srOpts = (sr) => ({ langs: [sr], processLocally: true });

function appendLine(line) {
  $('log').textContent += `${line}\n`;
  $('log').scrollTop = 1e9;
}
const log = (msg) => appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);

const notStarted = () => log(t('log.notStarted'));
const toEngine = (cmd) => chrome.runtime.sendMessage({ to: 'engine', cmd })
  .then((ok) => ok || notStarted(), notStarted);
const errText = (e) => `${e?.name}: ${e?.message}`;

// ---------- 語言能不能用 ----------

// 每個語言能不能用不寫死，詢問這台電腦的 Chrome：
//   來源語言 → 有沒有本地語音模型；目標語言 → 從目前的來源語言翻過去有沒有翻譯模型
const MARK = { available: '✓', downloadable: '⬇', downloading: '⬇', unavailable: '✕', same: '＝' };
const safe = (fn) => Promise.resolve().then(fn).catch(() => 'unavailable');
const srAvail = (sr) => (typeof SR?.available === 'function' ? safe(() => SR.available(srOpts(sr))) : 'unknown');
const trAvail = (src, tgt) => {
  if (src === tgt) return 'same';   // 同一種語言：不用翻譯
  if (!('Translator' in self)) return 'unavailable';
  return safe(() => Translator.availability({ sourceLanguage: src, targetLanguage: tgt }));
};

// 回傳的兩個陣列和 SOURCES、TARGETS 一一對應
async function probe(srcTr) {
  const [src, dst] = await Promise.all([
    Promise.all(SOURCES.map((l) => srAvail(l.sr))),
    Promise.all(TARGETS.map((l) => trAvail(srcTr, l.tr))),
  ]);
  return { src, dst };
}

function markSelect(sel, avails) {
  [...sel.options].forEach((o, i) => {
    o.textContent = `${MARK[avails[i]] ?? ''} ${o.dataset.name}`.trim();
    o.disabled = avails[i] === 'unavailable';
  });
}

// 換來源語言時目標清單會變；連續換很快時，只採用最後一次的結果
let probing = 0;
async function markAvailability() {
  const my = ++probing;
  const r = await probe(TSPrefs.source(prefs.lang).tr);
  if (my !== probing) return null;
  markSelect($('langs').querySelector('[data-pref=lang]'), r.src);
  markSelect($('langs').querySelector('[data-pref=target]'), r.dst);
  return r;
}

function logGroups(title, list, avails, key) {
  const groups = {};
  list.forEach((l, i) => (groups[avails[i]] ??= []).push(l[key]));
  log(title);
  for (const [a, ls] of Object.entries(groups)) log(`  ${MARK[a] ?? ''} ${a}: ${ls.join(', ')}`);
}

async function check() {
  const has = (x) => t(x ? 'word.yes' : 'word.no');
  log(t('log.apis', { sr: has(SR), tr: has('Translator' in self) }));
  const r = await markAvailability();
  if (!r) return;
  const src = TSPrefs.source(prefs.lang);
  logGroups(t('log.srModels'), SOURCES, r.src, 'sr');
  logGroups(t('log.trModels', { name: src.name }), TARGETS, r.dst, 'tr');
}

// ---------- 模型狀態 ----------

const nanoIO = (from) => ({ expectedInputs: [{ type: 'text', languages: [from] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] });
const nanoAvail = (from) => ('LanguageModel' in self ? safe(() => LanguageModel.availability(nanoIO(from))) : 'unavailable');
const qualityOn = (src, same) => prefs.quality === 'quality' && !same && src.tr !== 'en';

// 目前的語言組合需要哪些模型：每一項附上「怎麼查它的狀態」
function neededModels() {
  const src = TSPrefs.source(prefs.lang);
  const same = src.tr === prefs.target;
  const to = TSPrefs.targetName(prefs.target);
  const list = [];
  if (prefs.local) list.push({ label: t('model.sr', { lang: `${src.name}（${src.sr}）` }), check: () => srAvail(src.sr) });
  if (!same) list.push({ label: t('model.tr', { pair: `${src.name} → ${to}` }), check: () => trAvail(src.tr, prefs.target) });
  if (qualityOn(src, same)) {
    list.push({ label: t('model.nano'), check: () => nanoAvail(src.tr) });
    if (prefs.target !== 'en') list.push({ label: t('model.enTr', { pair: `English → ${to}` }), check: () => trAvail('en', prefs.target) });
  }
  return list;
}

// 準備模型按鈕：下載中／有缺的／全部都有／有不支援的。全部都有時停用，避免一直按
const MISSING = new Set(['downloadable', 'downloading']);
let preparing = false;
function showPrepareButton(states) {
  const key = preparing ? 'btn.preparing'
    : states.some((s) => MISSING.has(s)) ? 'btn.downloadMissing'
      : states.includes('unavailable') ? 'btn.someUnsupported' : 'btn.allReady';
  $('prepareText').textContent = t(key);
  $('prepare').disabled = key !== 'btn.downloadMissing';
}

let modelsSeq = 0;
async function showModels() {
  const my = ++modelsSeq;
  const list = neededModels();
  const states = await Promise.all(list.map((m) => m.check()));
  if (my !== modelsSeq) return;   // 這段期間又換了設定，以最新的為準
  $('models').replaceChildren(...list.map((m, i) => {
    const li = document.createElement('li');
    li.dataset.state = states[i];
    li.innerHTML = `<span class="mk">${MARK[states[i]] ?? '?'}</span><span></span><span class="st"></span>`;
    li.children[1].textContent = m.label;
    li.children[2].textContent = t(`mstate.${states[i]}`);
    return li;
  }));
  showPrepareButton(states);
}

// ---------- 準備模型 ----------

function createTranslator(src, tgt) {
  const monitor = (m) => m.addEventListener('downloadprogress', (e) => {
    const p = Math.round(e.loaded * 100);
    if (p % 20 === 0) log(t('log.downloading', { pair: `${src}→${tgt}`, p }));
  });
  return Translator.create({ sourceLanguage: src, targetLanguage: tgt, monitor }).then(() => 'OK');
}

// 品質優先要的模型：Gemini Nano（來源 → 英文）、Translator（英文 → 目標）。和其他下載在同一次點擊裡發出。
function qualityJobs(from) {
  const nanoMonitor = (m) => m.addEventListener('downloadprogress', (e) => {
    const p = Math.round(e.loaded * 100);
    if (p % 10 === 0) log(t('log.downloadingModel', { name: 'Gemini Nano', p }));
  });
  const nano = 'LanguageModel' in self
    ? LanguageModel.create({ ...nanoIO(from), monitor: nanoMonitor }).then((s) => { s.destroy(); return 'OK'; })
    : Promise.reject(new Error(t('err.noNano')));
  const jobs = [['Gemini Nano', nano]];
  if (prefs.target !== 'en') jobs.push([t('job.tr', { pair: `en→${prefs.target}` }), createTranslator('en', prefs.target)]);
  return jobs;
}

// 下載都需要「剛點過按鈕」，背景引擎做不到，所以在這裡下載；下載好之後背景引擎就能直接使用。
// 只下載目前選的組合（語言組合太多，不可能全部預先下載）。
// 語音＋翻譯兩項必須在同一次點擊裡同時發出；每一項分開記錄成敗。
async function prepare() {
  if (preparing) return;
  preparing = true;
  showPrepareButton([]);
  try {
    await prepareOnce();
  } finally {
    preparing = false;
    showModels();
  }
}

async function prepareOnce() {
  const src = TSPrefs.source(prefs.lang);
  const same = src.tr === prefs.target;
  const jobs = [
    [t('job.tr', { pair: `${src.tr}→${prefs.target}` }),
     same ? Promise.resolve(t('job.notNeeded')) : createTranslator(src.tr, prefs.target)],
    [t('job.sr', { lang: src.sr }), prefs.local ? SR.install(srOpts(src.sr)) : Promise.resolve(t('job.skipCloud'))],
  ];
  if (qualityOn(src, same)) jobs.push(...qualityJobs(src.tr));
  const results = await Promise.allSettled(jobs.map(([, p]) => p));
  results.forEach((r, i) => log(`${jobs[i][0]}: ${
    r.status === 'fulfilled' ? r.value : t('job.failed', { err: errText(r.reason) })}`));
  markAvailability();
  // 都下載好了：請背景引擎重試，不用再點圖示（背景引擎還沒啟動也沒關係，不必提示）
  if (results.every((r) => r.status === 'fulfilled'))
    chrome.runtime.sendMessage({ to: 'engine', cmd: 'retry' }).catch(() => {});
}

// ---------- 畫面 ----------

function div(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}

// showTrans=false：來源和目標同一種語言，只顯示原文
function segView(s, i) {
  const el = div(s.final ? 'seg' : 'seg interim', '');
  el.classList.toggle('marked', markedSrc.has(s.src));
  el.append(div('src', s.src));
  if (showTrans) el.append(div(s.q ? 'trans q' : 'trans', s.trans || '…'));
  el.insertAdjacentHTML('beforeend',
    `<button class="star ghost" data-mark="${i}" title="${t('mark.add')}">${TSIcons.icon('star', 16)}</button>`);
  return el;
}

// ---------- 收藏的句子 ----------

let marks = [], markedSrc = new Set(), lastTitle = '', lastUrl = '';

// 一個動作按鈕或連結（外部網站的連結會在提示文字註明「會把這句送到該網站」）
const actBtn = (act, id, iconName, key) =>
  `<button data-mact="${act}" data-id="${id}">${TSIcons.icon(iconName, 12)}${t(key)}</button>`;
const actLink = (href, iconName, key, hint = '') =>
  `<a href="${href}" target="_blank" rel="noopener" ${hint ? `title="${t(hint)}"` : ''}>${TSIcons.icon(iconName, 12)}${t(key)}</a>`;

function markView(m) {
  const el = div('mark', '');
  const when = new Date(m.at).toLocaleString();
  const at = m.videoTime != null ? `　⏱ ${TSMarks.clock(m.videoTime)}` : '';
  el.append(div('meta', `${when}${at}${m.title ? `　${m.title}` : ''}`), div('src', m.src), div('trans', m.trans || ''));
  const link = TSMarks.videoLink(m);
  el.insertAdjacentHTML('beforeend', `<div class="acts">${[
    actLink(TSMarks.google(m), 'external', 'mark.google', 'mark.externalHint'),
    actLink(TSMarks.deepl(m), 'external', 'mark.deepl', 'mark.externalHint'),
    actBtn('prompt', m.id, 'copy', 'mark.copyPrompt'),
    link ? actLink(link, 'play', 'mark.openVideo') : '',
    `<button class="del" data-mact="remove" data-id="${m.id}" title="${t('mark.delete')}">${TSIcons.icon('clear', 12)}</button>`,
  ].join('')}</div>`);
  return el;
}

function showMarks(list) {
  marks = list;
  markedSrc = new Set(list.map((m) => m.src));
  const views = [...list].reverse().map(markView);   // 新的在上
  $('marks').replaceChildren(...(views.length ? views : [div('empty-note', t('mark.empty'))]));
  $('subs').replaceChildren(...segs.map(segView).reverse());   // 字幕紀錄的 ⭐ 也跟著更新
}

async function markSeg(i) {
  const s = TSPrefs.source(prefs.lang);
  await TSMarks.add(TSMarks.build(segs, i, { title: lastTitle, url: lastUrl, from: s.tr, to: prefs.target }));
  log(t('mark.saved'));
}

const MARK_ACTS = {
  prompt: async (m) => {
    await navigator.clipboard.writeText(TSMarks.prompt(m));
    log(t('mark.promptCopied'));
  },
  remove: (m) => TSMarks.remove(m.id),
};

function exportMarks() {
  const blob = new Blob([TSMarks.exportMarkdown(marks)], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `freelivesub-marks-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function clearMarks() {
  if (marks.length && confirm(t('mark.confirmClear', { n: marks.length }))) await TSMarks.clear();
}

const RUNNING = new Set(['connecting', 'listening']);

// 狀態卡：上面是狀態，下面是目前擷取的分頁（出錯時改顯示錯誤原因）。
// 文字標上 data-i18n key，換介面語言時會跟著換。
function showStatus(status, sub, subKey) {
  $('statusCard').dataset.status = status;
  $('status').dataset.i18n = `state.${status}`;
  if (subKey) $('statusSub').dataset.i18n = subKey;
  else delete $('statusSub').dataset.i18n;
  $('statusSub').textContent = sub;
  $('toggle').innerHTML = TSIcons.icon(RUNNING.has(status) ? 'pause' : 'play', 16);
  TSI18n.apply(document);
}

function render(m) {
  $('mode').dataset.i18n = `using.${m.mode ?? 'fast'}`;   // 標上 key，換介面語言時會跟著換
  showStatus(m.status, m.status === 'error' ? m.reason : m.title || '');
  lastTitle = m.title || '';
  lastUrl = m.url || '';
  segs = m.segs;
  showTrans = m.translate;
  $('subs').replaceChildren(...segs.map(segView).reverse());   // 新的在上
}

async function copyAll() {
  const done = segs.filter((s) => s.final);
  const text = (s) => (showTrans ? `${s.src}\n${s.trans}` : s.src);
  await navigator.clipboard.writeText(done.map(text).join('\n\n'));
  log(t('log.copied', { n: done.length }));
}

// ---------- 接線 ----------

const guard = (fn) => async () => {
  try { await fn(); } catch (e) { log(t('log.errorGeneric', { err: errText(e) })); }
};
$('check').onclick = guard(check);
$('prepare').onclick = guard(prepare);
$('toggle').onclick = () => toEngine('toggle');
$('stop').onclick = () => toEngine('stop');
$('copy').onclick = guard(copyAll);
$('clear').onclick = () => toEngine('clear');
$('exportMarks').onclick = exportMarks;
$('clearMarks').onclick = guard(clearMarks);
// 字幕紀錄的 ⭐：按下就收藏，不等放開（字幕重畫時按鈕會被換掉，click 常常不會觸發）
document.addEventListener('pointerdown', (e) => {
  const star = e.target.closest('button[data-mark]');
  if (!star || e.button !== 0) return;
  e.preventDefault();
  guard(() => markSeg(Number(star.dataset.mark)))();
});
// 收藏卡片上的按鈕：看按鈕上的 data-* 決定做什麼
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b?.dataset.mact) guard(() => MARK_ACTS[b.dataset.mact](marks.find((m) => m.id === b.dataset.id)))();
});
TSMarks.list().then(showMarks);
TSMarks.watch(showMarks);

// 按鈕和標題的圖示（data-icon="名稱"），放在文字前面
document.querySelectorAll('[data-icon]').forEach((el) => {
  el.insertAdjacentHTML('afterbegin', TSIcons.icon(el.dataset.icon, 16));
});
// 右上角的介面語言選單：「自動」要翻譯，其他語言名稱用各自的寫法
$('uiLang').innerHTML = TSI18n.UI_OPTIONS.map(([v, name]) => (name
  ? `<option value="${v}">${name}</option>`
  : `<option value="${v}" data-i18n="opt.auto"></option>`)).join('');

const formCss = document.createElement('style');
formCss.textContent = TSPrefs.FORM_CSS + TSPrefs.HELP_CSS;
document.head.append(formCss);
$('form').innerHTML = TSPrefs.FORM_HTML;
$('help').innerHTML = TSPrefs.HELP_HTML;
$('langs').innerHTML = TSPrefs.LANG_SELECTS;
TSPrefs.bind(document);

// 主題顏色：系統是深色模式就用主題的深色組，否則用淺色組；系統切換時跟著換
const darkMode = matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => TSPrefs.paint(document.documentElement, TSPrefs.themeVars(prefs, darkMode.matches ? 'deep' : 'pale'));
darkMode.addEventListener('change', applyTheme);

// 來源語言變了，能翻成哪些目標語言也會變，重新詢問 Chrome；介面語言變了就把畫面上的字全部換掉
const applyPrefs = (p) => {
  const srcChanged = p.lang !== prefs.lang;
  prefs = p;
  applyTheme();
  document.documentElement.lang = TSI18n.use(p.uiLang);
  TSI18n.apply(document);
  TSPrefs.show(document, p);
  showMarks(marks);   // 收藏卡片的按鈕文字也換成新的介面語言
  showModels();       // 語言、翻譯品質、本地辨識變了，需要的模型也會變
  if (srcChanged) markAvailability();
};
TSPrefs.watch(applyPrefs);
applyTheme();   // 先用預設主題畫出來，讀到存檔後再更新
TSPrefs.load().then((p) => {
  applyPrefs(p);
  markAvailability();
});

chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'render') render(m);
  if (m.type === 'log') appendLine(m.line);
});

// 側邊欄晚打開也沒關係：先向背景引擎要目前的字幕、狀態和過去的紀錄。
// 背景引擎還沒啟動時，狀態列顯示「未啟動」，紀錄提示要點圖示。
function engineOff() {
  $('mode').dataset.i18n = 'using.off';
  showStatus('off', '', 'panel.howto');
  notStarted();
}
chrome.runtime.sendMessage({ to: 'engine', cmd: 'sync' })
  .then((s) => {
    if (!s) return engineOff();
    s.logs.forEach(appendLine);
    render(s);
  })
  .catch(engineOff);
