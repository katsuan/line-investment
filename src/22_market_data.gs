/**
 * 株価を取る：Google Finance のページを読み、MARKET_DATA シートに覚える（数分のあいだは覚えたものを使う）。
 * 市場がわからない銘柄は、東証・NASDAQ・NYSE・AMEX の順にためす。
 * 10_bot・11_watch_stats・12_liff_api・00_run から呼ばれる。
 */

// 銘柄の株価を返す。数分以内に取ったものがあればそれ、なければ市場をためしながら Google Finance から取る。どこもだめなら止まる
function getMarketQuoteByTicker_(ticker, options) {
  const normalizedTicker = normalizeTickerCode_(ticker);
  const settings = options || {};
  const cachedRecord = !settings.forceRefresh ? getCachedMarketQuoteRecord_(normalizedTicker) : null;
  if (cachedRecord) {
    return marketDataRecordToQuote_(cachedRecord);
  }

  const marketTickers = buildMarketTickerCandidates_(normalizedTicker);
  let lastResult = null;

  for (let index = 0; index < marketTickers.length; index += 1) {
    let result = null;
    try {
      result = fetchGoogleFinanceQuoteByMarketTicker_(normalizedTicker, marketTickers[index]);
    } catch (error) {
      continue; // つながらなかった（時間切れなど）。ほかの市場をためす
    }
    lastResult = result;

    if (result.quote && buildMarketDataFetchStatus_(result.quote) === 'parsed') {
      return result.quote;
    }
  }

  if (lastResult && lastResult.quote) {
    return lastResult.quote;
  }

  throw new Error('Google Finance quote fetch failed for ' + normalizedTicker);
}

// MARKET_DATA に、まだ新しい（数分以内に取れた）株価があれば、その行
function getCachedMarketQuoteRecord_(ticker) {
  const record = getMarketDataRecordByTicker_(ticker);
  return getFreshCachedMarketDataRecord_(record);
}

// 行が、取れていて（parsed）数分以内のものなら返す。古い・取れていなければ null
function getFreshCachedMarketDataRecord_(record) {
  if (!record) {
    return null;
  }

  if (String(record.fetchStatus || '') !== 'parsed') {
    return null;
  }

  const updatedAt = parseJstDateTime_(record.updatedAt);
  if (!updatedAt) {
    return null;
  }

  const ageMs = new Date().getTime() - updatedAt.getTime();
  if (ageMs > getMarketDataCacheMinutes_() * 60 * 1000) {
    return null;
  }

  return record;
}

// いくつもの銘柄の株価を { 銘柄: 株価 } で。useLatestCacheOnly なら、古くても覚えたものだけを使う（速く返す）
function getMarketQuoteMapByTickers_(tickers, options) {
  const normalizedTickers = Array.from(new Set((tickers || []).map(function(ticker) {
    return normalizeTickerCode_(ticker);
  }).filter(function(ticker) {
    return !!ticker;
  })));
  const settings = options || {};
  const quoteMap = {};
  if (normalizedTickers.length === 0) {
    return quoteMap;
  }

  let latestRecordMap = {};
  if (!settings.forceRefresh) {
    latestRecordMap = getLatestMarketDataRecordMapByTickers_(normalizedTickers);
  }

  normalizedTickers.forEach(function(ticker) {
    const latestRecord = latestRecordMap[ticker] || null;
    const freshRecord = !settings.forceRefresh ? getFreshCachedMarketDataRecord_(latestRecord) : null;
    if (freshRecord) {
      quoteMap[ticker] = marketDataRecordToQuote_(freshRecord);
      return;
    }

    if (settings.useLatestCacheOnly) {
      quoteMap[ticker] = latestRecord ? marketDataRecordToQuote_(latestRecord) : null;
      return;
    }

    try {
      quoteMap[ticker] = getMarketQuoteByTicker_(ticker, settings);
    } catch (error) {
      quoteMap[ticker] = null;
    }
  });

  return quoteMap;
}

// MARKET_DATA の行を、株価の形にする
function marketDataRecordToQuote_(record) {
  return {
    ticker: normalizeTickerCode_(record.ticker),
    marketTicker: record.googleFinanceTicker || composeMarketTicker_(record.ticker),
    name: record.name || '',
    price: record.price || '',
    changePercent: record.changepct || '',
    per: record.per || '',
    high: record.high || '',
    low: record.low || '',
    marketCap: record.marketcap || '',
    volume: record.volume || '',
    tradeTime: record.tradetime || record.updatedAt || '',
    fetchedAt: record.updatedAt || '',
  };
}

