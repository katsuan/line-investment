/**
 * スプレッドシートの読み書き：GROUPS・MEMBERS・RULES・WATCHLIST・MARKET_DATA・EVENT_LOG。
 * 1回の呼び出しの中で同じシートは1回だけ読み（H9）、書くときはロックの中で読みなおす。外から来た文字は式にしない（G1）。
 * 10_bot・11_watch_stats・12_liff_api・22_market_data から呼ばれる。
 */

// 1回の呼び出しの中では、同じシートは1回だけ読む（H9）。書くとき（ロックの中）は、読みなおしてから書く
let SPREADSHEET_MEMO_ = null;

let TABLE_DATA_MEMO_ = {};

// 記録のスプレッドシートを開く（1回の呼び出しの中では1回だけ）
function openSpreadsheet_() {
  if (!SPREADSHEET_MEMO_) {
    SPREADSHEET_MEMO_ = SpreadsheetApp.openById(getSpreadsheetId_());
  }
  return SPREADSHEET_MEMO_;
}

// 名前でシートを取る。ないと止まる
function getSheetOrThrow_(name) {
  const sheet = openSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet not found: ' + name);
  }
  return sheet;
}

// 覚えたシートの中身を捨てる（次に読むときは読みなおす）
function clearTableDataMemo_() {
  TABLE_DATA_MEMO_ = {};
}

// シートを読んで、見出しを名前にした行の一覧にする（1回の呼び出しの中では同じシートを1回だけ読む）
function getTableData_(sheetName) {
  if (TABLE_DATA_MEMO_[sheetName]) {
    return TABLE_DATA_MEMO_[sheetName];
  }

  const sheet = getSheetOrThrow_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    return { sheet: sheet, headers: [], rows: [] };
  }

  const headers = values[0];
  const rows = values.slice(1).map(function(row) {
    return toRecord_(headers, row);
  });

  const table = { sheet: sheet, headers: headers, rows: rows };
  TABLE_DATA_MEMO_[sheetName] = table;
  return table;
}

// シートの1行を { 見出し: 値 } にする。日時は日本時間の文字にそろえる
function toRecord_(headers, row) {
  const record = {};
  headers.forEach(function(header, index) {
    record[header] = toJstDateTimeText_(row[index]);
  });
  return record;
}

// シートに書く1行。外から来た文字（名前・銘柄名・相場のページの文字など）が式として動かないようにする（G1）
function recordToRow_(headers, record) {
  return headers.map(function(header) {
    return toSafeSheetValue_(Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '');
  });
}

// 「-1.23%」「+5」のような数の文字はそのまま（式にはならない）。ほかは safeCell（selfcheck.gs）
function toSafeSheetValue_(value) {
  if (typeof value === 'string' && /^[+-]?[\d.,]+%?$/.test(value)) {
    return value;
  }
  return safeCell(value);
}

// 決めた列の値がすべて合う、最初の行の番号（ないときは -1）
function findRowIndexByKeys_(rows, keyNames, keyValues) {
  for (let index = 0; index < rows.length; index += 1) {
    const matched = keyNames.every(function(keyName) {
      return String(rows[index][keyName]) === String(keyValues[keyName]);
    });
    if (matched) {
      return index;
    }
  }
  return -1;
}

// GROUPS にグループを書く（あれば直し、なければ足す）。ロックの中で
function upsertGroupRecord_(groupRecord) {
  return withScriptLock_(function() {
    const table = getTableData_(SHEET_NAMES_.GROUPS);
    const rowIndex = findRowIndexByKeys_(table.rows, ['groupId'], { groupId: groupRecord.groupId });
    const timestamp = nowJst_();

    if (rowIndex >= 0) {
      const existing = table.rows[rowIndex];
      const merged = Object.assign({}, existing, groupRecord, {
        updatedAt: timestamp,
      });
      table.sheet.getRange(rowIndex + 2, 1, 1, table.headers.length)
        .setValues([recordToRow_(table.headers, merged)]);
      return merged;
    }

    const record = Object.assign({
      groupName: '',
      enabled: true,
      ruleVersion: DEFAULT_RULE_VERSION_,
      joinedAt: timestamp,
      updatedAt: timestamp,
    }, groupRecord, {
      updatedAt: timestamp,
    });
    table.sheet.appendRow(recordToRow_(table.headers, record));
    return record;
  });
}

// GROUPS のグループの行（ないときは null）
function getGroupRecord_(groupId) {
  const table = getTableData_(SHEET_NAMES_.GROUPS);
  const rowIndex = findRowIndexByKeys_(table.rows, ['groupId'], { groupId: groupId });
  return rowIndex >= 0 ? table.rows[rowIndex] : null;
}

