/**
 * シートの用意の中身：シートと見出しを作る・足りない見出しを足す・決まりのルール（Version 1）を入れる。
 * 00_run の setupInvestmentGroupBot・updateDefaultRuleVersionOne と、21_sheet（ルールのシートが空のとき）から呼ばれる。
 */

// シートがなければ作って見出しを書く。あれば足りない見出しだけ足す
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

// シートに足りない見出しを、右に足す
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

// シートがあれば隠す
function hideSheetIfExists_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (sheet && !sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
}

// 決まりのルール（Version 1。文は 00_run の DEFAULT_RULE_○○）の行の中身
function buildDefaultRuleRecord_() {
  return {
    version: DEFAULT_RULE_VERSION_,
    title: DEFAULT_RULE_TITLE_,
    purpose: DEFAULT_RULE_PURPOSE_,
    prohibitedItems: DEFAULT_RULE_PROHIBITED_ITEMS_,
    disclaimer: DEFAULT_RULE_DISCLAIMER_,
    enabled: true,
    createdAt: nowJst_(),
  };
}

// 決まりのルールを、RULES シートの1行の並びで
function buildDefaultRuleRow_() {
  const rule = buildDefaultRuleRecord_();
  return [rule.version, rule.title, rule.purpose, rule.prohibitedItems, rule.disclaimer, rule.enabled, rule.createdAt];
}

// RULES に決まりのルール（Version 1）を入れる。あれば書きなおす
function seedOrUpdateDefaultRule_() {
  const existing = getRuleByVersion_(DEFAULT_RULE_VERSION_);
  if (!existing) {
    getSheetOrThrow_(SHEET_NAMES_.RULES).appendRow(buildDefaultRuleRow_().map(safeCell)); // 「---」で始まる文も、式にせず文字のまま
    return;
  }

  updateRuleVersionOne_(buildDefaultRuleRow_());
}

// RULES の Version 1 の行を書きかえる（式にならないように）
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
