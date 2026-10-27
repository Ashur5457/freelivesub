// 文字處理：刪掉多餘的空格、把黏在一起的長句切開、把各段譯文接回去。
// 背景引擎（正式字幕）和側邊欄的實驗工具共用，兩邊切法才會一致。
// 只是純函式，不碰 chrome API；用 ??= 避免重複定義。
globalThis.TSSplit ??= (() => {
  // 日文和中文本來不用空格分詞，本地辨識卻會在詞之間夾空格（ありがとう ござい ます），翻譯模型會因此漏翻。
  // 只對這兩種語言刪掉「兩個非 ASCII 字元之間」的空格。
  // 韓文、俄文、泰文等本來就用空格分開單字，不能刪（否則 안녕 하세요 會黏成一個字）。
  const NO_SPACE = new Set(['ja', 'zh', 'zh-Hant']);
  const squeeze = (s) => s.replace(/(?<=[^\x00-\x7F])\s+(?=[^\x00-\x7F])/g, '').trim();
  const tidy = (raw, tr) => (NO_SPACE.has(tr) ? squeeze(raw) : raw.trim());

  // 辨識結果沒有標點，好幾句黏在一起時，翻譯模型只翻第一句就停了。
  // 本地辨識會在詞（詞素）之間加空格，所以一個詞一個詞累積，
  // 累積的這段「結尾像句尾」就切開；每段分開翻譯再接起來。切法依語言查表（ruleFor）。

  // 日文：句尾詞、自然斷點、黏在前面的小詞都有專門的表
  const JA_FILLERS = new Set(['え', 'えー', 'えっと', 'えーと', 'えーっと', 'うー', 'あのー', 'えと', 'あー']);
  const JA_ENDINGS = ['ます', 'ました', 'ません', 'ましょう', 'まして', 'です', 'でした', 'でしょう',
                      'ですか', 'ますか', 'ませんか', 'でしょうか', 'ですよ', 'ますよ',
                      'ください', 'よね', 'ですね', 'ますね', 'だよ', 'かな', 'けど', 'じゃん'];
  // 自然的斷點：結尾是助詞。句子還沒講完，但在這裡切開翻譯不會把詞拆壞
  const JA_SOFT = ['て', 'で', 'は', 'が', 'を', 'に', 'し', 'けど', 'から', 'ので', 'たら', 'ながら'];
  // 下一個詞以這些開頭（而且很短）時不切，它是黏在前面的：「ます / ねって」「切っ / ちゃう」「切って / たん」
  // 後半是「〜て」後面的輔助動詞：やって / ほしい、して / いる、やって / みる…
  const JOINS_PREV = new RegExp('^(か|ね|よ|な|の|も|は|が|し|と|た|だ|ちゃ|じゃ|ん|っ|けど|けれ|から|って|ので|のに|' +
                                'ほし|いる|いた|いま|おく|おい|しま|みる|みた|もら|くれ|あげ)');
  // 「けれど／けれども」（但是）比較長，不限字數
  const jaAttached = (next) => next != null && ((next.length <= 3 && JOINS_PREV.test(next)) || next.startsWith('けれど'));

  // 其他語言：遇到句尾標點就切，逗號類是自然斷點，沒有標點才按長度切
  const PUNCT_END = ['.', '?', '!', '。', '？', '！'];
  const PUNCT_SOFT = [',', '，', '、'];
  const OTHER_FILLERS = new Set(['um', 'uh', 'uhm', 'er', 'erm']);
  const never = () => false;

  // min：太短不切；max：超過就退回最近的自然斷點切；hard：完全沒有斷點時的硬切長度
  // （中日文一個字的資訊量比英文字母大，所以長度門檻比較短）
  const JA_RULE = { min: 8, max: 40, hard: 80, fillers: JA_FILLERS, endings: JA_ENDINGS, soft: JA_SOFT, attached: jaAttached };
  const CJK_RULE = { min: 8, max: 40, hard: 60, fillers: OTHER_FILLERS, endings: PUNCT_END, soft: PUNCT_SOFT, attached: never };
  const SPACED_RULE = { min: 0, max: 160, hard: 240, fillers: OTHER_FILLERS, endings: PUNCT_END, soft: PUNCT_SOFT, attached: never };
  const ruleFor = (tr) => (tr === 'ja' ? JA_RULE : NO_SPACE.has(tr) ? CJK_RULE : SPACED_RULE);

  const endsWithAny = (text, list) => list.some((e) => text.endsWith(e));

  function splitSentences(raw, tr) {
    const rule = ruleFor(tr);
    const join = (ws) => tidy(ws.join(' '), tr);
    const words = raw.trim().split(/\s+/).filter((w) => w && !rule.fillers.has(w.toLowerCase()));
    const parts = [];
    let cur = [], soft = 0;   // soft：cur 裡最近一個自然斷點的位置（0 = 還沒有）
    const cut = (n) => {
      parts.push(join(cur.slice(0, n)));
      cur = cur.slice(n);
      soft = 0;
    };
    words.forEach((w, i) => {
      cur.push(w);
      const text = join(cur);
      const free = text.length >= rule.min && !rule.attached(words[i + 1]);
      if (free && endsWithAny(text, rule.endings)) return cut(cur.length);   // 句尾：直接切
      if (free && endsWithAny(text, rule.soft)) soft = cur.length;           // 記住自然斷點
      if (text.length >= rule.max && soft) return cut(soft);                 // 太長：退回自然斷點切
      if (text.length >= rule.hard) cut(cur.length);                         // 完全沒斷點：硬切
    });
    if (cur.length) parts.push(join(cur));
    return parts;
  }

  // 各段譯文接起來；沒有以標點結尾的段落補一個逗號，整句結尾不留逗號。
  // 中日文用全形逗號、不加空格；其他語言用半形逗號加空格。
  function joinParts(texts, target) {
    const [comma, gap] = NO_SPACE.has(target) ? ['，', ''] : [',', ' '];
    const ended = (x) => /[。！？，、!?.,]$/.test(x);
    return texts.map((x) => (ended(x) ? x : x + comma)).join(gap).replace(/[，,]$/, '');
  }

  return { NO_SPACE, tidy, splitSentences, joinParts };
})();