// MEMBERS にメンバーを書く（あれば直し、なければ足す）。ロックの中で
function upsertMemberRecord_(memberRecord) {
  return withScriptLock_(function() {
    const table = getTableData_(SHEET_NAMES_.MEMBERS);
    const keys = { groupId: memberRecord.groupId, userId: memberRecord.userId };
    const rowIndex = findRowIndexByKeys_(table.rows, ['groupId', 'userId'], keys);
    const timestamp = nowJst_();

    if (rowIndex >= 0) {
      const existing = table.rows[rowIndex];
      const merged = Object.assign({}, existing, memberRecord, {
        updatedAt: timestamp,
      });
      table.sheet.getRange(rowIndex + 2, 1, 1, table.headers.length)
        .setValues([recordToRow_(table.headers, merged)]);
      return merged;
    }

    const record = Object.assign({
      displayName: '',
      joinedAt: timestamp,
      agreedAt: '',
      agreedRuleVersion: '',
      active: true,
      updatedAt: timestamp,
    }, memberRecord, {
      updatedAt: timestamp,
    });
    table.sheet.appendRow(recordToRow_(table.headers, record));
    return record;
  });
}

// グループのいまのメンバーの行
function getActiveMembersByGroup_(groupId) {
  return getTableData_(SHEET_NAMES_.MEMBERS).rows.filter(function(row) {
    return String(row.groupId) === String(groupId) && String(row.active) !== 'false';
  });
}

// RULES のその版のルール（ないときは null）
function getRuleByVersion_(version) {
  const rows = getTableData_(SHEET_NAMES_.RULES).rows;
  const matched = rows.find(function(row) {
    return Number(row.version) === Number(version);
  });
  return matched || null;
}

// RULES で使うことにしているルール（なければ Version 1）
function getEnabledRule_() {
  const rows = getTableData_(SHEET_NAMES_.RULES).rows;
  const enabled = rows.find(function(row) {
    return String(row.enabled) === 'true' || row.enabled === true;
  });
  return enabled || getRuleByVersion_(DEFAULT_RULE_VERSION_);
}

// グループのいまのルール
function getCurrentRuleForGroup_(groupId) {
  const group = getGroupRecord_(groupId);
  const version = group && group.ruleVersion ? group.ruleVersion : DEFAULT_RULE_VERSION_;
  // ルールのシートが空でも、案内は出す（決まりのルールを使う）
  return getRuleByVersion_(version) || getEnabledRule_() || buildDefaultRuleRecord_();
}

// いまの版のルールを、まだ確認していないメンバー
function getUnconfirmedMembers_(groupId, ruleVersion) {
  return getActiveMembersByGroup_(groupId).filter(function(member) {
    return Number(member.agreedRuleVersion) !== Number(ruleVersion);
  });
}

// 注目を1つ足す。同じグループで同じ銘柄がもう注目中なら足さず、それを返す（同時に入れたとき2つにしない）
function createWatchlistRecordIfAbsent_(watchlistRecord) {
  return withScriptLock_(function() {
    const existing = getActiveWatchlistRecordByTicker_(watchlistRecord.groupId, watchlistRecord.ticker);
    if (existing) {
      return { record: existing, created: false };
    }

    const table = getTableData_(SHEET_NAMES_.WATCHLIST);
    const timestamp = nowJst_();
    const record = Object.assign({
      tickerName: '',
      note: '',
      addedAt: timestamp,
      addedByUserId: '',
      addedByDisplayName: '',
      active: true,
      updatedAt: timestamp,
    }, watchlistRecord, {
      addedAt: watchlistRecord.addedAt || timestamp,
      updatedAt: timestamp,
    });
    table.sheet.appendRow(recordToRow_(table.headers, record));
    return { record: record, created: true };
  });
}

// グループのいま注目中の行（新しい順）
function getActiveWatchlistByGroup_(groupId) {
  return getTableData_(SHEET_NAMES_.WATCHLIST).rows
    .filter(function(row) {
      return String(row.groupId) === String(groupId) && String(row.active) !== 'false';
    })
    .sort(function(a, b) {
      return String(b.addedAt).localeCompare(String(a.addedAt));
    });
}

