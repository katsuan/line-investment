function handleJoin_(event) {
  assertGroupEvent_(event);

  const groupId = event.source.groupId;
  if (!isGroupAccessAllowed_(groupId)) {
    logEventResult_(event, 'join_ignored', 'ignored', 'group is not allowed', '');
    return;
  }
  let groupName = '';
  try {
    const summary = getGroupSummary_(groupId);
    groupName = summary.groupName || '';
  } catch (error) {
    logEventResult_(event, 'get_group_summary', 'error', 'group summary fetch failed', buildErrorMessage_(error));
  }

  upsertGroupRecord_({
    groupId: groupId,
    groupName: groupName,
    enabled: true,
    ruleVersion: DEFAULT_RULE_VERSION_,
  });

  sendReplyMessage_(event.replyToken, [buildJoinGuideFlexMessage_(buildLiffAppLaunchUrl_(groupId, 'watchlist'))], groupId, {
    quickReply: buildMainQuickReply_(groupId),
  });
  logEventResult_(event, 'join_reply', 'success', 'group registered and guide sent', '');
}

function handleMemberJoined_(event) {
  assertGroupEvent_(event);

  const groupId = event.source.groupId;
  if (!isGroupAccessAllowed_(groupId)) {
    logEventResult_(event, 'member_joined_ignored', 'ignored', 'group is not allowed', '');
    return;
  }
  const joinedMembers = ((event.joined || {}).members || []).filter(function(member) {
    return member && member.type === 'user' && member.userId;
  });

  const displayNames = [];
  joinedMembers.forEach(function(member) {
    let displayName = '';
    try {
      const profile = getGroupMemberProfile_(groupId, member.userId);
      displayName = profile.displayName || '';
    } catch (error) {
      logEventResult_(event, 'get_member_profile', 'error', 'profile fetch failed for ' + member.userId, buildErrorMessage_(error));
    }

    upsertMemberRecord_({
      groupId: groupId,
      userId: member.userId,
      displayName: displayName,
      joinedAt: nowJst_(),
      active: true,
    });

    if (displayName) {
      displayNames.push(displayName);
    }
  });

  const targetUserIds = joinedMembers.map(function(member) {
    return member.userId;
  });

  const rule = getCurrentRuleForGroup_(groupId);
  sendReplyMessage_(event.replyToken, [buildWelcomeFlexMessage_(rule, displayNames, targetUserIds)], groupId, {
    quickReply: buildRuleAgreementQuickReply_(rule.version, targetUserIds),
  });
  logEventResult_(event, 'member_joined_reply', 'success', 'welcome flex sent', '');
}

function handlePostback_(event) {
  assertGroupEvent_(event);

  const groupId = event.source.groupId;
  const userId = event.source.userId || '';
  const params = parsePostbackData_((event.postback || {}).data);
  if (params.action === 'usage_prefill') {
    logEventResult_(event, 'usage_prefill', 'success', 'keyboard prefill opened', params.command || '');
    return;
  }

  if (params.action !== 'agree_rules') {
    sendReplyMessage_(event.replyToken, [{
      type: 'text',
      text: 'このボタンは、いまは使えません。「#使い方」を送ると、できることが見られます。',
    }], groupId, { quickReply: buildMainQuickReply_(groupId) });
    logEventResult_(event, 'postback_ignored', 'ignored', 'unsupported action', '');
    return;
  }

  if (!isGroupAccessAllowed_(groupId)) {
    logEventResult_(event, 'postback_denied', 'ignored', 'group is not allowed', '');
    return;
  }

  // 古いボタン・ほかの人のボタンが押されても黙らず、やさしく返す（H2）
  const targetUserIds = (params.targetUserIds || '').split(',').filter(function(id) {
    return !!id;
  });
  if (targetUserIds.length > 0 && targetUserIds.indexOf(userId) < 0) {
    sendReplyMessage_(event.replyToken, [{
      type: 'text',
      text: 'このボタンは、案内した人のためのものです。\nルールは「#ルール」で見られます。',
    }], groupId, { quickReply: buildMainQuickReply_(groupId, [buildMessageQuickReplyItem_('📜 ルールを見る', '#ルール')]) });
    logEventResult_(event, 'postback_ignored', 'ignored', 'tapped by non-target user', userId);
    return;
  }

  const currentRule = getCurrentRuleForGroup_(groupId);
  const requestedRuleVersion = Math.floor(Number(params.ruleVersion || DEFAULT_RULE_VERSION_));
  if (requestedRuleVersion !== Number(currentRule.version)) {
    const actor = getActorProfileForGroup_(groupId, userId);
    replyRuleConfirmationPrompt_(event.replyToken, groupId, currentRule, actor.displayName ? [actor.displayName] : [], [userId], [
      { type: 'text', text: 'ルールが新しくなりました。読んでから、もう一度「確認しました」を押してね。' },
    ]);
    logEventResult_(event, 'agree_rules', 'ignored', 'old rule version', String(requestedRuleVersion));
    return;
  }
  const ruleVersion = Number(currentRule.version);

  if (hasAgreedCurrentRule_(groupId, userId, ruleVersion)) {
    sendReplyMessage_(event.replyToken, [{
      type: 'text',
      text: 'ルールの確認は、もう記録しています。そのまま使えます。',
    }], groupId, { quickReply: buildMainQuickReply_(groupId) });
    logEventResult_(event, 'agree_rules', 'ignored', 'already agreed', '');
    return;
  }

  let displayName = '';
  try {
    const profile = getGroupMemberProfile_(groupId, userId);
    displayName = profile.displayName || '';
  } catch (error) {
    logEventResult_(event, 'get_member_profile', 'error', 'profile fetch failed for agree_rules', buildErrorMessage_(error));
  }

  upsertMemberRecord_({
    groupId: groupId,
    userId: userId,
    displayName: displayName,
    active: true,
    agreedAt: nowJst_(),
    agreedRuleVersion: ruleVersion,
  });
  addAllowedUserId_(userId);

  sendReplyMessage_(event.replyToken, [
    buildUsageGuideFlexMessage_({
      leadText: (displayName ? displayName + 'さん、' : '') + 'ルールの確認を記録しました。今日から使えます。',
      watchlistUrl: buildLiffAppLaunchUrl_(groupId, 'watchlist'),
    }),
  ], groupId, { quickReply: buildMainQuickReply_(groupId) });
  logEventResult_(event, 'agree_rules', 'success', 'rule agreement recorded', '');
}

