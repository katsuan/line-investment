/**
 * 決まった値と、Script Properties の読み書き（シートの名前・ルールの版・鍵や ID の読み出し）。
 * 人が書きかえる設定は 00_run にある。どのファイルからも呼ばれる。
 */

const SHEET_NAMES_ = Object.freeze({
  GROUPS: 'GROUPS',
  MEMBERS: 'MEMBERS',
  RULES: 'RULES',
  EVENT_LOG: 'EVENT_LOG',
  WATCHLIST: 'WATCHLIST',
  MARKET_DATA: 'MARKET_DATA',
});

const DEFAULT_RULE_VERSION_ = 1;

// 画面の注目一覧に出す数（新しい順）
const LIFF_WATCHLIST_LIMIT_ = 60;

const GROUP_SUMMARY_CACHE_KEY_PREFIX_ = 'GROUP_SUMMARY_CACHE__';

// 記録のスプレッドシートの ID（Script Properties の SPREADSHEET_ID。ないと止まる）
function getSpreadsheetId_() {
  return getRequiredProperty_('SPREADSHEET_ID');
}

// LINE のチャネルアクセストークン（LINE_CHANNEL_ACCESS_TOKEN。ないと止まる）
function getLineChannelAccessToken_() {
  return getRequiredProperty_('LINE_CHANNEL_ACCESS_TOKEN');
}

// 管理者の userId の一覧（ADMIN_USER_IDS）
function getAdminUserIds_() {
  return getScriptPropertyList_('ADMIN_USER_IDS');
}

// ルールを確認して、使ってよくなった人の userId の一覧（ALLOWED_USER_IDS）
function getAllowedUserIds_() {
  return getScriptPropertyList_('ALLOWED_USER_IDS');
}

// 使ってよいグループの一覧（ALLOWED_GROUP_IDS。空ならどのグループでも使える）
function getAllowedGroupIds_() {
  return getScriptPropertyList_('ALLOWED_GROUP_IDS');
}

// 日本株に付ける市場（STOCK_EXCHANGE_SUFFIX、なければ TYO）
function getStockExchangeSuffix_() {
  return getScriptProperty_('STOCK_EXCHANGE_SUFFIX') || DEFAULT_STOCK_EXCHANGE_SUFFIX_;
}

// 株価を覚えておく分数（MARKET_DATA_CACHE_MINUTES、なければ 00_run の決まりの値）
function getMarketDataCacheMinutes_() {
  const raw = String(getScriptProperty_('MARKET_DATA_CACHE_MINUTES') || '').trim();
  const minutes = Number(raw);
  // 入っていないとき（空）は決まりの分数。Number('') は 0 なので、空を先に見る
  return raw !== '' && Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_MARKET_DATA_CACHE_MINUTES_;
}

// 銘柄ごとの市場の決まり（00_run の DEFAULT_TICKER_MARKET_OVERRIDES_ に、TICKER_MARKET_OVERRIDES「AAPL:NASDAQ,…」を重ねる）
function getTickerMarketOverrides_() {
  const overrides = {};
  Object.keys(DEFAULT_TICKER_MARKET_OVERRIDES_).forEach(function(key) {
    overrides[key] = DEFAULT_TICKER_MARKET_OVERRIDES_[key];
  });

  const raw = getScriptProperty_('TICKER_MARKET_OVERRIDES') || '';
  raw.split(',').forEach(function(entry) {
    const parts = entry.split(':');
    const ticker = normalizeTickerCode_(parts[0] || '');
    const market = String(parts[1] || '').trim().toUpperCase();
    if (ticker && market) {
      overrides[ticker] = market;
    }
  });

  return overrides;
}

// なくてはいけない Script Properties を読む。ないと止まる
function getRequiredProperty_(key) {
  const value = getScriptProperty_(key);
  if (!value) {
    throw new Error('Script Properties "' + key + '" is not set.');
  }
  return value;
}

// 送り主の名前（LINE_SENDER_NAME、なければ 00_run の決まりの名前）
function getLineSenderName_() {
  return getScriptProperty_('LINE_SENDER_NAME') || DEFAULT_LINE_SENDER_NAME_;
}

// 画面（LIFF）の URL（LIFF_APP_BASE_URL。ないときは空）
function getLiffAppBaseUrl_() {
  return String(getScriptProperty_('LIFF_APP_BASE_URL') || '').trim();
}

// カンマ区切りの Script Properties を、空を除いた一覧で返す
function getScriptPropertyList_(key) {
  const raw = getScriptProperty_(key) || '';
  return raw
    .split(',')
    .map(function(value) { return value.trim(); })
    .filter(String);
}

// 一覧を、重なりと空を除いてカンマ区切りで書く。書いた一覧を返す
function setScriptPropertyList_(key, values) {
  const normalized = [];
  const seen = {};

  (values || []).forEach(function(value) {
    const text = String(value || '').trim();
    if (!text || seen[text]) {
      return;
    }
    seen[text] = true;
    normalized.push(text);
  });

  setScriptProperty_(key, normalized.join(','));
  return normalized;
}

// カンマ区切りの Script Properties に1つ足す（ロックの中で読みなおしてから書く）。足したあとの一覧を返す
function addScriptPropertyListValue_(key, value) {
  const text = String(value || '').trim();
  if (!text) {
    return getScriptPropertyList_(key);
  }

  // 同時に何人も押したとき、ほかの人の分を消さないよう、ロックの中で読みなおしてから書く（G7）
  return withScriptLock_(function() {
    refreshScriptProperty_(key);
    const values = getScriptPropertyList_(key);
    if (values.indexOf(text) === -1) {
      values.push(text);
    }
    return setScriptPropertyList_(key, values);
  });
}

// Script Properties は、1回の呼び出しの中で1回だけまとめて読む（H9）
let SCRIPT_PROPERTIES_MEMO_ = null;

// Script Properties を読む（1回の呼び出しの中では、まとめて1回だけ読んで覚える）。ないときは null
function getScriptProperty_(key) {
  if (!SCRIPT_PROPERTIES_MEMO_) {
    SCRIPT_PROPERTIES_MEMO_ = PropertiesService.getScriptProperties().getProperties() || {};
  }
  const value = SCRIPT_PROPERTIES_MEMO_[key];
  return value === null || typeof value === 'undefined' ? null : value;
}

// Script Properties に書き、覚えている分も直す
function setScriptProperty_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  if (SCRIPT_PROPERTIES_MEMO_) {
    SCRIPT_PROPERTIES_MEMO_[key] = String(value);
  }
}

// Script Properties の1つを読みなおし、覚えている分を直す（ほかの呼び出しが書いた分を取りこむ）
function refreshScriptProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (SCRIPT_PROPERTIES_MEMO_) {
    if (value === null) {
      delete SCRIPT_PROPERTIES_MEMO_[key];
    } else {
      SCRIPT_PROPERTIES_MEMO_[key] = value;
    }
  }
  return value;
}
