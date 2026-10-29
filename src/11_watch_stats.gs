/**
 * 注目の実績：いまの株価を付ける・騰落率を出す・注目した人ごとの順位・紹介する人をえらぶ。
 * 12_liff_api（画面の実績）と 30_cards（もう注目中のカード）から呼ばれる。
 */

// 注目の記録に、いまの株価（currentQuote）を付ける。forceRefresh でなければ、シートに覚えた株価だけを使う（速く返す）
function hydrateRecordsWithQuotes_(records, options) {
  const forceRefresh = !!(options && options.forceRefresh);
  const quoteMap = getMarketQuoteMapByTickers_(records.map(function(record) {
    return record.ticker;
  }), {
    forceRefresh: forceRefresh,
    useLatestCacheOnly: !forceRefresh,
  });

  return records.map(function(record) {
    return Object.assign({}, record, {
      currentQuote: quoteMap[normalizeTickerCode_(record.ticker)] || null,
    });
  });
}

// 新しい順に、画面に出す数（LIFF_WATCHLIST_LIMIT_）だけ、いまの株価を付ける
function hydrateRecentWatchlistWithCurrentQuotes_(records, options) {
  return hydrateRecordsWithQuotes_(records.slice(0, LIFF_WATCHLIST_LIMIT_), options);
}

// 注目したときの株価から、いまの株価までの変化（%）。どちらかがないときは null
function calcWatchPriceDelta_(record) {
  const quote = record.currentQuote || null;
  return calcPercentDelta_(toNumberOrNaN_(quote && quote.price), toNumberOrNaN_(record.addedPrice));
}

// 注目したときからの騰落率の文字。時価総額が両方あれば時価総額で（株式分割に左右されない）、なければ株価で
function formatWatchPerformanceDelta_(record, quote) {
  if (quote && quote.marketCap && record.addedMarketCap) {
    return formatSignedPercentDeltaFromBaseScaled_(quote.marketCap, record.addedMarketCap);
  }
  return formatSignedPercentDeltaFromBase_(quote && quote.price ? quote.price : '', record.addedPrice);
}

// 注目の行の市場付きコード（注目したとき → いまの株価 → 決まりの付け方の順）
function resolveRecordMarketTicker_(record, quote) {
  return record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker);
}