// トークのことば。決まったことば（# で始まる）のほかは、返事も記録もしない
function handleMessage_(event) {
  assertGroupEvent_(event);

  if (!event.message || event.message.type !== 'text') {
    return; // ふつうの写真・スタンプには返事をしない（記録もしない）
  }

  const context = {
    event: event,
    text: normalizeIncomingCommandText_(event.message.text),
    groupId: event.source.groupId,
    userId: event.source.userId || '',
  };

  if (context.text === '#グループ許可') {
    handleGroupAllowCommand_(context);
    return;
  }

  const handler = findMessageCommandHandler_(context.text);
  if (!handler) {
    return; // ふつうの会話には返事をしない（毎回シートに書くと遅くなるので、記録もしない）
  }

  if (!isAccessAllowedForCommand_(context.groupId, context.userId, context.text)) {
    handleNotAllowedMessage_(context);
    return;
  }

  handler(context);
}

// ことば → する関数（ないときは null）
function findMessageCommandHandler_(text) {
  if (isAdminTestCommand_(text)) {
    return null; // テストの窓口は 1:1 のトークだけ。グループでは反応しない（銘柄コード TEST とも見ない）
  }
  if (text === '#ルール') {
    return handleRuleCommand_;
  }
  if (text === '#未確認') {
    return handleUnconfirmedCommand_;
  }
  if (text === '#Bot設定') {
    return handleBotSettingsCommand_;
  }
  if (text === '#使い方' || text === '#ヘルプ') {
    return handleUsageCommand_;
  }
  if (Object.prototype.hasOwnProperty.call(LIFF_LAUNCH_COMMANDS_, text)) {
    return handleLiffLaunchCommand_;
  }
  if (isWatchRemovalCommand_(text)) {
    return handleWatchRemovalCommand_;
  }
  if (isSupportedWatchTickerCommand_(text)) {
    return handleWatchAddCommand_;
  }
  return null;
}

// 画面を開くことば：開く画面と、記録の名前
const LIFF_LAUNCH_COMMANDS_ = Object.freeze({
  '#LIFF一覧': { view: 'watchlist', action: 'command_liff_launch' },
  '#注目一覧': { view: 'watchlist', action: 'command_watchlist' },
  '#注目実績': { view: 'performance', action: 'command_watch_performance' },
});

// 全角の「＃」・数字・空白も受けつける（スマホの日本語入力では全角になりやすい）
function normalizeIncomingCommandText_(text) {
  return normalizeCommandText_(String(text || '').normalize('NFKC'));
}

// 文の返事。mainQuickReply で次の操作（H3）、quickReplyItems でその返事だけの操作を先頭に
function replyText_(context, text, options) {
  const settings = options || {};
  const withQuickReply = !!(settings.mainQuickReply || settings.quickReplyItems);
  sendReplyMessage_(context.event.replyToken, [{ type: 'text', text: text }], context.groupId,
    withQuickReply ? { quickReply: buildMainQuickReply_(context.groupId, settings.quickReplyItems) } : undefined);
}

