// 收藏（有疑義的句子）：懸浮框和側邊欄共用。資料存在 chrome.storage.local 的 marks。
//   mark = { id, at, src, raw, trans, before:[{src, trans}], title, url, videoTime, from, to }
//     raw        辨識器原始輸出（詞之間有空格），切句子要用；v0.10 之前的收藏沒有這欄
//     before     前兩句，複製成 LLM 提問時當上下文
//     videoTime  收藏時影片播到第幾秒（只有懸浮框拿得到；側邊欄收藏時是 null）
//     from / to  翻譯用的語言代碼（ja、zh-Hant…）
// 外部網站連結（Google 翻譯、DeepL）只在使用者按下時才開，句子才會送到那個網站。
// 懸浮框會被重複注入同一個網頁，所以用 ??= 避免重複定義。i18n.js、prefs.js 要比這個檔案先載入。
globalThis.TSMarks ??= (() => {
  const KEY = 'marks';
  const MAX = 500;   // 最多留 500 句，太舊的丟掉
  const CONTEXT_N = 2;

  async function list() {
    const r = await chrome.storage.local.get(KEY);
    return r[KEY] ?? [];
  }

  async function save(marks) {
    await chrome.storage.local.set({ [KEY]: marks.slice(-MAX) });
  }

  const add = async (mark) => save([...(await list()), mark]);
  const remove = async (id) => save((await list()).filter((m) => m.id !== id));
  const clear = () => save([]);

  function watch(cb) {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch[KEY]) cb(ch[KEY].newValue ?? []);
    });
  }

  // 從目前的字幕清單 segs 的第 i 句做成一筆收藏
  function build(segs, i, meta) {
    const s = segs[i];
    const before = segs.slice(Math.max(0, i - CONTEXT_N), i).map((x) => ({ src: x.src, trans: x.trans }));
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(),
      src: s.src, raw: s.raw, trans: s.trans, before, videoTime: null, ...meta,
    };
  }

  // ---------- 外部連結 ----------

  // 各網站的語言代碼寫法不同：Google 用 zh-TW／zh-CN，DeepL 用 zh-hant／zh-hans
  const GOOGLE_CODE = { 'zh-Hant': 'zh-TW', zh: 'zh-CN' };
  const DEEPL_CODE = { 'zh-Hant': 'zh-hant', zh: 'zh-hans' };
  const google = (m) => `https://translate.google.com/?sl=${GOOGLE_CODE[m.from] ?? m.from}` +
    `&tl=${GOOGLE_CODE[m.to] ?? m.to}&text=${encodeURIComponent(m.src)}&op=translate`;
  const deepl = (m) => `https://www.deepl.com/translator#${DEEPL_CODE[m.from] ?? m.from}` +
    `/${DEEPL_CODE[m.to] ?? m.to}/${encodeURIComponent(m.src)}`;

  // 回到影片的這個時間點：各網站「從第幾秒開始播」的參數名稱
  const SEEK_PARAM = { 'www.youtube.com': 't', 'youtube.com': 't', 'm.youtube.com': 't', 'www.nicovideo.jp': 'from' };
  function videoLink(m) {
    if (!m.url) return '';
    const u = new URL(m.url);
    const param = SEEK_PARAM[u.hostname];
    if (param && m.videoTime != null) u.searchParams.set(param, Math.floor(m.videoTime));
    return u.href;
  }

  const clock = (sec) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);

  // ---------- 複製成 LLM 提問／匯出 ----------

  const langName = (code) => TSPrefs.targetName(code);

  function prompt(m) {
    const ctx = m.before.map((x) => `- ${x.src}${x.trans ? `（${x.trans}）` : ''}`).join('\n') || '-';
    return TSI18n.t('mark.prompt', {
      from: langName(m.from), to: langName(m.to), context: ctx, src: m.src, trans: m.trans || '-',
    });
  }

  function exportMarkdown(marks) {
    return marks.map((m) => [
      `## ${new Date(m.at).toLocaleString()}${m.videoTime != null ? `　⏱ ${clock(m.videoTime)}` : ''}`,
      m.title ? `${m.title}${m.url ? ` — ${videoLink(m)}` : ''}` : videoLink(m),
      '', `> ${m.src}`, `> ${m.trans || ''}`, '',
    ].join('\n')).join('\n');
  }

  return { list, add, remove, clear, watch, build, google, deepl, videoLink, clock, prompt, exportMarkdown };
})();
