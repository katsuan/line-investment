/**
 * 画面（LIFF）からの問い合わせに返す中身：注目一覧・実績・銘柄ひとつ。画面を開く URL もここで作る。
 * 本人とグループの確かめ（03_auth）をしてから返す。02_router と 10_bot・30_cards から呼ばれる。
 */

// 画面への中身（view：watchlist・performance・quote）。本人を LINE に確かめ、そのグループにいてルールを確認した人にだけ返す
function processLineGroupBotLiffDataRequest_(request) {
  const params = (request && request.parameter) || {};
  const groupId = normalizeCommandText_(params.groupId || '');
  const view = normalizeCommandText_(params.view || 'watchlist');
  const forceRefresh = String(params.refresh || '') === '1';

  if (!isValidLineGroupId_(groupId)) {
    return createJsonOutput_({
      ok: false,
      error: 'groupId is required.',
    });
  }

  // 本人は、LINE に確かめた印（ID トークンかアクセストークン）で決める。画面から送られた userId は使わない
  const userId = resolveLiffRequestUserId_(params);
  if (!userId) {
    return createJsonOutput_({
      ok: false,
      error: 'login required',
    });
  }

  // 管理者のほかは、そのグループにいまいて、ルールを確認した人だけ
  if (!isAccessAllowed_(groupId, userId) || (!isAdminUser_(userId) && !isLineGroupMember_(groupId, userId))) {
    return createJsonOutput_({
      ok: false,
      error: 'access denied',
    });
  }

  if (view === 'watchlist') {
    return createJsonOutput_({
      ok: true,
      groupId: groupId,
      view: view,
      generatedAt: nowJst_(),
      data: buildLiffWatchlistPayload_(groupId, {
        forceRefresh: forceRefresh,
      }),
    });
  }

  if (view === 'performance') {
    return createJsonOutput_({
      ok: true,
      groupId: groupId,
      view: view,
      generatedAt: nowJst_(),
      data: buildLiffPerformancePayload_(groupId, {
        forceRefresh: forceRefresh,
      }),
    });
  }

  if (view === 'quote') {
    const ticker = normalizeTickerCode_(params.ticker || '');
    if (!isValidTickerCode_(ticker)) {
      return createJsonOutput_({
        ok: false,
        error: 'ticker is required for quote view',
      });
    }

    return createJsonOutput_({
      ok: true,
      groupId: groupId,
      view: view,
      generatedAt: nowJst_(),
      data: buildLiffQuotePayload_(groupId, ticker, {
        forceRefresh: forceRefresh,
      }),
    });
  }

  return createJsonOutput_({
    ok: false,
    error: 'unsupported view',
  });
}

// 画面の注目一覧：銘柄ごとの株価・騰落率・時価総額など（LINE のユーザー ID は返さない）
function buildLiffWatchlistPayload_(groupId, options) {
  const settings = options || {};
  const records = getActiveWatchlistByGroup_(groupId);
  const hydratedRecords = hydrateRecentWatchlistWithCurrentQuotes_(records, {
    forceRefresh: !!settings.forceRefresh,
  });
  let latestCachedAt = '';
  hydratedRecords.forEach(function(record) {
    const cachedAt = record.currentQuote && record.currentQuote.fetchedAt ? String(record.currentQuote.fetchedAt) : '';
    if (cachedAt > latestCachedAt) {
      latestCachedAt = cachedAt;
    }
  });
  return {
    totalCount: records.length,
    latestCachedAt: latestCachedAt,
    items: hydratedRecords.map(function(record) {
      const quote = record.currentQuote || null;
      const marketTicker = resolveRecordMarketTicker_(record, quote);
      const performanceDelta = formatWatchPerformanceDelta_(record, quote);
      return {
        ticker: record.ticker,
        name: (quote && quote.name) || record.tickerName || record.ticker,
        marketTicker: marketTicker,
        marketFlag: buildMarketFlagEmoji_(marketTicker),
        currentPrice: quote && quote.price ? quote.price : '',
        addedPrice: record.addedPrice || '',
        performanceDelta: performanceDelta,
        marketCap: quote && quote.marketCap ? quote.marketCap : '',
        addedMarketCap: record.addedMarketCap || '',
        marketCapDelta: quote && quote.marketCap && record.addedMarketCap ? performanceDelta : '',
        per: quote && quote.per ? quote.per : '',
        volume: quote && quote.volume ? quote.volume : '',
        addedAt: formatDateDisplayOnly_(record.addedAt),
        addedByDisplayName: record.addedByDisplayName || '',
        kabutanUrl: buildKabutanUrl_(record.ticker),
        source: 'Google Finance',
      };
    }),
    cached: !settings.forceRefresh,
  };
}