// ルールの確認のカード＋「✅ ルールを確認しました」のクイックリプライ（押せるのは userIds の人だけ）
function replyRuleConfirmationPrompt_(replyToken, groupId, rule, displayNames, userIds, leadMessages) {
  sendReplyMessage_(replyToken, (leadMessages || []).concat([
    buildRuleConfirmationPromptFlexMessage_(rule, displayNames, userIds),
  ]), groupId, { quickReply: buildRuleAgreementQuickReply_(rule.version, userIds) });
}

function handleGroupAllowCommand_(context) {
  const event = context.event;
  const groupId = context.groupId;
  if (!isAdminUser_(context.userId)) {
    replyText_(context, 'これは管理者だけが使えます。');
    logEventResult_(event, 'command_group_allow', 'ignored', 'admin only', '');
    return;
  }

  addAllowedGroupId_(groupId);
  let groupName = '';
  try {
    const summary = getCachedGroupSummary_(groupId);
    groupName = summary && summary.groupName ? summary.groupName : '';
  } catch (error) {
    groupName = '';
  }

  upsertGroupRecord_({
    groupId: groupId,
    groupName: groupName,
    enabled: true,
    ruleVersion: DEFAULT_RULE_VERSION_,
  });

  replyText_(context, 'このグループで使えるようにしました。\n新しく入った人には、ルールの案内を送ります。');
  logEventResult_(event, 'command_group_allow', 'success', 'group allowed', groupId);
}

// まだ使えない人：グループが許可されていれば、ルールの確認をお願いする
function handleNotAllowedMessage_(context) {
  const event = context.event;
  const groupId = context.groupId;
  if (isGroupAccessAllowed_(groupId)) {
    const actor = getActorProfileForGroup_(groupId, context.userId);
    const rule = getCurrentRuleForGroup_(groupId);
    replyRuleConfirmationPrompt_(event.replyToken, groupId, rule, actor.displayName ? [actor.displayName] : [], [context.userId]);
    logEventResult_(event, 'message_rule_prompt', 'success', 'rule confirmation prompted for unallowed user', context.text);
    return;
  }

  replyText_(context, buildAccessDeniedText_());
  logEventResult_(event, 'message_denied', 'ignored', 'group access denied', context.text);
}

function handleRuleCommand_(context) {
  const event = context.event;
  const groupId = context.groupId;
  const rule = getCurrentRuleForGroup_(groupId);
  if (isAccessAllowed_(groupId, context.userId)) {
    sendReplyMessage_(event.replyToken, [buildRuleFlexMessage_(rule)], groupId, { quickReply: buildMainQuickReply_(groupId) });
  } else {
    // まだ確認していない人には、確認のボタン付きのカードを出す
    const actor = getActorProfileForGroup_(groupId, context.userId);
    replyRuleConfirmationPrompt_(event.replyToken, groupId, rule, actor.displayName ? [actor.displayName] : [], [context.userId]);
  }
  logEventResult_(event, 'command_rules', 'success', 'rule flex sent', '');
}

function handleUnconfirmedCommand_(context) {
  const rule = getCurrentRuleForGroup_(context.groupId);
  const members = getUnconfirmedMembers_(context.groupId, rule.version);
  sendReplyMessage_(context.event.replyToken, [buildUnconfirmedMembersFlexMessage_(rule, members)], context.groupId, {
    quickReply: buildMainQuickReply_(context.groupId),
  });
  logEventResult_(context.event, 'command_unconfirmed', 'success', 'unconfirmed members sent', '');
}

function handleBotSettingsCommand_(context) {
  const group = getGroupRecord_(context.groupId);
  sendReplyMessage_(context.event.replyToken, [
    buildBotSettingsFlexMessage_(group, { showAccessCounts: isAdminUser_(context.userId) }),
  ], context.groupId);
  logEventResult_(context.event, 'command_bot_settings', 'success', 'settings flex sent', '');
}

function handleUsageCommand_(context) {
  sendReplyMessage_(context.event.replyToken, [buildUsageGuideFlexMessage_({
    watchlistUrl: buildLiffAppLaunchUrl_(context.groupId, 'watchlist'),
  })], context.groupId, { quickReply: buildMainQuickReply_(context.groupId) });
  logEventResult_(context.event, 'command_usage_guide', 'success', 'usage guide sent', context.text);
}

