// 介面文字對照表：側邊欄、懸浮框、背景程式、背景引擎共用。
// 每一句一行，欄位順序固定是 UI_LANGS 的順序，所以不會有哪個語言漏翻某一句；要加語言就在每行多加一欄。
//   畫面上的固定文字：HTML 標 data-i18n="key"（文字）或 data-i18n-title="key"（滑鼠提示），用 apply() 一次換掉
//   程式裡的訊息：t('key', { 變數 })，文字中的 {變數} 會被換成實際的值
// 繁中以外由 Claude 翻譯，歡迎母語者修正。懸浮框會被重複注入同一個網頁，所以用 ??= 避免重複定義。
globalThis.TSI18n ??= (() => {
  const UI_LANGS = ['zh-Hant', 'en', 'zh-Hans', 'ja', 'ko', 'es'];
  const NAMES = ['繁體中文', 'English', '简体中文', '日本語', '한국어', 'Español'];

  /* eslint-disable max-len */
  const S = {
    // ---------- 狀態 ----------
    'status.idle': ['⚪ 待機', '⚪ Idle', '⚪ 待机', '⚪ 待機中', '⚪ 대기', '⚪ En espera'],
    'status.paused': ['⚪ 已暫停', '⚪ Paused', '⚪ 已暂停', '⚪ 一時停止', '⚪ 일시정지', '⚪ En pausa'],
    'status.connecting': ['🟡 連接中', '🟡 Connecting', '🟡 连接中', '🟡 接続中', '🟡 연결 중', '🟡 Conectando'],
    'status.listening': ['🟢 辨識中', '🟢 Listening', '🟢 识别中', '🟢 認識中', '🟢 인식 중', '🟢 Escuchando'],
    'status.error': ['🔴 錯誤', '🔴 Error', '🔴 错误', '🔴 エラー', '🔴 오류', '🔴 Error'],

    // ---------- 錯誤（顯示在狀態列） ----------
    'err.hint': ['請打開側邊欄按「準備模型」', 'open the side panel and click "Prepare models"', '请打开侧边栏点击「准备模型」', 'サイドパネルを開いて「モデルを準備」を押してください', '사이드 패널을 열고 "모델 준비"를 누르세요', 'abre el panel lateral y pulsa «Preparar modelos»'],
    'err.trModel': ['翻譯模型（{pair}）未下載（{state}），{hint}', 'Translation model ({pair}) not downloaded ({state}): {hint}', '翻译模型（{pair}）未下载（{state}），{hint}', '翻訳モデル（{pair}）が未ダウンロードです（{state}）。{hint}', '번역 모델({pair})이 다운로드되지 않았습니다({state}). {hint}', 'Modelo de traducción ({pair}) no descargado ({state}): {hint}'],
    'err.srModel': ['{lang} 語音模型未下載（{state}），{hint}', '{lang} speech model not downloaded ({state}): {hint}', '{lang} 语音模型未下载（{state}），{hint}', '{lang} の音声モデルが未ダウンロードです（{state}）。{hint}', '{lang} 음성 모델이 다운로드되지 않았습니다({state}). {hint}', 'Modelo de voz de {lang} no descargado ({state}): {hint}'],
    'err.trackEnded': ['分頁聲音中斷：請在影片分頁上再點一次圖示', 'Tab audio ended: click the icon again on the video tab', '标签页声音中断：请在视频标签页上再点一次图标', 'タブの音声が途切れました。動画のタブでもう一度アイコンを押してください', '탭 오디오가 끊겼습니다. 동영상 탭에서 아이콘을 다시 누르세요', 'Se cortó el audio de la pestaña: vuelve a pulsar el icono en la pestaña del vídeo'],
    'err.noAudio': ['還沒擷取到聲音：請在影片分頁上點一次圖示', 'No audio yet: click the icon on the video tab', '还没获取到声音：请在视频标签页上点一次图标', 'まだ音声を取得していません。動画のタブでアイコンを押してください', '아직 오디오가 없습니다. 동영상 탭에서 아이콘을 누르세요', 'Aún no hay audio: pulsa el icono en la pestaña del vídeo'],
    'err.sr': ['辨識錯誤 {err}', 'Recognition error {err}', '识别错误 {err}', '認識エラー {err}', '인식 오류 {err}', 'Error de reconocimiento {err}'],
    'err.srStart': ['辨識無法開始 {err}', 'Recognition could not start {err}', '识别无法开始 {err}', '認識を開始できません {err}', '인식을 시작할 수 없습니다 {err}', 'No se pudo iniciar el reconocimiento {err}'],

    // ---------- 除錯紀錄 ----------
    'log.engineStarted': ['背景引擎已啟動', 'Engine started', '后台引擎已启动', 'エンジンを起動しました', '엔진이 시작되었습니다', 'Motor iniciado'],
    'log.captured': ['已擷取分頁: {title}（播放狀態 {state}）', 'Captured tab: {title} (playback {state})', '已获取标签页: {title}（播放状态 {state}）', 'タブを取得: {title}（再生状態 {state}）', '탭 캡처: {title} (재생 상태 {state})', 'Pestaña capturada: {title} (reproducción {state})'],
    'log.start': ['開始辨識（{pair}，{mode}）', 'Listening started ({pair}, {mode})', '开始识别（{pair}，{mode}）', '認識を開始（{pair}、{mode}）', '인식 시작 ({pair}, {mode})', 'Reconocimiento iniciado ({pair}, {mode})'],
    'log.paused': ['暫停（聲音軌保留）', 'Paused (audio kept)', '暂停（保留声音）', '一時停止（音声は保持）', '일시정지 (오디오 유지)', 'En pausa (se mantiene el audio)'],
    'log.stopped': ['停止並釋放分頁聲音（再點一次圖示即可重新開始）', 'Stopped and released tab audio (click the icon to start again)', '停止并释放标签页声音（再点一次图标即可重新开始）', '停止してタブの音声を解放しました（アイコンを押すと再開します）', '중지하고 탭 오디오를 해제했습니다 (아이콘을 누르면 다시 시작)', 'Detenido y audio liberado (pulsa el icono para empezar de nuevo)'],
    'log.cleared': ['已清除字幕', 'Subtitles cleared', '已清除字幕', '字幕を消去しました', '자막을 지웠습니다', 'Subtítulos borrados'],
    'log.switchLang': ['切換語言：{pair}', 'Language changed: {pair}', '切换语言：{pair}', '言語を変更: {pair}', '언어 변경: {pair}', 'Idioma cambiado: {pair}'],
    'log.split': ['切成 {n} 段翻譯：{parts}', 'Translated in {n} parts: {parts}', '切成 {n} 段翻译：{parts}', '{n} 分割で翻訳: {parts}', '{n}개로 나눠 번역: {parts}', 'Traducido en {n} partes: {parts}'],
    'log.translateError': ['翻譯錯誤 {err}', 'Translation error {err}', '翻译错误 {err}', '翻訳エラー {err}', '번역 오류 {err}', 'Error de traducción {err}'],
    'log.srError': ['辨識錯誤: {err}', 'Recognition error: {err}', '识别错误: {err}', '認識エラー: {err}', '인식 오류: {err}', 'Error de reconocimiento: {err}'],
    'log.error': ['錯誤：{reason}', 'Error: {reason}', '错误：{reason}', 'エラー: {reason}', '오류: {reason}', 'Error: {reason}'],
    'log.errorGeneric': ['錯誤 {err}', 'Error {err}', '错误 {err}', 'エラー {err}', '오류 {err}', 'Error {err}'],
    'log.captureFail': ['取得分頁聲音失敗: {err}', 'Could not capture tab audio: {err}', '获取标签页声音失败: {err}', 'タブの音声を取得できません: {err}', '탭 오디오를 캡처할 수 없습니다: {err}', 'No se pudo capturar el audio: {err}'],
    'log.overlayFail': ['懸浮框無法放進這個網頁: {err}（可改用側邊欄顯示）', 'Cannot show the floating box on this page: {err} (use the side panel instead)', '悬浮框无法放进这个网页: {err}（可改用侧边栏显示）', 'このページにはフローティング字幕を表示できません: {err}（サイドパネルをご利用ください）', '이 페이지에는 플로팅 자막을 표시할 수 없습니다: {err} (사이드 패널을 사용하세요)', 'No se puede mostrar el cuadro flotante en esta página: {err} (usa el panel lateral)'],
    'log.panelFail': ['無法打開側邊欄: {err}', 'Could not open the side panel: {err}', '无法打开侧边栏: {err}', 'サイドパネルを開けません: {err}', '사이드 패널을 열 수 없습니다: {err}', 'No se pudo abrir el panel lateral: {err}'],
    'log.apis': ['SpeechRecognition: {sr}；Translator: {tr}', 'SpeechRecognition: {sr}; Translator: {tr}', 'SpeechRecognition: {sr}；Translator: {tr}', 'SpeechRecognition: {sr}、Translator: {tr}', 'SpeechRecognition: {sr}, Translator: {tr}', 'SpeechRecognition: {sr}; Translator: {tr}'],
    'log.srModels': ['本地語音模型（可以當來源語言）：', 'On-device speech models (source languages):', '本地语音模型（可作为来源语言）：', 'ローカル音声モデル（元の言語）:', '로컬 음성 모델 (원본 언어):', 'Modelos de voz locales (idiomas de origen):'],
    'log.trModels': ['翻譯模型（從 {name} 翻成）：', 'Translation models (from {name} to):', '翻译模型（从 {name} 翻成）：', '翻訳モデル（{name} から）:', '번역 모델 ({name}에서):', 'Modelos de traducción (de {name} a):'],
    'log.downloading': ['翻譯模型 {pair} 下載 {p}%', 'Translation model {pair} downloading {p}%', '翻译模型 {pair} 下载 {p}%', '翻訳モデル {pair} ダウンロード {p}%', '번역 모델 {pair} 다운로드 {p}%', 'Modelo de traducción {pair} descargando {p}%'],
    'log.copied': ['已複製 {n} 句字幕到剪貼簿', 'Copied {n} lines to the clipboard', '已复制 {n} 句字幕到剪贴板', '{n} 件の字幕をコピーしました', '자막 {n}줄을 복사했습니다', '{n} líneas copiadas al portapapeles'],
    'log.notStarted': ['背景引擎還沒啟動：請在影片分頁點一次工具列圖示', 'Engine not running: click the toolbar icon on the video tab', '后台引擎还没启动：请在视频标签页点一次工具栏图标', 'エンジンが未起動です。動画のタブでツールバーのアイコンを押してください', '엔진이 실행되지 않았습니다. 동영상 탭에서 툴바 아이콘을 누르세요', 'Motor inactivo: pulsa el icono de la barra en la pestaña del vídeo'],
    'job.tr': ['翻譯模型 {pair}', 'Translation model {pair}', '翻译模型 {pair}', '翻訳モデル {pair}', '번역 모델 {pair}', 'Modelo de traducción {pair}'],
    'job.sr': ['語音模型 {lang}', 'Speech model {lang}', '语音模型 {lang}', '音声モデル {lang}', '음성 모델 {lang}', 'Modelo de voz {lang}'],
    'job.notNeeded': ['不需要（來源和目標相同）', 'Not needed (same language)', '不需要（来源和目标相同）', '不要（同じ言語）', '필요 없음 (같은 언어)', 'No hace falta (mismo idioma)'],
    'job.skipCloud': ['略過（雲端模式）', 'Skipped (cloud mode)', '跳过（云端模式）', 'スキップ（クラウドモード）', '건너뜀 (클라우드 모드)', 'Omitido (modo nube)'],
    'job.failed': ['失敗 {err}', 'Failed {err}', '失败 {err}', '失敗 {err}', '실패 {err}', 'Error {err}'],
    'word.yes': ['有', 'yes', '有', 'あり', '있음', 'sí'],
    'word.no': ['沒有', 'no', '没有', 'なし', '없음', 'no'],
    'mode.local': ['本地', 'on-device', '本地', 'ローカル', '로컬', 'local'],
    'mode.cloud': ['雲端', 'cloud', '云端', 'クラウド', '클라우드', 'nube'],

    // ---------- 側邊欄 ----------
    'panel.local': ['本地辨識', 'On-device recognition', '本地识别', 'ローカル認識', '로컬 인식', 'Reconocimiento local'],
    'panel.style': ['字幕外觀', 'Subtitle look', '字幕外观', '字幕の見た目', '자막 모양', 'Aspecto de subtítulos'],
    'panel.log': ['除錯紀錄', 'Debug log', '调试日志', 'デバッグログ', '디버그 로그', 'Registro de depuración'],
    'panel.history': ['字幕紀錄', 'Subtitle history', '字幕记录', '字幕の履歴', '자막 기록', 'Historial de subtítulos'],
    'btn.check': ['檢查', 'Check', '检查', 'チェック', '확인', 'Comprobar'],
    'btn.toggle': ['⏸ 暫停/繼續', '⏸ Pause/Resume', '⏸ 暂停/继续', '⏸ 一時停止/再開', '⏸ 일시정지/재개', '⏸ Pausar/Reanudar'],
    'btn.stop': ['停止', 'Stop', '停止', '停止', '중지', 'Detener'],
    'btn.copy': ['複製全部', 'Copy all', '复制全部', 'すべてコピー', '모두 복사', 'Copiar todo'],
    'btn.clear': ['清除', 'Clear', '清除', 'クリア', '지우기', 'Borrar'],

    // ---------- 懸浮框 ----------
    'ov.empty': ['字幕會顯示在這裡', 'Subtitles will appear here', '字幕会显示在这里', 'ここに字幕が表示されます', '여기에 자막이 표시됩니다', 'Los subtítulos aparecerán aquí'],
    'ov.latest': ['↓ 最新', '↓ Latest', '↓ 最新', '↓ 最新', '↓ 최신', '↓ Último'],
    'ov.smaller': ['字變小', 'Smaller text', '字变小', '文字を小さく', '글자 작게', 'Texto más pequeño'],
    'ov.bigger': ['字變大', 'Larger text', '字变大', '文字を大きく', '글자 크게', 'Texto más grande'],
    'ov.toggle': ['暫停／繼續', 'Pause / resume', '暂停／继续', '一時停止／再開', '일시정지／재개', 'Pausar / reanudar'],
    'ov.clear': ['清除字幕', 'Clear subtitles', '清除字幕', '字幕を消去', '자막 지우기', 'Borrar subtítulos'],
    'ov.settings': ['設定', 'Settings', '设置', '設定', '설정', 'Ajustes'],
    'ov.panel': ['打開側邊欄', 'Open side panel', '打开侧边栏', 'サイドパネルを開く', '사이드 패널 열기', 'Abrir panel lateral'],
    'ov.close': ['停止並關閉', 'Stop and close', '停止并关闭', '停止して閉じる', '중지하고 닫기', 'Detener y cerrar'],
    'lang.source': ['來源語言', 'Source language', '来源语言', '元の言語', '원본 언어', 'Idioma de origen'],
    'lang.target': ['翻譯成', 'Translate to', '翻译成', '翻訳先', '번역할 언어', 'Traducir a'],

    // ---------- 設定表單 ----------
    'form.display': ['顯示位置', 'Show in', '显示位置', '表示場所', '표시 위치', 'Mostrar en'],
    'form.bg': ['背景不透明', 'Background', '背景不透明', '背景の濃さ', '배경 불투명도', 'Opacidad del fondo'],
    'form.outline': ['文字描邊', 'Outline', '文字描边', '文字のふち', '글자 테두리', 'Contorno'],
    'form.align': ['文字對齊', 'Alignment', '文字对齐', '文字の配置', '정렬', 'Alineación'],
    'form.speed': ['更新速度', 'Update speed', '更新速度', '更新速度', '업데이트 속도', 'Velocidad'],
    'form.highlight': ['舊字幕變淡', 'Fade older lines', '旧字幕变淡', '古い字幕を薄く', '이전 자막 흐리게', 'Atenuar anteriores'],
    'form.speedHint': ['更新速度＝話還沒講完時多久翻一次。越快譯文跟得越緊，但越吃 CPU。', 'Update speed = how often unfinished sentences are translated. Faster keeps up better but uses more CPU.', '更新速度＝话还没说完时多久翻译一次。越快译文跟得越紧，但越占 CPU。', '更新速度＝話の途中でどのくらいの間隔で翻訳するか。速いほど追従しますが CPU を多く使います。', '업데이트 속도 = 말이 끝나기 전에 얼마나 자주 번역할지. 빠를수록 잘 따라가지만 CPU를 더 씁니다.', 'Velocidad = cada cuánto se traducen las frases sin terminar. Más rápido sigue mejor el ritmo, pero usa más CPU.'],
    'opt.auto': ['自動', 'Auto', '自动', '自動', '자동', 'Automático'],
    'opt.overlay': ['懸浮框', 'Floating box', '悬浮框', 'フローティング', '플로팅 상자', 'Cuadro flotante'],
    'opt.panel': ['側邊欄', 'Side panel', '侧边栏', 'サイドパネル', '사이드 패널', 'Panel lateral'],
    'opt.both': ['兩者', 'Both', '两者', '両方', '둘 다', 'Ambos'],
    'opt.none': ['無', 'None', '无', 'なし', '없음', 'Ninguno'],
    'opt.black': ['黑色', 'Black', '黑色', '黒', '검정', 'Negro'],
    'opt.white': ['白色', 'White', '白色', '白', '흰색', 'Blanco'],
    'speed.realtime': ['即時（每 0.25 秒翻譯）', 'Real time (every 0.25 s)', '实时（每 0.25 秒翻译）', 'リアルタイム（0.25 秒ごと）', '실시간 (0.25초마다)', 'Tiempo real (cada 0,25 s)'],
    'speed.fast': ['快（每 0.5 秒）', 'Fast (every 0.5 s)', '快（每 0.5 秒）', '速い（0.5 秒ごと）', '빠름 (0.5초마다)', 'Rápida (cada 0,5 s)'],
    'speed.normal': ['標準（每 1 秒）', 'Normal (every 1 s)', '标准（每 1 秒）', '標準（1 秒ごと）', '보통 (1초마다)', 'Normal (cada 1 s)'],
    'speed.slow': ['慢（每 2 秒）', 'Slow (every 2 s)', '慢（每 2 秒）', '遅い（2 秒ごと）', '느림 (2초마다)', 'Lenta (cada 2 s)'],
    'speed.final': ['只顯示講完的句子', 'Finished sentences only', '只显示说完的句子', '話し終えた文のみ', '끝난 문장만', 'Solo frases terminadas'],
    'color.white': ['白', 'White', '白', '白', '흰색', 'Blanco'],

    // ---------- v0.8：主題、顯示內容、和色 ----------
    'state.idle': ['待機', 'Idle', '待机', '待機中', '대기', 'En espera'],
    'state.paused': ['已暫停', 'Paused', '已暂停', '一時停止', '일시정지', 'En pausa'],
    'state.connecting': ['連接中', 'Connecting', '连接中', '接続中', '연결 중', 'Conectando'],
    'state.listening': ['辨識中', 'Listening', '识别中', '認識中', '인식 중', 'Escuchando'],
    'state.off': ['未啟動', 'Not running', '未启动', '未起動', '실행 안 됨', 'Inactivo'],
    'state.error': ['錯誤', 'Error', '错误', 'エラー', '오류', 'Error'],
    'sec.theme': ['主題', 'Theme', '主题', 'テーマ', '테마', 'Tema'],
    'sec.text': ['文字', 'Text', '文字', '文字', '글자', 'Texto'],
    'sec.display': ['顯示', 'Display', '显示', '表示', '표시', 'Visualización'],
    'form.preview': ['預覽', 'Preview', '预览', 'プレビュー', '미리보기', 'Vista previa'],
    'preview.trans': ['非常感謝', 'Thank you very much', '非常感谢', 'Thank you very much', '감사합니다', 'Muchas gracias'],
    'form.theme': ['配色', 'Colors', '配色', '配色', '색상', 'Colores'],
    'theme.cha': ['茶', 'Cha (tea)', '茶', '茶', '차(茶)', 'Té (cha)'],
    'theme.sumi': ['墨', 'Sumi (ink)', '墨', '墨', '먹(墨)', 'Tinta (sumi)'],
    'theme.custom': ['自訂', 'Custom', '自定义', 'カスタム', '사용자 지정', 'Personalizado'],
    'form.themeColors': ['自訂顏色', 'Custom colors', '自定义颜色', 'カスタム色', '사용자 색상', 'Colores propios'],
    'form.themeBg': ['背景', 'Background', '背景', '背景', '배경', 'Fondo'],
    'form.themeAccent': ['主色', 'Accent', '主色', 'アクセント', '강조색', 'Acento'],
    'form.transColor': ['譯文顏色', 'Translation', '译文颜色', '訳文の色', '번역 색', 'Traducción'],
    'form.transFont': ['譯文大小', 'Translation size', '译文大小', '訳文のサイズ', '번역 크기', 'Tamaño traducción'],
    'form.srcColor': ['原文顏色', 'Original', '原文颜色', '原文の色', '원문 색', 'Original'],
    'form.srcFont': ['原文大小', 'Original size', '原文大小', '原文のサイズ', '원문 크기', 'Tamaño original'],
    'form.show': ['顯示內容', 'Show', '显示内容', '表示内容', '표시 내용', 'Mostrar'],
    'opt.showBoth': ['原文＋譯文', 'Both', '原文＋译文', '原文＋訳文', '원문+번역', 'Ambos'],
    'opt.showTrans': ['只有譯文', 'Translation only', '只有译文', '訳文のみ', '번역만', 'Solo traducción'],
    'opt.showSrc': ['只有原文', 'Original only', '只有原文', '原文のみ', '원문만', 'Solo original'],
    'form.order': ['順序', 'Order', '顺序', '順序', '순서', 'Orden'],
    'opt.srcFirst': ['原文在上', 'Original first', '原文在上', '原文が上', '원문 먼저', 'Original arriba'],
    'opt.transFirst': ['譯文在上', 'Translation first', '译文在上', '訳文が上', '번역 먼저', 'Traducción arriba'],
    'color.theme': ['跟主題', 'Match theme', '跟随主题', 'テーマに合わせる', '테마 따라가기', 'Según el tema'],
    'color.kinari': ['生成り（米白）', 'Kinari (off-white)', '生成（米白）', '生成り', '기나리 (미색)', 'Kinari (crudo)'],
    'color.yamabuki': ['山吹（金黃）', 'Yamabuki (golden)', '山吹（金黄）', '山吹色', '야마부키 (황금)', 'Yamabuki (dorado)'],
    'color.tamago': ['卵色（淡黃）', 'Tamago (pale yellow)', '卵色（淡黄）', '卵色', '다마고 (연노랑)', 'Tamago (amarillo claro)'],
    'color.wakatake': ['若竹（嫩綠）', 'Wakatake (bamboo green)', '若竹（嫩绿）', '若竹色', '와카타케 (연두)', 'Wakatake (verde bambú)'],
    'color.asagi': ['浅葱（淺藍綠）', 'Asagi (light teal)', '浅葱（浅蓝绿）', '浅葱色', '아사기 (청록)', 'Asagi (turquesa)'],
    'color.sora': ['空色（天藍）', 'Sora (sky blue)', '空色（天蓝）', '空色', '소라 (하늘색)', 'Sora (celeste)'],
    'color.fuji': ['藤色（淡紫）', 'Fuji (wisteria)', '藤色（淡紫）', '藤色', '후지 (연보라)', 'Fuji (glicina)'],
    'color.nadeshiko': ['撫子（粉紅）', 'Nadeshiko (pink)', '抚子（粉红）', '撫子色', '나데시코 (분홍)', 'Nadeshiko (rosa)'],
    'color.sango': ['珊瑚（珊瑚紅）', 'Sango (coral)', '珊瑚（珊瑚红）', '珊瑚色', '산고 (산호)', 'Sango (coral)'],
    'color.shu': ['朱色（朱紅）', 'Shu (vermilion)', '朱色（朱红）', '朱色', '슈 (주홍)', 'Shu (bermellón)'],
    'color.sumi': ['墨（墨黑）', 'Sumi (ink black)', '墨（墨黑）', '墨色', '스미 (먹색)', 'Sumi (negro tinta)'],
    'color.custom': ['自訂顏色', 'Custom color', '自定义颜色', 'カスタム色', '사용자 색', 'Color personalizado'],
    'panel.lang': ['語言', 'Languages', '语言', '言語', '언어', 'Idiomas'],
    'panel.howto': ['在影片分頁點一次工具列圖示就會開始', 'Click the toolbar icon on a video tab to start', '在视频标签页点一次工具栏图标就会开始', '動画のタブでツールバーのアイコンを押すと始まります', '동영상 탭에서 툴바 아이콘을 누르면 시작됩니다', 'Pulsa el icono de la barra en una pestaña de vídeo para empezar'],
    'panel.prepareHint': ['第一次使用或換了語言組合，請按「準備模型」', 'The first time, or after changing languages, click "Prepare models"', '第一次使用或换了语言组合，请点「准备模型」', '初回や言語を変えたときは「モデルを準備」を押してください', '처음이거나 언어를 바꿨다면 "모델 준비"를 누르세요', 'La primera vez, o al cambiar de idioma, pulsa «Preparar modelos»'],
    'panel.legend': ['✓ 已下載　⬇ 可下載　✕ 不支援', '✓ downloaded  ⬇ downloadable  ✕ not supported', '✓ 已下载　⬇ 可下载　✕ 不支持', '✓ 済み　⬇ ダウンロード可　✕ 非対応', '✓ 다운로드됨  ⬇ 다운로드 가능  ✕ 지원 안 됨', '✓ descargado  ⬇ descargable  ✕ no compatible'],

    // ---------- v0.9：設定選單、使用教學 ----------
    'menu.title': ['設定', 'Settings', '设置', '設定', '설정', 'Ajustes'],
    'menu.bilingual': ['雙語字幕', 'Bilingual', '双语字幕', '二か国語', '이중 자막', 'Bilingüe'],
    'menu.autoHide': ['自動隱藏工具列', 'Auto-hide toolbar', '自动隐藏工具栏', 'ツールバー自動非表示', '툴바 자동 숨김', 'Ocultar barra'],
    'menu.fade': ['舊字幕變淡', 'Fade old lines', '旧字幕变淡', '古い字幕を薄く', '이전 자막 흐리게', 'Atenuar anteriores'],
    'menu.look': ['字幕外觀', 'Subtitle look', '字幕外观', '字幕の見た目', '자막 모양', 'Aspecto'],
    'menu.display': ['顯示與速度', 'Display and speed', '显示与速度', '表示と速度', '표시와 속도', 'Visualización y velocidad'],
    'menu.uiLang': ['介面語言', 'Interface language', '界面语言', '表示言語', '인터페이스 언어', 'Idioma de la interfaz'],
    'menu.copy': ['複製字幕', 'Copy subtitles', '复制字幕', '字幕をコピー', '자막 복사', 'Copiar subtítulos'],
    'menu.resetPos': ['重設字幕框位置', 'Reset box position', '重置字幕框位置', '字幕枠の位置をリセット', '자막 상자 위치 초기화', 'Restablecer posición'],
    'menu.help': ['使用教學', 'How to use', '使用教程', '使い方', '사용법', 'Cómo usar'],
    'menu.report': ['回報問題', 'Report an issue', '反馈问题', '問題を報告', '문제 신고', 'Informar de un problema'],
    'opt.autoChrome': ['自動（跟著 Chrome）', 'Auto (follow Chrome)', '自动（跟随 Chrome）', '自動（Chrome に合わせる）', '자동 (Chrome 따라가기)', 'Automático (según Chrome)'],
    'help.1': ['打開有聲音的分頁（例如 YouTube），點工具列上的 FreeLiveSub 圖示，字幕就會出現。', 'Open a tab that plays audio (e.g. YouTube) and click the FreeLiveSub toolbar icon. Subtitles appear.', '打开有声音的标签页（例如 YouTube），点工具栏上的 FreeLiveSub 图标，字幕就会出现。', '音声が流れるタブ（YouTube など）でツールバーの FreeLiveSub アイコンを押すと字幕が表示されます。', '소리가 나는 탭(예: YouTube)에서 툴바의 FreeLiveSub 아이콘을 누르면 자막이 나타납니다.', 'Abre una pestaña con audio (p. ej., YouTube) y pulsa el icono de FreeLiveSub en la barra. Aparecerán los subtítulos.'],
    'help.2': ['第一次使用、或換了語言組合時，打開側邊欄按「準備模型」下載語音和翻譯模型（只需一次）。', 'The first time, or after changing languages, open the side panel and click "Prepare models" to download the speech and translation models (only once).', '第一次使用、或换了语言组合时，打开侧边栏点「准备模型」下载语音和翻译模型（只需一次）。', '初回や言語の組み合わせを変えたときは、サイドパネルの「モデルを準備」で音声・翻訳モデルをダウンロードします（1 回だけ）。', '처음 사용하거나 언어 조합을 바꾸면 사이드 패널에서 "모델 준비"를 눌러 음성·번역 모델을 내려받으세요(한 번만).', 'La primera vez, o al cambiar de idiomas, abre el panel lateral y pulsa «Preparar modelos» para descargar los modelos de voz y traducción (solo una vez).'],
    'help.3': ['拖曳工具列可以移動字幕框，拖四個角可以縮放；工具列上可以切換語言、調整字級、暫停或清除字幕。', 'Drag the toolbar to move the box and any corner to resize it. The toolbar also switches languages, changes text size, and pauses or clears subtitles.', '拖动工具栏可以移动字幕框，拖四个角可以缩放；工具栏上可以切换语言、调整字号、暂停或清除字幕。', 'ツールバーをドラッグすると移動、四隅をドラッグすると拡大縮小できます。ツールバーでは言語の切り替え、文字サイズ、一時停止、字幕の消去もできます。', '툴바를 끌어 자막 상자를 옮기고, 네 모서리를 끌어 크기를 바꿀 수 있습니다. 툴바에서 언어 전환, 글자 크기, 일시정지, 자막 지우기도 할 수 있습니다.', 'Arrastra la barra para mover el cuadro y cualquier esquina para cambiar su tamaño. Desde la barra también cambias idiomas y el tamaño del texto, o pausas y borras los subtítulos.'],
    'help.4': ['辨識和翻譯都用 Chrome 內建功能在這台電腦上進行，聲音和文字不會傳到網路，也不用付費。', 'Recognition and translation run on this computer with Chrome\'s built-in features. Audio and text never leave your device, and it\'s free.', '识别和翻译都用 Chrome 内置功能在这台电脑上进行，声音和文字不会传到网络，也不用付费。', '認識と翻訳は Chrome の内蔵機能でこのパソコン上で行われます。音声や文字がネットに送られることはなく、無料です。', '인식과 번역은 Chrome 내장 기능으로 이 컴퓨터에서 처리됩니다. 소리와 글자는 인터넷으로 전송되지 않으며 무료입니다.', 'El reconocimiento y la traducción se hacen en este equipo con las funciones integradas de Chrome. El audio y el texto no salen de tu dispositivo, y es gratis.'],
    'help.tip': ['翻譯怪怪的？常見原因是辨識聽錯了，或句子太短沒有上下文。', 'Odd translations? Usually the speech was misheard, or the sentence was too short to have context.', '翻译怪怪的？常见原因是识别听错了，或句子太短没有上下文。', '翻訳がおかしい？多くは聞き間違いか、文が短すぎて文脈がないことが原因です。', '번역이 이상한가요? 대개 음성을 잘못 들었거나 문장이 너무 짧아 문맥이 없기 때문입니다.', '¿Traducciones raras? Suele ser porque el audio se reconoció mal o la frase era demasiado corta para tener contexto.'],

    // ---------- v0.10：收藏 ----------
    'panel.marks': ['收藏的句子', 'Saved lines', '收藏的句子', '保存した字幕', '저장한 문장', 'Frases guardadas'],
    'mark.add': ['收藏這句（之後可以查證或問 AI）', 'Save this line (check it later or ask an AI)', '收藏这句（之后可以查证或问 AI）', 'この字幕を保存（あとで確認や AI に質問）', '이 문장 저장 (나중에 확인하거나 AI에 질문)', 'Guardar esta frase (para revisarla o preguntar a una IA)'],
    'mark.saved': ['已收藏，可在側邊欄查看', 'Saved. See it in the side panel', '已收藏，可在侧边栏查看', '保存しました。サイドパネルで確認できます', '저장했습니다. 사이드 패널에서 볼 수 있습니다', 'Guardada. Puedes verla en el panel lateral'],
    'mark.empty': ['還沒有收藏。滑鼠移到字幕上按 ⭐，收藏聽不懂或翻得怪的句子。', 'Nothing saved yet. Hover over a line and click ⭐ to save lines that seem wrong.', '还没有收藏。鼠标移到字幕上点 ⭐，收藏听不懂或翻得怪的句子。', 'まだありません。字幕にカーソルを合わせて ⭐ を押すと、気になる字幕を保存できます。', '아직 없습니다. 자막에 마우스를 올리고 ⭐를 눌러 이상한 문장을 저장하세요.', 'Aún no hay nada. Pasa el cursor sobre una línea y pulsa ⭐ para guardar las que parezcan raras.'],
    'mark.google': ['Google 翻譯', 'Google Translate', 'Google 翻译', 'Google 翻訳', 'Google 번역', 'Google Traductor'],
    'mark.deepl': ['DeepL', 'DeepL', 'DeepL', 'DeepL', 'DeepL', 'DeepL'],
    'mark.externalHint': ['會把這句話送到該網站', 'Sends this line to that website', '会把这句话发送到该网站', 'この文がそのサイトに送られます', '이 문장이 해당 사이트로 전송됩니다', 'Envía esta frase a ese sitio web'],
    'mark.copyPrompt': ['複製成 AI 提問', 'Copy as AI prompt', '复制成 AI 提问', 'AI 用の質問をコピー', 'AI 질문으로 복사', 'Copiar como pregunta para IA'],
    'mark.promptCopied': ['已複製提問，貼到 ChatGPT、Claude 等 AI 就能用', 'Prompt copied. Paste it into ChatGPT, Claude, or another AI', '已复制提问，粘贴到 ChatGPT、Claude 等 AI 就能用', '質問をコピーしました。ChatGPT や Claude などに貼り付けてください', '질문을 복사했습니다. ChatGPT, Claude 등에 붙여 넣으세요', 'Pregunta copiada. Pégala en ChatGPT, Claude u otra IA'],
    'mark.openVideo': ['回到影片這裡', 'Back to this moment', '回到视频这里', '動画のこの場面へ', '영상의 이 장면으로', 'Volver a este momento'],
    'mark.delete': ['刪除', 'Delete', '删除', '削除', '삭제', 'Eliminar'],
    'mark.export': ['匯出成 .md 檔', 'Export as .md', '导出成 .md 文件', '.md ファイルで書き出し', '.md 파일로 내보내기', 'Exportar como .md'],
    'mark.clearAll': ['全部刪除', 'Delete all', '全部删除', 'すべて削除', '모두 삭제', 'Eliminar todo'],
    'mark.confirmClear': ['確定要刪除全部 {n} 句收藏？', 'Delete all {n} saved lines?', '确定要删除全部 {n} 句收藏？', '保存した {n} 件をすべて削除しますか？', '저장한 {n}개를 모두 삭제할까요?', '¿Eliminar las {n} frases guardadas?'],
    'mark.prompt': ['以下是{from}影片的語音辨識字幕（自動辨識，可能有聽錯的字）。\n請參考前文，把【這一句】翻成{to}，並指出可能聽錯或翻錯的地方。\n\n前文：\n{context}\n\n【這一句】{src}\n目前的機器翻譯：{trans}', 'Below are auto-generated speech recognition subtitles from a {from} video (some words may be misheard).\nUsing the preceding lines as context, translate [this line] into {to} and point out anything that may have been misheard or mistranslated.\n\nPreceding lines:\n{context}\n\n[This line] {src}\nCurrent machine translation: {trans}', '以下是{from}视频的语音识别字幕（自动识别，可能有听错的字）。\n请参考前文，把【这一句】翻成{to}，并指出可能听错或翻错的地方。\n\n前文：\n{context}\n\n【这一句】{src}\n目前的机器翻译：{trans}', '以下は{from}の動画の音声認識字幕です（自動認識のため聞き間違いがあるかもしれません）。\n前の文を参考に【この文】を{to}に翻訳し、聞き間違いや誤訳の可能性がある箇所を指摘してください。\n\n前の文：\n{context}\n\n【この文】{src}\n現在の機械翻訳：{trans}', '다음은 {from} 영상의 음성 인식 자막입니다(자동 인식이라 잘못 들은 부분이 있을 수 있습니다).\n앞 문장을 참고해 [이 문장]을 {to}로 번역하고, 잘못 들었거나 잘못 번역된 부분을 알려 주세요.\n\n앞 문장:\n{context}\n\n[이 문장] {src}\n현재 기계 번역: {trans}', 'Estos son subtítulos generados por reconocimiento de voz de un vídeo en {from} (puede haber palabras mal reconocidas).\nUsando las líneas anteriores como contexto, traduce [esta línea] al {to} e indica lo que pueda estar mal reconocido o mal traducido.\n\nLíneas anteriores:\n{context}\n\n[Esta línea] {src}\nTraducción automática actual: {trans}'],

    // ---------- v0.11：翻譯品質 ----------
    'form.quality': ['翻譯品質', 'Quality', '翻译质量', '翻訳の品質', '번역 품질', 'Calidad'],
    'opt.fast': ['快速', 'Fast', '快速', '速さ優先', '빠르게', 'Rápida'],
    'opt.quality': ['品質優先 ✨', 'Better ✨', '质量优先 ✨', '品質優先 ✨', '품질 우선 ✨', 'Mejor ✨'],
    'form.qualityHint': ['品質優先：先顯示快速翻譯，講完的句子再用 Gemini Nano 重翻並換掉（標 ✨），每句慢 1～3 秒、比較吃 CPU。需要先按「準備模型」下載 Gemini Nano（約數 GB）。', 'Better: shows the fast translation first, then re-translates finished lines with Gemini Nano and swaps them in (marked ✨). Adds 1–3 s per line and uses more CPU. Click "Prepare models" first to download Gemini Nano (several GB).', '质量优先：先显示快速翻译，说完的句子再用 Gemini Nano 重翻并替换（标 ✨），每句慢 1～3 秒、比较占 CPU。需要先点「准备模型」下载 Gemini Nano（约数 GB）。', '品質優先：まず速い翻訳を表示し、話し終えた文を Gemini Nano で訳し直して差し替えます（✨ 印）。1 文あたり 1～3 秒遅く、CPU も多く使います。先に「モデルを準備」で Gemini Nano（数 GB）をダウンロードしてください。', '품질 우선: 먼저 빠른 번역을 보여 주고, 끝난 문장을 Gemini Nano로 다시 번역해 바꿉니다(✨ 표시). 문장마다 1~3초 더 걸리고 CPU를 더 씁니다. 먼저 "모델 준비"로 Gemini Nano(수 GB)를 내려받으세요.', 'Mejor: muestra primero la traducción rápida y luego vuelve a traducir las frases terminadas con Gemini Nano (marcadas con ✨). Tarda 1–3 s más por frase y usa más CPU. Pulsa antes «Preparar modelos» para descargar Gemini Nano (varios GB).'],
    'err.noNano': ['這個 Chrome 沒有 Gemini Nano（Prompt API）', 'This Chrome has no Gemini Nano (Prompt API)', '这个 Chrome 没有 Gemini Nano（Prompt API）', 'この Chrome には Gemini Nano（Prompt API）がありません', '이 Chrome에는 Gemini Nano(Prompt API)가 없습니다', 'Este Chrome no tiene Gemini Nano (Prompt API)'],
    'err.nanoState': ['Gemini Nano 不能用（{state}），{hint}', 'Gemini Nano unavailable ({state}): {hint}', 'Gemini Nano 不能用（{state}），{hint}', 'Gemini Nano が使えません（{state}）。{hint}', 'Gemini Nano를 쓸 수 없습니다({state}). {hint}', 'Gemini Nano no disponible ({state}): {hint}'],
    'log.qualityOn': ['品質優先已啟用：{pair}（Gemini Nano → 英文 → Translator）', 'Better quality on: {pair} (Gemini Nano → English → Translator)', '质量优先已启用：{pair}（Gemini Nano → 英文 → Translator）', '品質優先を有効化: {pair}（Gemini Nano → 英語 → Translator）', '품질 우선 사용: {pair} (Gemini Nano → 영어 → Translator)', 'Calidad mejorada activada: {pair} (Gemini Nano → inglés → Translator)'],
    'log.qualityOff': ['品質優先暫停，改用快速翻譯：{reason}', 'Better quality paused, using fast translation: {reason}', '质量优先暂停，改用快速翻译：{reason}', '品質優先を停止し、速い翻訳を使います: {reason}', '품질 우선을 멈추고 빠른 번역을 사용합니다: {reason}', 'Calidad mejorada en pausa; se usa la traducción rápida: {reason}'],
    'log.qualityFail': ['品質重翻失敗（保留快速翻譯）：{err}', 'Re-translation failed (kept the fast one): {err}', '质量重翻失败（保留快速翻译）：{err}', '訳し直しに失敗（速い翻訳のまま）: {err}', '다시 번역 실패 (빠른 번역 유지): {err}', 'Falló la nueva traducción (se mantiene la rápida): {err}'],

    // ---------- v0.12：模型狀態 ----------
    'model.sr': ['語音辨識　{lang}', 'Speech recognition: {lang}', '语音识别　{lang}', '音声認識　{lang}', '음성 인식: {lang}', 'Reconocimiento de voz: {lang}'],
    'model.tr': ['翻譯　{pair}', 'Translation: {pair}', '翻译　{pair}', '翻訳　{pair}', '번역: {pair}', 'Traducción: {pair}'],
    'model.nano': ['Gemini Nano（品質優先用）', 'Gemini Nano (for Better quality)', 'Gemini Nano（质量优先用）', 'Gemini Nano（品質優先用）', 'Gemini Nano (품질 우선용)', 'Gemini Nano (para Calidad mejor)'],
    'model.enTr': ['翻譯　{pair}（品質優先用）', 'Translation: {pair} (for Better quality)', '翻译　{pair}（质量优先用）', '翻訳　{pair}（品質優先用）', '번역: {pair} (품질 우선용)', 'Traducción: {pair} (para Calidad mejor)'],
    'mstate.available': ['已安裝', 'Installed', '已安装', 'インストール済み', '설치됨', 'Instalado'],
    'mstate.downloadable': ['未下載', 'Not downloaded', '未下载', '未ダウンロード', '다운로드 안 됨', 'Sin descargar'],
    'mstate.downloading': ['下載中', 'Downloading', '下载中', 'ダウンロード中', '다운로드 중', 'Descargando'],
    'mstate.unavailable': ['不支援', 'Not supported', '不支持', '非対応', '지원 안 됨', 'No compatible'],
    'mstate.unknown': ['無法確認', 'Unknown', '无法确认', '確認できません', '확인 불가', 'Desconocido'],
    'panel.using': ['目前使用：', 'Now using: ', '目前使用：', '使用中：', '현재 사용: ', 'Usando: '],
    'using.fast': ['快速（Chrome Translator）', 'Fast (Chrome Translator)', '快速（Chrome Translator）', '速さ優先（Chrome Translator）', '빠르게 (Chrome Translator)', 'Rápida (Chrome Translator)'],
    'using.quality': ['品質優先 ✨（Gemini Nano → 英文 → Translator）', 'Better ✨ (Gemini Nano → English → Translator)', '质量优先 ✨（Gemini Nano → 英文 → Translator）', '品質優先 ✨（Gemini Nano → 英語 → Translator）', '품질 우선 ✨ (Gemini Nano → 영어 → Translator)', 'Mejor ✨ (Gemini Nano → inglés → Translator)'],
    'using.qualityPending': ['品質優先 ✨（第一句講完後啟動）', 'Better ✨ (starts after the first finished line)', '质量优先 ✨（第一句说完后启动）', '品質優先 ✨（最初の文が終わると開始）', '품질 우선 ✨ (첫 문장이 끝나면 시작)', 'Mejor ✨ (empieza tras la primera frase)'],
    'using.blocked': ['品質優先無法使用，目前用快速（原因見除錯紀錄）', 'Better quality unavailable, using Fast (see debug log)', '质量优先无法使用，目前用快速（原因见调试日志）', '品質優先は使えないため速さ優先を使用中（理由はデバッグログ）', '품질 우선을 쓸 수 없어 빠르게 사용 중 (이유는 디버그 로그)', 'Calidad mejor no disponible; se usa Rápida (ver registro)'],
    'using.off': ['—（尚未開始）', '— (not started)', '—（尚未开始）', '—（未開始）', '— (시작 전)', '— (sin iniciar)'],
    'btn.downloadMissing': ['下載缺少的模型', 'Download missing models', '下载缺少的模型', '足りないモデルをダウンロード', '빠진 모델 다운로드', 'Descargar modelos que faltan'],
    'btn.preparing': ['下載中…', 'Downloading…', '下载中…', 'ダウンロード中…', '다운로드 중…', 'Descargando…'],
    'btn.allReady': ['全部已安裝 ✓', 'All installed ✓', '全部已安装 ✓', 'すべてインストール済み ✓', '모두 설치됨 ✓', 'Todo instalado ✓'],
    'btn.someUnsupported': ['有模型不支援 ✕', 'Some models not supported ✕', '有模型不支持 ✕', '非対応のモデルがあります ✕', '지원되지 않는 모델이 있음 ✕', 'Hay modelos no compatibles ✕'],
    'log.downloadingModel': ['下載 {name} {p}%', 'Downloading {name} {p}%', '下载 {name} {p}%', '{name} をダウンロード中 {p}%', '{name} 다운로드 {p}%', 'Descargando {name} {p}%'],
    'log.qualityShort': ['重翻結果比快速翻譯短很多，可能漏了內容，保留快速翻譯：{src}', 'Re-translation was much shorter (likely incomplete); kept the fast one: {src}', '重翻结果比快速翻译短很多，可能漏了内容，保留快速翻译：{src}', '訳し直しが大幅に短く内容が欠けている可能性があるため、速い翻訳のままにしました：{src}', '다시 번역한 결과가 훨씬 짧아 내용이 빠졌을 수 있어 빠른 번역을 유지합니다: {src}', 'La nueva traducción era mucho más corta (probablemente incompleta); se mantiene la rápida: {src}'],
  };
  /* eslint-enable max-len */

  // 「自動」：跟著瀏覽器的語言；沒有對應的就用英文
  function resolve(pref) {
    if (UI_LANGS.includes(pref)) return pref;
    const nav = (globalThis.navigator?.language || 'en').toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(nav)) return 'zh-Hant';
    if (nav.startsWith('zh')) return 'zh-Hans';
    return UI_LANGS.find((l) => nav.startsWith(l)) ?? 'en';
  }

  let current = resolve('auto');
  const use = (pref) => { current = resolve(pref); return current; };

  // 找不到這個語言就用英文，連英文都沒有就直接顯示 key（方便發現漏掉的字）
  function t(key, vars = {}) {
    const row = S[key];
    const text = row ? (row[UI_LANGS.indexOf(current)] ?? row[1]) : key;
    return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  function apply(root) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  }

  // 介面語言選單：「自動」加上 6 種語言（語言名稱用各自的寫法）
  const UI_OPTIONS = [['auto', null], ...UI_LANGS.map((l, i) => [l, NAMES[i]])];

  return { UI_LANGS, UI_OPTIONS, resolve, use, t, apply, current: () => current };
})();
