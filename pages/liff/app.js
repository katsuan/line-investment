(function() {
  const query = new URLSearchParams(window.location.search);
  const config = window.APP_CONFIG || {};
  const state = {
    activeView: query.get('view') || 'search',
    groupId: query.get('groupId') || '',
    userId: '',
    apiBaseUrl: query.get('apiBaseUrl') || config.apiBaseUrl || '',
    liffId: query.get('liffId') || config.liffId || '',
    initialized: false,
  };

  const contextBadge = document.getElementById('contextBadge');
  const groupBadge = document.getElementById('groupBadge');
  const userBadge = document.getElementById('userBadge');
  const tickerInput = document.getElementById('tickerInput');
  const sendTickerButton = document.getElementById('sendTickerButton');
  const fillTickerButton = document.getElementById('fillTickerButton');
  const searchStatus = document.getElementById('searchStatus');
  const watchlistLoading = document.getElementById('watchlistLoading');
  const watchlistContent = document.getElementById('watchlistContent');
  const performanceLoading = document.getElementById('performanceLoading');
  const performanceContent = document.getElementById('performanceContent');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  const reloadButtons = Array.from(document.querySelectorAll('[data-reload-view]'));

  function setBadge(el, text) {
    if (el) {
      el.textContent = text;
    }
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

  function renderAvatar(pictureUrl, displayName) {
    if (pictureUrl) {
      return '<div class="avatar"><img src="' + escapeHtml(pictureUrl) + '" alt=""></div>';
    }
    return '<div class="avatar">' + escapeHtml(String(displayName || '-').slice(0, 1)) + '</div>';
  }

  function setActiveView(view, options) {
    state.activeView = view;
    tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.view === view);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.panel === view);
    });

    if (!options || !options.silent) {
      if (view === 'watchlist' || view === 'performance') {
        loadView(view);
      }
    }
  }

  function normalizeTickerInput() {
    return String(tickerInput.value || '').trim().toUpperCase().replace(/^#/, '');
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
    searchStatus.textContent = command + ' を手動送信用にセットしました。';
  }

  function fillTickerCommand() {
    const ticker = normalizeTickerInput();
    if (!ticker) {
      searchStatus.textContent = '銘柄コードを入力してください。';
      return;
    }
    tickerInput.value = '#' + ticker;
    searchStatus.textContent = '送信用に #' + ticker + ' をセットしました。';
  }

  async function initializeLiff() {
    if (!window.liff || !state.liffId) {
      setBadge(contextBadge, state.liffId ? 'LIFF SDKなし' : 'LIFF ID未設定');
      return;
    }

    try {
      await window.liff.init({ liffId: state.liffId });
      const context = window.liff.getContext ? window.liff.getContext() : null;
      const profile = window.liff.getProfile ? await window.liff.getProfile() : null;
      state.userId = (profile && profile.userId) || (context && context.userId) || '';
      state.initialized = true;
      setBadge(contextBadge, 'LIFF ' + ((context && context.type) || 'unknown'));
      setBadge(groupBadge, 'group: ' + (state.groupId || '-'));
      setBadge(userBadge, 'user: ' + (state.userId || '-'));
    } catch (error) {
      setBadge(contextBadge, 'LIFF初期化失敗');
      searchStatus.textContent = 'LIFF 初期化に失敗しました。query の liffId / apiBaseUrl を確認してください。';
    }
  }

  async function fetchJson(view) {
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

    const response = await fetch(url.toString(), { method: 'GET' });
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'request failed');
    }
    return data.data;
  }

  function renderWatchlist(payload) {
    const items = (payload && payload.items) || [];
    if (items.length === 0) {
      watchlistContent.innerHTML = '<p class="empty-state">注目銘柄はまだありません。</p>';
      return;
    }

    watchlistContent.innerHTML = items.map(function(item) {
      return [
        '<article class="data-card">',
        '<div class="card-head">',
        '<div class="title-block">',
        '<h3>' + escapeHtml((item.marketFlag ? item.marketFlag + ' ' : '') + item.name) + '</h3>',
        '<p>' + escapeHtml(item.marketTicker || '-') + '</p>',
        '</div>',
        '<a class="pill-link" href="' + escapeHtml(item.kabutanUrl) + '" target="_blank" rel="noreferrer">🔍 ' + escapeHtml(item.ticker) + '</a>',
        '</div>',
        '<div class="stat-row">',
        '<div class="metric-block"><h4 class="mono">' + escapeHtml(item.currentPrice || '-') + '</h4><p>注目時 ' + escapeHtml(item.addedPrice || '-') + '</p></div>',
        '<div class="metric-block"><h4 class="mono delta ' + getDeltaClass(item.performanceDelta) + '">' + escapeHtml(item.performanceDelta || '-') + '</h4><p>パフォーマンス</p></div>',
        '</div>',
        '<div class="record-row">',
        '<div class="metric-block"><strong>時価総額</strong><p>' + escapeHtml(item.marketCap || '-') + ' / 注目時 ' + escapeHtml(item.addedMarketCap || '-') + '</p></div>',
        '<div class="metric-block"><strong>PER / 出来高</strong><p>' + escapeHtml(item.per || '-') + ' / ' + escapeHtml(String(item.volume || '-')) + '</p></div>',
        '</div>',
        '<div class="record-row"><span>' + escapeHtml('注目 ' + (item.addedByDisplayName || '-') + ' / ' + (item.addedAt || '-')) + '</span><span>' + escapeHtml(item.source || '') + '</span></div>',
        '</article>'
      ].join('');
    }).join('');
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

  async function loadView(view) {
    const loadingEl = view === 'watchlist' ? watchlistLoading : performanceLoading;
    const contentEl = view === 'watchlist' ? watchlistContent : performanceContent;
    loadingEl.textContent = '読み込み中...';
    contentEl.innerHTML = '';

    try {
      const data = await fetchJson(view);
      if (view === 'watchlist') {
        renderWatchlist(data);
      } else {
        renderPerformance(data);
      }
      loadingEl.textContent = '更新済み: ' + new Date().toLocaleTimeString('ja-JP');
    } catch (error) {
      loadingEl.textContent = '取得失敗: ' + error.message;
    }
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      setActiveView(tab.dataset.view);
    });
  });

  reloadButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      loadView(button.dataset.reloadView);
    });
  });

  sendTickerButton.addEventListener('click', sendTickerCommand);
  fillTickerButton.addEventListener('click', fillTickerCommand);

  initializeLiff().finally(function() {
    setBadge(groupBadge, 'group: ' + (state.groupId || '-'));
    setBadge(userBadge, 'user: ' + (state.userId || '-'));
    setActiveView(state.activeView, { silent: false });
  });
})();
