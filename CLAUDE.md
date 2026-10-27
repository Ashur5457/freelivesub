# FreeLiveSub：分頁聲音 → 任意語言即時雙語字幕（Chrome 擴充功能）

> 開發文件：架構、踩過的坑、進度。每次開始工作前先讀完本檔（個人設定另見 `CLAUDE.local.md`，不公開）。

## 1. 需求

**一句話**：免費、完全在本機運作的 Chrome 擴充功能，把任何分頁的聲音即時轉成「原文＋譯文」雙語字幕。

- 起點：開發者自己常用即時字幕，但現有工具都要付費，所以自己做；2026-10 起公開在 GitHub（https://github.com/Ashur5457/freelivesub，MIT）
- 不處理使用者自己麥克風的聲音、不做多人共用
- **必須免費、完全在本機**：不用任何付費 API、不架伺服器，聲音和文字不送到外部（使用者自己按的 Google 翻譯／DeepL 查證連結除外）
- 主要使用情境：YouTube、niconico、直播、線上會議網頁版；主要測試日文、英文
- 參考對象：ViiTor 即時翻譯 Chrome 擴充功能（懸浮、可拖曳、可縮放的字幕框），但介面刻意做出區隔

## 2. 環境

- 開發與實測：Windows、Chrome 155（Stable，64 位元）；開發機的硬體細節在 `CLAUDE.local.md`
- 安裝方式：`chrome://extensions` → 開發人員模式 → 載入未封裝項目
- 每次改完程式：在 `chrome://extensions` 按 🔄 重新載入，影片分頁**重新整理網頁**，再點一次工具列圖示

## 3. 技術路線（v0.4.0 架構）

全部使用 Chrome 內建功能，完全在本機運作。辨識和翻譯在看不見的背景引擎（offscreen document）裡跑，側邊欄和懸浮框都只負責顯示：

```
點工具列圖示（在影片分頁上）
  → sw.js：顯示位置 ≠ 懸浮框 時先 sidePanel.open()（第一個呼叫，不能 await）
           注入 prefs.js + overlay.js
           確保 offscreen document 存在 → 請引擎 release 舊聲音軌
           → tabCapture.getMediaStreamId() → 送 capture 給引擎
  → offscreen.js（引擎）：getUserMedia({chromeMediaSource:'tab'}) + AudioContext 播回聲音
           → SpeechRecognition（processLocally）.start(音訊軌)
           → Translator（ja/en → zh-Hant）→ segments
           → runtime 訊息 render / log
  → sw.js 把 render 轉給網頁（chrome.tabs.sendMessage）→ overlay.js 顯示
  → panel.js（如果開著）直接收 render / log；剛打開時送 sync 要目前狀態和紀錄
```

訊息格式：`{ to:'engine', cmd }`（capture、release、prefs、log、start、toggle、stop、clear、retry、sync）、`{ to:'sw', cmd:'openPanel' }`、`{ type:'render', tabId, status, label, segs }`、`{ type:'log', line }`。引擎對每個指令都回覆 `true`（sync 回覆狀態快照）。

語言：`prefs.lang`＝來源（辨識代碼，如 ja-JP），`prefs.target`＝目標（翻譯代碼，如 zh-Hant）；翻譯器以「來源>目標」為 key。來源和目標相同時不翻譯（`translate:false`，畫面只顯示原文）。

設定：唯一來源是 `chrome.storage.local` 的 `prefs`（`prefs.js` 定義預設值、共用設定表單 HTML/CSS、讀寫函式）。側邊欄和懸浮框直接讀寫；引擎不能讀 storage，由 `sw.js` 監聽變更後轉送。語言也是 prefs 的一部分（`lang`），引擎收到語言變更時 `rec.stop()`，onend 用新語言接回。

