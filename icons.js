// 按鈕圖示：懸浮框和側邊欄共用。全部是內嵌 SVG，不從網路載入任何東西。
// 線條用 currentColor，所以圖示顏色跟著按鈕的文字顏色走。
// 懸浮框會被重複注入同一個網頁，所以用 ??= 避免重複定義。
globalThis.TSIcons ??= (() => {
  const PATHS = {
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    clear: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/>' +
              '<circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    reset: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    alignLeft: '<path d="M4 6h16M4 12h10M4 18h14"/>',
    alignCenter: '<path d="M4 6h16M7 12h10M5 18h14"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-1.3-1-1.4-1-2.6 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/>' +
             '<circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/>' +
             '<circle cx="14.5" cy="7" r="1.2" fill="currentColor"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/><path d="M12 8v4l3 2"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 ' +
          '1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1' +
          'a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1' +
          'a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 ' +
          '1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1' +
          'a1.7 1.7 0 0 0-1.5 1z"/>',
    bilingual: '<path d="M4 5h8M8 3v2M5 9c1.5 3 4 5 7 6M11 5c-1 4-3.5 7-7 9"/><path d="M13 21l4-9 4 9M14.5 18h5"/>',
    autoHide: '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A9 9 0 0 1 12 5c5 0 9 4.5 10 7a12 12 0 0 1-2.5 3.4' +
              'M6.6 6.6C4.4 8 2.8 10 2 12c1 2.5 5 7 10 7a9 9 0 0 0 5.4-1.6"/>',
    fade: '<path d="M4 6h16" opacity=".35"/><path d="M4 12h16" opacity=".65"/><path d="M4 18h16"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };

  // size：圖示的寬高（px）
  const icon = (name, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

  return { icon };
})();