// いま注目中のうち、いちばん古いもの（ないときは null）
function getActiveWatchlistRecordByTicker_(groupId, ticker) {
  const normalizedTicker = normalizeTickerCode_(ticker);
  const rows = getTableData_(SHEET_NAMES_.WATCHLIST).rows
    .filter(function(row) {
      return String(row.groupId) === String(groupId) &&
        String(row.ticker) === String(normalizedTicker) &&
        String(row.active) !== 'false';
    })
    .sort(function(a, b) {
      return String(a.addedAt || '').localeCompare(String(b.addedAt || ''));
    });
  return rows.length > 0 ? rows[0] : null;
}

// 注目中の行の、注目したときの株価などの空欄だけを埋める（00_run の refreshActiveWatchlistMarketCaps から）
function backfillActiveWatchlistSnapshot_(groupId, ticker, snapshotRecord) {
  return withScriptLock_(function() {
    const normalizedTicker = normalizeTickerCode_(ticker);
    const table = getTableData_(SHEET_NAMES_.WATCHLIST);
    const timestamp = nowJst_();
    let updatedRecord = null;

    table.rows.forEach(function(row, index) {
      if (
        String(row.groupId) !== String(groupId) ||
        String(row.ticker) !== String(normalizedTicker) ||
        String(row.active) === 'false'
      ) {
        return;
      }

      const merged = Object.assign({}, row);
      const fields = snapshotRecord || {};

      if (!merged.tickerName && fields.tickerName) {
        merged.tickerName = fields.tickerName;
      }
      if (!merged.addedMarketTicker && fields.addedMarketTicker) {
        merged.addedMarketTicker = fields.addedMarketTicker;
      }
      if (!merged.addedPrice && fields.addedPrice) {
        merged.addedPrice = fields.addedPrice;
      }
      if (!merged.addedMarketCap && fields.addedMarketCap) {
        merged.addedMarketCap = fields.addedMarketCap;
      }
      if (!merged.addedChangePercent && fields.addedChangePercent) {
        merged.addedChangePercent = fields.addedChangePercent;
      }
      if (!merged.addedTradeTime && fields.addedTradeTime) {
        merged.addedTradeTime = fields.addedTradeTime;
      }

      merged.updatedAt = timestamp;
      table.sheet.getRange(index + 2, 1, 1, table.headers.length)
        .setValues([recordToRow_(table.headers, merged)]);
      updatedRecord = merged;
    });

    return updatedRecord;
  });
}

// その銘柄の注目を外す（外した人と時刻を残す）。外した行を返す（なければ null）
function deactivateWatchlistRecord_(groupId, ticker, deactivatedByUserId, deactivatedByDisplayName) {
  return withScriptLock_(function() {
    const normalizedTicker = normalizeTickerCode_(ticker);
    const table = getTableData_(SHEET_NAMES_.WATCHLIST);
    const activeIndexes = [];
    table.rows.forEach(function(row, index) {
      if (
        String(row.groupId) === String(groupId) &&
        String(row.ticker) === String(normalizedTicker) &&
        String(row.active) !== 'false'
      ) {
        activeIndexes.push(index);
      }
    });

    if (activeIndexes.length === 0) {
      return null;
    }

    const timestamp = nowJst_();
    let result = null;
    activeIndexes.forEach(function(rowIndex) {
      const existing = table.rows[rowIndex];
      const merged = Object.assign({}, existing, {
        active: false,
        deactivatedAt: timestamp,
        deactivatedByUserId: deactivatedByUserId || '',
        deactivatedByDisplayName: deactivatedByDisplayName || '',
        updatedAt: timestamp,
      });
      table.sheet.getRange(rowIndex + 2, 1, 1, table.headers.length)
        .setValues([recordToRow_(table.headers, merged)]);
      if (!result) {
        result = merged;
      }
    });
    return result;
  });
}

// グループの注目を全部外す。外した行の一覧を返す
function deactivateAllActiveWatchlistRecords_(groupId, deactivatedByUserId, deactivatedByDisplayName) {
  return withScriptLock_(function() {
    const table = getTableData_(SHEET_NAMES_.WATCHLIST);
    const timestamp = nowJst_();
    const updatedRecords = [];

    table.rows.forEach(function(row, index) {
      if (String(row.groupId) !== String(groupId) || String(row.active) === 'false') {
        return;
      }

      const merged = Object.assign({}, row, {
        active: false,
        deactivatedAt: timestamp,
        deactivatedByUserId: deactivatedByUserId || '',
        deactivatedByDisplayName: deactivatedByDisplayName || '',
        updatedAt: timestamp,
      });
      table.sheet.getRange(index + 2, 1, 1, table.headers.length)
        .setValues([recordToRow_(table.headers, merged)]);
      updatedRecords.push(merged);
    });

    return updatedRecords;
  });
}