實測結果：
- `SpeechRecognition.start(MediaStreamTrack)` 在 Chrome 155 可用，**在 offscreen document 裡也可用**（v0.3.0 背景測試通過）
- offscreen document 的 AudioContext 建立即為 `running`，影片聲音不會被靜音
- 翻譯延遲 9～150 ms，**不是瓶頸**；品質才是問題（短句無上下文、專有名詞、長句漏翻）
- 本機支援的本地語音模型：已安裝 ja-JP、en-US、en-GB；可下載 zh-TW、cmn-Hant-TW、zh-CN、ko-KR、fr、de、es、it、pt-BR、ru、hi、id、th、vi、tr、pl；不支援 yue-Hant-HK、nl-NL、ar-SA
- 資源用量：語音辨識服務 610 MB／76% 單核、翻譯服務 126 MB／33%、擴充功能 53 MB／9%
- 模型存放位置（Chrome 統一管理、所有網站與擴充功能共用，移除擴充功能不會刪）：`%LOCALAPPDATA%\Google\Chrome\User Data\` 下的 `SODA\`（語音辨識引擎 35 MB）、`SODALanguagePacks\`（en-US 194 MB、ja-JP 167 MB）、`TranslateKit\models\`（翻譯，178 MB）、`OptGuideOnDeviceModel\`（Gemini Nano，尚未下載）
- **`TranslateKit\models\` 只有 `en_ja`、`en_zh-Hant`，沒有 `ja_zh-Hant` → ja→zh-Hant 確定經英文中轉**（解釋了 ja→en 比 ja→zh-Hant 通順、「番組」→program→「程式」這類錯誤）
- `en-US` 路線尚未實測

## 4. 已踩過的坑（不要再犯）

1. **使用者點擊效力（transient activation）約 5 秒就過期**
   `Translator.create()` 和 `SpeechRecognition.install()` 在模型狀態為 `downloadable` 時都需要「剛點過按鈕」。
   → 必須在同一次點擊中**同時**發出（`Promise.allSettled`），不能一個 await 完再做另一個。
   → 背景引擎沒有點擊，**不能下載模型**，只能用已下載的；下載一律在側邊欄「準備模型」做。
2. **不能從側邊欄呼叫 `chrome.tabCapture.getMediaStreamId()`**
   會報錯 `Extension has not been invoked for the current page`。
   → 必須在 service worker 的 `chrome.action.onClicked` 裡取得 stream ID，再傳給引擎。stream ID 只能用一次、幾秒內過期。
   → `chrome.sidePanel.open()` 必須是 onClicked 裡第一個呼叫，前面不能有 await。所以「顯示位置」快取在 sw 變數裡；sw 閒置被暫停後的第一次點擊還沒讀到設定，會當成「懸浮框」（已知限制）。
3. **`setPanelBehavior({openPanelOnActionClick:true})` 會被 Chrome 永久記住**，導致 `action.onClicked` 不觸發。
   → `sw.js` 開頭明確設 `false`。不要再使用 openPanelOnActionClick。
4. 側邊欄裡建立的 AudioContext 沒有點擊時是 `suspended`（v0.0.4～v0.3.0 的問題）；搬到 offscreen 後不再發生。
5. 同一個分頁不能同時被擷取兩次 → 每次點圖示前先請引擎 `release`。
6. offscreen document 只能用 `chrome.runtime`；也不能 `chrome.tabs.sendMessage` → 字幕由 sw.js 轉送給網頁。
7. 規則：換分頁或整頁重新載入後，必須在該分頁再點一次圖示。
8. **不要把區域變數取名 `t`**：`t` 是 i18n 的查表函式（`const { t } = TSI18n`）。v0.7.0 的 `translate()` 用 `const t = translators[…]` 蓋掉它，切成多段的句子記紀錄時報 `t is not a function`。測試要真的跑到翻譯（用假的 translator 物件），不能只測「沒有模型」的分支。
10. **字幕區的按鈕不能用 click**：字幕每秒重畫好幾次（`replaceChildren`），按下和放開時已經是不同的按鈕，click 不會觸發。v0.10.0 懸浮框的 ⭐ 因此按不到 → 改用 `pointerdown`（v0.10.1）。測試時要模擬「按下 → 重畫 → 放開」，不能只呼叫 `el.click()`。
9. **共用的 `FORM_CSS` 要限定元素類型**：它會和懸浮框自己的樣式放在同一個 Shadow DOM。v0.8.0 開關用 `.toggle`，和懸浮框的暫停按鈕 `.toggle` 撞名，開關的白色圓鈕（`::before`）畫到了暫停鍵上 → 改成 `input.toggle`（v0.8.1）。

## 5. 目前檔案

| 檔案 | 作用 |
|---|---|
| `manifest.json` | MV3 v0.12.0，名稱 FreeLiveSub；權限 `tabCapture`、`sidePanel`、`storage`、`scripting`、`activeTab`、`offscreen` |
| `i18n.js` | 介面文字對照表 `TSI18n`：每個 key 一行、6 欄固定順序（zh-Hant、en、zh-Hans、ja、ko、es）；`t(key, vars)`、`apply(root)` 處理 `data-i18n`／`data-i18n-title`；`uiLang: 'auto'` 依瀏覽器語言。**必須比 prefs.js 先載入** |
| `icons/` | B3 圖示 16／32／48／128 px（16、32 是無尾巴、大字的小尺寸版）；由 `tools/make_icons.ps1` 產生（PowerShell＋System.Drawing，Yu Gothic Bold；執行：`powershell -File tools/make_icons.ps1 -OutDir icons`） |
| `prefs.js` | 共用設定：預設值、**語言表**（`SOURCES` 來源 18 種、`TARGETS` 目標 39 種、`LANG_SELECTS`）、設定表單 HTML/CSS、load/set/watch/show/bind（側邊欄、懸浮框、sw、引擎都載入） |
| `split.js` | 文字處理 `TSSplit`：tidy（只對 ja／zh 刪空格）、splitSentences（切句規則表）、joinParts；引擎和側邊欄實驗共用 |
| `marks.js` | 收藏 `TSMarks`：storage key `marks`；build／add／remove、Google 翻譯／DeepL 連結、回到影片連結、AI 提問、匯出 .md |
| `icons.js` | 內嵌 SVG 圖示 `TSIcons.icon(name, size)` |
| `lab.js` | 側邊欄「實驗：Gemini Nano」（暫時性，文字只寫繁中）：檢查、下載、三條路線比較 |
| `sw.js` | 總機：點圖示流程、建立引擎、轉送 render 給網頁、轉送 prefs 給引擎、☰ 開側邊欄 |
| `offscreen.html` / `offscreen.js` | 背景引擎：擷取、辨識、翻譯、segment、state、紀錄 |
| `overlay.js` | 懸浮字幕框（content script，Shadow DOM）：顯示字幕、⚙ 設定面板、拖曳縮放；只自己存位置大小（`overlayBox`） |
| `panel.html` / `panel.js` | 側邊欄：檢查、準備模型、暫停/停止、設定、除錯紀錄、字幕紀錄（複製全部） |

## 6. 實測發現的問題

1. ~~中文跟不上~~ → interim 依「更新速度」節流翻譯
2. ~~日文空格造成漏翻~~ → `clean()`
2b. **長句只翻第一句**（無標點、多句黏在一起）→ v0.5.0 切句子＋刪語助詞（待實測）
3. **辨識錯字**：例如 キャント スリープ（can't sleep）被聽成 キャント スリーブ（can't sleeve）；ジャル（JAL）→「日軍」。需要術語表。**使用者決定先不做**
4. **翻譯品質**：短句無上下文（続きまして→「蟬聯」、懐かしい→「昂貴」）。候選：刪語助詞、長句切段、Gemini Nano（Prompt API，記憶體吃緊、官方未列中文輸出，需驗證）
5. ~~介面簡陋 / 側邊欄佔空間~~ → v0.4.0 懸浮框為主、側邊欄可選

## 7. 進度與計畫

### 已完成
- v0.1.0 segment 資料結構、interim 翻譯、懸浮框、狀態列
- v0.2.0 字幕樣式、更新速度、高亮、複製全部、語言檢查、UI 美化
- v0.3.0 背景測試通過；懸浮框「框多高就顯示幾句」（最多 10 句）
- v0.4.1～0.4.2 懸浮框縮放改用自製右下角把手（CSS `resize` 會被字幕區的 mask-image 蓋住）；畫出來的框一律限制在可見範圍內（扣捲軸、`box-sizing: border-box`），但 `box` 保留使用者設定，視窗變大會恢復；標題列按鈕會換行，✕ 永遠看得到
- v0.4.3 字幕框最大寬 95%、高 60% 可見範圍（避免全螢幕時拉大的存檔在一般視窗鋪滿頁面）；⚙ 面板加「重設大小位置」
- v0.4.4 參考 ViiTor：預設框 480×440 放右側上下置中；四個角都能縮放（`CORNERS` 表＋`stretch()`，對角固定）；最大高度改 90%；新增 prefs `align`（靠左預設／置中）
- v0.4.5 懸浮框原文與中文同字級（原文較淡）；字幕區改為可捲動（最近 50 句），停在底部才自動跟上，往上看時顯示「↓ 最新」
- v0.5.0 **（待實測）** 翻譯前切句子：segment 多存 `raw`（辨識原始輸出，詞素間有空格）；`splitSentences()` 逐詞累積，累積文字以 `JA_ENDINGS` 結尾且 ≥ 8 字、下一詞不是 `TAILS` 小詞就切；超過 40 字強制切（英文只按 160 字切）；`FILLERS`（え、えー、えっと、うー、あのー…）不送翻譯；各段平行翻譯後 `joinZh()` 接回。除錯紀錄會記「切成 N 段翻譯：…」。**前提是本地辨識真的在詞素間加空格**，需從紀錄確認
- v0.5.0 實測：本地日文辨識**確實在詞素間加空格**，長句翻譯明顯變完整；但 40 字硬切會切在詞中間（切っ / ちゃう、お / 金）
- v0.5.1 **（待實測）** 硬切改軟切：記住最近的自然斷點（結尾為 `JA_SOFT` 助詞 て・で・は・が・を・に・し・けど・から・ので・たら・ながら），超過 40 字退回該斷點切，完全沒斷點才 80 字硬切；「下一詞黏在前面」改成看開頭（`JOINS_PREV`，≤ 3 字），含 ね・か・よ・の・た・ちゃ・ん・っ 等與〜て後的輔助動詞（ほしい・いる・おく・しまう・みる・もらう・くれる・あげる）
- v0.5.2 清除字幕：懸浮框 🗑、側邊欄「清除」→ 引擎 `clear`；capture 到不同分頁時自動清空，同分頁重點圖示保留
- v0.6.0 **（待實測）** 多語言：語言表放 `prefs.js`；懸浮框標題列和側邊欄改成「來源 → 目標」下拉選單；側邊欄詢問 Chrome（`SR.available`、`Translator.availability`）後在選單標 ✓ 已下載／⬇ 可下載／✕ 不支援（停用）／＝ 同語言；「準備模型」只下載目前組合；換目標語言時已有字幕重新翻譯；segment 欄位 `zh` 改名 `trans`；刪空格（`tidy`）只用於 ja／zh（韓、俄等用空格分詞的語言不能刪）；切句 `ruleFor()`：日文專用規則，中文按標點＋40 字，其他語言按標點＋160 字；譯文接回 `joinParts()` 依目標語言用全形或半形逗號。已用假 Chrome 環境測過純函式、側邊欄標示、懸浮框選單
- v0.6.0 實測：本機 Chrome 從 ja 可翻成 38 種語言（zh-Hant 已下載，其餘皆可下載）；換到未下載組合會報錯，下載後引擎停在錯誤狀態需手動重開
- v0.6.1 「準備模型」全部成功後送 `retry` 給引擎（有聲音軌且沒在辨識時自動 start）；分頁標題拿不到時改顯示網址
- v0.6.1 實測：ja→en 可用，英譯品質看起來比 ja→zh-Hant 通順（推測 Chrome 的 ja→zh-Hant 可能經英文中轉，未證實）
- v0.6.2 切句表微調：`JA_FILLERS` 加 えと、あー；`jaAttached` 擋住 けれど／けれども（不限 3 字）
- v0.7.0 **（待實測）** 名稱改 FreeLiveSub、加上圖示；介面多語言：所有介面文字改用 `i18n.js`（99 句 × 6 語言），設定表單加「介面語言」（自動＋6 種）；表單 HTML 只放 key，換語言時 `apply()` 重填；引擎和 sw 的訊息也用 `t()`。側邊欄狀態列在引擎未啟動時掛 `data-i18n`，收到 render 後移除。已用假 Chrome 環境測過側邊欄 6 種語言切換、懸浮框、引擎錯誤訊息；也用腳本檢查過 key 都存在且每行剛好 6 欄
- v0.7.1 修正：`translate()` 的區域變數 `t` 蓋掉 i18n 的 `t()`（改名 `translator`）；已用假 translator 跑完整翻譯流程驗證
- v0.8.0 **（進行中，待實測）** 和風改版：`icons.js`（內嵌 SVG）；主題 茶／墨／自訂（`themeVars()` 用背景色＋主色混色推算，deep＝懸浮框與深色側邊欄、pale＝淺色側邊欄）；12 種和色＋調色盤、「跟主題」字色；原文顏色／大小獨立；顯示內容與順序；懸浮框膠囊工具列（28px 按鈕、狀態只留燈號）、錯誤提示條、分組外觀卡片；側邊欄卡片版面＋右上角介面語言。側邊欄截圖已確認；外觀卡片尚未截圖檢查
- v0.8.1 修正暫停鍵上的白點（`FORM_CSS` 的 `.toggle` 開關樣式撞名，改成 `input.toggle`）
- v0.9.0 **（待實測）** 懸浮框齒輪設定選單（刻意不做成 ViiTor 的條列＋藍色開關）：快速開關方塊 `TILES`（雙語字幕＝show both/trans、自動隱藏工具列＝新 pref `barAutoHide`、舊字幕變淡）＋分類卡片 `ROWS`（字幕外觀、顯示與速度、介面語言子頁，複製字幕、重設位置）＋底部使用教學／回報問題（GitHub issues）；點擊用 `CLICKS` 表依 data-act／data-go／data-tile／data-ui 分派。`prefs.js` 表單拆成 `FORM_LOOK`、`FORM_DISPLAY`（側邊欄用合併的 `FORM_HTML`），新增共用 `HELP_HTML`；側邊欄加「使用教學」卡片。已在假環境測過選單切換、開關、語言子頁、教學頁並截圖
- v0.10.0 **（待實測）** 收藏有疑義的句子：新檔 `marks.js`（`TSMarks`，storage key `marks`，最多 500 筆；mark＝原文、譯文、前兩句、標題、網址、影片秒數、語言）。懸浮框每句 hover 出現 ⭐（收藏時讀網頁 `<video>` 的 currentTime）；側邊欄字幕紀錄也有 ⭐，新增「收藏的句子」卡片：Google 翻譯／DeepL 連結（使用者按了才送出）、複製成 AI 提問（附前文，`mark.prompt` 6 語模板）、回到影片（YouTube `t=`、niconico `from=`）、刪除、匯出 .md、全部刪除。引擎 snapshot 多送 `url`。已在假環境測過
- v0.10.0 **Gemini Nano 驗證工具（待使用者回報）**：新檔 `lab.js`（側邊欄「實驗：Gemini Nano」卡片，文字暫時只寫繁中、沒進 i18n）。「檢查」＝`LanguageModel.availability()`（不指定語言、ja→目標／en／ja）；「比較翻譯」＝收藏的最近 5 句（沒有就用內建 5 句範例）分別給 Chrome Translator 和 Gemini Nano（system prompt 要求只輸出最後一行譯文、可參考 context 行；每句用 `session.clone()` 避免上下文累積），並排記錄結果和 ms。官方未宣告支援目標輸出語言時，改用不宣告 `expectedOutputs` 的模式並註明。模型 downloadable 時先 `confirm()`，確定後要再按一次才下載（confirm 會用掉點擊效力）。驗證完要移除或改成正式的「翻譯引擎」選項（候選設計：引擎表＋interim 用 Translator、final 用較好的引擎重翻）
- Gemini Nano 在只有 4 GB 顯示卡記憶體、16 GB 記憶體的開發機上仍可下載與執行（下載約 447 秒）
- Gemini Nano 實測 ja→en（5 句範例）：語意明顯優於 Translator（続きまして→Next、はい以上です→that's all、投げ銭→Donate；Translator 是 Continue／that's more／coin），但會把前文一起翻進去（提示已改成 `<context>`／`<line>` 分開）；速度 740～1420 ms／句（Translator 26～106 ms）→ 適合「講完的句子重翻」，不適合 interim。**ja→zh-Hant 尚未測**（官方未宣告中文輸出）
- 實驗卡片的下載改成獨立「下載 Gemini Nano」按鈕（不再 confirm＋按兩次）
- Gemini Nano 實測 ja→zh-Hant（官方未宣告中文輸出，用不宣告模式）：範例句語意好（以上、節目、捐款），但**實際問題句 5 句有 3 句直接輸出日文沒翻、其他混簡體字**（怀孕、视频）→ 不能直接當繁中引擎
- v0.10.1 新檔 `split.js`（`TSSplit`：tidy／splitSentences／joinParts，從 offscreen.js 原封不動搬出，引擎和側邊欄實驗共用）；收藏多存 `raw`（辨識原始輸出，切句用）；實驗改比三條路線 `labRoutes()`：Translator（切句後）／Nano 直接／**Nano→英文→Translator（en→目標有專用模型）**；⭐ 改用 pointerdown（見坑 10）
- 三路線實測 ja→zh-Hant（使用者收藏的 5 句問題句）：Translator 3/5 意思錯或漏半句；Nano 直接最懂意思但常混簡體／日文／俄文；**Nano→英文→Translator 最平衡**（不會出現其他文字、認得 Luna Lovegood），偶爾加戲或漏句；Nano 同句兩次結果不同（隨機性）
- v0.11.0 **（待實測）** 翻譯品質設定 `prefs.quality`：fast（預設，只用 Translator）／quality（講完的句子先顯示快速翻譯，再用「Gemini Nano 來源→英文 → Translator 英文→目標」重翻並換掉，segment 標 `q:true`、畫面加 ✨）。引擎：`ensureQuality()` 檢查並建立 Nano session（`temperature 0.1, topK 1`，不接受就用預設）與 en→目標 Translator；`enqueueQuality()` 一次一句、排隊最多 3 句、新的先翻；`s.seq` 變了就作廢；Nano 不能用時 `quality.blocked` 記住該語言組合並在紀錄說明、退回快速。來源是英文或同語言時不啟用。側邊欄「準備模型」選品質優先時一併下載 Nano 與 en→目標。lab 比較按鈕防連按。已用假模型在引擎測過換掉、排隊順序、退回
- v0.11.0 實測：**背景引擎（offscreen）可以跑 Gemini Nano**（紀錄出現「品質優先已啟用」）；但 400 字長句被 Nano 濃縮成兩句、蓋掉較完整的快速翻譯；英文中轉仍會把「番組」→program→「程式」；使用者連按「準備模型」5 次（看不出有沒有裝好）
- v0.12.0 **（待實測）** 引擎：`QUALITY_MAX_CHARS = 80`（太長不重翻）、`QUALITY_MIN_RATIO = 0.6`（重翻比快速翻譯短太多就不換，記 `log.qualityShort`）；snapshot 多送 `mode`（`engineMode()`：fast／quality／qualityPending／blocked）。側邊欄語言卡加**模型狀態清單** `neededModels()`（依設定列出需要的模型：語音、翻譯、品質優先時加 Nano 與 en→目標，各自 ✓／⬇／✕＋文字）、「目前使用」（引擎回報的 mode）；準備模型按鈕依狀態顯示「下載缺少的模型／下載中…／全部已安裝 ✓／有模型不支援」，非可下載狀態一律停用（解決連按）；Nano 下載紀錄改「下載 Gemini Nano {p}%」。已在假環境測過各狀態並截圖
- v0.4.x 實測：點圖示 → 懸浮框、☰／右鍵開側邊欄都正常（背景引擎架構可用）
- v0.4.0 **（待實測）** 辨識搬到背景引擎；顯示位置：懸浮框（預設）／側邊欄／兩者；懸浮框 ⚙ 設定面板（與側邊欄同一份 prefs）；☰ 開側邊欄（content script 訊息觸發 sidePanel.open，未驗證）；✕ = 停止並釋放分頁聲音

### 使用者的決定
- 術語表先不做；側邊欄保留最近 50 句
- 點圖示預設出懸浮框，可選側邊欄；懸浮框要有 ViiTor 式樣式設定
- 上架 GitHub 等功能測試穩定後再說（Chrome 商店需一次性 5 美元開發者費）
- 2026-10-22 決定公開到 GitHub；圖示選「B3 兩個對話框」（綠色對話框寫「あ」，前方白色對話框寫「A」，青綠 #1D9E75／#0F6E56）；正式圖示要用粗體日文字型重畫
- 專案名稱 **FreeLiveSub**（說明：「FreeLiveSub — 免費即時翻譯字幕」／「Free live translated subtitles, 100% on-device」）；GitHub 帳號 **Ashur5457**（https://github.com/Ashur5457），repo 名 `freelivesub`；LICENSE 用 MIT、著作權人 Ashur5457。README 開頭放使用者的動機：常用即時字幕，但現有工具都要付費，所以自己做
- 介面語言第一批：繁中、English、简中、日本語、한국어、Español（繁中以外由 Claude 翻譯，README 註明歡迎母語者修正）
- 不選的名字：ZeroSub（會被讀成「沒有字幕」）、FloatSub（已有同名擴充功能）、OpenLiveSub（和 Firefox 的 OpenSubs 太像）、Tabtitle（使用者看不到「分頁」）
- 2026-10-28 公開到 GitHub（Public，https://github.com/Ashur5457/freelivesub）；README 以繁中為預設（README.md），另有 en／ja／zh-Hans／ko／es 五個版本，格式參考使用者的 interactive-HCSDL；截圖之後補（放 `docs/readme/`）；提交身分用 `Ashur5457` ＋ GitHub noreply 信箱（只設在本 repo）
- 待做順序：v0.6 多語言翻譯（來源／目標語言由 Chrome 實際支援決定）→ v0.7 介面多語言 → 發布準備（名稱、圖示、README、LICENSE、CLAUDE.md 個人內容搬到 CLAUDE.local.md、git）

### 待做 / 候選
- 翻譯品質改善（見第 6 節第 4 點）
- 自動偵測語言（Chrome 本地辨識需事先指定語言；可試「辨識結果像亂碼就切換」的啟發式）
- 畫中畫字幕、術語表

## 8. 使用者與工作方式

個人的背景、回答語言、工作與審查方式寫在 `CLAUDE.local.md`（不上傳到 GitHub，Claude Code 會自動讀取）。
