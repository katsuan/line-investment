function nowJst_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

function parseJstDateTime_(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!matched) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Number(matched[4]),
    Number(matched[5]),
    Number(matched[6])
  );
}

function createOkTextOutput_() {
  return ContentService
    .createTextOutput('OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

function createJsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function parsePostbackData_(data) {
  const result = {};
  if (!data) {
    return result;
  }

  data.split('&').forEach(function(pair) {
    const parts = pair.split('=');
    const key = decodeURIComponent(parts[0] || '');
    const value = decodeURIComponent(parts.slice(1).join('=') || '');
    if (key) {
      result[key] = value;
    }
  });

  return result;
}

function normalizeCommandText_(text) {
  return (text || '').trim();
}

function safeJsonStringify_(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function buildErrorMessage_(error) {
  if (!error) {
    return '';
  }
  return error.stack || error.message || String(error);
}

function extractStockCommandArgument_(text, commandPrefix) {
  const normalized = normalizeCommandText_(text);
  if (normalized.indexOf(commandPrefix) !== 0) {
    return '';
  }

  return normalized.slice(commandPrefix.length).trim();
}

function normalizeTickerCode_(rawTicker) {
  return String(rawTicker || '').trim().toUpperCase();
}

function composeMarketTicker_(rawTicker) {
  const ticker = normalizeTickerCode_(rawTicker);
  if (!ticker) {
    return '';
  }
  if (ticker.indexOf(':') >= 0) {
    return ticker;
  }
  if (looksLikeNumericTicker_(ticker) || looksLikeJapaneseAlphaNumericTicker_(ticker)) {
    return ticker + ':' + getStockExchangeSuffix_();
  }
  const marketOverrides = getTickerMarketOverrides_();
  if (marketOverrides[ticker]) {
    return ticker + ':' + marketOverrides[ticker];
  }
  return ticker;
}

function buildMarketTickerCandidates_(rawTicker) {
  const ticker = normalizeTickerCode_(rawTicker);
  const candidates = [];
  const seen = {};

  function pushCandidate(value) {
    const normalized = normalizeTickerCode_(value);
    if (!normalized || seen[normalized]) {
      return;
    }
    seen[normalized] = true;
    candidates.push(normalized);
  }

  if (!ticker) {
    return candidates;
  }

  const composedMarketTicker = composeMarketTicker_(ticker);
  pushCandidate(composedMarketTicker);

  if (ticker.indexOf(':') >= 0 || looksLikeNumericTicker_(ticker) || looksLikeJapaneseAlphaNumericTicker_(ticker)) {
    return candidates;
  }

  ['NASDAQ', 'NYSE', 'AMEX'].forEach(function(market) {
    pushCandidate(ticker + ':' + market);
  });
  pushCandidate(ticker);

  return candidates;
}

function formatNumberWithCommas_(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return '';
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return formatDecimalWithCommas_(number, 0);
}

function formatPrice_(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return '-';
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return formatDecimalWithCommas_(number, 2);
}

function formatPercent_(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return '-';
  }
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return Utilities.formatString('%s%%', number.toFixed(2));
}

function formatSignedPriceDelta_(currentValue, baseValue) {
  const current = Number(currentValue);
  const base = Number(baseValue);
  if (Number.isNaN(current) || Number.isNaN(base)) {
    return '-';
  }
  const delta = current - base;
  const sign = delta > 0 ? '+' : '';
  return sign + formatDecimalWithCommas_(delta, 2);
}

function formatSignedPercentDeltaFromBase_(currentValue, baseValue) {
  const current = Number(currentValue);
  const base = Number(baseValue);
  if (Number.isNaN(current) || Number.isNaN(base) || base === 0) {
    return '-';
  }
  const deltaPercent = ((current - base) / base) * 100;
  const sign = deltaPercent > 0 ? '+' : '';
  return sign + deltaPercent.toFixed(2) + '%';
}

function parseComparableScaledNumber_(value) {
  const text = String(value || '').trim().replace(/[￥¥$,]/g, '').replace(/^US/, '');
  if (!text) {
    return NaN;
  }

  const matched = text.match(/^([+-]?\d+(?:\.\d+)?)(万|億|兆|K|M|B|T)?$/i);
  if (!matched) {
    return Number(text);
  }

  const base = Number(matched[1]);
  if (Number.isNaN(base)) {
    return NaN;
  }

  const unit = String(matched[2] || '').toUpperCase();
  const multiplierMap = {
    '': 1,
    K: 1e3,
    M: 1e6,
    B: 1e9,
    T: 1e12,
    '万': 1e4,
    '億': 1e8,
    '兆': 1e12,
  };

  return base * (multiplierMap[unit] || 1);
}

function formatSignedPercentDeltaFromBaseScaled_(currentValue, baseValue) {
  const current = parseComparableScaledNumber_(currentValue);
  const base = parseComparableScaledNumber_(baseValue);
  if (Number.isNaN(current) || Number.isNaN(base) || base === 0) {
    return '-';
  }
  const deltaPercent = ((current - base) / base) * 100;
  const sign = deltaPercent > 0 ? '+' : '';
  return sign + deltaPercent.toFixed(2) + '%';
}

function toLineText_(value, fallback) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return typeof fallback === 'undefined' ? '' : String(fallback);
  }
  return String(value);
}