// 注目した人ごとの実績（注目した数と、平均の騰落率）。上位5位まで（同じ成績は同じ順位）
function buildWatchPerformanceStats_(groupId, options) {
  const records = hydrateRecordsWithQuotes_(getActiveWatchlistByGroup_(groupId), options);
  const statsByUser = {};
  records.forEach(function(record) {
    const key = String(record.addedByUserId || record.addedByDisplayName || 'unknown');
    if (!statsByUser[key]) {
      statsByUser[key] = {
        userId: record.addedByUserId || '',
        displayName: record.addedByDisplayName || '不明',
        pickCount: 0,
        deltaSum: 0,
        deltaCount: 0,
      };
    }
    const stat = statsByUser[key];
    stat.pickCount += 1;
    const delta = calcWatchPriceDelta_(record);
    if (delta !== null) {
      stat.deltaSum += delta;
      stat.deltaCount += 1;
    }
  });

  const rows = Object.keys(statsByUser)
    .map(function(key) {
      const stat = statsByUser[key];
      const profile = getMemberProfileOrEmpty_(groupId, stat.userId);
      const average = stat.deltaCount > 0 ? (stat.deltaSum / stat.deltaCount) : null;
      return {
        userId: stat.userId,
        displayName: profile.displayName || stat.displayName,
        pictureUrl: profile.pictureUrl || '',
        pickCount: stat.pickCount,
        averageDelta: average,
        rankingAverageDelta: average === null ? Number.NEGATIVE_INFINITY : average,
      };
    })
    .sort(function(a, b) {
      if (b.rankingAverageDelta !== a.rankingAverageDelta) {
        return b.rankingAverageDelta - a.rankingAverageDelta;
      }
      if (b.pickCount !== a.pickCount) {
        return b.pickCount - a.pickCount;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  return {
    rows: rankTopRows_(rows, 5),
    totalCount: records.length,
  };
}

// LINE の名前と写真（わからないときは空）
function getMemberProfileOrEmpty_(groupId, userId) {
  if (!userId) {
    return {};
  }
  try {
    return getGroupMemberProfile_(groupId, userId) || {};
  } catch (error) {
    return {};
  }
}

// 1位の人の紹介（騰落率の高い順に3つ）。順位がなければ null
function buildTopPerformerWatchSpotlightData_(groupId, stats, options) {
  const rows = (stats && stats.rows) || [];
  if (rows.length === 0) {
    return null;
  }

  const topRow = rows[0];
  return buildWatchSpotlightDataForUser_(groupId, topRow.userId, topRow.displayName, Object.assign({
    limit: 3,
    sortByDeltaDesc: true,
    title: '🥇 ' + toLineText_(topRow.displayName, '不明'),
  }, options || {}));
}

// 1位でない人から、1人をえらんで紹介する
function buildNonTopRandomWatchSpotlightData_(groupId, stats, options) {
  const candidates = ((stats && stats.rows) || []).slice(1);
  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const displayName = selected.displayName || '不明';
  return buildWatchSpotlightDataForUser_(groupId, selected.userId || '', displayName, Object.assign({
    limit: 3,
    sortByDeltaDesc: false,
    title: 'ランダム ' + toLineText_(displayName, '不明'),
  }, options || {}));
}

// ある人が注目した銘柄の紹介（名前・写真・平均の騰落率・銘柄）。注目がなければ null
function buildWatchSpotlightDataForUser_(groupId, userId, fallbackDisplayName, options) {
  const settings = options || {};
  const filteredRecords = getActiveWatchlistByGroup_(groupId).filter(function(record) {
    if (userId) {
      return String(record.addedByUserId || '') === String(userId);
    }
    return String(record.addedByDisplayName || record.addedByUserId || '') === String(fallbackDisplayName || '');
  });
  if (filteredRecords.length === 0) {
    return null;
  }

  const profile = getMemberProfileOrEmpty_(groupId, userId);
  const hydratedRecords = hydrateRecordsWithQuotes_(filteredRecords, settings).map(function(record) {
    return Object.assign(record, { currentDelta: calcWatchPriceDelta_(record) });
  });

  let deltaSum = 0;
  let deltaCount = 0;
  hydratedRecords.forEach(function(record) {
    if (record.currentDelta !== null) {
      deltaSum += record.currentDelta;
      deltaCount += 1;
    }
  });

  const displayRecords = hydratedRecords.slice();
  if (settings.sortByDeltaDesc) {
    displayRecords.sort(function(a, b) {
      const aDelta = a.currentDelta === null ? Number.NEGATIVE_INFINITY : a.currentDelta;
      const bDelta = b.currentDelta === null ? Number.NEGATIVE_INFINITY : b.currentDelta;
      if (bDelta !== aDelta) {
        return bDelta - aDelta;
      }
      return String(b.addedAt || '').localeCompare(String(a.addedAt || ''));
    });
  }

  return {
    title: settings.title || '注目カード',
    userId: userId || '',
    displayName: profile.displayName || fallbackDisplayName || filteredRecords[0].addedByDisplayName || '不明',
    pictureUrl: profile.pictureUrl || '',
    pickCount: hydratedRecords.length,
    averageDelta: deltaCount > 0 ? (deltaSum / deltaCount) : null,
    records: displayRecords.slice(0, settings.limit || 5),
  };
}

// 並べた行に順位を付け、上位 maxRank 位までを返す（平均の騰落率と注目した数が同じなら同じ順位）
function rankTopRows_(sortedRows, maxRank) {
  const ranked = [];
  let currentRank = 0;
  let previousRankingKey = null;
  sortedRows.forEach(function(row, index) {
    const rankingKey = row.rankingAverageDelta + '|' + row.pickCount;
    if (rankingKey !== previousRankingKey) {
      currentRank = index + 1;
      previousRankingKey = rankingKey;
    }
    if (currentRank <= maxRank) {
      ranked.push(Object.assign({}, row, { rank: currentRank }));
    }
  });
  return ranked;
}
