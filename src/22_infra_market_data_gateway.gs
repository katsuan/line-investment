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
    const candidateMarketTicker = marketTickers[index];
    const result = fetchGoogleFinanceQuoteByMarketTicker_(normalizedTicker, candidateMarketTicker);
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

function getCachedMarketQuoteRecord_(ticker) {
  const record = getMarketDataRecordByTicker_(ticker);
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

function findGoogleFinanceAnchorIndex_(lines, marketTicker, name) {
  if (name) {
    const nameIndex = lines.indexOf(name);
    if (nameIndex >= 0) {
      return nameIndex;
    }
  }
  return lines.indexOf(marketTicker);
}

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

function looksLikePriceLine_(line) {
  return /^(US)?[¥￥$]?\d[\d,]*(\.\d+)?$/.test(String(line || '').trim());
}

function looksLikePercentLine_(line) {
  return /^[+-]?\d+(\.\d+)?%$/.test(String(line || '').trim());
}

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

function looksLikeMetricValueLine_(line) {
  const normalized = String(line || '').trim();
  return (
    looksLikePriceLine_(normalized) ||
    looksLikePercentLine_(normalized) ||
    /^(US)?[¥￥$]?\d[\d,]*(\.\d+)?(万|億|兆|K|M|B|T)?$/.test(normalized) ||
    /^\d{4}\/\d{2}\/\d{2}$/.test(normalized)
  );
}

function extractGoogleFinanceText_(text, pattern) {
  const match = text.match(pattern);
  return match && match[1] ? decodeHtmlEntities_(match[1].trim()) : '';
}

function normalizeScrapedNumber_(value) {
  const normalized = String(value || '')
    .replace(/[￥¥$,]/g, '')
    .replace(/^US/, '')
    .replace(/\s/g, '')
    .trim();
  return normalized;
}

function normalizeScrapedInteger_(value) {
  return String(value || '').replace(/,/g, '').trim();
}

function normalizeScrapedPercent_(value) {
  return String(value || '')
    .replace(/[()%]/g, '')
    .replace(/\s/g, '')
    .trim();
}

function decodeHtmlEntities_(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeForRegex_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMarketDataFetchStatus_(quote) {
  if (quote.name || quote.price || quote.high || quote.low || quote.volume) {
    return 'parsed';
  }
  return 'empty_parse';
}
