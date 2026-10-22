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

function ensureSheetWithHeaders_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const hasHeader = sheet.getLastRow() > 0;
  if (!hasHeader) {
    // qcheck-ok: G1 決まった見出しだけ
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, headers.length);
    return;
  }

  ensureMissingHeaders_(sheet, headers);
}

function ensureMissingHeaders_(sheet, headers) {
  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const missingHeaders = headers.filter(function(header) {
    return existingHeaders.indexOf(header) === -1;
  });

  if (missingHeaders.length === 0) {
    return;
  }

  const startColumn = existingHeaders.filter(String).length + 1;
  // qcheck-ok: G1 決まった見出しだけ
  sheet.getRange(1, startColumn, 1, missingHeaders.length).setValues([missingHeaders]);
  sheet.getRange(1, 1, 1, startColumn + missingHeaders.length - 1).setFontWeight('bold');
  sheet.autoResizeColumns(startColumn, missingHeaders.length);
}

function hideSheetIfExists_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (sheet && !sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
}

function seedOrUpdateDefaultRule_() {
  const sheet = getSheetOrThrow_(SHEET_NAMES_.RULES);
  const defaultRuleRow = [
    DEFAULT_RULE_VERSION_,
    '投資情報共有グループのルール',
    [
      '## 🏛️ グループの目的',
      '当グループは、メンバー間の「教え合い」と「リアルタイムな情報共有」を目的としています。',
      '',
      '小さな疑問の解消から、最新の相場環境のキャッチアップまで、全員で投資リテラシーを高め合う空間を目指します。',
    ].join('\n'),
    [
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
      'グループ内からの勧誘だけでなく、メンバーが外部の怪しい商品やサービスへ勧誘する行為も禁止します。'
    ].join('\n'),
    [
      '当グループは情報交換と学習を目的としており、特定の金融商品や銘柄の売買を推奨するものではありません。',
      '',
      '投資判断は各自の責任で行うものとします。'
    ].join('\n'),
    true,
    nowJst_(),
  ];
  const existing = getRuleByVersion_(DEFAULT_RULE_VERSION_);
  if (!existing) {
    sheet.appendRow(defaultRuleRow.map(safeCell)); // 「---」で始まる文も、式にせず文字のまま
    return;
  }

  updateRuleVersionOne_(defaultRuleRow);
}

function updateDefaultRuleVersionOne() {
  updateRuleVersionOne_([
    DEFAULT_RULE_VERSION_,
    '投資情報共有グループのルール',
    [
      '## 🏛️ グループの目的',
      '当グループは、メンバー間の「教え合い」と「リアルタイムな情報共有」を目的としています。',
      '',
      '小さな疑問の解消から、最新の相場環境のキャッチアップまで、全員で投資リテラシーを高め合う空間を目指します。'
    ].join('\n'),
    [
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
      'グループ内からの勧誘だけでなく、メンバーが外部の怪しい商品やサービスへ勧誘する行為も禁止します。'
    ].join('\n'),
    [
      '当グループは情報交換と学習を目的としており、特定の金融商品や銘柄の売買を推奨するものではありません。',
      '',
      '投資判断は各自の責任で行うものとします。'
    ].join('\n'),
    true,
    nowJst_(),
  ]);
}

function updateRuleVersionOne_(rowValues) {
  const sheet = getSheetOrThrow_(SHEET_NAMES_.RULES);
  const values = sheet.getDataRange().getValues();
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (Number(values[rowIndex][0]) === DEFAULT_RULE_VERSION_) {
      sheet.getRange(rowIndex + 1, 1, 1, rowValues.length).setValues([rowValues.map(safeCell)]);
      return;
    }
  }
}
