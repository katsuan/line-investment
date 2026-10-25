/**
 * 人が GAS エディタから実行する関数と、人が書きかえる設定（投資グループボット）。
 * 上の関数の欄でえらんで「実行」する。結果は実行ログに出る。ボットの動きの中からは呼ばれない。
 *
 * どの順に何を実行するか
 *   ふだん（直したあと・おかしいとき）
 *     1. checkAll … 自己点検。設定・シート・LINE の鍵・カードのようすを ✅⚠️❌ で出す（何も書かない）
 *   はじめて使うとき・シートの見出しを足したとき
 *     1. setupInvestmentGroupBot … シートと見出し・ルール（Version 1）を用意する
 *     2. Script Properties を入れる（README の「Script Properties」）→ checkAll で ❌ がないかを見る
 *   めったに使わないもの
 *     refreshActiveWatchlistMarketCaps … 注目中の銘柄の、注目したときの株価・時価総額の空欄を埋める
 *     updateDefaultRuleVersionOne … ルール（Version 1）を、下の DEFAULT_RULE_○○ の文に書きなおす
 *
 * 人が書きかえる設定は、このファイルの下のほう（送り主の名前・市場・株価を覚える分数・ルールの文）。
 * 鍵や ID は Script Properties に入れる（ここには書かない）。
 */

// 自己点検（selfcheck.gs の qCheckAll）。直したあと・おかしいときに実行する。何も書かず、結果を ✅⚠️❌ で実行ログに出す
function checkAll() {
  return qCheckAll();
}

// はじめて使うとき・見出しを足したときに実行：6つのシートと見出しを用意し（足りない見出しだけ足す）、ルール（Version 1）を入れる。株価を覚える MARKET_DATA は隠す
function setupInvestmentGroupBot() {
  const spreadsheet = SpreadsheetApp.openById(getSpreadsheetId_());

  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES_.GROUPS, [
    'groupId',
    'groupName',
    'enabled',
    'ruleVersion',
    'joinedAt',
    'updatedAt',
  ]);

  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES_.MEMBERS, [
    'groupId',
    'userId',
    'displayName',
    'joinedAt',
    'agreedAt',
    'agreedRuleVersion',
    'active',
    'updatedAt',
  ]);

  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES_.RULES, [
    'version',
    'title',
    'purpose',
    'prohibitedItems',
    'disclaimer',
    'enabled',
    'createdAt',
  ]);

  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES_.EVENT_LOG, [
    'timestamp',
    'eventType',
    'groupId',
    'userId',
    'action',
    'result',
    'detail',
    'errorMessage',
  ]);

  ensureSheetWithHeaders_(spreadsheet, SHEET_NAMES_.WATCHLIST, [
    'groupId',
    'ticker',
    'tickerName',
    'note',
    'addedAt',
    'addedMarketTicker',
    'addedPrice',
    'addedMarketCap',
    'addedChangePercent',
    'addedTradeTime',
    'addedByUserId',
    'addedByDisplayName',
    'active',
    'deactivatedAt',
    'deactivatedByUserId',
    'deactivatedByDisplayName',
    'updatedAt',
  ]);

  ensureSheetWithHeaders_(spreadsheet, 'MARKET_DATA', [
    'ticker',
    'googleFinanceTicker',
    'name',
    'price',
    'changepct',
    'per',
    'high',
    'low',
    'marketcap',
    'volume',
    'tradetime',
    'updatedAt',
    'fetchStatus',
    'debugPriceText',
    'debugChangeText',
    'debugNameText',
    'debugMetricSnippet',
  ]);

  hideSheetIfExists_(spreadsheet, 'MARKET_DATA');

  seedOrUpdateDefaultRule_();
}

// めったに使わない：注目中の銘柄の株価を取りなおし、注目したときの株価・時価総額などの空欄だけを埋める（入っている値は変えない）。結果を実行ログに出す
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

// GAS エディタから動かす：Version 1 のルールを、決まりの文に戻す
function updateDefaultRuleVersionOne() {
  updateRuleVersionOne_(buildDefaultRuleRow_());
}

// ---- 人が書きかえる設定 ----
// 鍵・ID・管理者・使ってよいグループは Script Properties に入れる（README の「Script Properties」）。ここには書かない

const DEFAULT_LINE_SENDER_NAME_ = '投資情報グループ';

const DEFAULT_STOCK_EXCHANGE_SUFFIX_ = 'TYO';

const DEFAULT_MARKET_DATA_CACHE_MINUTES_ = 5;

const DEFAULT_TICKER_MARKET_OVERRIDES_ = Object.freeze({
  AAPL: 'NASDAQ',
  AMD: 'NASDAQ',
  GOOGL: 'NASDAQ',
  GOOG: 'NASDAQ',
  NVDA: 'NASDAQ',
  MCD: 'NYSE',
});

// 決まりのルール（Version 1）。RULES シートの1行と同じ並び
const DEFAULT_RULE_TITLE_ = '投資情報共有グループのルール';

const DEFAULT_RULE_PURPOSE_ = [
  '## 🏛️ グループの目的',
  '当グループは、メンバー間の「教え合い」と「リアルタイムな情報共有」を目的としています。',
  '',
  '小さな疑問の解消から、最新の相場環境のキャッチアップまで、全員で投資リテラシーを高め合う空間を目指します。',
].join('\n');

const DEFAULT_RULE_PROHIBITED_ITEMS_ = [
  '------------------------------',
  '※怪しい商品の販売、勧誘はありません',
  'もちろん逆もNGです',
  '',
  '・投資商品や情報商材の販売',
  '・営業、勧誘、MLMへの誘導',
  '・怪しい案件や商品の紹介',
  '・グループ外サービスへの不適切な誘導',
  '・誹謗中傷',
  '・迷惑行為',
  '・他メンバーへの過度な売買推奨',
  '',
  'グループ内からの勧誘だけでなく、メンバーが外部の怪しい商品やサービスへ勧誘する行為も禁止します。',
].join('\n');

const DEFAULT_RULE_DISCLAIMER_ = [
  '当グループは情報交換と学習を目的としており、特定の金融商品や銘柄の売買を推奨するものではありません。',
  '',
  '投資判断は各自の責任で行うものとします。',
].join('\n');
