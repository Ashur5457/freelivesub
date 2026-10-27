// 懸浮字幕框：點圖示時注入到影片網頁（i18n.js、icons.js、prefs.js、marks.js 會先注入）。自己不記任何字幕，背景引擎送什麼就畫什麼。
//   背景引擎 → sw.js 轉送 → { type:'render', status, reason, label, translate, segs } → render()
//   設定（主題、樣式、語言、顯示位置）直接讀寫 chrome.storage.local，和側邊欄同一份
//   ⏸ / 🗑 / ✕ → 背景引擎；側邊欄按鈕 → sw.js 打開側邊欄
// 顏色全部來自主題變數（TSPrefs.themeVars），只有位置和大小由這裡自己存，下次打開沿用。
(() => {
  // 同一個網頁再點一次圖示：已經有字幕框了，只要重新顯示
  if (globalThis.__tabSubtitle) return globalThis.__tabSubtitle.show();
  // 擴充功能重新載入後，舊的字幕框會殘留在網頁上且已失效，先清掉
  document.querySelectorAll('tab-subtitle').forEach((el) => el.remove());

  const KEY = 'overlayBox';
  const RUNNING = new Set(['connecting', 'listening']);
  const { icon } = TSIcons;
  const tint = (pct) => `color-mix(in srgb, var(--text) ${pct}%, transparent)`;
  const STYLE = `
    .box { position: fixed; z-index: 2147483647; display: flex; flex-direction: column; box-sizing: border-box;
           color: var(--text); background: rgba(var(--bg-rgb), var(--bg-alpha)); backdrop-filter: blur(8px);
           border: 1px solid color-mix(in srgb, var(--line) 45%, transparent); border-radius: 16px;
           box-shadow: 0 8px 28px rgba(0, 0, 0, .35);
           font-family: "Microsoft JhengHei", "Yu Gothic UI", "Noto Sans TC", system-ui, sans-serif; line-height: 1.45; }

    /* 工具列：浮在字幕框上緣的膠囊，滑鼠移到字幕框上才出現；出錯或設定打開時常駐 */
    .bar { position: absolute; top: -20px; right: 12px; z-index: 3; max-width: calc(100% - 24px);
           display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 3px;
           padding: 4px 5px; border-radius: 999px; background: var(--bar); border: 1px solid var(--line);
           box-shadow: 0 4px 14px rgba(0, 0, 0, .35); font: 12px/1 system-ui, sans-serif;
           cursor: move; user-select: none; opacity: 0; transform: translateY(4px); transition: opacity .15s, transform .15s; }
    .box:hover .bar, .box.open .bar, .box.pinbar .bar, .box[data-status=error] .bar { opacity: 1; transform: none; }
    .bar button { width: 28px; height: 28px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
                  display: inline-flex; align-items: center; justify-content: center;
                  color: var(--text); background: ${tint(10)}; transition: background .12s; }
    .bar button:hover { background: ${tint(24)}; }
    .bar button.txt { font: 700 13px/1 system-ui, sans-serif; }
    .box.open [data-act=settings] { background: var(--accent); color: var(--on-accent); }
    /* 狀態只留燈號，文字（辨識中、已暫停…）放在滑鼠提示裡，工具列才排得下一行 */
    .state { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
             border-radius: 50%; background: ${tint(10)}; }
    .led { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .box[data-status=listening] .led  { background: #68BE8D; }
    .box[data-status=connecting] .led { background: #F8B500; }
    .box[data-status=error] .led      { background: var(--error); }
    .langs { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: 999px;
             background: color-mix(in srgb, var(--accent) 30%, transparent); }
    .langs select { font: 12px/1.2 system-ui, sans-serif; color: var(--text); background: transparent; border: 0;
                    max-width: 84px; padding: 5px 1px; cursor: pointer; }
    .langs select option { color: #000; background: #fff; }
    .arrow { display: inline-flex; color: var(--accent); }

    /* 工具列隱藏時，右上角還留一顆狀態燈 */
    .box > .dot { position: absolute; top: 10px; right: 12px; width: 8px; height: 8px; border-radius: 50%;
                  background: var(--muted); transition: opacity .15s; }
    .box:hover > .dot { opacity: 0; }
    .box[data-status=listening] > .dot  { background: #68BE8D; }
    .box[data-status=connecting] > .dot { background: #F8B500; }
    .box[data-status=error] > .dot      { background: var(--error); }

    /* 錯誤原因：框內一條朱色提示 */
    .alert { margin: 16px 14px 0; padding: 6px 10px; border-radius: 10px; font: 12px/1.45 system-ui, sans-serif;
             background: color-mix(in srgb, var(--error) 22%, transparent); border: 1px solid var(--error); }
    .alert[hidden] { display: none; }

    /* 四個角的縮放把手：滑鼠移上字幕框才出現 L 形標記，拖哪個角就往哪個方向縮放 */
    .corner { position: absolute; z-index: 2; width: 14px; height: 14px; opacity: 0; transition: opacity .15s;
              border: 0 solid var(--line); }
    .box:hover .corner { opacity: 1; }
    .corner[data-c=nw] { left: 0; top: 0; cursor: nwse-resize; border-width: 2px 0 0 2px; border-top-left-radius: 16px; }
    .corner[data-c=ne] { right: 0; top: 0; cursor: nesw-resize; border-width: 2px 2px 0 0; border-top-right-radius: 16px; }
    .corner[data-c=sw] { left: 0; bottom: 0; cursor: nesw-resize; border-width: 0 0 2px 2px; border-bottom-left-radius: 16px; }
    .corner[data-c=se] { right: 0; bottom: 0; cursor: nwse-resize; border-width: 0 2px 2px 0; border-bottom-right-radius: 16px; }

    /* 字幕從底部往上排；放不下時右側出現捲軸，可往上捲看最近 50 句。
       下方留 12px，捲軸才不會被右下角的縮放把手蓋住 */
    .subs { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
            margin: 0 3px 12px 0; padding: 14px 12px 0 18px; text-align: left;
            display: flex; flex-direction: column;
            scrollbar-width: thin; scrollbar-color: ${tint(30)} transparent; }
    .subs > :first-child { margin-top: auto; }   /* 字幕少的時候貼底 */
    .seg { position: relative; display: flex; flex-direction: column; margin-top: .5em; padding-right: 26px; transition: opacity .2s; }
    /* ⭐ 收藏：滑鼠移到這句才出現；收藏過的一直亮著 */
    .star { position: absolute; top: 0; right: 0; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%;
            display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
            color: var(--muted); background: none; opacity: 0; transition: opacity .12s; }
    .seg:hover .star { opacity: .8; }
    .star:hover { background: ${tint(15)}; opacity: 1; }
    .seg.marked .star { opacity: 1; color: #F8B500; }
    .seg.marked .star svg { fill: currentColor; }
    .src { color: var(--src-color); font-size: var(--src-size); }
    .trans { color: var(--trans-color); font-size: var(--trans-size); font-weight: 600; }
    .interim .trans { opacity: .8; }
    .trans.q::after { content: ' ✨'; font-size: .65em; opacity: .75; }   /* 品質優先重翻過 */
    .box[data-order=transFirst] .src { order: 2; }
    .box[data-show=trans] .src, .box[data-show=src] .trans { display: none; }
    .highlight .seg:not(:last-child) { opacity: .45; }
    .empty { color: var(--muted); font-size: 13px; }
    .box[data-align=center] .subs { text-align: center; }
    .box[data-outline=black] .subs { text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 4px #000; }
    .box[data-outline=white] .subs { text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 0 4px #fff; }
    .latest { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2; cursor: pointer;
              padding: 5px 14px; border: 0; border-radius: 999px; font: 12px system-ui, sans-serif;
              background: var(--accent); color: var(--on-accent); box-shadow: 0 2px 8px rgba(0, 0, 0, .3); }
    .latest[hidden] { display: none; }

    /* 設定選單：貼在字幕框上方或下方。主選單＝快速開關方塊＋分類卡片，點進去是子頁 */
    .settings { position: fixed; z-index: 2147483647; width: 330px; max-height: 75vh; overflow: auto; box-sizing: border-box;
                padding: 12px 14px; border-radius: 18px; color: var(--text); background: var(--bg);
                border: 1px solid var(--line); box-shadow: 0 12px 32px rgba(0, 0, 0, .45);
                font: 13px/1.5 system-ui, "Microsoft JhengHei", sans-serif; scrollbar-width: thin; }
    .settings[hidden], .page[hidden] { display: none; }
    .settings button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
    .settings header { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; margin-bottom: 10px; }
    .settings header .title { flex: 1; }
    .settings header button { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
    .settings header button:hover { background: ${tint(12)}; }
    .settings header button[hidden] { display: none; }

    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .settings .tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px 10px; border-radius: 14px;
            border: 1px solid var(--line); background: var(--card); font-size: 11px; line-height: 1.3; }
    .settings .tile.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
    .settings .nav { width: 100%; display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 6px;
           border-radius: 12px; background: var(--card); text-align: left; }
    .settings .nav:hover { background: ${tint(12)}; }
    .settings .nav .ico { flex: none; width: 28px; height: 28px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center;
                background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); }
    .settings .nav .val { margin-left: auto; max-width: 130px; font-size: 12px; color: var(--muted);
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .settings .nav > svg { flex: none; color: var(--muted); }
    .foot { display: flex; justify-content: center; gap: 18px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
    .foot button, .foot a { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); text-decoration: none; }
    .foot button:hover, .foot a:hover { color: var(--accent); }
    .settings .opt { width: 100%; display: flex; align-items: center; padding: 9px 10px; margin-bottom: 4px; border-radius: 10px; text-align: left; }
    .settings .opt:hover { background: ${tint(8)}; }
    .settings .opt.on { background: var(--card); font-weight: 600; }
    .settings .opt .check { margin-left: auto; color: var(--accent); visibility: hidden; }
    .settings .opt.on .check { visibility: visible; }
    .toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 4; max-width: 80%;
             padding: 6px 14px; border-radius: 999px; text-align: center; font: 12px/1.4 system-ui, sans-serif;
             background: var(--accent); color: var(--on-accent); box-shadow: 0 2px 8px rgba(0, 0, 0, .3); }
    .toast[hidden] { display: none; }
    ${TSPrefs.HELP_CSS}
    ${TSPrefs.FORM_CSS}`;

  // ---------- 設定選單（用資料描述，同一段程式畫出來） ----------

  // 快速開關：on＝目前是不是開著，flip＝按下去要改哪些設定
  const TILES = [
    { id: 'bilingual', icon: 'bilingual', label: 'menu.bilingual',
      on: (p) => p.show === 'both', flip: (p) => ({ show: p.show === 'both' ? 'trans' : 'both' }) },
    { id: 'autoHide', icon: 'autoHide', label: 'menu.autoHide',
      on: (p) => p.barAutoHide, flip: (p) => ({ barAutoHide: !p.barAutoHide }) },
    { id: 'fade', icon: 'fade', label: 'menu.fade',
      on: (p) => p.highlight, flip: (p) => ({ highlight: !p.highlight }) },
  ];
  // 分類卡片：go＝點進哪個子頁，act＝直接執行的動作，value＝右邊顯示的目前設定
  const uiName = (v) => (v === 'auto'
    ? `${TSI18n.t('opt.auto')}（${TSI18n.UI_OPTIONS.find(([c]) => c === TSI18n.resolve('auto'))[1]}）`
    : TSI18n.UI_OPTIONS.find(([c]) => c === v)?.[1] ?? v);
  const ROWS = [
    { id: 'look', icon: 'palette', label: 'menu.look', go: 'look', value: (p) => TSI18n.t(`theme.${p.theme}`) },
    { id: 'display', icon: 'settings', label: 'menu.display', go: 'display', value: (p) => TSI18n.t(`speed.${p.speed}`) },
    { id: 'lang', icon: 'globe', label: 'menu.uiLang', go: 'lang', value: (p) => uiName(p.uiLang) },
    { id: 'copy', icon: 'copy', label: 'menu.copy', act: 'copy' },
    { id: 'reset', icon: 'reset', label: 'menu.resetPos', act: 'reset' },
  ];
  const PAGE_TITLES = { main: 'menu.title', look: 'menu.look', display: 'menu.display', lang: 'menu.uiLang', help: 'menu.help' };
  const ISSUES_URL = 'https://github.com/Ashur5457/freelivesub/issues';

  const MENU_HTML =
    `<div class="tiles">${TILES.map((x) =>
      `<button class="tile" data-tile="${x.id}">${icon(x.icon, 20)}<span data-i18n="${x.label}"></span></button>`).join('')}</div>` +
    ROWS.map((r) => `<button class="nav" ${r.go ? `data-go="${r.go}"` : `data-act="${r.act}"`}>` +
      `<span class="ico">${icon(r.icon, 16)}</span><span data-i18n="${r.label}"></span>` +
      `<span class="val" data-val="${r.id}"></span>${r.go ? icon('chevronRight', 14) : ''}</button>`).join('') +
    `<div class="foot"><button data-go="help">${icon('book', 14)}<span data-i18n="menu.help"></span></button>` +
    `<a href="${ISSUES_URL}" target="_blank" rel="noopener">${icon('external', 14)}<span data-i18n="menu.report"></span></a></div>`;
  // 介面語言子頁：「自動」要翻譯，其他語言名稱用各自的寫法
  const LANG_HTML = TSI18n.UI_OPTIONS.map(([v, name]) =>
    `<button class="opt" data-ui="${v}">${name ?? '<span data-i18n="opt.autoChrome"></span>'}` +
    `<span class="check">${icon('check', 16)}</span></button>`).join('');

  const host = document.createElement('tab-subtitle');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="box">
      <div class="bar">
        <span class="state" data-i18n-title="state.idle"><i class="led"></i></span>
        <span class="langs">${TSPrefs.LANG_SELECTS}</span>
        <button data-act="smaller" class="txt" data-i18n-title="ov.smaller">A−</button>
        <button data-act="bigger" class="txt" data-i18n-title="ov.bigger">A+</button>
        <button data-act="toggle" class="toggle" data-i18n-title="ov.toggle">${icon('play')}</button>
        <button data-act="clear" data-i18n-title="ov.clear">${icon('clear')}</button>
        <button data-act="settings" data-i18n-title="ov.settings">${icon('gear')}</button>
        <button data-act="panel" data-i18n-title="ov.panel">${icon('panel')}</button>
        <button data-act="close" data-i18n-title="ov.close">${icon('close')}</button>
      </div>
      <div class="dot"></div>
      <div class="alert" hidden></div>
      <div class="corner" data-c="nw"></div><div class="corner" data-c="ne"></div>
      <div class="corner" data-c="sw"></div><div class="corner" data-c="se"></div>
      <div class="subs"><div class="empty" data-i18n="ov.empty"></div></div>
      <button class="latest" data-act="latest" data-i18n="ov.latest" hidden></button>
      <div class="toast" hidden></div>
    </div>
    <div class="settings" hidden>
      <header>
        <button data-go="main" class="back" hidden>${icon('chevronLeft', 16)}</button>
        <span class="title" data-i18n="menu.title"></span>
        <button data-act="settings">${icon('close', 16)}</button>
      </header>
      <div class="page" data-page="main">${MENU_HTML}</div>
      <div class="page" data-page="look" hidden>${TSPrefs.FORM_LOOK}</div>
      <div class="page" data-page="display" hidden>${TSPrefs.FORM_DISPLAY}</div>
      <div class="page" data-page="lang" hidden>${LANG_HTML}</div>
      <div class="page" data-page="help" hidden>${TSPrefs.HELP_HTML}</div>
    </div>`;
  const q = (sel) => root.querySelector(sel);
  const el = q('.box'), bar = q('.bar'), panel = q('.settings'), alertBox = q('.alert');
  TSI18n.apply(root);   // 還沒讀到設定前，先用「自動」的介面語言把字填上
  const MIN_W = 320, MIN_H = 72;
  const BAR_ROOM = 24;   // 工具列浮在框上緣外面，框的上方要留這麼多空間，工具列才不會跑出畫面
  let prefs = { ...TSPrefs.DEFAULT };
  let translateOn = true;   // 背景引擎說要不要翻譯（來源和目標相同時不翻譯）
  let closed = false;       // 按過 ✕：要等下一次點圖示才再出現

  // ---------- 位置、大小 ----------

  // 可見範圍：扣掉捲軸（innerWidth 含捲軸，會讓框的右邊被捲軸蓋住）。
  // 取較小值：少數舊式網頁的 clientHeight 是整份文件的高度，不是視窗高度。
  const viewW = () => Math.min(document.documentElement.clientWidth || innerWidth, innerWidth);
  const viewH = () => Math.min(document.documentElement.clientHeight || innerHeight, innerHeight);
  // 字幕框最大只能佔畫面寬 95%、高 90%，不會蓋住整個影片（例如全螢幕時拉大的存檔回到一般視窗）
  const maxW = () => Math.max(MIN_W, viewW() * 0.95);
  const maxH = () => Math.max(MIN_H, viewH() * 0.9 - BAR_ROOM);

  // 預設：寬 480、高 440，放在畫面右側、上下置中（通常蓋在推薦影片上，不擋影片）
  const defaultBox = () => ({
    width: 480, height: 440,
    left: Math.max(0, viewW() - 480 - 24), top: Math.max(BAR_ROOM, (viewH() - 440) / 2),
  });
  let box = defaultBox();

  // 畫出來的框（含寬高）一定在可見範圍內，工具列、✕ 和縮放把手才按得到。
  // box 保留使用者要的位置大小，只在畫的時候配合可見範圍：視窗暫時變小時框跟著縮，變大時恢復。
  const fit = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  function fitted() {
    const width = fit(box.width, MIN_W, maxW());
    const height = fit(box.height, MIN_H, maxH());
    return { width, height, left: fit(box.left, 0, viewW() - width), top: fit(box.top, BAR_ROOM, viewH() - height) };
  }

  function apply() {
    const r = fitted();
    Object.assign(el.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    });
    if (!panel.hidden) placeSettings();
  }

  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ [KEY]: box }), 300);
  };

  // 按住 handle 拖曳：onMove 收到「拖曳開始時的 box」和滑鼠移動的距離，放開時存檔。
  // 移動（工具列）和縮放（四個角）共用這一段。
  function draggable(handle, onMove) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, select')) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, start = fitted();
      const move = (ev) => {
        onMove(start, ev.clientX - x0, ev.clientY - y0);
        apply();
      };
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener('pointermove', move);
      handle.addEventListener('lostpointercapture', () => {
        handle.removeEventListener('pointermove', move);
        box = fitted();   // 拖到畫面外的部分不算，存畫出來的樣子
        save();
      }, { once: true });
    });
  }

  draggable(bar, (s, dx, dy) => {
    box.left = s.left + dx;
    box.top = s.top + dy;
  });
  // 每個角往哪個方向長大：+1 = 往右／往下，-1 = 往左／往上。對角那一點固定不動。
  const CORNERS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

  // 一個方向（寬或高）的縮放：拉到畫面邊緣或最大尺寸就停
  function stretch(pos, size, sign, d, min, max, lo, view) {
    const room = sign > 0 ? view - pos : pos + size - lo;   // 往這個方向最多能長到多大
    const next = fit(size + sign * d, min, Math.min(max, room));
    return [sign > 0 ? pos : pos + size - next, next];
  }

  root.querySelectorAll('.corner').forEach((c) => {
    const [sx, sy] = CORNERS[c.dataset.c];
    draggable(c, (s, dx, dy) => {
      [box.left, box.width] = stretch(s.left, s.width, sx, dx, MIN_W, maxW(), 0, viewW());
      [box.top, box.height] = stretch(s.top, s.height, sy, dy, MIN_H, maxH(), BAR_ROOM, viewH());
    });
  });

  // ---------- 字幕外觀卡片 ----------

  // 下方放得下就放下方，否則放上方
  function placeSettings() {
    const r = el.getBoundingClientRect();
    const h = panel.offsetHeight;
    panel.style.left = `${fit(r.right - 330, 8, viewW() - 338)}px`;
    panel.style.top = `${r.bottom + 8 + h < viewH() ? r.bottom + 8 : Math.max(8, r.top - BAR_ROOM - 8 - h)}px`;
  }

  function showPage(name) {
    root.querySelectorAll('.page').forEach((pg) => { pg.hidden = pg.dataset.page !== name; });
    q('.back').hidden = name === 'main';
    q('.title').dataset.i18n = PAGE_TITLES[name];
    TSI18n.apply(panel);
    placeSettings();   // 子頁高度不同，重新決定放上方還是下方
  }

  function toggleSettings() {
    panel.hidden = !panel.hidden;
    el.classList.toggle('open', !panel.hidden);
    if (!panel.hidden) showPage('main');
  }

  // 選單上「目前是什麼」的顯示：快速開關亮不亮、分類卡片右邊的值、介面語言打勾
  function showMenuState(p) {
    TILES.forEach((x) => q(`[data-tile=${x.id}]`).classList.toggle('on', x.on(p)));
    ROWS.filter((r) => r.value).forEach((r) => { q(`[data-val=${r.id}]`).textContent = r.value(p); });
    root.querySelectorAll('[data-ui]').forEach((b) => b.classList.toggle('on', b.dataset.ui === p.uiLang));
  }

  let toastTimer = null;
  function toast(text) {
    const box = q('.toast');
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 1800);
  }

  // 複製目前所有講完的句子（原文＋譯文）
  let lastSegs = [];
  async function copyAll() {
    const done = lastSegs.filter((s) => s.final);
    const text = (s) => (translateOn ? `${s.src}\n${s.trans}` : s.src);
    await navigator.clipboard.writeText(done.map(text).join('\n\n'));
    toast(TSI18n.t('log.copied', { n: done.length }));
  }

  // ---------- 按鈕 ----------

  function send(m) {
    try {
      chrome.runtime.sendMessage(m).catch(() => {});
    } catch {
      // 擴充功能已重新載入，這個字幕框失效了；再點一次圖示會換成新的
    }
  }

  // A−／A+：譯文和原文一起調整
  const font = (d) => TSPrefs.update({
    font: fit(prefs.font + d, 12, 48), srcFont: fit(prefs.srcFont + d, 10, 40),
  });
  const ACTIONS = {
    smaller: () => font(-2),
    bigger: () => font(2),
    toggle: () => send({ to: 'engine', cmd: 'toggle' }),
    clear: () => send({ to: 'engine', cmd: 'clear' }),
    settings: toggleSettings,
    panel: () => send({ to: 'sw', cmd: 'openPanel' }),
    latest: () => toLatest(),
    copy: () => copyAll().catch((e) => toast(e.message)),
    reset: () => {
      box = defaultBox();
      apply();
      save();
    },
    close: () => {
      closed = true;
      panel.hidden = true;
      el.classList.remove('open');
      updateVisibility();
      send({ to: 'engine', cmd: 'stop' });
    },
  };

  const CLICKS = {
    act: (v) => ACTIONS[v](),
    go: (v) => showPage(v),
    tile: (v) => TSPrefs.update(TILES.find((x) => x.id === v).flip(prefs)),
    ui: (v) => TSPrefs.set('uiLang', v),
  };
  // ⭐ 按下就收藏，不等放開：字幕每秒會重畫好幾次，按鈕會被換掉，等到放開時 click 常常不會觸發
  root.addEventListener('pointerdown', (e) => {
    const star = e.target.closest('button[data-mark]');
    if (!star || e.button !== 0) return;
    e.preventDefault();
    markSeg(Number(star.dataset.mark)).catch((err) => toast(err.message));
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Object.entries(CLICKS).forEach(([key, fn]) => { if (b.dataset[key]) fn(b.dataset[key]); });
  });

  // ---------- 畫字幕、套設定 ----------

  function div(cls, text) {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    return d;
  }

  // 原文和譯文都畫出來，要顯示哪一個、誰在上面由 CSS（data-show、data-order）決定
  function segView(s, i) {
    const d = div(s.final ? 'seg' : 'seg interim', '');
    d.classList.toggle('marked', markedSrc.has(s.src));
    d.append(div('src', s.src));
    if (translateOn) d.append(div(s.q ? 'trans q' : 'trans', s.trans || '…'));
    d.insertAdjacentHTML('beforeend',
      `<button class="star" data-mark="${i}" title="${TSI18n.t('mark.add')}">${icon('star', 16)}</button>`);
    return d;
  }

  // ---------- 收藏 ----------

  // 收藏過的句子（用原文比對），讓 ⭐ 一直亮著
  let markedSrc = new Set();
  const useMarks = (marks) => { markedSrc = new Set(marks.map((m) => m.src)); };
  TSMarks.list().then(useMarks);
  TSMarks.watch((marks) => { useMarks(marks); rerender(); });

  // 網頁裡正在播的影片播到第幾秒（沒有影片就是 null），之後可以回到這裡重聽
  function videoTime() {
    const vids = [...document.querySelectorAll('video')];
    const v = vids.find((x) => !x.paused) ?? vids.find((x) => x.currentTime > 0);
    return v ? v.currentTime : null;
  }

  async function markSeg(i) {
    const meta = { title: document.title, url: location.href, videoTime: videoTime(),
                   from: TSPrefs.source(prefs.lang).tr, to: prefs.target };
    await TSMarks.add(TSMarks.build(lastSegs, i, meta));
    toast(TSI18n.t('mark.saved'));
  }

  // 不翻譯時（來源和目標相同）一定要顯示原文，否則畫面會是空的
  const updateShow = () => { el.dataset.show = translateOn ? prefs.show : 'src'; };

  // 停在最底下 → 新字幕來時自動捲到最新；往上看舊字幕時不打擾，改顯示「↓ 最新」按鈕
  const subs = q('.subs'), latest = q('.latest');
  const atBottom = () => subs.scrollHeight - subs.scrollTop - subs.clientHeight < 24;
  const toLatest = () => { subs.scrollTop = subs.scrollHeight; };
  subs.addEventListener('scroll', () => { latest.hidden = atBottom(); });

  let lastMsg = null;
  const rerender = () => { if (lastMsg) render(lastMsg); };   // 收藏清單變了，重畫 ⭐

  function render(m) {
    lastMsg = m;
    el.dataset.status = m.status;
    const state = q('.state');
    state.dataset.i18nTitle = `state.${m.status}`;   // 標上 key，換介面語言時會跟著換
    state.title = TSI18n.t(state.dataset.i18nTitle);
    q('.toggle').innerHTML = icon(RUNNING.has(m.status) ? 'pause' : 'play');
    alertBox.hidden = !(m.status === 'error' && m.reason);
    alertBox.textContent = m.reason || '';
    translateOn = m.translate;
    lastSegs = m.segs;
    updateShow();
    const follow = atBottom();
    const segs = m.segs.map(segView);   // map 會把第幾句（i）一起傳進去
    subs.replaceChildren(...(segs.length ? segs : [div('empty', TSI18n.t('ov.empty'))]));
    if (follow) toLatest();
    latest.hidden = atBottom();
  }

  const updateVisibility = () => {
    host.style.display = closed || prefs.display === 'panel' ? 'none' : '';
  };

  function applyPrefs(p) {
    prefs = p;
    TSPrefs.paint(host, TSPrefs.themeVars(p, 'deep'));   // 主題顏色：懸浮框疊在影片上，一律用深色組
    host.style.setProperty('--bg-alpha', p.bg / 100);
    host.style.setProperty('--trans-size', `${p.font}px`);
    host.style.setProperty('--src-size', `${p.srcFont}px`);
    el.dataset.outline = p.outline;
    el.dataset.align = p.align;
    el.dataset.order = p.order;
    el.classList.toggle('highlight', p.highlight);
    el.classList.toggle('pinbar', !p.barAutoHide);
    updateShow();
    TSI18n.use(p.uiLang);
    TSI18n.apply(root);
    TSPrefs.show(root, p);   // 工具列的語言選單和設定子頁
    showMenuState(p);
    updateVisibility();
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === 'render') render(m);
  });
  TSPrefs.bind(root);
  TSPrefs.watch(applyPrefs);
  applyPrefs(prefs);   // 先用預設值畫出來，讀到存檔後再更新
  TSPrefs.load().then(applyPrefs);

  // ---------- 放進網頁 ----------

  // 全螢幕時只有全螢幕的那個元素看得到，所以把字幕框搬進去；退出時搬回來。
  const place = () => (document.fullscreenElement ?? document.documentElement).appendChild(host);
  document.addEventListener('fullscreenchange', place);
  addEventListener('resize', apply);

  const show = () => {
    closed = false;
    updateVisibility();
    place();
  };
  globalThis.__tabSubtitle = { show };

  apply();
  show();
  chrome.storage.local.get(KEY).then((r) => {
    box = { ...box, ...r[KEY] };
    apply();
  });
})();