// 画面の実績：注目した人の順位と、1位の人・ほかの1人の紹介
function buildLiffPerformancePayload_(groupId, options) {
  const settings = { forceRefresh: !!(options && options.forceRefresh) };
  const stats = buildWatchPerformanceStats_(groupId, settings);
  return {
    totalCount: stats.totalCount || 0,
    ranking: (stats.rows || []).map(function(row) {
      return {
        rank: row.rank,
        displayName: row.displayName,
        pictureUrl: row.pictureUrl,
        pickCount: row.pickCount,
        averageDelta: row.averageDelta,
      };
    }),
    topSpotlight: toLiffSpotlight_(buildTopPerformerWatchSpotlightData_(groupId, stats, settings)),
    randomSpotlight: toLiffSpotlight_(buildNonTopRandomWatchSpotlightData_(groupId, stats, settings)),
    cached: !settings.forceRefresh,
  };
}

// 画面に返す紹介カード（LINE のユーザー ID は返さない）
function toLiffSpotlight_(spotlight) {
  if (!spotlight) {
    return null;
  }
  return {
    title: spotlight.title,
    displayName: spotlight.displayName,
    pictureUrl: spotlight.pictureUrl,
    pickCount: spotlight.pickCount,
    averageDelta: spotlight.averageDelta,
    items: (spotlight.records || []).map(function(record) {
      const quote = record.currentQuote || null;
      const marketTicker = resolveRecordMarketTicker_(record, quote);
      return {
        ticker: record.ticker,
        name: (quote && quote.name) || record.tickerName || record.ticker,
        marketTicker: marketTicker,
        marketFlag: buildMarketFlagEmoji_(marketTicker),
        currentPrice: quote && quote.price ? quote.price : '',
        addedPrice: record.addedPrice || '',
        currentDelta: record.currentDelta,
        currentDeltaText: formatSignedPercent_(record.currentDelta),
        addedAt: formatDateDisplayOnly_(record.addedAt),
        kabutanUrl: buildKabutanUrl_(record.ticker),
      };
    }),
  };
}

// 画面の「しらべる」：銘柄ひとつの株価と、注目中ならそのようす
function buildLiffQuotePayload_(groupId, ticker, options) {
  const settings = options || {};
  const normalizedTicker = normalizeTickerCode_(ticker);
  let quote = null;
  try {
    quote = getMarketQuoteByTicker_(normalizedTicker, {
      forceRefresh: !!settings.forceRefresh,
    });
  } catch (error) {
    quote = null;
  }

  const activeRecord = getActiveWatchlistRecordByTicker_(groupId, normalizedTicker);
  const marketTicker = (quote && quote.marketTicker) ||
    (activeRecord && activeRecord.addedMarketTicker) ||
    composeMarketTicker_(normalizedTicker);

  return {
    ticker: normalizedTicker,
    name: (quote && quote.name) || (activeRecord && activeRecord.tickerName) || normalizedTicker,
    marketTicker: marketTicker,
    marketFlag: buildMarketFlagEmoji_(marketTicker),
    currentPrice: quote && quote.price ? quote.price : '',
    changePercent: quote && quote.changePercent ? quote.changePercent : '',
    marketCap: quote && quote.marketCap ? quote.marketCap : '',
    per: quote && quote.per ? quote.per : '',
    volume: quote && quote.volume ? quote.volume : '',
    kabutanUrl: buildKabutanUrl_(normalizedTicker),
    source: 'Google Finance',
    isWatched: !!activeRecord,
    watchedBy: activeRecord ? (activeRecord.addedByDisplayName || '') : '',
    watchedAt: activeRecord ? formatDateDisplayOnly_(activeRecord.addedAt) : '',
    addedPrice: activeRecord ? (activeRecord.addedPrice || '') : '',
    performanceDelta: activeRecord ? formatWatchPerformanceDelta_(activeRecord, quote) : '',
    cached: !settings.forceRefresh,
  };
}

// 画面を開く URL（groupId と view を付ける）。画面の URL がまだないときは空
function buildLiffAppLaunchUrl_(groupId, view) {
  const baseUrl = getLiffAppBaseUrl_();
  if (!baseUrl) {
    return '';
  }

  const separator = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  return baseUrl + separator +
    'groupId=' + encodeURIComponent(groupId) +
    '&view=' + encodeURIComponent(view || 'watchlist');
}
