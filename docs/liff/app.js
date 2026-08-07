(function() {
  const query = new URLSearchParams(window.location.search);
  const config = window.APP_CONFIG || {};
  const state = {
    activeView: query.get('view') || 'search',
    groupId: query.get('groupId') || config.debugGroupId || '',
    userId: '',
    apiBaseUrl: query.get('apiBaseUrl') || config.apiBaseUrl || '',
    liffId: query.get('liffId') || config.liffId || '',
    initialized: false,
    watchlistPayload: null,
    performancePayload: null,
    cacheFetchedAt: {
      watchlist: 0,
      performance: 0
    },
    inFlightLoads: {
      watchlist: null,
      performance: null
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
    watchlistFilters: {
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
    }
  };

  const contextBadge = document.getElementById('contextBadge');
  const groupBadge = document.getElementById('groupBadge');
  const userBadge = document.getElementById('userBadge');
  const debugContextRow = document.getElementById('debugContextRow');
  const tickerInput = document.getElementById('tickerInput');
  const fetchQuoteButton = document.getElementById('fetchQuoteButton');
  const sendTickerButton = document.getElementById('sendTickerButton');
  const searchStatus = document.getElementById('searchStatus');
  const watchlistHint = document.getElementById('watchlistHint');
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
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  const reloadButtons = Array.from(document.querySelectorAll('[data-reload-view]'));

  function setBadge(el, text) {
    if (el) {
      el.textContent = text;
    }
  }

  function setDebugBadgeVisible(visible) {
    if (!debugContextRow) {
      return;
    }
    debugContextRow.classList.toggle('is-hidden', !visible);
  }

  function getDeltaClass(value) {
    if (typeof value !== 'string') {
      return '';
    }
    if (value.indexOf('+') === 0) {
      return 'plus';
    }
    if (value.indexOf('-') === 0) {
      return 'minus';
    }
    return '';
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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

  function formatDateTimeDisplay(value) {
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

  function getTickerCode(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '-';
    }
    return raw.split(':')[0] || raw;
  }

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

  function getWatchlistCellValue(item, key) {
    if (key === 'name') {
      return (item.marketFlag ? item.marketFlag + ' ' : '') + (item.name || '-');
    }
    if (key === 'marketTicker') {
      return getTickerCode(item.marketTicker || item.ticker);
    }
    return item[key];
  }

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

  function getWatchlistAddedByOptions(items) {
    const names = items.map(function(item) {
      return String(item.addedByDisplayName || '').trim();
    }).filter(Boolean);
    return Array.from(new Set(names)).sort(function(a, b) {
      return a.localeCompare(b, 'ja');
    });
  }

  function renderWatchlistFilterInput(column, items) {
    const filters = state.watchlistFilters;

    if (column.type === 'number') {
      return [
        '<div class="filter-pair">',
        '<input class="table-filter-input" data-filter-key="' + column.key + 'Min" type="text" inputmode="decimal" placeholder="min" value="' + escapeHtml(filters[column.key + 'Min'] || '') + '">',
        '<input class="table-filter-input" data-filter-key="' + column.key + 'Max" type="text" inputmode="decimal" placeholder="max" value="' + escapeHtml(filters[column.key + 'Max'] || '') + '">',
        '</div>'
      ].join('');
    }

    if (column.key === 'addedByDisplayName') {
      const options = getWatchlistAddedByOptions(items);
      return [
        '<select class="table-filter-select" data-filter-key="addedByDisplayNames" multiple size="' + escapeHtml(String(Math.min(Math.max(options.length, 2), 4))) + '">',
        options.map(function(name) {
          const selected = filters.addedByDisplayNames.indexOf(name) >= 0 ? ' selected' : '';
          return '<option value="' + escapeHtml(name) + '"' + selected + '>' + escapeHtml(name) + '</option>';
        }).join(''),
        '</select>'
      ].join('');
    }

    return '<input class="table-filter-input" data-filter-key="' + column.key + '" type="text" placeholder="filter" value="' + escapeHtml(filters[column.key] || '') + '">';
  }

  function renderWatchlistTable(items) {
    const filteredItems = getWatchlistFilteredItems(items);
    const sortedItems = getWatchlistSortedItems(filteredItems);
    const sortMarker = state.watchlistSort.direction === 'asc' ? '↑' : '↓';
    const latestCachedAt = state.watchlistPayload && state.watchlistPayload.latestCachedAt
      ? 'キャッシュ ' + formatDateTimeDisplay(state.watchlistPayload.latestCachedAt)
      : '';

    return [
      '<div class="watchlist-toolbar">',
      '<div class="watchlist-summary">表示 ' + escapeHtml(String(sortedItems.length)) + ' / 全' + escapeHtml(String(items.length)) + '件' + (latestCachedAt ? ' ・ ' + escapeHtml(latestCachedAt) : '') + '</div>',
      '<button class="ghost-button compact" data-watchlist-reset type="button">条件クリア</button>',
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
        return '<th class="watchlist-head-cell" data-column-key="' + column.key + '">' +
          '<button class="sort-button' + (isActive ? ' is-active' : '') + '" data-sort-key="' + column.key + '" type="button">' +
          escapeHtml(column.label) + (isActive ? ' ' + sortMarker : '') + '</button>' +
          '<span class="column-resizer" data-resize-key="' + column.key + '"></span>' +
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
        '<td class="table-empty" colspan="' + escapeHtml(String(watchlistColumns.length)) + '">条件に一致する注目銘柄はありません。</td>',
        '</tr>'
      ].join('') : sortedItems.map(function(item) {
        return [
          '<tr data-ticker="' + escapeHtml(item.ticker || '') + '" data-name="' + escapeHtml(item.name || '') + '">',
          '<td><a class="pill-link" href="' + escapeHtml(item.kabutanUrl) + '" target="_blank" rel="noreferrer">🔍 ' + escapeHtml(getTickerCode(item.marketTicker || item.ticker)) + '</a></td>',
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
      '</div>',
      '<p class="status-text">タップで列ソート、入力で絞り込み、見出し右端のドラッグで列幅調整できます。</p>'
    ].join('');
  }

  function renderAvatar(pictureUrl, displayName) {
    if (pictureUrl) {
      return '<div class="avatar"><img src="' + escapeHtml(pictureUrl) + '" alt=""></div>';
    }
    return '<div class="avatar">' + escapeHtml(String(displayName || '-').slice(0, 1)) + '</div>';
  }

  function setActiveView(view, options) {
    const isSameView = state.activeView === view;
    state.activeView = view;
    tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.view === view);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.panel === view);
    });

    if (isSameView && (!options || !options.forceReload)) {
      return;
    }

    if (!options || !options.silent) {
      if (view === 'watchlist' || view === 'performance') {
        loadView(view);
      }
    }
  }

  function normalizeTickerInput() {
    return normalizeTickerText(tickerInput.value || '');
  }

  function findWatchItemByTicker(ticker) {
    const items = (state.watchlistPayload && state.watchlistPayload.items) || [];
    return items.find(function(item) {
      return String(item.ticker || '').toUpperCase() === String(ticker || '').toUpperCase();
    }) || null;
  }

  function updateSearchWatchState() {
    const ticker = normalizeTickerInput();
    if (!ticker) {
      searchWatchState.textContent = '';
      return;
    }

    if (!state.watchlistPayload) {
      searchWatchState.textContent = '注目一覧の取得完了後に、利用中かどうかをここへ表示します。';
      return;
    }

    const watchItem = findWatchItemByTicker(ticker);
    if (watchItem) {
      searchWatchState.textContent = ticker + ' は注目中です。' +
        (watchItem.addedByDisplayName ? ' 注目 ' + watchItem.addedByDisplayName + ' / ' + watchItem.addedAt : '');
      return;
    }

    searchWatchState.textContent = ticker + ' は現在の注目一覧には入っていません。';
  }

  async function sendTickerCommand() {
    const ticker = normalizeTickerInput();
    if (!ticker) {
      searchStatus.textContent = '銘柄コードを入力してください。';
      return;
    }

    const command = '#' + ticker;
    if (window.liff && typeof window.liff.sendMessages === 'function') {
      try {
        await window.liff.sendMessages([{ type: 'text', text: command }]);
        searchStatus.textContent = command + ' をチャットへ送信しました。';
        if (window.liff.closeWindow) {
          setTimeout(function() {
            window.liff.closeWindow();
          }, 700);
        }
        return;
      } catch (error) {
        searchStatus.textContent = '送信に失敗したため、手動で送る用に表示します。';
      }
    }

    tickerInput.value = command;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(command);
        searchStatus.textContent = 'この環境では送信できません。' + command + ' をコピーして入力欄にも入れました。';
        return;
      } catch (error) {
        // Continue to the plain fallback.
      }
    }
    searchStatus.textContent = 'この環境では送信できません。' + command + ' を入力欄に入れました。';
  }

  async function initializeLiff() {
    if (!window.liff || !state.liffId) {
      setDebugBadgeVisible(true);
      state.userId = config.debugUserId || '';
      setBadge(contextBadge, state.liffId ? 'ローカルデバッグ' : 'ID未設定');
      setBadge(groupBadge, 'group: ' + (state.groupId || '-'));
      setBadge(userBadge, 'user: ' + (state.userId || '-'));
      searchStatus.textContent = 'ローカル表示中です。debugGroupId / debugUserId でデータ取得し、送信はコピーへフォールバックします。';
      return;
    }

    try {
      await window.liff.init({ liffId: state.liffId });
      setDebugBadgeVisible(false);
      const context = window.liff.getContext ? window.liff.getContext() : null;
      const profile = window.liff.getProfile ? await window.liff.getProfile() : null;
      state.userId = (profile && profile.userId) || (context && context.userId) || '';
      state.initialized = true;
      setBadge(contextBadge, 'debug ' + ((context && context.type) || 'unknown'));
      setBadge(groupBadge, 'group: ' + (state.groupId || '-'));
      setBadge(userBadge, 'user: ' + (state.userId || '-'));
    } catch (error) {
      setDebugBadgeVisible(true);
      state.userId = config.debugUserId || '';
      setBadge(contextBadge, '初期化失敗');
      setBadge(groupBadge, 'group: ' + (state.groupId || '-'));
      setBadge(userBadge, 'user: ' + (state.userId || '-'));
      searchStatus.textContent = '起動に失敗したため、debugGroupId / debugUserId を使うデバッグ表示へ切り替えました。';
    }
  }

  function setLoadingState(el, message, isBusy) {
    if (!el) {
      return;
    }
    el.textContent = message;
    el.classList.toggle('is-idle', !isBusy);
    el.classList.toggle('loading-state', !!isBusy);
  }

  function getViewPayload(view) {
    return view === 'watchlist' ? state.watchlistPayload : state.performancePayload;
  }

  function setViewPayload(view, payload) {
    if (view === 'watchlist') {
      state.watchlistPayload = payload;
      return;
    }
    state.performancePayload = payload;
  }

  function renderViewFromPayload(view, payload) {
    if (view === 'watchlist') {
      renderWatchlist(payload);
      setLoadingState(watchlistHint, '注目一覧をローカル保持しています。更新時のみ再取得します。', false);
      updateSearchWatchState();
      return;
    }
    renderPerformance(payload);
  }

  async function fetchJson(view) {
    return fetchJsonWithParams(view, {});
  }

  async function fetchJsonWithParams(view, extraParams) {
    if (!state.apiBaseUrl) {
      throw new Error('apiBaseUrl is missing');
    }
    if (!state.groupId) {
      throw new Error('groupId is missing');
    }
    if (!state.userId) {
      throw new Error('userId is missing');
    }

    const url = new URL(state.apiBaseUrl, window.location.href);
    url.searchParams.set('action', 'liff_data');
    url.searchParams.set('groupId', state.groupId);
    url.searchParams.set('view', view);
    url.searchParams.set('userId', state.userId);
    Object.keys(extraParams || {}).forEach(function(key) {
      if (extraParams[key] !== '' && extraParams[key] !== null && typeof extraParams[key] !== 'undefined') {
        url.searchParams.set(key, extraParams[key]);
      }
    });

    const response = await fetch(url.toString(), { method: 'GET' });
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'request failed');
    }
    return data.data;
  }

  function renderQuotePreview(payload, targetEl) {
    const container = targetEl || quotePreview;
    if (!payload) {
      container.innerHTML = '';
      return;
    }

    const watchStateText = payload.isWatched
      ? '注目中: ' + escapeHtml(payload.watchedBy || '-') + ' / ' + escapeHtml(payload.watchedAt || '-')
      : '未注目';

    container.innerHTML = [
      '<article class="data-card">',
      '<div class="card-head">',
      '<div class="title-block">',
      '<h3>' + escapeHtml((payload.marketFlag ? payload.marketFlag + ' ' : '') + (payload.name || payload.ticker)) + '</h3>',
      '<p>' + escapeHtml(payload.marketTicker || '-') + ' / ' + escapeHtml(payload.source || '') + '</p>',
      '</div>',
      '<a class="pill-link" href="' + escapeHtml(payload.kabutanUrl || '#') + '" target="_blank" rel="noreferrer">🔍 ' + escapeHtml(payload.ticker || '-') + '</a>',
      '</div>',
      '<div class="stat-row">',
      '<div class="metric-block"><h4 class="mono">' + escapeHtml(payload.currentPrice || '-') + '</h4><p>' + escapeHtml(payload.changePercent || '-') + '</p></div>',
      '<div class="metric-block"><h4 class="mono delta ' + getDeltaClass(payload.performanceDelta || '') + '">' + escapeHtml(payload.performanceDelta || '-') + '</h4><p>注目時比</p></div>',
      '</div>',
      '<div class="record-row">',
      '<div class="metric-block"><p>時価総額</p><h4 class="mono">' + escapeHtml(payload.marketCap || '-') + '</h4></div>',
      '<div class="metric-block"><p>PER / 出来高</p><h4 class="mono">' + escapeHtml(payload.per || '-') + ' / ' + escapeHtml(String(payload.volume || '-')) + '</h4></div>',
      '</div>',
      '<div class="record-row"><span>' + watchStateText + '</span><span>注目時価格 ' + escapeHtml(payload.addedPrice || '-') + '</span></div>',
      '</article>'
    ].join('');
  }

  function openQuoteModal(title) {
    if (!quoteModal) {
      return;
    }
    quoteModal.classList.remove('is-hidden');
    quoteModal.setAttribute('aria-hidden', 'false');
    if (quoteModalTitle) {
      quoteModalTitle.textContent = title || '銘柄情報';
    }
  }

  function closeQuoteModal() {
    if (!quoteModal) {
      return;
    }
    quoteModal.classList.add('is-hidden');
    quoteModal.setAttribute('aria-hidden', 'true');
  }

  async function fetchQuoteByTicker(ticker, options) {
    const normalizedTicker = normalizeTickerText(ticker);
    const settings = options || {};
    if (!normalizedTicker) {
      return null;
    }

    if (settings.statusEl) {
      setLoadingState(settings.statusEl, normalizedTicker + ' の株情報を取得中です。', true);
    }
    if (settings.targetEl) {
      settings.targetEl.innerHTML = '';
    }

    try {
      const data = await fetchJsonWithParams('quote', { ticker: normalizedTicker });
      renderQuotePreview(data, settings.targetEl);
      if (settings.titleEl) {
        settings.titleEl.textContent = (data.marketFlag ? data.marketFlag + ' ' : '') + (data.name || normalizedTicker);
      }
      if (settings.statusEl) {
        setLoadingState(settings.statusEl, normalizedTicker + ' の株情報を更新しました。', false);
      }
      return data;
    } catch (error) {
      if (settings.statusEl) {
        setLoadingState(settings.statusEl, '株情報の取得に失敗しました: ' + error.message, false);
      }
      return null;
    }
  }

  async function fetchQuotePreview() {
    const ticker = normalizeTickerInput();
    if (!ticker) {
      setLoadingState(searchStatus, '銘柄コードを入力してください。', false);
      return;
    }

    await fetchQuoteByTicker(ticker, {
      statusEl: searchStatus,
      targetEl: quotePreview
    });
  }

  function renderWatchlist(payload) {
    const items = (payload && payload.items) || [];
    const existingWrap = watchlistContent.querySelector('.watchlist-table-wrap');
    const previousScrollLeft = existingWrap ? existingWrap.scrollLeft : 0;
    if (items.length === 0) {
      watchlistContent.innerHTML = '<p class="empty-state">注目銘柄はまだありません。</p>';
      return;
    }
    watchlistContent.innerHTML = renderWatchlistTable(items);
    const nextWrap = watchlistContent.querySelector('.watchlist-table-wrap');
    if (nextWrap) {
      nextWrap.scrollLeft = previousScrollLeft;
    }
  }

  function renderRankingRows(ranking) {
    return ranking.map(function(row) {
      const average = row.averageDelta === null || typeof row.averageDelta === 'undefined'
        ? '-'
        : ((row.averageDelta > 0 ? '+' : '') + Number(row.averageDelta).toFixed(2) + '%');
      const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : '#' + row.rank;
      return [
        '<div class="ranking-row">',
        '<div class="member-cell">',
        renderAvatar(row.pictureUrl, row.displayName),
        '<div><strong>' + escapeHtml(medal + ' ' + (row.displayName || '不明')) + '</strong></div>',
        '</div>',
        '<div class="mono">' + escapeHtml(String(row.pickCount || 0)) + '</div>',
        '<div class="mono delta ' + getDeltaClass(average) + '">' + escapeHtml(average) + '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderSpotlightCard(spotlight) {
    if (!spotlight) {
      return '';
    }
    const average = spotlight.averageDelta === null || typeof spotlight.averageDelta === 'undefined'
      ? '-'
      : ((spotlight.averageDelta > 0 ? '+' : '') + Number(spotlight.averageDelta).toFixed(2) + '%');
    const items = (spotlight.items || []).map(function(item) {
      return [
        '<article class="data-card">',
        '<div class="card-head">',
        '<div class="title-block">',
        '<h4>' + escapeHtml((item.marketFlag ? item.marketFlag + ' ' : '') + item.name) + '</h4>',
        '<p>' + escapeHtml(item.marketTicker || '-') + '</p>',
        '</div>',
        '<a class="pill-link" href="' + escapeHtml(item.kabutanUrl) + '" target="_blank" rel="noreferrer">🔍 ' + escapeHtml(item.ticker) + '</a>',
        '</div>',
        '<div class="record-row">',
        '<strong class="mono">' + escapeHtml(item.currentPrice || '-') + '</strong>',
        '<strong class="mono delta ' + getDeltaClass(item.currentDeltaText) + '">' + escapeHtml(item.currentDeltaText || '-') + '</strong>',
        '</div>',
        '<div class="record-row"><span>注目時 ' + escapeHtml(item.addedPrice || '-') + '</span><span>日付 ' + escapeHtml(item.addedAt || '-') + '</span></div>',
        '</article>'
      ].join('');
    }).join('');

    return [
      '<section class="data-card">',
      '<div class="member-cell">',
      renderAvatar(spotlight.pictureUrl, spotlight.displayName),
      '<div>',
      '<strong>' + escapeHtml(spotlight.title || spotlight.displayName || '注目カード') + '</strong>',
      '<p class="status-text">' + escapeHtml(String(spotlight.pickCount || 0) + '件 ' + average + '（平均騰落率）') + '</p>',
      '</div>',
      '</div>',
      '<div class="card-list">' + items + '</div>',
      '</section>'
    ].join('');
  }

  function renderPerformance(payload) {
    const ranking = (payload && payload.ranking) || [];
    performanceContent.innerHTML = [
      '<section class="data-card">',
      '<div class="section-head"><h3>ランキング</h3><p>集計対象 ' + escapeHtml(String((payload && payload.totalCount) || 0)) + '件</p></div>',
      renderRankingRows(ranking),
      '</section>',
      renderSpotlightCard(payload && payload.topSpotlight),
      renderSpotlightCard(payload && payload.randomSpotlight)
    ].join('');
  }

  async function loadView(view, options) {
    const forceRefresh = !!(options && options.forceRefresh);
    const loadingEl = view === 'watchlist' ? watchlistLoading : performanceLoading;
    const contentEl = view === 'watchlist' ? watchlistContent : performanceContent;
    const cachedPayload = getViewPayload(view);

    if (!forceRefresh && cachedPayload) {
      renderViewFromPayload(view, cachedPayload);
      setLoadingState(loadingEl, 'ローカル表示中: ' + new Date(state.cacheFetchedAt[view]).toLocaleTimeString('ja-JP'), false);
      return;
    }

    if (state.inFlightLoads[view] && !forceRefresh) {
      setLoadingState(loadingEl, '読み込み中...', true);
      return state.inFlightLoads[view];
    }

    setLoadingState(loadingEl, forceRefresh ? '更新中...' : '読み込み中...', true);
    if (!cachedPayload) {
      contentEl.innerHTML = '';
    }

    const request = (async function() {
      try {
        const data = await fetchJsonWithParams(view, forceRefresh ? { refresh: '1' } : {});
        setViewPayload(view, data);
        state.cacheFetchedAt[view] = Date.now();
        renderViewFromPayload(view, data);
        setLoadingState(loadingEl, '更新済み: ' + new Date().toLocaleTimeString('ja-JP'), false);
      } catch (error) {
        if (cachedPayload) {
          renderViewFromPayload(view, cachedPayload);
          setLoadingState(loadingEl, '更新失敗: ローカル表示を継続', false);
          return;
        }
        setLoadingState(loadingEl, '取得失敗: ' + error.message, false);
      } finally {
        state.inFlightLoads[view] = null;
      }
    })();

    state.inFlightLoads[view] = request;
    return request;
  }

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
  fetchQuoteButton.addEventListener('click', fetchQuotePreview);
  sendTickerButton.addEventListener('click', sendTickerCommand);
  watchlistContent.addEventListener('click', function(event) {
    if (!event.target.closest('a, button, input, select') && !event.target.closest('.column-resizer')) {
      const tickerRow = event.target.closest('tr[data-ticker]');
      if (tickerRow) {
        openQuoteModal(tickerRow.dataset.name || '銘柄情報');
        fetchQuoteByTicker(tickerRow.dataset.ticker, {
          statusEl: quoteModalStatus,
          targetEl: quoteModalContent,
          titleEl: quoteModalTitle
        });
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

    const resetButton = event.target.closest('[data-watchlist-reset]');
    if (resetButton) {
      Object.keys(state.watchlistFilters).forEach(function(key) {
        state.watchlistFilters[key] = '';
      });
      if (state.watchlistPayload) {
        renderWatchlist(state.watchlistPayload);
      }
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

    function onMove(moveEvent) {
      state.watchlistColumnWidths[key] = Math.max(72, startWidth + (moveEvent.clientX - startX));
      if (state.watchlistPayload) {
        renderWatchlist(state.watchlistPayload);
      }
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  if (quoteModalClose) {
    quoteModalClose.addEventListener('click', closeQuoteModal);
  }
  if (quoteModal) {
    quoteModal.addEventListener('click', function(event) {
      if (event.target === quoteModal) {
        closeQuoteModal();
      }
    });
  }
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      closeQuoteModal();
    }
  });

  initializeLiff().finally(function() {
    setBadge(groupBadge, 'group: ' + (state.groupId || '-'));
    setBadge(userBadge, 'user: ' + (state.userId || '-'));
    setActiveView(state.activeView, { silent: false, forceReload: true });
    if (state.activeView !== 'watchlist') {
      loadView('watchlist');
    }
  });
})();
