/* 投資情報共有の画面（LIFF）の入口：注目一覧・実績・銘柄をしらべる・#コード をグループに送る。
 * 読むもの：config.js（LIFF ID と問い合わせ先）・Q キット（ui.js）・LINE の LIFF SDK。index.html から読まれる。
 * 中身は GAS（src/12_liff_api.gs）に問い合わせる。本人は LINE の ID トークンで GAS が確かめる */
(function() {
  const query = new URLSearchParams(window.location.search);
  const config = window.APP_CONFIG || {};
  // 手元（localhost）で確かめるときだけ、URL で問い合わせ先を変えられる。公開した画面では、決めた所にだけ問い合わせる
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].indexOf(window.location.hostname) >= 0;
  const state = {
    activeView: ['search', 'watchlist', 'performance'].indexOf(query.get('view')) >= 0 ? query.get('view') : 'search',
    groupId: query.get('groupId') || config.debugGroupId || '',
    userId: '',
    apiBaseUrl: (isLocalHost && query.get('apiBaseUrl')) || config.apiBaseUrl || '',
    liffId: (isLocalHost && query.get('liffId')) || config.liffId || '',
    initialized: false,
    // その場で送れるか（LINE アプリの中で、トークから開いたとき）
    canSend: false,
    // 手元で確かめるとき（?debug=1 か config.local.js の debugGroupId）だけ、group・user の目印を出す
    isDebug: query.get('debug') === '1' || (isLocalHost && !!config.debugGroupId),
    watchlistPayload: null,
    performancePayload: null,
    // この画面を開いてから、ネットから取りなおしたか（端末に残した中身は、取りなおすまで仮のもの）
    fresh: {
      watchlist: false,
      performance: false
    },
    cacheFetchedAt: {
      watchlist: 0,
      performance: 0
    },
    inFlightLoads: {
      watchlist: null,
      performance: null
    },
    // 読みこみの番号。重なったときは、いちばん新しい読みこみの返事だけを使う
    loadSeq: {
      watchlist: 0,
      performance: 0
    },
    watchlistSort: {
      key: 'addedAt',
      direction: 'desc'
    },
    watchlistColumnWidths: {
      marketTicker: 92,
      name: 188,
      currentPrice: 110,
      addedPrice: 126,
      performanceDelta: 104,
      marketCap: 140,
      per: 88,
      volume: 118,
      addedByDisplayName: 120,
      addedAt: 108
    },
    watchlistFilters: emptyWatchlistFilters()
  };

  // 注目一覧のしぼりこみの、空の形
  function emptyWatchlistFilters() {
    return {
      name: '',
      marketTicker: '',
      currentPriceMin: '',
      currentPriceMax: '',
      addedPriceMin: '',
      addedPriceMax: '',
      performanceDeltaMin: '',
      performanceDeltaMax: '',
      marketCapMin: '',
      marketCapMax: '',
      perMin: '',
      perMax: '',
      volumeMin: '',
      volumeMax: '',
      addedByDisplayNames: [],
      addedAt: ''
    };
  }

  const contextBadge = document.getElementById('contextBadge');
  const groupBadge = document.getElementById('groupBadge');
  const userBadge = document.getElementById('userBadge');
  const debugContextRow = document.getElementById('debugContextRow');
  const outsideNote = document.getElementById('outsideNote');
  const outsideText = document.getElementById('outsideText');
  const loginButton = document.getElementById('loginButton');
  const openInLineLink = document.getElementById('openInLineLink');
  const tickerInput = document.getElementById('tickerInput');
  const tickerError = document.getElementById('tickerError');
  const recentWrap = document.getElementById('recentWrap');
  const recentChips = document.getElementById('recentChips');
  const fetchQuoteButton = document.getElementById('fetchQuoteButton');
  const sendTickerButton = document.getElementById('sendTickerButton');
  const sendNote = document.getElementById('sendNote');
  const searchStatus = document.getElementById('searchStatus');
  const searchWatchState = document.getElementById('searchWatchState');
  const quotePreview = document.getElementById('quotePreview');
  const watchlistLoading = document.getElementById('watchlistLoading');
  const watchlistContent = document.getElementById('watchlistContent');
  const performanceLoading = document.getElementById('performanceLoading');
  const performanceContent = document.getElementById('performanceContent');
  const quoteModal = document.getElementById('quoteModal');
  const quoteModalTitle = document.getElementById('quoteModalTitle');
  const quoteModalStatus = document.getElementById('quoteModalStatus');
  const quoteModalContent = document.getElementById('quoteModalContent');
  const quoteModalClose = document.getElementById('quoteModalClose');
  const tabList = document.querySelector('.ls-tabs');
  const tabs = Array.from(document.querySelectorAll('.ls-tab'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  const reloadButtons = Array.from(document.querySelectorAll('[data-reload-view]'));

  // ---- Q キット（読みこめなかったときも止まらないように） ----

  // Q キット（LineShareUI）。読みこめていなければ null
  function kit() {
    return window.LineShareUI || null;
  }

  // 下に短い知らせを出す（Q キットがなければ、しらべるの欄に文字で）
  function toast(message, options) {
    const ui = kit();
    if (ui && ui.toast) {
      ui.toast(message, options);
      return;
    }
    searchStatus.textContent = message;
  }

  // 確かめの小窓を出す（Q キットがなければ、すぐ答えを返す）
  function ask(options) {
    const ui = kit();
    if (ui && ui.ask) {
      return ui.ask(options);
    }
    return Promise.resolve(options && options.cancel === null);
  }

  // 目印の文字を変える
  function setBadge(el, text) {
    if (el) {
      el.textContent = text;
    }
  }

  // 手元で確かめるときだけ、group・user の目印を出す
  function updateDebugBadges(label) {
    if (!state.isDebug) {
      return;
    }
    debugContextRow.hidden = false;
    if (label) {
      setBadge(contextBadge, label);
    }
    setBadge(groupBadge, 'group: ' + (state.groupId || '-'));
    setBadge(userBadge, 'user: ' + (state.userId || '-'));
  }

  // 騰落率の色の名前（+ は plus、- は minus。数がない「-」は色なし）
  function getDeltaClass(value) {
    if (typeof value !== 'string') {
      return '';
    }
    // 「-」だけ（数がない）は色を付けない
    if (/^\+\d/.test(value)) {
      return 'plus';
    }
    if (/^-\d/.test(value)) {
      return 'minus';
    }
    return '';
  }

  // 前日比：「+1.20」のように % なしで来るので、数なら % を付ける
  function formatChangePercent(value) {
    const text = String(value || '').trim();
    if (!text) {
      return '-';
    }
    return /^[+-]?\d+(\.\d+)?$/.test(text) ? text + '%' : text;
  }

  // HTML に入れる文字を、タグとして読まれないようにする
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 「1,234」「48.5兆」「+1.2%」のような文字を数にする（比べる・しぼるため）。読めなければ null
  function parseMaybeNumber(value) {
    if (value === null || typeof value === 'undefined') {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const raw = String(value).trim();
    if (!raw || raw === '-') {
      return null;
    }

    const normalized = raw.replace(/,/g, '').replace(/[%\s]/g, '');
    const unitMap = {
      '万': 1e4,
      '億': 1e8,
      '兆': 1e12
    };

    var multiplier = 1;
    var unit = normalized.slice(-1);
    var numericText = normalized;
    if (unitMap[unit]) {
      multiplier = unitMap[unit];
      numericText = normalized.slice(0, -1);
    }

    const parsed = Number(numericText);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed * multiplier;
  }

  // 「26/10/01」「2026-10-01」などの日付を、比べられる数にする。読めなければ null
  function parseDateValue(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return null;
    }

    const shortMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (shortMatch) {
      return Date.UTC(2000 + Number(shortMatch[1]), Number(shortMatch[2]) - 1, Number(shortMatch[3]));
    }

    const longMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (longMatch) {
      return Date.UTC(Number(longMatch[1]), Number(longMatch[2]) - 1, Number(longMatch[3]));
    }

    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // 日時を「10/1 15:00」の形で出す（日本時間の文字はそのまま月日と時刻に）
  function formatDateTimeDisplay(value) {
    // 「2026-10-22 15:00:00」（日本時間）は、そのまま月日と時刻にする（日付だけで読むと時刻がずれる）
    const withTime = String(value || '').trim().match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})/);
    if (withTime) {
      return Number(withTime[2]) + '/' + Number(withTime[3]) + ' ' + withTime[4] + ':' + withTime[5];
    }
    const parsed = parseDateValue(value);
    if (parsed === null) {
      return String(value || '');
    }
    return new Date(parsed).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(/-/g, '/');
  }

  // 「7203:TYO」から市場を除いたコード
  function getTickerCode(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '-';
    }
    return raw.split(':')[0] || raw;
  }

  // 入れた銘柄コードを、大文字にして「#」を取る
  function normalizeTickerText(value) {
    return String(value || '').trim().toUpperCase().replace(/^#/, '');
  }

  const watchlistColumns = [
    { key: 'marketTicker', label: 'コード', type: 'text' },
    { key: 'name', label: '銘柄', type: 'text' },
    { key: 'currentPrice', label: '価格', type: 'number' },
    { key: 'addedPrice', label: '注目時価格', type: 'number' },
    { key: 'performanceDelta', label: '騰落率', type: 'number' },
    { key: 'marketCap', label: '時価総額', type: 'number' },
    { key: 'per', label: 'PER', type: 'number' },
    { key: 'volume', label: '出来高', type: 'number' },
    { key: 'addedByDisplayName', label: '注目者', type: 'text' },
    { key: 'addedAt', label: '注目日', type: 'date' }
  ];

  // 注目一覧の、列ごとの比べる値（銘柄は国旗付き・コードは市場なし）
  function getWatchlistCellValue(item, key) {
    if (key === 'name') {
      return (item.marketFlag ? item.marketFlag + ' ' : '') + (item.name || '-');
    }
    if (key === 'marketTicker') {
      return getTickerCode(item.marketTicker || item.ticker);
    }
    return item[key];
  }

  // 注目一覧の2行を、列の種類（数・日付・文字）で比べる。値がないものは後ろへ
  function compareWatchlistItems(a, b, column) {
    const aValue = getWatchlistCellValue(a, column.key);
    const bValue = getWatchlistCellValue(b, column.key);

    if (column.type === 'number') {
      const aNumber = parseMaybeNumber(aValue);
      const bNumber = parseMaybeNumber(bValue);
      if (aNumber === null && bNumber === null) {
        return 0;
      }
      if (aNumber === null) {
        return 1;
      }
      if (bNumber === null) {
        return -1;
      }
      return aNumber - bNumber;
    }

    if (column.type === 'date') {
      const aDate = parseDateValue(aValue);
      const bDate = parseDateValue(bValue);
      if (aDate === null && bDate === null) {
        return 0;
      }
      if (aDate === null) {
        return 1;
      }
      if (bDate === null) {
        return -1;
      }
      return aDate - bDate;
    }

    return String(aValue || '').localeCompare(String(bValue || ''), 'ja');
  }

  // 注目一覧を、しぼりこみの条件で残す
  function getWatchlistFilteredItems(items) {
    return items.filter(function(item) {
      const filters = state.watchlistFilters;

      if (filters.name) {
        const name = String(getWatchlistCellValue(item, 'name') || '').toUpperCase();
        if (name.indexOf(filters.name.toUpperCase()) === -1) {
          return false;
        }
      }

      if (filters.marketTicker) {
        const marketTicker = String(item.marketTicker || '').toUpperCase();
        if (marketTicker.indexOf(filters.marketTicker.toUpperCase()) === -1) {
          return false;
        }
      }

      if (filters.addedByDisplayNames && filters.addedByDisplayNames.length) {
        if (filters.addedByDisplayNames.indexOf(String(item.addedByDisplayName || '')) === -1) {
          return false;
        }
      }

      if (filters.addedAt) {
        const addedAt = String(item.addedAt || '');
        if (addedAt.indexOf(filters.addedAt) === -1) {
          return false;
        }
      }

      const numericRanges = [
        ['currentPrice', 'currentPriceMin', 'currentPriceMax'],
        ['addedPrice', 'addedPriceMin', 'addedPriceMax'],
        ['performanceDelta', 'performanceDeltaMin', 'performanceDeltaMax'],
        ['marketCap', 'marketCapMin', 'marketCapMax'],
        ['per', 'perMin', 'perMax'],
        ['volume', 'volumeMin', 'volumeMax']
      ];

      return numericRanges.every(function(range) {
        const current = parseMaybeNumber(item[range[0]]);
        const min = parseMaybeNumber(filters[range[1]]);
        const max = parseMaybeNumber(filters[range[2]]);

        if (min !== null && (current === null || current < min)) {
          return false;
        }
        if (max !== null && (current === null || current > max)) {
          return false;
        }
        return true;
      });
    });
  }

  // 注目一覧を、えらんだ列と向きで並べる
  function getWatchlistSortedItems(items) {
    const column = watchlistColumns.find(function(entry) {
      return entry.key === state.watchlistSort.key;
    }) || watchlistColumns[watchlistColumns.length - 1];

    return items.slice().sort(function(a, b) {
      const compared = compareWatchlistItems(a, b, column);
      if (compared !== 0) {
        return state.watchlistSort.direction === 'asc' ? compared : -compared;
      }
      return String(a.ticker || '').localeCompare(String(b.ticker || ''), 'en');
    });
  }

  // 注目した人の名前の一覧（しぼりこみの選択肢）
  function getWatchlistAddedByOptions(items) {
    const names = items.map(function(item) {
      return String(item.addedByDisplayName || '').trim();
    }).filter(Boolean);
    return Array.from(new Set(names)).sort(function(a, b) {
      return a.localeCompare(b, 'ja');
    });
  }

  // 列ごとのしぼりこみの入力欄（数は以上・以下、注目者は選ぶ、ほかは文字）の HTML
  function renderWatchlistFilterInput(column, items) {
    const filters = state.watchlistFilters;
    const label = column.label;

    if (column.type === 'number') {
      return [
        '<div class="filter-pair">',
        '<input class="table-filter-input" data-filter-key="' + column.key + 'Min" type="text" inputmode="decimal" enterkeyhint="done" placeholder="以上" aria-label="' + escapeHtml(label) + '（以上）" value="' + escapeHtml(filters[column.key + 'Min'] || '') + '">',
        '<input class="table-filter-input" data-filter-key="' + column.key + 'Max" type="text" inputmode="decimal" enterkeyhint="done" placeholder="以下" aria-label="' + escapeHtml(label) + '（以下）" value="' + escapeHtml(filters[column.key + 'Max'] || '') + '">',
        '</div>'
      ].join('');
    }

    if (column.key === 'addedByDisplayName') {
      const options = getWatchlistAddedByOptions(items);
      return [
        '<select class="table-filter-select" data-filter-key="addedByDisplayNames" multiple aria-label="注目した人でしぼる" size="' + escapeHtml(String(Math.min(Math.max(options.length, 2), 4))) + '">',
        options.map(function(name) {
          const selected = filters.addedByDisplayNames.indexOf(name) >= 0 ? ' selected' : '';
          return '<option value="' + escapeHtml(name) + '"' + selected + '>' + escapeHtml(name) + '</option>';
        }).join(''),
        '</select>'
      ].join('');
    }

    return '<input class="table-filter-input" data-filter-key="' + column.key + '" type="text" enterkeyhint="done" placeholder="しぼる" aria-label="' + escapeHtml(label) + 'でしぼる" value="' + escapeHtml(filters[column.key] || '') + '">';
  }

  // しぼりこみが1つでも入っているか
  function hasWatchlistFilters() {
    const filters = state.watchlistFilters;
    return Object.keys(filters).some(function(key) {
      const value = filters[key];
      return Array.isArray(value) ? value.length > 0 : !!value;
    });
  }

  // 注目一覧の表の HTML（件数・株価の時刻・見出し・しぼりこみ・行）
  function renderWatchlistTable(items) {
    const filteredItems = getWatchlistFilteredItems(items);
    const sortedItems = getWatchlistSortedItems(filteredItems);
    const sortMarker = state.watchlistSort.direction === 'asc' ? '↑' : '↓';
    const latestCachedAt = state.watchlistPayload && state.watchlistPayload.latestCachedAt
      ? '株価は ' + formatDateTimeDisplay(state.watchlistPayload.latestCachedAt) + ' ごろ'
      : '';

    return [
      '<div class="watchlist-toolbar">',
      '<p class="watchlist-summary">' + escapeHtml(String(sortedItems.length)) + ' / ' + escapeHtml(String(items.length)) + '件' + (latestCachedAt ? '・' + escapeHtml(latestCachedAt) : '') + '</p>',
      hasWatchlistFilters() ? '<button class="ls-button is-small" data-watchlist-reset type="button">✕ しぼりこみを解除</button>' : '',
      '</div>',
      '<div class="watchlist-table-wrap">',
      '<table class="watchlist-table">',
      '<colgroup>',
      watchlistColumns.map(function(column) {
        return '<col style="width:' + escapeHtml(String(state.watchlistColumnWidths[column.key] || 120)) + 'px">';
      }).join(''),
      '</colgroup>',
      '<thead>',
      '<tr>',
      watchlistColumns.map(function(column) {
        const isActive = state.watchlistSort.key === column.key;
        const ariaSort = isActive ? (state.watchlistSort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
        return '<th class="watchlist-head-cell" data-column-key="' + column.key + '" aria-sort="' + ariaSort + '">' +
          '<button class="sort-button' + (isActive ? ' is-active' : '') + '" data-sort-key="' + column.key + '" type="button">' +
          escapeHtml(column.label) + (isActive ? ' ' + sortMarker : '') + '</button>' +
          '<span class="column-resizer" data-resize-key="' + column.key + '" aria-hidden="true"></span>' +
          '</th>';
      }).join(''),
      '</tr>',
      '<tr class="filter-row">',
      watchlistColumns.map(function(column) {
        return '<th>' + renderWatchlistFilterInput(column, items) + '</th>';
      }).join(''),
      '</tr>',
      '</thead>',
      '<tbody>',
      (sortedItems.length === 0 ? [
        '<tr>',
        '<td class="table-empty" colspan="' + escapeHtml(String(watchlistColumns.length)) + '">この条件の銘柄はありません。</td>',
        '</tr>'
      ].join('') : sortedItems.map(function(item) {
        return [
          '<tr data-ticker="' + escapeHtml(item.ticker || '') + '" data-name="' + escapeHtml(item.name || '') + '" tabindex="0">',
          '<td><a class="pill-link" href="' + escapeHtml(item.kabutanUrl) + '" target="_blank" rel="noopener noreferrer">🔍 ' + escapeHtml(getTickerCode(item.marketTicker || item.ticker)) + '</a></td>',
          '<td><div class="company-cell"><strong>' + escapeHtml((item.marketFlag ? item.marketFlag + ' ' : '') + item.name) + '</strong></div></td>',
          '<td class="mono">' + escapeHtml(item.currentPrice || '-') + '</td>',
          '<td class="mono">' + escapeHtml(item.addedPrice || '-') + '</td>',
          '<td class="mono delta ' + getDeltaClass(item.performanceDelta || '') + '">' + escapeHtml(item.performanceDelta || '-') + '</td>',
          '<td class="mono">' + escapeHtml(item.marketCap || '-') + '</td>',
          '<td class="mono">' + escapeHtml(item.per || '-') + '</td>',
          '<td class="mono">' + escapeHtml(String(item.volume || '-')) + '</td>',
          '<td>' + escapeHtml(item.addedByDisplayName || '-') + '</td>',
          '<td class="mono">' + escapeHtml(item.addedAt || '-') + '</td>',
          '</tr>'
        ].join('');
      }).join('')),
      '</tbody>',
      '</table>',
      '</div>'
    ].join('');
  }

  // 人の写真の丸（写真がなければ名前の1文字目）の HTML
  function renderAvatar(pictureUrl, displayName) {
    if (pictureUrl) {
      return '<div class="avatar"><img src="' + escapeHtml(pictureUrl) + '" alt=""></div>';
    }
    return '<div class="avatar" aria-hidden="true">' + escapeHtml(String(displayName || '-').slice(0, 1)) + '</div>';
  }

  // ---- タブ ----

  // タブを切りかえる。注目一覧・実績は、まだなら読みこむ
  function setActiveView(view, options) {
    const isSameView = state.activeView === view;
    state.activeView = view;
    tabs.forEach(function(tab) {
      tab.setAttribute('aria-selected', tab.dataset.view === view ? 'true' : 'false');
    });
    panels.forEach(function(panel) {
      panel.hidden = panel.dataset.panel !== view;
    });

    if (isSameView && (!options || !options.forceReload)) {
      return;
    }

    if (view === 'watchlist' || view === 'performance') {
      loadView(view);
    }
  }

  // ---- しらべる・送る ----

  // しらべるの欄の銘柄コード
  function normalizeTickerInput() {
    return normalizeTickerText(tickerInput.value || '');
  }

  // 注目一覧から、その銘柄の行を探す（ないときは null）
  function findWatchItemByTicker(ticker) {
    const items = (state.watchlistPayload && state.watchlistPayload.items) || [];
    return items.find(function(item) {
      return String(item.ticker || '').toUpperCase() === String(ticker || '').toUpperCase();
    }) || null;
  }

  // しらべるの欄が変わったとき：注目中かどうか・送ると何が起きるか・注目中のボタンを出しなおす
  function updateSearchWatchState() {
    const ticker = normalizeTickerInput();
    if (ticker) {
      tickerError.hidden = true;
    }
    updateSendNote();
    renderRecentChips();

    if (!ticker || !state.watchlistPayload) {
      searchWatchState.hidden = true;
      searchWatchState.textContent = '';
      return;
    }

    const watchItem = findWatchItemByTicker(ticker);
    searchWatchState.hidden = false;
    if (watchItem) {
      searchWatchState.textContent = '📌 ' + ticker + ' は注目中です' +
        (watchItem.addedByDisplayName ? '（' + watchItem.addedByDisplayName + (watchItem.addedAt ? '・' + watchItem.addedAt : '') + '）' : '');
      return;
    }
    searchWatchState.textContent = ticker + ' はまだ注目されていません。送ると注目に入ります。';
  }

  // 送る前に、何が起きるかを短く（F2・B6）
  function updateSendNote() {
    const ticker = normalizeTickerInput();
    if (!state.canSend) {
      sendTickerButton.textContent = '📋 コピーする';
      sendNote.textContent = state.initialized || state.isDebug
        ? 'ここからは送れません。コピーして、グループのトークに貼ってね。'
        : '';
      return;
    }
    sendTickerButton.textContent = '💬 グループに送る';
    sendNote.textContent = ticker ? '「#' + ticker + '」をこのトークに送ります。ボットが株価を返します。' : '';
  }

  // 注目中の銘柄を、押すだけで入るボタンに（新しい順に8つ）
  function renderRecentChips() {
    const items = ((state.watchlistPayload && state.watchlistPayload.items) || []).slice();
    if (items.length === 0) {
      recentWrap.hidden = true;
      recentChips.innerHTML = '';
      return;
    }
    items.sort(function(a, b) {
      return (parseDateValue(b.addedAt) || 0) - (parseDateValue(a.addedAt) || 0);
    });
    const current = normalizeTickerInput();
    recentWrap.hidden = false;
    recentChips.innerHTML = items.slice(0, 8).map(function(item) {
      const ticker = String(item.ticker || '');
      const name = String(item.name || '');
      const label = ticker + (name && name !== ticker ? ' ' + (name.length > 8 ? name.slice(0, 8) + '…' : name) : '');
      return '<button class="ls-chip is-small" type="button" data-pick-ticker="' + escapeHtml(ticker) + '" aria-pressed="' + (current === ticker.toUpperCase() ? 'true' : 'false') + '">' + escapeHtml(label) + '</button>';
    }).join('');
  }

  // しらべるの欄の銘柄コード。空なら欄の下に赤い文字を出して空を返す
  function requireTicker() {
    const ticker = normalizeTickerInput();
    if (!ticker) {
      tickerError.hidden = false;
      tickerInput.focus();
      return '';
    }
    tickerError.hidden = true;
    return ticker;
  }

  // 文字をコピーする。できたら true
  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // 下の「長押しでコピー」へ
      }
    }
    return false;
  }

  // 「#コード」をグループに送る（LINE の中で送れないときはコピー）
  async function sendTickerCommand() {
    const ticker = requireTicker();
    if (!ticker) {
      return;
    }

    const command = '#' + ticker;
    if (state.canSend && window.liff && typeof window.liff.sendMessages === 'function') {
      sendTickerButton.disabled = true;
      sendTickerButton.textContent = '送っています…';
      try {
        await window.liff.sendMessages([{ type: 'text', text: command }]);
      } catch (error) {
        console.error(error);
        sendTickerButton.disabled = false;
        updateSendNote();
        toast('送れませんでした。もう一度ためしてね。');
        return;
      }
      sendTickerButton.disabled = false;
      updateSendNote();
      // すぐ閉じない（F3）。トークに戻るか、続けてしらべるかを選べる
      const close = await ask({
        title: command + ' を送りました',
        text: 'ボットの返事はトークで見られます。',
        ok: '閉じてトークを見る',
        cancel: '続けてしらべる'
      });
      if (close && window.liff && window.liff.closeWindow) {
        window.liff.closeWindow();
      }
      return;
    }

    if (await copyText(command)) {
      toast(command + ' をコピーしました。トークに貼って送ってね。');
      return;
    }
    await ask({ title: '長押ししてコピーしてね', input: command, readonly: true, ok: '閉じる', cancel: null });
  }

  // ---- LINE とのつなぎ ----

  // LINE アプリで開きなおす URL（グループと今のタブを付ける）
  function buildOpenInLineUrl() {
    if (!state.liffId) {
      return '';
    }
    const params = new URLSearchParams();
    if (state.groupId) {
      params.set('groupId', state.groupId);
    }
    params.set('view', state.activeView);
    return 'https://liff.line.me/' + encodeURIComponent(state.liffId) + '?' + params.toString();
  }

  // LINE の外で開いたとき・グループから開いていないとき。エラーにせず、できることを出す（B6）
  function showOutsideNote(text, options) {
    const settings = options || {};
    outsideText.textContent = text;
    loginButton.hidden = !settings.login;
    const lineUrl = settings.openInLine ? buildOpenInLineUrl() : '';
    openInLineLink.hidden = !lineUrl;
    if (lineUrl) {
      openInLineLink.href = lineUrl;
    }
    outsideNote.hidden = false;
  }

  // LINE に確かめてもらう本人の印（GAS がこれで本人を決める。端末には残さない）
  function getLineProof() {
    if (!state.initialized || !window.liff) {
      return null;
    }
    try {
      const idToken = window.liff.getIDToken ? window.liff.getIDToken() : '';
      if (idToken) {
        return { idToken: idToken };
      }
      const accessToken = window.liff.getAccessToken ? window.liff.getAccessToken() : '';
      return accessToken ? { accessToken: accessToken } : null;
    } catch (error) {
      return null;
    }
  }

  // 手元で確かめるときだけ、config.local.js の人として動かす。使ったら true
  function useLocalDebugUser(label) {
    if (!isLocalHost || !config.debugUserId) {
      return false;
    }
    state.userId = config.debugUserId;
    state.isDebug = true;
    updateDebugBadges(label);
    return true;
  }

  // LINE とつなぐ：ログインと、その場で送れるかを決める。LINE の外では、できることを出す
  async function initializeLiff() {
    if (!window.liff || !state.liffId) {
      if (!useLocalDebugUser('LINE なし')) {
        showOutsideNote('うまく開けませんでした。LINE アプリで開きなおしてね。', { openInLine: true });
      }
      return;
    }

    try {
      await window.liff.init({ liffId: state.liffId });
    } catch (error) {
      console.error(error);
      if (!useLocalDebugUser('LINE につながらない')) {
        showOutsideNote('うまく開けませんでした。LINE アプリで開きなおしてね。', { openInLine: true });
      }
      return;
    }

    state.initialized = true;
    const inClient = window.liff.isInClient ? window.liff.isInClient() : false;
    const loggedIn = window.liff.isLoggedIn ? window.liff.isLoggedIn() : inClient;
    if (!inClient && !loggedIn) {
      if (!useLocalDebugUser('LINE の外')) {
        showOutsideNote('LINE の外で開いています。注目一覧を見るには、LINE でログインしてね。', { login: true, openInLine: true });
      }
      return;
    }

    const context = window.liff.getContext ? window.liff.getContext() : null;
    try {
      const profile = window.liff.getProfile ? await window.liff.getProfile() : null;
      state.userId = (profile && profile.userId) || (context && context.userId) || '';
    } catch (error) {
      console.error(error);
      state.userId = (context && context.userId) || '';
    }
    state.canSend = inClient && !!context && ['group', 'room', 'utou'].indexOf(context.type) >= 0;
    if (!inClient) {
      showOutsideNote('LINE の外で開いています。見ることはできます。グループに送るときは、LINE アプリで開いてね。', { openInLine: true });
    }
    updateDebugBadges('LINE ' + ((context && context.type) || '-'));
  }

  // ---- 読みこみ ----

  // 読みこみのようすの文字を出す
  function setLoadingText(el, message) {
    if (el) {
      el.textContent = message || '';
    }
  }

  // 注目一覧か実績の、いま持っている中身
  function getViewPayload(view) {
    return view === 'watchlist' ? state.watchlistPayload : state.performancePayload;
  }

  // 注目一覧か実績の中身を置きかえる
  function setViewPayload(view, payload) {
    if (view === 'watchlist') {
      state.watchlistPayload = payload;
      return;
    }
    state.performancePayload = payload;
  }

  // 前に開いたときの中身を、この端末に残す（次に開いたとき、すぐ出すため。B1）
  function cacheKey(view) {
    return 'line-investment:v1:' + state.groupId + ':' + view;
  }

  // この端末に残した、前に開いたときの中身を読む（ないときは null）
  function readCachedView(view) {
    if (!state.groupId) {
      return null;
    }
    try {
      const raw = localStorage.getItem(cacheKey(view));
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.payload ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  // 中身をこの端末に残す（次に開いたとき、すぐ出すため）
  function writeCachedView(view, payload) {
    if (!state.groupId) {
      return;
    }
    try {
      localStorage.setItem(cacheKey(view), JSON.stringify({ savedAt: Date.now(), payload: payload }));
    } catch (error) {
      // 残せなくても表示は続ける
    }
  }

  // 開いたとき、端末に残した注目一覧・実績を先に読む
  function restoreCachedViews() {
    ['watchlist', 'performance'].forEach(function(view) {
      const cached = readCachedView(view);
      if (cached) {
        setViewPayload(view, cached.payload);
        state.cacheFetchedAt[view] = cached.savedAt || 0;
      }
    });
  }

  // 中身から、注目一覧か実績を描く
  function renderViewFromPayload(view, payload) {
    if (view === 'watchlist') {
      renderWatchlist(payload);
      updateSearchWatchState();
      return;
    }
    renderPerformance(payload);
  }

  // 読みこみ中の箱を出す
  function renderSkeleton(contentEl) {
    contentEl.innerHTML = '<div class="skeleton-list" aria-hidden="true">' +
      '<span class="ls-skeleton"></span><span class="ls-skeleton"></span><span class="ls-skeleton"></span><span class="ls-skeleton"></span>' +
      '</div>';
  }

  // 中身がないときの絵と文を出す
  function renderEmptyNote(contentEl, icon, text) {
    contentEl.innerHTML = '<div class="ls-empty"><span class="ls-empty-icon" aria-hidden="true">' + escapeHtml(icon) + '</span>' + escapeHtml(text) + '</div>';
  }

  // 問い合わせできるか（問い合わせ先・グループ・本人の印がそろっている）
  function canFetch() {
    return !!(state.apiBaseUrl && state.groupId && (getLineProof() || state.userId));
  }

  // 読みこみの失敗の種類（kind）を持つエラーを作る
  function makeLoadError(kind) {
    const error = new Error(kind);
    error.kind = kind;
    return error;
  }

  // 失敗のときに出す言葉（仕組みの言葉やエラーの中身は出さない。E2）
  function describeLoadError(error, hasCache) {
    if (error && error.kind === 'relogin') {
      return 'LINE とのつながりが切れました。LINE アプリで開きなおしてね。';
    }
    if (error && error.kind === 'denied') {
      return '見られるのは、ルールを確認した人だけです。トークで「#ルール」と送り、「✅ ルールを確認しました」を押してね。';
    }
    if (hasCache) {
      return '新しくできませんでした。前に開いたときの内容を出しています。電波のよいところで「↻ 新しくする」を押してね。';
    }
    return '読みこめませんでした。電波のよいところで「↻ 新しくする」を押してね。';
  }

  // GAS に問い合わせて中身を返す。失敗は種類（ネット・見られない・ログインしなおし）のエラーで止まる
  async function fetchJsonWithParams(view, extraParams) {
    if (!canFetch()) {
      throw makeLoadError('nocontext');
    }

    const url = new URL(state.apiBaseUrl, window.location.href);
    url.searchParams.set('action', 'liff_data');
    url.searchParams.set('groupId', state.groupId);
    url.searchParams.set('view', view);
    const proof = getLineProof() || {};
    Object.keys(proof).forEach(function(key) {
      url.searchParams.set(key, proof[key]);
    });
    Object.keys(extraParams || {}).forEach(function(key) {
      if (extraParams[key] !== '' && extraParams[key] !== null && typeof extraParams[key] !== 'undefined') {
        url.searchParams.set(key, extraParams[key]);
      }
    });

    let data = null;
    try {
      const response = await fetch(url.toString(), { method: 'GET' });
      data = await response.json();
    } catch (error) {
      console.error(error);
      throw makeLoadError('network');
    }
    if (!data || !data.ok) {
      // くわしい中身は開発者ツールにだけ
      console.error('liff_data failed', data && data.error);
      const kind = data && data.error === 'access denied'
        ? 'denied'
        : (data && data.error === 'login required' ? 'relogin' : 'server');
      throw makeLoadError(kind);
    }
    return data.data;
  }

  // 3秒をこえたら、経過秒数と理由を出す（B2）
  function startSlowProgress(el, label) {
    const ui = kit();
    if (!ui || !ui.progress) {
      return function() {};
    }
    const startedAt = Date.now();
    return ui.progress(label, function(text) {
      if (Date.now() - startedAt >= 3000) {
        setLoadingText(el, text);
      }
    }, { slowAfter: 8, slowNote: '株価を取りに行っています。少し時間がかかることがあります。' });
  }

  // 銘柄ひとつのカード（株価・前日比・注目中か）を描く
  function renderQuotePreview(payload, targetEl) {
    const container = targetEl || quotePreview;
    if (!payload) {
      container.innerHTML = '';
      return;
    }

    const watchStateText = payload.isWatched
      ? '📌 注目中：' + escapeHtml(payload.watchedBy || '-') + '・' + escapeHtml(payload.watchedAt || '-')
      : 'まだ注目されていません';

    container.innerHTML = [
      '<article class="data-card">',
      '<div class="card-head">',
      '<div class="title-block">',
      '<h3>' + escapeHtml((payload.marketFlag ? payload.marketFlag + ' ' : '') + (payload.name || payload.ticker)) + '</h3>',
      '<p>' + escapeHtml(payload.marketTicker || '-') + (payload.source ? '・' + escapeHtml(payload.source) : '') + '</p>',
      '</div>',
      '<a class="pill-link" href="' + escapeHtml(payload.kabutanUrl || '#') + '" target="_blank" rel="noopener noreferrer">🔍 株探で見る</a>',
      '</div>',
      '<div class="stat-row">',
      '<div class="metric-block"><h4 class="mono big-price">' + escapeHtml(payload.currentPrice || '-') + '</h4><p>いまの株価・前日比 <span class="delta ' + getDeltaClass(payload.changePercent || '') + '">' + escapeHtml(formatChangePercent(payload.changePercent)) + '</span></p></div>',
      payload.isWatched
        ? '<div class="metric-block"><h4 class="mono delta ' + getDeltaClass(payload.performanceDelta || '') + '">' + escapeHtml(payload.performanceDelta || '-') + '</h4><p>注目したときから</p></div>'
        : '',
      '</div>',
      '<div class="record-row">',
      '<div class="metric-block"><p>時価総額</p><h4 class="mono">' + escapeHtml(payload.marketCap || '-') + '</h4></div>',
      '<div class="metric-block"><p>PER・出来高</p><h4 class="mono">' + escapeHtml(payload.per || '-') + '・' + escapeHtml(String(payload.volume || '-')) + '</h4></div>',
      '</div>',
      '<div class="record-row"><span>' + watchStateText + '</span>' + (payload.isWatched ? '<span>注目したときの株価 ' + escapeHtml(payload.addedPrice || '-') + '</span>' : '') + '</div>',
      '</article>'
    ].join('');
  }

  // ---- 銘柄のシート ----

  let quoteSheetReturnFocus = null;

  // 銘柄のシートを開く（閉じたら元の場所にもどる）
  function openQuoteModal(title) {
    quoteSheetReturnFocus = document.activeElement;
    quoteModalTitle.textContent = title || '銘柄の情報';
    quoteModal.hidden = false;
    quoteModalClose.focus();
  }

  // 銘柄のシートを閉じる
  function closeQuoteModal() {
    if (quoteModal.hidden) {
      return;
    }
    quoteModal.hidden = true;
    if (quoteSheetReturnFocus && quoteSheetReturnFocus.focus) {
      quoteSheetReturnFocus.focus();
    }
  }

  // 銘柄ひとつの株価を取って描く。取れなければ、やさしい文を出して null
  async function fetchQuoteByTicker(ticker, options) {
    const normalizedTicker = normalizeTickerText(ticker);
    const settings = options || {};
    if (!normalizedTicker) {
      return null;
    }

    if (!canFetch()) {
      setLoadingText(settings.statusEl, state.groupId
        ? '株価を見るには、LINE で開いてね。'
        : 'グループのトークから開くと、株価を見られます。');
      return null;
    }

    setLoadingText(settings.statusEl, normalizedTicker + ' の株価を取りに行っています…');
    if (settings.targetEl) {
      renderSkeleton(settings.targetEl);
    }
    const stopProgress = startSlowProgress(settings.statusEl, normalizedTicker + ' の株価を取りに行っています');

    try {
      const data = await fetchJsonWithParams('quote', { ticker: normalizedTicker });
      renderQuotePreview(data, settings.targetEl);
      if (settings.titleEl) {
        settings.titleEl.textContent = (data.marketFlag ? data.marketFlag + ' ' : '') + (data.name || normalizedTicker);
      }
      setLoadingText(settings.statusEl, '');
      return data;
    } catch (error) {
      if (settings.targetEl) {
        settings.targetEl.innerHTML = '';
      }
      setLoadingText(settings.statusEl, error.kind === 'denied'
        ? describeLoadError(error, false)
        : '株価を取れませんでした。少し待って、もう一度ためしてね。');
      return null;
    } finally {
      stopProgress();
    }
  }

  // 「🔍 株価を見る」：しらべるの欄の銘柄の株価を出す
  async function fetchQuotePreview() {
    const ticker = requireTicker();
    if (!ticker) {
      return;
    }
    fetchQuoteButton.disabled = true;
    try {
      await fetchQuoteByTicker(ticker, {
        statusEl: searchStatus,
        targetEl: quotePreview
      });
    } finally {
      fetchQuoteButton.disabled = false;
    }
  }

  // ---- 注目一覧・実績 ----

  // 注目一覧を描く（横のスクロールの位置は残す）
  function renderWatchlist(payload) {
    const items = (payload && payload.items) || [];
    const existingWrap = watchlistContent.querySelector('.watchlist-table-wrap');
    const previousScrollLeft = existingWrap ? existingWrap.scrollLeft : 0;
    if (items.length === 0) {
      renderEmptyNote(watchlistContent, '📭', 'まだ注目銘柄はありません。\n「🔍 しらべる」から #コード を送ると、注目に入ります。');
      return;
    }
    watchlistContent.innerHTML = renderWatchlistTable(items);
    const nextWrap = watchlistContent.querySelector('.watchlist-table-wrap');
    if (nextWrap) {
      nextWrap.scrollLeft = previousScrollLeft;
    }
  }

  // 平均の騰落率を「+1.23%」の文字に（ないときは「-」）
  function formatAverage(value) {
    return value === null || typeof value === 'undefined'
      ? '-'
      : ((value > 0 ? '+' : '') + Number(value).toFixed(2) + '%');
  }

  // 実績の順位の行の HTML
  function renderRankingRows(ranking) {
    return ranking.map(function(row) {
      const average = formatAverage(row.averageDelta);
      const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : row.rank + '位';
      return [
        '<div class="ranking-row">',
        '<div class="member-cell">',
        renderAvatar(row.pictureUrl, row.displayName),
        '<strong>' + escapeHtml(medal + ' ' + (row.displayName || '不明')) + '</strong>',
        '</div>',
        '<div class="mono">' + escapeHtml(String(row.pickCount || 0)) + '<small>件</small></div>',
        '<div class="mono delta ' + getDeltaClass(average) + '">' + escapeHtml(average) + '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  // 紹介する人のカードの HTML（名前・平均・銘柄）
  function renderSpotlightCard(spotlight) {
    if (!spotlight) {
      return '';
    }
    const average = formatAverage(spotlight.averageDelta);
    const items = (spotlight.items || []).map(function(item) {
      return [
        '<article class="data-card">',
        '<div class="card-head">',
        '<div class="title-block">',
        '<h4>' + escapeHtml((item.marketFlag ? item.marketFlag + ' ' : '') + item.name) + '</h4>',
        '<p>' + escapeHtml(item.marketTicker || '-') + '</p>',
        '</div>',
        '<a class="pill-link" href="' + escapeHtml(item.kabutanUrl) + '" target="_blank" rel="noopener noreferrer">🔍 ' + escapeHtml(item.ticker) + '</a>',
        '</div>',
        '<div class="record-row">',
        '<strong class="mono">' + escapeHtml(item.currentPrice || '-') + '</strong>',
        '<strong class="mono delta ' + getDeltaClass(item.currentDeltaText) + '">' + escapeHtml(item.currentDeltaText || '-') + '</strong>',
        '</div>',
        '<div class="record-row"><span>注目したとき ' + escapeHtml(item.addedPrice || '-') + '</span><span>' + escapeHtml(item.addedAt || '-') + '</span></div>',
        '</article>'
      ].join('');
    }).join('');

    return [
      '<section class="data-card">',
      '<div class="member-cell">',
      renderAvatar(spotlight.pictureUrl, spotlight.displayName),
      '<div>',
      '<strong>' + escapeHtml(spotlight.title || spotlight.displayName || '注目カード') + '</strong>',
      '<p class="ls-hint">' + escapeHtml(String(spotlight.pickCount || 0) + '件・平均 ' + average) + '</p>',
      '</div>',
      '</div>',
      '<div class="card-list">' + items + '</div>',
      '</section>'
    ].join('');
  }

  // 実績（順位と紹介）を描く
  function renderPerformance(payload) {
    const ranking = (payload && payload.ranking) || [];
    if (ranking.length === 0) {
      renderEmptyNote(performanceContent, '🏆', 'まだ実績はありません。\n注目銘柄が入ると、ここに順位が出ます。');
      return;
    }
    performanceContent.innerHTML = [
      '<section class="data-card">',
      '<div class="ranking-head"><h3>ランキング</h3><p class="ls-hint">注目 ' + escapeHtml(String((payload && payload.totalCount) || 0)) + '件の平均騰落率</p></div>',
      '<div>' + renderRankingRows(ranking) + '</div>',
      '</section>',
      renderSpotlightCard(payload && payload.topSpotlight),
      renderSpotlightCard(payload && payload.randomSpotlight)
    ].join('');
  }

  // 端末に残した時刻を「10/1 15:00」の形に
  function formatSavedTime(ms) {
    if (!ms) {
      return '';
    }
    return new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // 注目一覧か実績を読みこむ：残した中身を先に出し、ネットの返事をあとから重ねる。重なったときは新しい読みこみだけを使う
  async function loadView(view, options) {
    const forceRefresh = !!(options && options.forceRefresh);
    const loadingEl = view === 'watchlist' ? watchlistLoading : performanceLoading;
    const contentEl = view === 'watchlist' ? watchlistContent : performanceContent;
    const cachedPayload = getViewPayload(view);

    if (cachedPayload) {
      renderViewFromPayload(view, cachedPayload);
    }

    if (!forceRefresh && cachedPayload && state.fresh[view]) {
      setLoadingText(loadingEl, '');
      return;
    }

    if (!canFetch() && !state.initDone) {
      // LINE の準備がすむまでは、前の中身か読みこみ中の箱
      if (cachedPayload) {
        setLoadingText(loadingEl, '前に開いたときの内容です。新しくしています…');
      } else {
        renderSkeleton(contentEl);
      }
      return;
    }

    if (!canFetch()) {
      if (cachedPayload) {
        setLoadingText(loadingEl, '前に開いたときの内容です（' + formatSavedTime(state.cacheFetchedAt[view]) + '）。');
        return;
      }
      setLoadingText(loadingEl, '');
      renderEmptyNote(contentEl, '💬', state.groupId
        ? '見るには、LINE で開いてね。'
        : 'グループのトークから開いてね。\nトークで「#注目一覧」と送ると、開くボタンが届きます。');
      return;
    }

    if (state.inFlightLoads[view] && !forceRefresh) {
      return state.inFlightLoads[view];
    }

    setLoadingText(loadingEl, cachedPayload
      ? (state.fresh[view] ? '新しくしています…' : '前に開いたときの内容です。新しくしています…')
      : '読みこんでいます…');
    if (!cachedPayload) {
      renderSkeleton(contentEl);
    }
    const stopProgress = startSlowProgress(loadingEl, cachedPayload ? '新しくしています' : '読みこんでいます');

    const seq = ++state.loadSeq[view];
    const isLatest = function() {
      return seq === state.loadSeq[view];
    };
    const request = (async function() {
      try {
        const data = await fetchJsonWithParams(view, forceRefresh ? { refresh: '1' } : {});
        if (!isLatest()) {
          return;
        }
        setViewPayload(view, data);
        state.fresh[view] = true;
        state.cacheFetchedAt[view] = Date.now();
        writeCachedView(view, data);
        stopProgress();
        renderViewFromPayload(view, data);
        setLoadingText(loadingEl, '');
        if (forceRefresh) {
          toast(view === 'watchlist' ? '注目一覧を新しくしました' : '実績を新しくしました');
        }
      } catch (error) {
        stopProgress();
        if (!isLatest()) {
          return;
        }
        const latest = getViewPayload(view);
        if (latest && error.kind !== 'denied') {
          renderViewFromPayload(view, latest);
          setLoadingText(loadingEl, describeLoadError(error, true));
          return;
        }
        setLoadingText(loadingEl, '');
        renderEmptyNote(contentEl, error.kind === 'denied' ? '🔒' : '📶', describeLoadError(error, false));
      } finally {
        if (isLatest()) {
          state.inFlightLoads[view] = null;
        }
      }
    })();

    state.inFlightLoads[view] = request;
    return request;
  }

  // ---- 操作 ----

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      setActiveView(tab.dataset.view);
    });
  });

  reloadButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      loadView(button.dataset.reloadView, { forceRefresh: true });
    });
  });

  tickerInput.addEventListener('input', updateSearchWatchState);
  tickerInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      tickerInput.blur();
      fetchQuotePreview();
    }
  });
  fetchQuoteButton.addEventListener('click', fetchQuotePreview);
  sendTickerButton.addEventListener('click', sendTickerCommand);
  recentChips.addEventListener('click', function(event) {
    const chip = event.target.closest('[data-pick-ticker]');
    if (!chip) {
      return;
    }
    tickerInput.value = chip.dataset.pickTicker;
    updateSearchWatchState();
    fetchQuotePreview();
  });
  loginButton.addEventListener('click', function() {
    if (window.liff && window.liff.login) {
      window.liff.login({ redirectUri: window.location.href });
    }
  });

  // 注目一覧の行を押したとき、その銘柄のシートを開く
  function openQuoteForRow(tickerRow) {
    openQuoteModal(tickerRow.dataset.name || '銘柄の情報');
    fetchQuoteByTicker(tickerRow.dataset.ticker, {
      statusEl: quoteModalStatus,
      targetEl: quoteModalContent,
      titleEl: quoteModalTitle
    });
  }

  watchlistContent.addEventListener('click', function(event) {
    if (!event.target.closest('a, button, input, select') && !event.target.closest('.column-resizer')) {
      const tickerRow = event.target.closest('tr[data-ticker]');
      if (tickerRow) {
        openQuoteForRow(tickerRow);
        return;
      }
    }

    const sortButton = event.target.closest('[data-sort-key]');
    if (sortButton) {
      const sortKey = sortButton.dataset.sortKey;
      if (state.watchlistSort.key === sortKey) {
        state.watchlistSort.direction = state.watchlistSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.watchlistSort.key = sortKey;
        state.watchlistSort.direction = 'asc';
      }
      if (state.watchlistPayload) {
        renderWatchlist(state.watchlistPayload);
      }
      return;
    }

    // しぼりこみの解除は、すぐ解除して「元に戻す」で戻せる（D1）
    const resetButton = event.target.closest('[data-watchlist-reset]');
    if (resetButton) {
      const previousFilters = JSON.parse(JSON.stringify(state.watchlistFilters));
      state.watchlistFilters = emptyWatchlistFilters();
      if (state.watchlistPayload) {
        renderWatchlist(state.watchlistPayload);
      }
      toast('しぼりこみを解除しました', {
        actionLabel: '元に戻す',
        onAction: function() {
          state.watchlistFilters = previousFilters;
          if (state.watchlistPayload) {
            renderWatchlist(state.watchlistPayload);
          }
        }
      });
    }
  });
  watchlistContent.addEventListener('keydown', function(event) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const tickerRow = event.target.closest('tr[data-ticker]');
    if (tickerRow && event.target === tickerRow) {
      event.preventDefault();
      openQuoteForRow(tickerRow);
    }
  });
  watchlistContent.addEventListener('change', function(event) {
    const filterSelect = event.target.closest('[data-filter-key="addedByDisplayNames"]');
    if (filterSelect) {
      state.watchlistFilters.addedByDisplayNames = Array.from(filterSelect.selectedOptions).map(function(option) {
        return option.value;
      });
      if (state.watchlistPayload) {
        renderWatchlist(state.watchlistPayload);
      }
      return;
    }

    const filterInput = event.target.closest('[data-filter-key]');
    if (!filterInput) {
      return;
    }
    state.watchlistFilters[filterInput.dataset.filterKey] = filterInput.value;
    if (state.watchlistPayload) {
      renderWatchlist(state.watchlistPayload);
    }
  });
  watchlistContent.addEventListener('mousedown', function(event) {
    const resizer = event.target.closest('[data-resize-key]');
    if (!resizer) {
      return;
    }
    event.preventDefault();
    const key = resizer.dataset.resizeKey;
    const startX = event.clientX;
    const startWidth = Number(state.watchlistColumnWidths[key] || 120);

    // 列の幅を、つまんで動かした分だけ変える
    function onMove(moveEvent) {
      state.watchlistColumnWidths[key] = Math.max(72, startWidth + (moveEvent.clientX - startX));
      if (state.watchlistPayload) {
        renderWatchlist(state.watchlistPayload);
      }
    }

    // 列の幅の変更を終える
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  quoteModalClose.addEventListener('click', closeQuoteModal);
  quoteModal.addEventListener('click', function(event) {
    if (event.target === quoteModal) {
      closeQuoteModal();
    }
  });
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      closeQuoteModal();
    }
  });

  // ---- はじめに ----

  // 前に開いたときの中身を先に出す（返事を待つあいだ真っ白にしない。B1）
  restoreCachedViews();
  updateSendNote();
  setActiveView(state.activeView, { forceReload: true });
  updateSearchWatchState();

  // はじめての人にだけ、使い方を3つ（B3）
  const tip = kit();
  if (tip && tip.firstTip && tabList) {
    tip.firstTip('line-investment', [
      '銘柄コードを入れて「🔍 株価を見る」で、いまの株価が見られます。',
      '「💬 グループに送る」で #コード を送ると、ボットが注目に入れます。',
      '注目一覧は、見出しを押すと並べかえ、下の欄でしぼりこめます。行を押すとくわしく見られます。'
    ], tabList);
  }

  // 電波がないときも開けるように（B5）。手元の確かめでは読めなくてもよい
  if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(function() {});
  }

  initializeLiff().finally(function() {
    state.initDone = true;
    updateSendNote();
    updateDebugBadges();
    if (!state.groupId && outsideNote.hidden) {
      showOutsideNote('グループのトークから開いてね。トークで「#注目一覧」と送ると、開くボタンが届きます。', {});
    }
    if (state.activeView === 'watchlist' || state.activeView === 'performance') {
      loadView(state.activeView);
    }
    if (state.activeView !== 'watchlist') {
      loadView('watchlist');
    }
  });
})();
