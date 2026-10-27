// 背景程式（總機）：
//   點圖示 → （需要時）開側邊欄、注入懸浮框、拿聲音通行證交給背景引擎（offscreen.js）
//   背景引擎的字幕 → 轉給網頁裡的懸浮框（背景引擎不能直接傳給網頁）
//   設定變更 → 轉給背景引擎（背景引擎不能讀 chrome.storage）
importScripts('i18n.js', 'icons.js', 'prefs.js');
const { t } = TSI18n;

// v0.0.1 設過 openPanelOnActionClick=true，Chrome 會永久記住，
// 導致點圖示時 onClicked 不觸發。這裡明確關掉。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

const toEngine = (m) => chrome.runtime.sendMessage({ to: 'engine', ...m }).catch(() => {});
const engineLog = (msg) => toEngine({ cmd: 'log', msg });

// 開側邊欄必須在點圖示的第一時間做，前面不能有 await，所以「顯示位置」先記在變數裡。
// 限制：背景程式閒置被 Chrome 暫停後，第一次點擊時還沒讀到設定，會先當成「懸浮框」。
let display = TSPrefs.DEFAULT.display;
TSPrefs.load().then((p) => {
  display = p.display;
  TSI18n.use(p.uiLang);
});
TSPrefs.watch((p) => {
  display = p.display;
  TSI18n.use(p.uiLang);
  toEngine({ cmd: 'prefs', prefs: p });
});

let creating = null;
async function ensureEngine() {
  const found = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (found.length) return;
  creating ??= chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Capture tab audio in the background for speech recognition and translation',
  }).finally(() => { creating = null; });
  await creating;
}

// 通行證只能用一次、幾秒內過期，拿到就立刻交給背景引擎。
// 每次點圖示都重新擷取：先請背景引擎放掉舊的聲音軌，同一個分頁才能再擷取。
chrome.action.onClicked.addListener(async (tab) => {
  if (display !== 'overlay') chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  const overlay = chrome.scripting
    .executeScript({ target: { tabId: tab.id }, files: ['i18n.js', 'icons.js', 'prefs.js', 'marks.js', 'overlay.js'] })
    .then(() => null, (e) => e.message);
  await ensureEngine();
  await toEngine({ cmd: 'release' });
  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    return engineLog(t('log.captureFail', { err: e.message }));
  }
  const overlayError = await overlay;
  if (overlayError) engineLog(t('log.overlayFail', { err: overlayError }));
  const title = tab.title || tab.url || `#${tab.id}`;   // Chrome 自己的頁面拿不到標題
  toEngine({ cmd: 'capture', streamId, tabId: tab.id, title, url: tab.url, prefs: await TSPrefs.load() });
});

chrome.runtime.onMessage.addListener((m, sender) => {
  // 背景引擎的字幕 → 網頁的懸浮框（網頁沒有懸浮框時，如 chrome:// 頁面，忽略）
  if (m.type === 'render' && m.tabId != null) chrome.tabs.sendMessage(m.tabId, m).catch(() => {});
  // 懸浮框的 ☰ 按鈕 → 打開側邊欄（必須馬上呼叫，前面不能有 await）
  if (m.to === 'sw' && m.cmd === 'openPanel' && sender.tab)
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
      .catch((e) => engineLog(t('log.panelFail', { err: e.message })));
});
