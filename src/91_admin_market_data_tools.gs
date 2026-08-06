function refreshActiveWatchlistMarketCaps() {
  const activeRecords = getTableData_(SHEET_NAMES_.WATCHLIST).rows.filter(function(row) {
    return String(row.active) !== 'false';
  });
  const seen = {};
  const results = [];

  activeRecords.forEach(function(record) {
    const groupId = String(record.groupId || '').trim();
    const ticker = normalizeTickerCode_(record.ticker);
    const key = groupId + '::' + ticker;
    if (!groupId || !ticker || seen[key]) {
      return;
    }
    seen[key] = true;

    try {
      const quote = getMarketQuoteByTicker_(ticker);
      const backfilledWatchlistRecord = backfillActiveWatchlistSnapshot_(groupId, ticker, {
        tickerName: (quote && quote.name) || record.tickerName || '',
        addedMarketTicker: (quote && quote.marketTicker) || record.addedMarketTicker || composeMarketTicker_(ticker),
        addedPrice: (quote && quote.price) || '',
        addedMarketCap: (quote && quote.marketCap) || '',
        addedChangePercent: (quote && quote.changePercent) || '',
        addedTradeTime: (quote && quote.tradeTime) || '',
      });
      results.push({
        groupId: groupId,
        ticker: ticker,
        tickerName: (quote && quote.name) || record.tickerName || '',
        marketTicker: (quote && quote.marketTicker) || record.addedMarketTicker || composeMarketTicker_(ticker),
        marketCap: (quote && quote.marketCap) || '',
        per: (quote && quote.per) || '',
        fetchedAt: (quote && quote.fetchedAt) || nowJst_(),
        status: buildMarketDataFetchStatus_(quote || {}),
        watchlistBackfilled: !!backfilledWatchlistRecord,
      });
    } catch (error) {
      results.push({
        groupId: groupId,
        ticker: ticker,
        tickerName: record.tickerName || '',
        marketTicker: record.addedMarketTicker || composeMarketTicker_(ticker),
        marketCap: '',
        per: '',
        fetchedAt: nowJst_(),
        status: 'error',
        errorMessage: buildErrorMessage_(error),
      });
    }
  });

  Logger.log(JSON.stringify(results));
  return results;
}