// MARKET_DATA に取った株価を書く（銘柄ごとに1行。あれば直す）
function upsertMarketDataRecord_(marketDataRecord) {
  return withScriptLock_(function() {
    const table = getTableData_(SHEET_NAMES_.MARKET_DATA);
    const keys = {
      ticker: marketDataRecord.ticker,
    };
    const rowIndex = findRowIndexByKeys_(table.rows, ['ticker'], keys);
    const timestamp = nowJst_();

    if (rowIndex >= 0) {
      const existing = table.rows[rowIndex];
      const merged = Object.assign({}, existing, marketDataRecord, {
        updatedAt: timestamp,
      });
      table.sheet.getRange(rowIndex + 2, 1, 1, table.headers.length)
        .setValues([recordToRow_(table.headers, merged)]);
      return merged;
    }

    const record = Object.assign({
      ticker: '',
      googleFinanceTicker: '',
      name: '',
      price: '',
      changepct: '',
      per: '',
      high: '',
      low: '',
      marketcap: '',
      volume: '',
      tradetime: '',
      updatedAt: timestamp,
      fetchStatus: '',
      debugPriceText: '',
      debugChangeText: '',
      debugNameText: '',
      debugMetricSnippet: '',
    }, marketDataRecord, {
      updatedAt: timestamp,
    });
    table.sheet.appendRow(recordToRow_(table.headers, record));
    return record;
  });
}

// MARKET_DATA のその銘柄の行（ないときは null）
function getMarketDataRecordByTicker_(ticker) {
  const normalizedTicker = normalizeTickerCode_(ticker);
  if (!normalizedTicker) {
    return null;
  }

  const rows = getTableData_(SHEET_NAMES_.MARKET_DATA).rows
    .filter(function(row) {
      return String(row.ticker) === String(normalizedTicker);
    })
    .sort(function(a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

  return rows.length > 0 ? rows[0] : null;
}

// MARKET_DATA から、銘柄ごとのいちばん新しい行を { 銘柄: 行 } で
function getLatestMarketDataRecordMapByTickers_(tickers) {
  const normalizedTickers = Array.from(new Set((tickers || []).map(function(ticker) {
    return normalizeTickerCode_(ticker);
  }).filter(function(ticker) {
    return !!ticker;
  })));
  if (normalizedTickers.length === 0) {
    return {};
  }

  const lookup = {};
  normalizedTickers.forEach(function(ticker) {
    lookup[ticker] = true;
  });

  const latestMap = {};
  getTableData_(SHEET_NAMES_.MARKET_DATA).rows.forEach(function(row) {
    const ticker = normalizeTickerCode_(row.ticker);
    if (!lookup[ticker]) {
      return;
    }

    if (!latestMap[ticker] || String(row.updatedAt || '') > String(latestMap[ticker].updatedAt || '')) {
      latestMap[ticker] = row;
    }
  });

  return latestMap;
}

// 記録は見出しの行だけ読んで1行足す（記録のシートは長くなるので、全部は読まない）
let EVENT_LOG_HEADERS_MEMO_ = null;

// EVENT_LOG に1行足す（ユーザー ID はハッシュにし、長い中身は切る）
function appendEventLog_(eventLog) {
  const sheet = getSheetOrThrow_(SHEET_NAMES_.EVENT_LOG);
  if (!EVENT_LOG_HEADERS_MEMO_) {
    const lastColumn = sheet.getLastColumn();
    EVENT_LOG_HEADERS_MEMO_ = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  }
  const record = Object.assign({
    timestamp: nowJst_(),
    eventType: '',
    groupId: '',
    userId: '',
    action: '',
    result: '',
    detail: '',
    errorMessage: '',
  }, eventLog);
  // 記録には、LINE のユーザー ID をそのまま残さない（S2）。長すぎる中身は切る（G6）
  record.userId = maskLineUserId_(record.userId);
  ['detail', 'errorMessage'].forEach(function(key) {
    record[key] = maskLineUserIdsInText_(record[key]).slice(0, 2000);
  });
  sheet.appendRow(recordToRow_(EVENT_LOG_HEADERS_MEMO_, record));
  return record;
}

// LINE の知らせ1つの結果を EVENT_LOG に残す
function logEventResult_(event, action, result, detail, errorMessage) {
  const source = event && event.source ? event.source : {};
  appendEventLog_({
    eventType: event && event.type ? event.type : '',
    groupId: source.groupId || '',
    userId: source.userId || '',
    action: action,
    result: result,
    detail: detail || '',
    errorMessage: errorMessage || '',
  });
}
