// 設定（語言、主題、字幕樣式、更新速度、顯示位置）：側邊欄、懸浮框、背景程式共用。
// 唯一的資料來源是 chrome.storage.local 的 prefs：任何一邊修改，其他地方都會收到變更。
// 背景引擎（offscreen）不能讀 chrome.storage，由 sw.js 轉送給它。
// 懸浮框會被重複注入同一個網頁，所以用 ??= 避免重複定義。
// 表單上的文字都是 data-i18n key，由 i18n.js 換成目前的介面語言；圖示來自 icons.js（兩者都要比這個檔案先載入）。
globalThis.TSPrefs ??= (() => {
  const KEY = 'prefs';
  const DEFAULT = {
    uiLang: 'auto', lang: 'ja-JP', target: 'zh-Hant', local: true, display: 'overlay',
    theme: 'cha', themeBg: '#3B2A20', themeAccent: '#1D9E75', bg: 80,
    color: 'theme', font: 20, srcColor: 'theme', srcFont: 16,
    outline: 'none', align: 'left', show: 'both', order: 'srcFirst', speed: 'fast', highlight: true,
    barAutoHide: true,   // 懸浮框工具列：滑鼠移上才出現（false＝一直顯示）
    quality: 'fast',     // fast＝只用 Translator；quality＝講完的句子再用 Gemini Nano 重翻（見 offscreen.js）
  };
  // 字幕文字顏色：「跟主題」＋ 12 種日本傳統色（另有調色盤可自訂）
  const COLORS = [
    ['#FFFFFF', 'color.white'], ['#FBF6E9', 'color.kinari'], ['#F8B500', 'color.yamabuki'],
    ['#FCD575', 'color.tamago'], ['#68BE8D', 'color.wakatake'], ['#00A3AF', 'color.asagi'],
    ['#A0D8EF', 'color.sora'], ['#BBBCDE', 'color.fuji'], ['#EEBBCB', 'color.nadeshiko'],
    ['#F5B1AA', 'color.sango'], ['#EB6101', 'color.shu'], ['#2B2B2B', 'color.sumi'],
  ];
  const SPEEDS = ['realtime', 'fast', 'normal', 'slow', 'final'];

  // ---------- 語言表 ----------

  // 來源語言：語音辨識用的代碼（sr）和翻譯用的代碼（tr）。目標語言：翻譯用的代碼。
  // 這裡只列「可能」支援的語言，實際能不能用由 Chrome 決定，側邊欄會詢問後標示。
  const SOURCES = [
    ['ja-JP', 'ja', '日本語'], ['en-US', 'en', 'English (US)'], ['en-GB', 'en', 'English (UK)'],
    ['zh-TW', 'zh-Hant', '中文（台灣）'], ['zh-CN', 'zh', '中文（中国）'], ['ko-KR', 'ko', '한국어'],
    ['es-ES', 'es', 'Español'], ['fr-FR', 'fr', 'Français'], ['de-DE', 'de', 'Deutsch'],
    ['it-IT', 'it', 'Italiano'], ['pt-BR', 'pt', 'Português (Brasil)'], ['ru-RU', 'ru', 'Русский'],
    ['hi-IN', 'hi', 'हिन्दी'], ['id-ID', 'id', 'Bahasa Indonesia'], ['th-TH', 'th', 'ไทย'],
    ['vi-VN', 'vi', 'Tiếng Việt'], ['tr-TR', 'tr', 'Türkçe'], ['pl-PL', 'pl', 'Polski'],
  ].map(([sr, tr, name]) => ({ sr, tr, name }));
  const TARGETS = [
    ['zh-Hant', '繁體中文'], ['zh', '简体中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'],
    ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'],
    ['ru', 'Русский'], ['hi', 'हिन्दी'], ['id', 'Bahasa Indonesia'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'],
    ['tr', 'Türkçe'], ['pl', 'Polski'], ['nl', 'Nederlands'], ['ar', 'العربية'], ['uk', 'Українська'],
    ['sv', 'Svenska'], ['cs', 'Čeština'], ['da', 'Dansk'], ['fi', 'Suomi'], ['no', 'Norsk'],
    ['el', 'Ελληνικά'], ['he', 'עברית'], ['hu', 'Magyar'], ['ro', 'Română'], ['sk', 'Slovenčina'],
    ['bg', 'Български'], ['hr', 'Hrvatski'], ['lt', 'Lietuvių'], ['sl', 'Slovenščina'],
    ['bn', 'বাংলা'], ['mr', 'मराठी'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['kn', 'ಕನ್ನಡ'],
  ].map(([tr, name]) => ({ tr, name }));
  const source = (sr) => SOURCES.find((l) => l.sr === sr) ?? SOURCES[0];
  const targetName = (tr) => TARGETS.find((l) => l.tr === tr)?.name ?? tr;

  const options = (list, key) =>
    list.map((l) => `<option value="${l[key]}" data-name="${l.name}">${l.name}</option>`).join('');
  // 「來源 → 目標」兩個下拉選單：側邊欄和懸浮框工具列共用
  const LANG_SELECTS = `<select data-pref="lang" class="lang" data-i18n-title="lang.source">${options(SOURCES, 'sr')}</select>` +
    `<span class="arrow">${TSIcons.icon('arrow', 14)}</span>` +
    `<select data-pref="target" class="lang" data-i18n-title="lang.target">${options(TARGETS, 'tr')}</select>`;

  // ---------- 主題 ----------

  // 一個主題 = 主色 accent ＋ 兩組顏色：
  //   deep：懸浮框（疊在影片上）和側邊欄的深色模式
  //   pale：側邊欄的淺色模式
  // 「自訂」只讓使用者選背景色和主色，其他顏色用混色自動推算，避免配出看不清楚的組合。
  const THEMES = {
    // 茶（ちゃ）：焦茶背景、栗色工具列、枯茶框線、生成り文字
    cha: {
      accent: '#1D9E75',
      deep: { bg: '#3B2A20', bar: '#5C4033', card: '#4A3528', line: '#C8A27A', text: '#FBF6E9', muted: '#C8A27A' },
      pale: { bg: '#FBF6E9', bar: '#F3EADB', card: '#FFFDF8', line: '#E6D9C6', text: '#4A3426', muted: '#8D6449' },
    },
    // 墨（すみ）：黑灰
    sumi: {
      accent: '#1D9E75',
      deep: { bg: '#1E1E1E', bar: '#333333', card: '#2A2A2A', line: '#6B6B6B', text: '#F5F5F5', muted: '#A8A8A8' },
      pale: { bg: '#F4F4F2', bar: '#EAEAE7', card: '#FFFFFF', line: '#E0E0DC', text: '#2B2B2B', muted: '#6B6B6B' },
    },
  };

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const mix = (a, b, w) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * w));   // a 往 b 混 w（0～1）
  const lum = (h) => rgb(h).reduce((s, v, i) => s + (v / 255) * [0.2126, 0.7152, 0.0722][i], 0);

  // 從背景色 b 和文字色 t 推算整組顏色
  const palette = (b, t) => ({ bg: b, bar: mix(b, t, 0.14), card: mix(b, t, 0.07), line: mix(b, t, 0.4), text: t, muted: mix(b, t, 0.62) });

  function derive(bg, accent) {
    const dark = lum(bg) < 0.45;
    const ink = dark ? '#FBF6E9' : '#2B2B2B';   // 背景暗就用淺色字，背景亮就用深色字
    return { accent, deep: palette(bg, ink), pale: palette(mix(bg, '#FFFFFF', 0.9), mix(bg, '#000000', dark ? 0.1 : 0.7)) };
  }

  const themeOf = (p) => (p.theme === 'custom' ? derive(p.themeBg, p.themeAccent) : THEMES[p.theme] ?? THEMES.cha);

  // mode：'deep'（懸浮框、深色側邊欄）或 'pale'（淺色側邊欄）。回傳一組 CSS 顏色變數
  function themeVars(p, mode) {
    const th = themeOf(p);
    const c = th[mode];
    return {
      '--bg': c.bg, '--bg-rgb': rgb(c.bg).join(', '), '--bar': c.bar, '--card': c.card, '--line': c.line,
      '--text': c.text, '--muted': c.muted, '--accent': th.accent, '--error': '#EB6101',
      '--on-accent': lum(th.accent) > 0.6 ? '#2B2B2B' : '#FFFFFF',
      '--trans-color': p.color === 'theme' ? c.text : p.color,
      '--src-color': p.srcColor === 'theme' ? c.muted : p.srcColor,
    };
  }

  const paint = (el, vars) => Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));

  // 設定卡片上方的預覽：一律用懸浮框（deep）的顏色，側邊欄淺色模式下也看得出字幕實際的樣子
  function paintPreview(root, p) {
    const box = root.querySelector('.pv-box');
    if (!box) return;
    paint(box, themeVars(p, 'deep'));
    box.style.setProperty('--bg-alpha', p.bg / 100);
    box.dataset.outline = p.outline;
    box.dataset.align = p.align;
    box.dataset.show = p.show;
    box.dataset.order = p.order;
    box.style.setProperty('--trans-size', `${Math.min(p.font, 26)}px`);
    box.style.setProperty('--src-size', `${Math.min(p.srcFont, 22)}px`);
  }

  // ---------- 設定卡片（側邊欄和懸浮框共用同一份 HTML） ----------

  // 文字都放 data-i18n key，實際的字由 TSI18n.apply() 填上
  const txt = (key) => `<span data-i18n="${key}"></span>`;
  const row = (key, body, cls = '') => `<div class="row ${cls}"><span class="name" data-i18n="${key}"></span>${body}</div>`;
  const section = (key) => `<div class="sec" data-i18n="${key}"></div>`;
  const chips = (pref, opts) => `<div class="chips">${opts.map(([v, label]) =>
    `<label><input type="radio" name="${pref}" data-pref="${pref}" value="${v}">${label}</label>`).join('')}</div>`;
  const chipsT = (pref, opts) => chips(pref, opts.map(([v, key]) => [v, txt(key)]));
  // themeVar：「跟主題」那一格用哪個主題顏色畫（譯文用 --text、原文用 --muted）
  const swatches = (pref, themeVar) => `<div class="swatches">` +
    `<input type="radio" class="swatch auto" name="${pref}" data-pref="${pref}" value="theme" style="--c: var(${themeVar})" data-i18n-title="color.theme">` +
    COLORS.map(([c, key]) =>
      `<input type="radio" class="swatch" name="${pref}" data-pref="${pref}" value="${c}" style="--c:${c}" data-i18n-title="${key}">`).join('') +
    `<input type="color" class="picker" data-pref="${pref}" data-i18n-title="color.custom"></div>`;
  const range = (pref, min, max, step, unit) =>
    `<input type="range" min="${min}" max="${max}" step="${step}" data-pref="${pref}">` +
    `<output data-for="${pref}" data-unit="${unit}"></output>`;
  const select = (pref, opts) => `<select data-pref="${pref}">${opts.join('')}</select>`;
  const speeds = select('speed', SPEEDS.map((v) => `<option value="${v}" data-i18n="speed.${v}"></option>`));
  const alignChips = chips('align', [['left', TSIcons.icon('alignLeft', 16)], ['center', TSIcons.icon('alignCenter', 16)]]);

  // 字幕外觀：預覽、主題、文字
  const LOOK = [
    `<div class="preview"><div class="pv-label" data-i18n="form.preview"></div>
       <div class="pv-box"><div class="src">ありがとうございます</div><div class="trans" data-i18n="preview.trans"></div></div></div>`,
    section('sec.theme'),
    row('form.theme', chipsT('theme', [['cha', 'theme.cha'], ['sumi', 'theme.sumi'], ['custom', 'theme.custom']])),
    row('form.themeColors', `<label class="pick"><input type="color" data-pref="themeBg"> ${txt('form.themeBg')}</label>` +
        `<label class="pick"><input type="color" data-pref="themeAccent"> ${txt('form.themeAccent')}</label>`, 'only-custom'),
    row('form.bg', range('bg', 0, 100, 5, '%')),
    section('sec.text'),
    row('form.transColor', swatches('color', '--text')),
    row('form.transFont', range('font', 12, 48, 1, 'px')),
    row('form.srcColor', swatches('srcColor', '--muted')),
    row('form.srcFont', range('srcFont', 10, 40, 1, 'px')),
    row('form.outline', chipsT('outline', [['none', 'opt.none'], ['black', 'opt.black'], ['white', 'opt.white']])),
    row('form.align', alignChips),
  ].join('');

  // 顯示與速度
  const DISPLAY = [
    row('form.quality', chipsT('quality', [['fast', 'opt.fast'], ['quality', 'opt.quality']])),
    '<div class="hint" data-i18n="form.qualityHint"></div>',
    row('form.show', chipsT('show', [['both', 'opt.showBoth'], ['trans', 'opt.showTrans'], ['src', 'opt.showSrc']])),
    row('form.order', chipsT('order', [['srcFirst', 'opt.srcFirst'], ['transFirst', 'opt.transFirst']]), 'only-both'),
    row('form.highlight', `<input type="checkbox" class="toggle" data-pref="highlight">`),
    row('form.speed', speeds),
    '<div class="hint" data-i18n="form.speedHint"></div>',
    row('form.display', chipsT('display', [['overlay', 'opt.overlay'], ['panel', 'opt.panel'], ['both', 'opt.both']])),
  ].join('');
  // 外層 .form 讓「只在自訂主題／兩者都顯示時出現」的規則生效。
  // 懸浮框的設定選單把兩塊分成兩個子頁；側邊欄的「字幕外觀」卡片兩塊都放。
  const form = (html) => `<div class="form">${html}</div>`;
  const FORM_LOOK = form(LOOK);
  const FORM_DISPLAY = form(DISPLAY);
  const FORM = form(LOOK + section('sec.display') + DISPLAY);

  // 使用教學：懸浮框的設定子頁和側邊欄共用同一份內容
  const HELP_HTML = `<div class="help"><ol>${['help.1', 'help.2', 'help.3', 'help.4'].map((k) =>
    `<li data-i18n="${k}"></li>`).join('')}</ol><div class="tip" data-i18n="help.tip"></div></div>`;
  const HELP_CSS = `
    .help ol { margin: 0; padding-left: 20px; }
    .help li { margin-bottom: 8px; }
    .help li::marker { color: var(--accent); font-weight: 700; }
    .help .tip { font-size: 12px; color: var(--muted); background: var(--card); border-radius: 10px; padding: 8px 10px; }`;

  // 顏色都用主題變數（--text、--muted、--line、--accent、--card…），由側邊欄和懸浮框各自用 themeVars() 設定
  const FORM_CSS = `
    .sec { font-size: 11px; letter-spacing: .08em; color: var(--accent); margin: 14px 0 4px; font-weight: 600; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .name { width: 76px; color: var(--muted); font-size: 12px; }
    .hint { color: var(--muted); font-size: 11px; margin: -2px 0 6px 84px; }
    .only-custom, .only-both { display: none; }
    .form:has([data-pref=theme][value=custom]:checked) .only-custom { display: flex; }
    .form:has([data-pref=show][value=both]:checked) .only-both { display: flex; }

    .preview { border-radius: 12px; padding: 8px; background: var(--card); border: 1px solid var(--line); }
    .pv-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
    .pv-box { border-radius: 10px; padding: 8px 12px; background: rgba(var(--bg-rgb), var(--bg-alpha, .8)); line-height: 1.45; }
    .pv-box .src { color: var(--src-color); font-size: var(--src-size); }
    .pv-box .trans { color: var(--trans-color); font-size: var(--trans-size); font-weight: 600; }
    .pv-box { display: flex; flex-direction: column; }
    .pv-box[data-order=transFirst] .src { order: 2; }
    .pv-box[data-show=trans] .src, .pv-box[data-show=src] .trans { display: none; }
    .pv-box[data-align=center] { text-align: center; }
    .pv-box[data-outline=black] { text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; }
    .pv-box[data-outline=white] { text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff; }

    .swatches { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; min-width: 0; }
    .swatch { appearance: none; margin: 0; width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
              background: var(--c); border: 1px solid var(--line); }
    .swatch.auto { border: 2px dashed var(--line); }
    .swatch:checked { outline: 2px solid var(--accent); outline-offset: 2px; }
    .picker, .pick input { appearance: none; width: 22px; height: 22px; padding: 0; border: 1px solid var(--line);
                           border-radius: 50%; background: none; cursor: pointer; overflow: hidden; }
    .picker::-webkit-color-swatch-wrapper, .pick input::-webkit-color-swatch-wrapper { padding: 0; }
    .picker::-webkit-color-swatch, .pick input::-webkit-color-swatch { border: 0; border-radius: 50%; }
    .pick { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; margin-right: 8px; cursor: pointer; }

    .chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
    .chips label { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; cursor: pointer;
                   font-size: 12px; border: 1px solid var(--line); color: var(--text); }
    .chips input { display: none; }
    .chips label:has(input:checked) { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }

    input.toggle { appearance: none; margin: 0; width: 34px; height: 18px; border-radius: 999px; cursor: pointer;
              background: var(--line); position: relative; transition: background .15s; }
    input.toggle::before { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
                      background: #fff; transition: transform .15s; }
    input.toggle:checked { background: var(--accent); }
    input.toggle:checked::before { transform: translateX(16px); }

    input[type=range] { flex: 1; min-width: 80px; accent-color: var(--accent); }
    output { min-width: 40px; text-align: center; font-size: 11px; padding: 1px 6px; border-radius: 999px;
             background: var(--card); border: 1px solid var(--line); color: var(--text); font-variant-numeric: tabular-nums; }
    select { font: inherit; font-size: 12px; color: var(--text); background: var(--card);
             border: 1px solid var(--line); border-radius: 8px; padding: 3px 6px; }`;

  // ---------- 讀寫 ----------

  async function load() {
    const r = await chrome.storage.local.get(KEY);
    return { ...DEFAULT, ...r[KEY] };
  }

  // 一次改多個欄位（例如 A−／A+ 同時調整原文和譯文大小）
  async function update(patch) {
    const p = await load();
    await chrome.storage.local.set({ [KEY]: { ...p, ...patch } });
  }
  const set = (key, value) => update({ [key]: value });

  function watch(cb) {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch[KEY]) cb({ ...DEFAULT, ...ch[KEY].newValue });
    });
  }

  // 表單欄位都標了 data-pref="欄位名稱"，用同一套程式讀寫，不必每個欄位各寫一段。
  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range') return Number(el.value);
    return el.value;
  }

  function showInput(el, v) {
    if (el.type === 'radio') el.checked = el.value === v;
    else if (el.type === 'checkbox') el.checked = v;
    else if (el.type === 'color') { if (/^#[0-9a-f]{6}$/i.test(v)) el.value = v; }   // 「跟主題」不是顏色碼，調色盤維持原樣
    else el.value = v;
  }

  function show(root, p) {
    root.querySelectorAll('[data-pref]').forEach((el) => showInput(el, p[el.dataset.pref]));
    root.querySelectorAll('output[data-for]').forEach((o) => {
      o.value = `${p[o.dataset.for]}${o.dataset.unit}`;
    });
    paintPreview(root, p);
  }

  function bind(root) {
    root.querySelectorAll('[data-pref]').forEach((el) =>
      el.addEventListener('input', () => set(el.dataset.pref, readInput(el))));
  }

  return { DEFAULT, SOURCES, TARGETS, LANG_SELECTS, FORM_HTML: FORM, FORM_LOOK, FORM_DISPLAY, FORM_CSS, HELP_HTML, HELP_CSS,
           source, targetName, themeVars, paint, load, set, update, watch, show, bind };
})();
