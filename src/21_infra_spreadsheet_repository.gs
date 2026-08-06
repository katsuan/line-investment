function openSpreadsheet_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function getSheetOrThrow_(name) {
  const sheet = openSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet not found: ' + name);
  }
  return sheet;
}

function getTableData_(sheetName) {
  const sheet = getSheetOrThrow_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    return { sheet: sheet, headers: [], rows: [] };
  }

  const headers = values[0];
  const rows = values.slice(1).map(function(row) {
    return toRecord_(headers, row);
  });

  return { sheet: sheet, headers: headers, rows: rows };
}

function toRecord_(headers, row) {
  const record = {};
  headers.forEach(function(header, index) {
    record[header] = row[index];
  });
  return record;
}

function recordToRow_(headers, record) {
  return headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
  });
}

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

function getGroupRecord_(groupId) {
  const table = getTableData_(SHEET_NAMES_.GROUPS);
  const rowIndex = findRowIndexByKeys_(table.rows, ['groupId'], { groupId: groupId });
  return rowIndex >= 0 ? table.rows[rowIndex] : null;
}

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

function getActiveMembersByGroup_(groupId) {
  return getTableData_(SHEET_NAMES_.MEMBERS).rows.filter(function(row) {
    return String(row.groupId) === String(groupId) && String(row.active) !== 'false';
  });
}

function getRuleByVersion_(version) {
  const rows = getTableData_(SHEET_NAMES_.RULES).rows;
  const matched = rows.find(function(row) {
    return Number(row.version) === Number(version);
  });
  return matched || null;
}

function getEnabledRule_() {
  const rows = getTableData_(SHEET_NAMES_.RULES).rows;
  const enabled = rows.find(function(row) {
    return String(row.enabled) === 'true' || row.enabled === true;
  });
  return enabled || getRuleByVersion_(DEFAULT_RULE_VERSION_);
}

function getCurrentRuleForGroup_(groupId) {
  const group = getGroupRecord_(groupId);
  const version = group && group.ruleVersion ? group.ruleVersion : DEFAULT_RULE_VERSION_;
  return getRuleByVersion_(version) || getEnabledRule_();
}

function getUnconfirmedMembers_(groupId, ruleVersion) {
  return getActiveMembersByGroup_(groupId).filter(function(member) {
    return Number(member.agreedRuleVersion) !== Number(ruleVersion);
  });
}

function createWatchlistRecord_(watchlistRecord) {
  return withScriptLock_(function() {
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
    return record;
  });
}

function getActiveWatchlistByGroup_(groupId) {
  return getTableData_(SHEET_NAMES_.WATCHLIST).rows
    .filter(function(row) {
      return String(row.groupId) === String(groupId) && String(row.active) !== 'false';
    })
    .sort(function(a, b) {
      return String(b.addedAt).localeCompare(String(a.addedAt));
    });
}

function getWatchlistRecordByTicker_(groupId, ticker) {
  const normalizedTicker = normalizeTickerCode_(ticker);
  const rows = getTableData_(SHEET_NAMES_.WATCHLIST).rows
    .filter(function(row) {
      return String(row.groupId) === String(groupId) && String(row.ticker) === String(normalizedTicker);
    })
    .sort(function(a, b) {
      return String(a.addedAt || '').localeCompare(String(b.addedAt || ''));
    });
  return rows.length > 0 ? rows[0] : null;
}

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

function appendEventLog_(eventLog) {
  return withScriptLock_(function() {
    const table = getTableData_(SHEET_NAMES_.EVENT_LOG);
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
    table.sheet.appendRow(recordToRow_(table.headers, record));
    return record;
  });
}

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