// Google Finance のページを1つ読んで株価を取り、MARKET_DATA に書く。{ quote, fetchStatus } を返す
function fetchGoogleFinanceQuoteByMarketTicker_(normalizedTicker, marketTicker) {
  const quoteUrl = 'https://www.google.com/finance/quote/' + encodeURIComponent(marketTicker) + '?hl=ja';
  const response = UrlFetchApp.fetch(quoteUrl, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });
  const statusCode = response.getResponseCode();
  const html = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    upsertMarketDataRecord_({
      ticker: normalizedTicker,
      googleFinanceTicker: marketTicker,
      fetchStatus: 'http_error_' + statusCode,
      debugMetricSnippet: html.slice(0, 5000),
    });
    return {
      quote: null,
      fetchStatus: 'http_error_' + statusCode,
    };
  }

  const visibleLines = extractGoogleFinanceVisibleLines_(html);
  const debugNameText = extractGoogleFinanceNameFromLines_(visibleLines, marketTicker);
  const debugPriceText = extractGoogleFinancePriceFromLines_(visibleLines, marketTicker, debugNameText);
  const debugChangeText = extractGoogleFinanceChangePercentFromLines_(visibleLines, marketTicker, debugNameText);
  const quote = {
    ticker: normalizedTicker,
    marketTicker: marketTicker,
    name: debugNameText,
    price: normalizeScrapedNumber_(debugPriceText),
    changePercent: normalizeScrapedPercent_(debugChangeText),
    per: extractGoogleFinanceMetricValueFromLines_(visibleLines, ['株価収益率', 'P/E ratio']),
    high: extractGoogleFinanceMetricValueFromLines_(visibleLines, ['高値', 'High']),
    low: extractGoogleFinanceMetricValueFromLines_(visibleLines, ['安値', 'Low']),
    marketCap: extractGoogleFinanceMetricValueFromLines_(visibleLines, ['時価総額', 'Mkt. cap']),
    volume: normalizeScrapedInteger_(extractGoogleFinanceMetricValueFromLines_(visibleLines, ['取引量', '出来高', 'Volume'])),
    tradeTime: nowJst_(),
    fetchedAt: nowJst_(),
  };

  upsertMarketDataRecord_({
    ticker: normalizedTicker,
    googleFinanceTicker: marketTicker,
    name: quote.name,
    price: quote.price,
    changepct: quote.changePercent,
    per: quote.per,
    high: quote.high,
    low: quote.low,
    marketcap: quote.marketCap,
    volume: quote.volume,
    tradetime: quote.tradeTime,
    fetchStatus: buildMarketDataFetchStatus_(quote),
    debugPriceText: debugPriceText,
    debugChangeText: debugChangeText,
    debugNameText: debugNameText,
    debugMetricSnippet: visibleLines.slice(0, 120).join(' | '),
  });

  return {
    quote: quote,
    fetchStatus: buildMarketDataFetchStatus_(quote),
  };
}

// ページの HTML から、見える文字の行だけを取り出す
function extractGoogleFinanceVisibleLines_(html) {
  return decodeHtmlEntities_(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\u00a0/g, ' '))
    .split('\n')
    .map(function(line) {
      return line.replace(/\s+/g, ' ').trim();
    })
    .filter(function(line) {
      return !!line;
    });
}

// 行の中から、銘柄名を探す（市場付きコードのすぐあと）
function extractGoogleFinanceNameFromLines_(lines, marketTicker) {
  const startIndex = lines.indexOf(marketTicker);
  if (startIndex < 0) {
    return '';
  }

  for (let index = startIndex + 1; index < Math.min(startIndex + 12, lines.length); index += 1) {
    const line = lines[index];
    if (isIgnorableGoogleFinanceLine_(line)) {
      continue;
    }
    if (looksLikePriceLine_(line) || looksLikePercentLine_(line)) {
      continue;
    }
    return line;
  }

  return '';
}

// 行の中から、株価を探す（銘柄名のあと）
function extractGoogleFinancePriceFromLines_(lines, marketTicker, name) {
  const startIndex = findGoogleFinanceAnchorIndex_(lines, marketTicker, name);
  if (startIndex < 0) {
    return '';
  }

  for (let index = startIndex + 1; index < Math.min(startIndex + 12, lines.length); index += 1) {
    const line = lines[index];
    if (looksLikePriceLine_(line)) {
      return line;
    }
  }

  return '';
}