function handleLiffLaunchCommand_(context) {
  const command = LIFF_LAUNCH_COMMANDS_[context.text];
  const liffUrl = buildLiffAppLaunchUrl_(context.groupId, command.view);
  if (!liffUrl) {
    replyText_(context, '画面を開くリンクが、まだ用意されていません。管理者に伝えてね。');
    logEventResult_(context.event, command.action, 'ignored', 'LIFF_APP_BASE_URL missing', '');
    return;
  }

  sendReplyMessage_(context.event.replyToken, [buildLiffLaunchFlexMessage_(liffUrl, command.view)], context.groupId, {
    quickReply: buildMainQuickReply_(context.groupId),
  });
  logEventResult_(context.event, command.action, 'success', command.view + ' launch sent', liffUrl);
}

function handleWatchRemovalCommand_(context) {
  const ticker = extractTickerFromWatchRemovalCommand_(context.text);
  if (!ticker) {
    handleWatchRemoveAllCommand_(context);
    return;
  }

  const event = context.event;
  const groupId = context.groupId;
  const userId = context.userId;
  // 外して入れなおした銘柄もあるので、いま注目中のものを見る
  const activeRecord = getActiveWatchlistRecordByTicker_(groupId, ticker);
  if (!activeRecord) {
    replyText_(context, ticker + ' は注目に入っていません。', { mainQuickReply: true });
    logEventResult_(event, 'command_watch_remove', 'ignored', 'watchlist record not found', ticker);
    return;
  }

  if (!isAdminUser_(userId)) {
    const ownerUserId = String(activeRecord.addedByUserId || '');
    if (!ownerUserId || ownerUserId !== String(userId)) {
      replyText_(context, ticker + ' を外せるのは、注目に入れた人か管理者だけです。', { mainQuickReply: true });
      logEventResult_(event, 'command_watch_remove', 'ignored', 'not owner or admin', ticker);
      return;
    }
  }

  const actor = getActorProfileForGroup_(groupId, userId);
  const deactivatedRecord = deactivateWatchlistRecord_(groupId, ticker, userId, actor.displayName) || activeRecord;
  replyText_(context, '注目から外しました：' + ticker + '\n' +
    toLineText_(deactivatedRecord.tickerName || activeRecord.tickerName || ticker, ticker), {
    // まちがえて外したとき、すぐ入れなおせる（#コード を送るだけなので、あとで押されても困らない）
    quickReplyItems: [buildMessageQuickReplyItem_('↩ ' + ticker + ' を戻す', '#' + ticker)],
  });
  logEventResult_(event, 'command_watch_remove', 'success', 'watchlist record deactivated', ticker);
}

function handleWatchRemoveAllCommand_(context) {
  if (!isAdminUser_(context.userId)) {
    replyText_(context, '全部の注目を外すのは、管理者だけができます。\n自分の注目は「#解除 7203」のように外せます。', { mainQuickReply: true });
    logEventResult_(context.event, 'command_watch_remove_all', 'ignored', 'admin only', '');
    return;
  }

  const actor = getActorProfileForGroup_(context.groupId, context.userId);
  const deactivatedRecords = deactivateAllActiveWatchlistRecords_(context.groupId, context.userId, actor.displayName);
  replyText_(context, deactivatedRecords.length === 0
    ? '外す注目銘柄はありません。'
    : '注目銘柄を全部外しました（' + deactivatedRecords.length + '件）。');
  logEventResult_(context.event, 'command_watch_remove_all', 'success', 'all watchlist records deactivated', String(deactivatedRecords.length));
}

function handleWatchAddCommand_(context) {
  const event = context.event;
  const groupId = context.groupId;
  const userId = context.userId;
  const ticker = normalizeTickerCode_(context.text.slice(1));
  const watchlistUrl = buildLiffAppLaunchUrl_(groupId, 'watchlist');

  const actor = getActorProfileForGroup_(groupId, userId);
  const activeRecord = getActiveWatchlistRecordByTicker_(groupId, ticker);
  let quoteAtRegistration = null;
  try {
    quoteAtRegistration = getMarketQuoteByTicker_(ticker, { forceRefresh: true });
  } catch (error) {
    logEventResult_(event, 'market_quote_fetch', 'error', 'quote fetch failed on watch add', buildErrorMessage_(error));
  }

  if (!hasUsableQuoteForWatchAdd_(quoteAtRegistration)) {
    replyText_(context, ticker + ' の株価が見つかりませんでした。\nコードを確かめて、もう一度送ってね。\n例：#7203（日本株）・#AAPL（米国株）', { mainQuickReply: true });
    logEventResult_(event, 'command_watch_add', 'ignored', 'watch add quote unavailable', ticker);
    return;
  }

  // 株価を取りに行っているあいだに、ほかの人が同じ銘柄を入れることがある。足すのはロックの中で確かめてから
  const added = activeRecord
    ? { record: activeRecord, created: false }
    : createWatchlistRecordIfAbsent_(buildWatchlistRecordFromQuote_(groupId, ticker, quoteAtRegistration, actor));

  if (!added.created) {
    sendReplyMessage_(event.replyToken, [buildWatchAlreadyActiveFlexMessage_(added.record, quoteAtRegistration, watchlistUrl)], groupId, {
      quickReply: buildMainQuickReply_(groupId),
    });
    logEventResult_(event, 'command_watch_add', 'ignored', 'watchlist record already active', ticker);
    return;
  }

  sendReplyMessage_(event.replyToken, [buildWatchRegistrationFlexMessage_(added.record, quoteAtRegistration, watchlistUrl)], groupId, {
    quickReply: buildMainQuickReply_(groupId),
  });
  logEventResult_(event, 'command_watch_add', 'success', 'watchlist record created', ticker);
}

