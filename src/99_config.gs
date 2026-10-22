const SHEET_NAMES_ = Object.freeze({
  GROUPS: 'GROUPS',
  MEMBERS: 'MEMBERS',
  RULES: 'RULES',
  EVENT_LOG: 'EVENT_LOG',
  WATCHLIST: 'WATCHLIST',
  MARKET_DATA: 'MARKET_DATA',
});

const DEFAULT_RULE_VERSION_ = 1;
const DEFAULT_WATCHLIST_RECENT_PER_BUBBLE_ = 5;
const DEFAULT_WATCHLIST_MAX_BUBBLES_ = 12;
const DEFAULT_WATCHLIST_RECENT_LIMIT_ = DEFAULT_WATCHLIST_RECENT_PER_BUBBLE_ * DEFAULT_WATCHLIST_MAX_BUBBLES_;
const DEFAULT_STOCK_EXCHANGE_SUFFIX_ = 'TYO';
const DEFAULT_MARKET_DATA_CACHE_MINUTES_ = 5;
const DEFAULT_LINE_SENDER_NAME_ = '投資情報グループ';
const GROUP_SUMMARY_CACHE_KEY_PREFIX_ = 'GROUP_SUMMARY_CACHE__';
const DEFAULT_TICKER_MARKET_OVERRIDES_ = Object.freeze({
  AAPL: 'NASDAQ',
  AMD: 'NASDAQ',
  GOOGL: 'NASDAQ',
  GOOG: 'NASDAQ',
  NVDA: 'NASDAQ',
  MCD: 'NYSE',
});

function getSpreadsheetId_() {
  return getRequiredProperty_('SPREADSHEET_ID');
}

function getLineChannelAccessToken_() {
  return getRequiredProperty_('LINE_CHANNEL_ACCESS_TOKEN');
}

function getAdminUserIds_() {
  return getScriptPropertyList_('ADMIN_USER_IDS');
}

function getAllowedUserIds_() {
  return getScriptPropertyList_('ALLOWED_USER_IDS');
}

function getAllowedGroupIds_() {
  return getScriptPropertyList_('ALLOWED_GROUP_IDS');
}

function getStockExchangeSuffix_() {
  return getScriptProperty_('STOCK_EXCHANGE_SUFFIX') || DEFAULT_STOCK_EXCHANGE_SUFFIX_;
}

function getMarketDataCacheMinutes_() {
  const raw = getScriptProperty_('MARKET_DATA_CACHE_MINUTES');
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : DEFAULT_MARKET_DATA_CACHE_MINUTES_;
}

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

function getRequiredProperty_(key) {
  const value = getScriptProperty_(key);
  if (!value) {
    throw new Error('Script Properties "' + key + '" is not set.');
  }
  return value;
}

function getLineSenderName_() {
  return getScriptProperty_('LINE_SENDER_NAME') || DEFAULT_LINE_SENDER_NAME_;
}

function getLiffAppBaseUrl_() {
  return String(getScriptProperty_('LIFF_APP_BASE_URL') || '').trim();
}

function getScriptPropertyList_(key) {
  const raw = getScriptProperty_(key) || '';
  return raw
    .split(',')
    .map(function(value) { return value.trim(); })
    .filter(String);
}

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

function getScriptProperty_(key) {
  if (!SCRIPT_PROPERTIES_MEMO_) {
    SCRIPT_PROPERTIES_MEMO_ = PropertiesService.getScriptProperties().getProperties() || {};
  }
  const value = SCRIPT_PROPERTIES_MEMO_[key];
  return value === null || typeof value === 'undefined' ? null : value;
}

function setScriptProperty_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  if (SCRIPT_PROPERTIES_MEMO_) {
    SCRIPT_PROPERTIES_MEMO_[key] = String(value);
  }
}

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