// 行の中から、前日比（%）を探す（銘柄名のあと）
function extractGoogleFinanceChangePercentFromLines_(lines, marketTicker, name) {
  const startIndex = findGoogleFinanceAnchorIndex_(lines, marketTicker, name);
  if (startIndex < 0) {
    return '';
  }

  for (let index = startIndex + 1; index < Math.min(startIndex + 14, lines.length); index += 1) {
    const line = lines[index];
    if (looksLikePercentLine_(line)) {
      return line;
    }
  }

  return '';
}

// 行の中から、見出し（時価総額・PER など）のすぐあとの値を探す
function extractGoogleFinanceMetricValueFromLines_(lines, labels) {
  for (let labelIndex = 0; labelIndex < labels.length; labelIndex += 1) {
    const label = labels[labelIndex];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (lines[lineIndex] !== label) {
        continue;
      }
      for (let index = lineIndex + 1; index < Math.min(lineIndex + 6, lines.length); index += 1) {
        const line = lines[index];
        if (isIgnorableGoogleFinanceLine_(line) || isMetricLabelLine_(line)) {
          continue;
        }
        if (looksLikeMetricValueLine_(line)) {
          return normalizeScrapedNumber_(line);
        }
        break;
      }
    }
  }
  return '';
}

// 探しはじめる行（銘柄名、なければ市場付きコード）
function findGoogleFinanceAnchorIndex_(lines, marketTicker, name) {
  if (name) {
    const nameIndex = lines.indexOf(name);
    if (nameIndex >= 0) {
      return nameIndex;
    }
  }
  return lines.indexOf(marketTicker);
}

// 飛ばしてよい行か（アイコンの名前など）
function isIgnorableGoogleFinanceLine_(line) {
  return [
    'search',
    'settings',
    'check_indeterminate_small',
    'arrow_downward',
    'arrow_upward',
    'area_chartエリア',
    'stacked_line_chart比較',
    'monitoring指標',
  ].indexOf(line) >= 0;
}

// 株価の形の行か（¥3,000・$250.00 など）
function looksLikePriceLine_(line) {
  return /^(US)?[¥￥$]?\d[\d,]*(\.\d+)?$/.test(String(line || '').trim());
}

// % の形の行か（+1.20% など）
function looksLikePercentLine_(line) {
  return /^[+-]?\d+(\.\d+)?%$/.test(String(line || '').trim());
}

// 指標の見出しの行か（始値・時価総額など）
function isMetricLabelLine_(line) {
  return [
    '始値',
    'Open',
    '高値',
    'High',
    '安値',
    'Low',
    '時価総額',
    'Mkt. cap',
    '平均出来高',
    'Avg. vol.',
    '取引量',
    '出来高',
    'Volume',
    '配当',
    'Dividend',
    '四半期配当',
    'Quarterly dividend',
    '配当落ち日',
    'Ex-dividend date',
    '株価収益率',
    'P/E ratio',
    '52 週高値',
    '52-wk high',
    '52 週安値',
    '52-wk low',
    'EPS',
    '発行済株式数',
    'Shares outstanding',
    '従業員数',
    'No. of employees',
  ].indexOf(String(line || '').trim()) >= 0;
}

// 指標の値の形の行か（数・%・兆や B の付いた数・日付）
function looksLikeMetricValueLine_(line) {
  const normalized = String(line || '').trim();
  return (
    looksLikePriceLine_(normalized) ||
    looksLikePercentLine_(normalized) ||
    /^(US)?[¥￥$]?\d[\d,]*(\.\d+)?(万|億|兆|K|M|B|T)?$/.test(normalized) ||
    /^\d{4}\/\d{2}\/\d{2}$/.test(normalized)
  );
}

// ページの数の文字から、¥ $ , 空白を取る
function normalizeScrapedNumber_(value) {
  const normalized = String(value || '')
    .replace(/[￥¥$,]/g, '')
    .replace(/^US/, '')
    .replace(/\s/g, '')
    .trim();
  return normalized;
}

// ページの整数の文字から、, を取る
function normalizeScrapedInteger_(value) {
  return String(value || '').replace(/,/g, '').trim();
}

// ページの % の文字から、( ) % 空白を取る
function normalizeScrapedPercent_(value) {
  return String(value || '')
    .replace(/[()%]/g, '')
    .replace(/\s/g, '')
    .trim();
}

// &amp; などを文字にもどす
function decodeHtmlEntities_(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 取れたか：名前・株価・高値・安値・出来高のどれかがあれば parsed
function buildMarketDataFetchStatus_(quote) {
  if (quote.name || quote.price || quote.high || quote.low || quote.volume) {
    return 'parsed';
  }
  return 'empty_parse';
}