function buildWatchlistRecordFromQuote_(groupId, ticker, quote, actor) {
  const q = quote || {};
  return {
    groupId: groupId,
    ticker: ticker,
    tickerName: q.name || '',
    addedAt: nowJst_(),
    addedMarketTicker: q.marketTicker || composeMarketTicker_(ticker),
    addedPrice: q.price || '',
    addedMarketCap: q.marketCap || '',
    addedChangePercent: q.changePercent || '',
    addedTradeTime: q.tradeTime || '',
    addedByUserId: actor.userId,
    addedByDisplayName: actor.displayName,
    active: true,
  };
}

function hasUsableQuoteForWatchAdd_(quote) {
  return !!(quote && (quote.name || quote.price));
}

function assertGroupEvent_(event) {
  if (!event.source || event.source.type !== 'group' || !event.source.groupId) {
    throw new Error('This bot currently supports group events only.');
  }
}

function getActorProfileForGroup_(groupId, userId) {
  let displayName = '';
  if (!userId) {
    return { userId: '', displayName: '' };
  }

  try {
    const profile = getGroupMemberProfile_(groupId, userId);
    displayName = profile.displayName || '';
  } catch (error) {
    logEventResult_({
      type: 'message',
      source: { groupId: groupId, userId: userId },
    }, 'get_member_profile', 'error', 'actor profile fetch failed', buildErrorMessage_(error));
  }

  if (displayName && !isMemberRecordUpToDate_(groupId, userId, displayName)) {
    upsertMemberRecord_({
      groupId: groupId,
      userId: userId,
      displayName: displayName,
      active: true,
    });
  }

  return {
    userId: userId,
    displayName: displayName,
  };
}

function isMemberRecordUpToDate_(groupId, userId, displayName) {
  const rows = getTableData_(SHEET_NAMES_.MEMBERS).rows;
  const rowIndex = findRowIndexByKeys_(rows, ['groupId', 'userId'], { groupId: groupId, userId: userId });
  if (rowIndex < 0) {
    return false;
  }
  const row = rows[rowIndex];
  return String(row.displayName || '') === String(displayName) && String(row.active) !== 'false';
}

// 注目の記録に、いまの株価（currentQuote）を付ける。forceRefresh でなければ、シートに覚えた株価だけを使う（速く返す）
function hydrateRecordsWithQuotes_(records, options) {
  const forceRefresh = !!(options && options.forceRefresh);
  const quoteMap = getMarketQuoteMapByTickers_(records.map(function(record) {
    return record.ticker;
  }), {
    forceRefresh: forceRefresh,
    useLatestCacheOnly: !forceRefresh,
  });

  return records.map(function(record) {
    return Object.assign({}, record, {
      currentQuote: quoteMap[normalizeTickerCode_(record.ticker)] || null,
    });
  });
}

function hydrateRecentWatchlistWithCurrentQuotes_(records, options) {
  return hydrateRecordsWithQuotes_(records.slice(0, LIFF_WATCHLIST_LIMIT_), options);
}

// 注目したときの株価から、いまの株価までの変化（%）。どちらかがないときは null
function calcWatchPriceDelta_(record) {
  const quote = record.currentQuote || null;
  return calcPercentDelta_(toNumberOrNaN_(quote && quote.price), toNumberOrNaN_(record.addedPrice));
}

// 注目したときからの騰落率の文字。時価総額が両方あれば時価総額で（株式分割に左右されない）、なければ株価で
function formatWatchPerformanceDelta_(record, quote) {
  if (quote && quote.marketCap && record.addedMarketCap) {
    return formatSignedPercentDeltaFromBaseScaled_(quote.marketCap, record.addedMarketCap);
  }
  return formatSignedPercentDeltaFromBase_(quote && quote.price ? quote.price : '', record.addedPrice);
}

function resolveRecordMarketTicker_(record, quote) {
  return record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker);
}