function formatDecimalWithCommas_(number, fractionDigits) {
  const fixed = Number(number).toFixed(fractionDigits);
  const parts = fixed.split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? integerPart + '.' + parts[1] : integerPart;
}

function formatDateTimeDisplay_(value) {
  if (!value) {
    return '-';
  }
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }
  const text = String(value).trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /GMT|UTC|[A-Z][a-z]{2} [A-Z][a-z]{2}/.test(text)) {
    return Utilities.formatDate(parsed, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  }
  return text;
}

function formatDateDisplayOnly_(value) {
  if (!value) {
    return '-';
  }
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yy/MM/dd');
  }
  const text = String(value).trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Tokyo', 'yy/MM/dd');
  }
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return matched ? matched[1].slice(2) + '/' + matched[2] + '/' + matched[3] : text;
}

function isSupportedWatchTickerCommand_(text) {
  return /^#[A-Z0-9.-]{1,10}$/i.test(String(text || '').trim());
}

function looksLikeNumericTicker_(ticker) {
  return /^\d{4,5}$/.test(String(ticker || '').trim());
}

function looksLikeJapaneseAlphaNumericTicker_(ticker) {
  return /^\d{3,4}[A-Z]$/.test(String(ticker || '').trim().toUpperCase());
}

function buildKabutanUrl_(ticker) {
  const normalizedTicker = normalizeTickerCode_(ticker);
  if (!normalizedTicker) {
    return 'https://kabutan.jp/';
  }
  if (looksLikeNumericTicker_(normalizedTicker) || looksLikeJapaneseAlphaNumericTicker_(normalizedTicker)) {
    return 'https://s.kabutan.jp/stocks/' + encodeURIComponent(normalizedTicker) + '/';
  }
  return 'https://us.kabutan.jp/stocks/' + encodeURIComponent(normalizedTicker) + '/';
}

function buildMarketFlagEmoji_(marketTicker) {
  const normalized = String(marketTicker || '').toUpperCase();
  if (normalized.indexOf(':TYO') >= 0 || looksLikeNumericTicker_(normalized) || looksLikeJapaneseAlphaNumericTicker_(normalized)) {
    return '🇯🇵';
  }
  if (
    normalized.indexOf(':NASDAQ') >= 0 ||
    normalized.indexOf(':NYSE') >= 0 ||
    normalized.indexOf(':AMEX') >= 0
  ) {
    return '🇺🇸';
  }
  return '';
}