function isWatchRemovalCommand_(text) {
  return /^#解除(\s+[A-Z0-9.-]{1,10})?$/i.test(String(text || '').trim());
}

function extractTickerFromWatchRemovalCommand_(text) {
  const matched = String(text || '').trim().match(/^#解除\s+([A-Z0-9.-]{1,10})$/i);
  return matched ? normalizeTickerCode_(matched[1]) : '';
}

function hasAgreedCurrentRule_(groupId, userId, ruleVersion) {
  if (getAllowedUserIds_().indexOf(String(userId)) < 0) {
    return false;
  }
  const rows = getTableData_(SHEET_NAMES_.MEMBERS).rows;
  const rowIndex = findRowIndexByKeys_(rows, ['groupId', 'userId'], { groupId: groupId, userId: userId });
  return rowIndex >= 0 && Number(rows[rowIndex].agreedRuleVersion) === Number(ruleVersion);
}

function isAccessAllowed_(groupId, userId) {
  if (isAdminUser_(userId)) {
    return true;
  }

  if (!isGroupAccessAllowed_(groupId)) {
    return false;
  }

  const allowedUserIds = getAllowedUserIds_();
  return !!userId && allowedUserIds.indexOf(userId) >= 0;
}

function isAccessAllowedForCommand_(groupId, userId, text) {
  if (isAccessAllowed_(groupId, userId)) {
    return true;
  }

  if (!isGroupAccessAllowed_(groupId)) {
    return false;
  }

  return text === '#ルール';
}

function isAdminUser_(userId) {
  return !!userId && getAdminUserIds_().indexOf(String(userId)) >= 0;
}

function isGroupAccessAllowed_(groupId) {
  const allowedGroupIds = getAllowedGroupIds_();
  if (allowedGroupIds.length === 0) {
    return true;
  }
  return allowedGroupIds.indexOf(String(groupId || '').trim()) >= 0;
}

function buildAccessDeniedText_() {
  return [
    'このグループでは、まだ使えません。',
    '使いたいときは、管理者に伝えてね。'
  ].join('\n');
}

function addAllowedUserId_(userId) {
  if (!userId) {
    return getAllowedUserIds_();
  }
  return addScriptPropertyListValue_('ALLOWED_USER_IDS', userId);
}

function addAllowedGroupId_(groupId) {
  if (!groupId) {
    return getAllowedGroupIds_();
  }
  return addScriptPropertyListValue_('ALLOWED_GROUP_IDS', groupId);
}

// 注目した人ごとの実績（注目した数と、平均の騰落率）。上位5位まで（同じ成績は同じ順位）
function buildWatchPerformanceStats_(groupId, options) {
  const records = hydrateRecordsWithQuotes_(getActiveWatchlistByGroup_(groupId), options);
  const statsByUser = {};
  records.forEach(function(record) {
    const key = String(record.addedByUserId || record.addedByDisplayName || 'unknown');
    if (!statsByUser[key]) {
      statsByUser[key] = {
        userId: record.addedByUserId || '',
        displayName: record.addedByDisplayName || '不明',
        pickCount: 0,
        deltaSum: 0,
        deltaCount: 0,
      };
    }
    const stat = statsByUser[key];
    stat.pickCount += 1;
    const delta = calcWatchPriceDelta_(record);
    if (delta !== null) {
      stat.deltaSum += delta;
      stat.deltaCount += 1;
    }
  });

  const rows = Object.keys(statsByUser)
    .map(function(key) {
      const stat = statsByUser[key];
      const profile = getMemberProfileOrEmpty_(groupId, stat.userId);
      const average = stat.deltaCount > 0 ? (stat.deltaSum / stat.deltaCount) : null;
      return {
        userId: stat.userId,
        displayName: profile.displayName || stat.displayName,
        pictureUrl: profile.pictureUrl || '',
        pickCount: stat.pickCount,
        averageDelta: average,
        rankingAverageDelta: average === null ? Number.NEGATIVE_INFINITY : average,
      };
    })
    .sort(function(a, b) {
      if (b.rankingAverageDelta !== a.rankingAverageDelta) {
        return b.rankingAverageDelta - a.rankingAverageDelta;
      }
      if (b.pickCount !== a.pickCount) {
        return b.pickCount - a.pickCount;
      }
      return a.displayName.localeCompare(b.displayName);
    });

  const limitedRows = [];
  let currentRank = 0;
  let previousRankingKey = null;
  rows.forEach(function(row, index) {
    const rankingKey = row.rankingAverageDelta + '|' + row.pickCount;
    if (rankingKey !== previousRankingKey) {
      currentRank = index + 1;
      previousRankingKey = rankingKey;
    }
    if (currentRank <= 5) {
      limitedRows.push(Object.assign({}, row, { rank: currentRank }));
    }
  });

  return {
    rows: limitedRows,
    totalCount: records.length,
  };
}

// LINE の名前と写真（わからないときは空）
function getMemberProfileOrEmpty_(groupId, userId) {
  if (!userId) {
    return {};
  }
  try {
    return getGroupMemberProfile_(groupId, userId) || {};
  } catch (error) {
    return {};
  }
}

// 1位でない人から、1人をえらんで紹介する
function buildNonTopRandomWatchSpotlightData_(groupId, stats, options) {
  const candidates = ((stats && stats.rows) || []).slice(1);
  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const displayName = selected.displayName || '不明';
  return buildWatchSpotlightDataForUser_(groupId, selected.userId || '', displayName, Object.assign({
    limit: 3,
    sortByDeltaDesc: false,
    title: 'ランダム ' + toLineText_(displayName, '不明'),
  }, options || {}));
}

function buildTopPerformerWatchSpotlightData_(groupId, stats, options) {
  const rows = (stats && stats.rows) || [];
  if (rows.length === 0) {
    return null;
  }

  const topRow = rows[0];
  return buildWatchSpotlightDataForUser_(groupId, topRow.userId, topRow.displayName, Object.assign({
    limit: 3,
    sortByDeltaDesc: true,
    title: '🥇 ' + toLineText_(topRow.displayName, '不明'),
  }, options || {}));
}

function buildWatchSpotlightDataForUser_(groupId, userId, fallbackDisplayName, options) {
  const settings = options || {};
  const filteredRecords = getActiveWatchlistByGroup_(groupId).filter(function(record) {
    if (userId) {
      return String(record.addedByUserId || '') === String(userId);
    }
    return String(record.addedByDisplayName || record.addedByUserId || '') === String(fallbackDisplayName || '');
  });
  if (filteredRecords.length === 0) {
    return null;
  }

  const profile = getMemberProfileOrEmpty_(groupId, userId);
  const hydratedRecords = hydrateRecordsWithQuotes_(filteredRecords, settings).map(function(record) {
    return Object.assign(record, { currentDelta: calcWatchPriceDelta_(record) });
  });

  let deltaSum = 0;
  let deltaCount = 0;
  hydratedRecords.forEach(function(record) {
    if (record.currentDelta !== null) {
      deltaSum += record.currentDelta;
      deltaCount += 1;
    }
  });

  const displayRecords = hydratedRecords.slice();
  if (settings.sortByDeltaDesc) {
    displayRecords.sort(function(a, b) {
      const aDelta = a.currentDelta === null ? Number.NEGATIVE_INFINITY : a.currentDelta;
      const bDelta = b.currentDelta === null ? Number.NEGATIVE_INFINITY : b.currentDelta;
      if (bDelta !== aDelta) {
        return bDelta - aDelta;
      }
      return String(b.addedAt || '').localeCompare(String(a.addedAt || ''));
    });
  }

  return {
    title: settings.title || '注目カード',
    userId: userId || '',
    displayName: profile.displayName || fallbackDisplayName || filteredRecords[0].addedByDisplayName || '不明',
    pictureUrl: profile.pictureUrl || '',
    pickCount: hydratedRecords.length,
    averageDelta: deltaCount > 0 ? (deltaSum / deltaCount) : null,
    records: displayRecords.slice(0, settings.limit || 5),
  };
}

function buildLiffAppLaunchUrl_(groupId, view) {
  const baseUrl = getLiffAppBaseUrl_();
  if (!baseUrl) {
    return '';
  }

  const separator = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  return baseUrl + separator +
    'groupId=' + encodeURIComponent(groupId) +
    '&view=' + encodeURIComponent(view || 'watchlist');
}

function buildLiffWatchlistPayload_(groupId, options) {
  const settings = options || {};
  const records = getActiveWatchlistByGroup_(groupId);
  const hydratedRecords = hydrateRecentWatchlistWithCurrentQuotes_(records, {
    forceRefresh: !!settings.forceRefresh,
  });
  let latestCachedAt = '';
  hydratedRecords.forEach(function(record) {
    const cachedAt = record.currentQuote && record.currentQuote.fetchedAt ? String(record.currentQuote.fetchedAt) : '';
    if (cachedAt > latestCachedAt) {
      latestCachedAt = cachedAt;
    }
  });
  return {
    totalCount: records.length,
    latestCachedAt: latestCachedAt,
    items: hydratedRecords.map(function(record) {
      const quote = record.currentQuote || null;
      const marketTicker = resolveRecordMarketTicker_(record, quote);
      const performanceDelta = formatWatchPerformanceDelta_(record, quote);
      return {
        ticker: record.ticker,
        name: (quote && quote.name) || record.tickerName || record.ticker,
        marketTicker: marketTicker,
        marketFlag: buildMarketFlagEmoji_(marketTicker),
        currentPrice: quote && quote.price ? quote.price : '',
        addedPrice: record.addedPrice || '',
        performanceDelta: performanceDelta,
        marketCap: quote && quote.marketCap ? quote.marketCap : '',
        addedMarketCap: record.addedMarketCap || '',
        marketCapDelta: quote && quote.marketCap && record.addedMarketCap ? performanceDelta : '',
        per: quote && quote.per ? quote.per : '',
        volume: quote && quote.volume ? quote.volume : '',
        addedAt: formatDateDisplayOnly_(record.addedAt),
        addedByDisplayName: record.addedByDisplayName || '',
        kabutanUrl: buildKabutanUrl_(record.ticker),
        source: 'Google Finance',
      };
    }),
    cached: !settings.forceRefresh,
  };
}

function buildLiffPerformancePayload_(groupId, options) {
  const settings = { forceRefresh: !!(options && options.forceRefresh) };
  const stats = buildWatchPerformanceStats_(groupId, settings);
  return {
    totalCount: stats.totalCount || 0,
    ranking: (stats.rows || []).map(function(row) {
      return {
        rank: row.rank,
        displayName: row.displayName,
        pictureUrl: row.pictureUrl,
        pickCount: row.pickCount,
        averageDelta: row.averageDelta,
      };
    }),
    topSpotlight: toLiffSpotlight_(buildTopPerformerWatchSpotlightData_(groupId, stats, settings)),
    randomSpotlight: toLiffSpotlight_(buildNonTopRandomWatchSpotlightData_(groupId, stats, settings)),
    cached: !settings.forceRefresh,
  };
}

// 画面に返す紹介カード（LINE のユーザー ID は返さない）
function toLiffSpotlight_(spotlight) {
  if (!spotlight) {
    return null;
  }
  return {
    title: spotlight.title,
    displayName: spotlight.displayName,
    pictureUrl: spotlight.pictureUrl,
    pickCount: spotlight.pickCount,
    averageDelta: spotlight.averageDelta,
    items: (spotlight.records || []).map(function(record) {
      const quote = record.currentQuote || null;
      const marketTicker = resolveRecordMarketTicker_(record, quote);
      return {
        ticker: record.ticker,
        name: (quote && quote.name) || record.tickerName || record.ticker,
        marketTicker: marketTicker,
        marketFlag: buildMarketFlagEmoji_(marketTicker),
        currentPrice: quote && quote.price ? quote.price : '',
        addedPrice: record.addedPrice || '',
        currentDelta: record.currentDelta,
        currentDeltaText: formatSignedPercent_(record.currentDelta),
        addedAt: formatDateDisplayOnly_(record.addedAt),
        kabutanUrl: buildKabutanUrl_(record.ticker),
      };
    }),
  };
}

function buildLiffQuotePayload_(groupId, ticker, options) {
  const settings = options || {};
  const normalizedTicker = normalizeTickerCode_(ticker);
  let quote = null;
  try {
    quote = getMarketQuoteByTicker_(normalizedTicker, {
      forceRefresh: !!settings.forceRefresh,
    });
  } catch (error) {
    quote = null;
  }

  const activeRecord = getActiveWatchlistRecordByTicker_(groupId, normalizedTicker);
  const marketTicker = (quote && quote.marketTicker) ||
    (activeRecord && activeRecord.addedMarketTicker) ||
    composeMarketTicker_(normalizedTicker);

  return {
    ticker: normalizedTicker,
    name: (quote && quote.name) || (activeRecord && activeRecord.tickerName) || normalizedTicker,
    marketTicker: marketTicker,
    marketFlag: buildMarketFlagEmoji_(marketTicker),
    currentPrice: quote && quote.price ? quote.price : '',
    changePercent: quote && quote.changePercent ? quote.changePercent : '',
    marketCap: quote && quote.marketCap ? quote.marketCap : '',
    per: quote && quote.per ? quote.per : '',
    volume: quote && quote.volume ? quote.volume : '',
    kabutanUrl: buildKabutanUrl_(normalizedTicker),
    source: 'Google Finance',
    isWatched: !!activeRecord,
    watchedBy: activeRecord ? (activeRecord.addedByDisplayName || '') : '',
    watchedAt: activeRecord ? formatDateDisplayOnly_(activeRecord.addedAt) : '',
    addedPrice: activeRecord ? (activeRecord.addedPrice || '') : '',
    performanceDelta: activeRecord ? formatWatchPerformanceDelta_(activeRecord, quote) : '',
    cached: !settings.forceRefresh,
  };
}
