/**
 * グループのボット：LINE の知らせ（入った・メンバーが入った・ボタン・ことば）を受けて返事をする。
 *   ことば：#ルール・#未確認・#Bot設定・#使い方・#注目一覧・#注目実績・#7203（注目に入れる）・#解除 7203・#グループ許可
 *   ルールの確認（postback）と、使ってよい人・グループの見分け
 * 02_router から呼ばれる。カードは 30_cards、シートは 21_sheet、株価は 22_market_data。
 */

// ボットがグループに入ったとき：使ってよいグループなら、グループを記録して案内のカードを返す
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

// メンバーが入ったとき：記録して、ようこそのカード（ルールの確認のボタン付き。押せるのは入った人だけ）を返す
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

// カード・クイックリプライのボタン（postback）。ルールの確認は、押されるたびに状態を見て返す（ほかの人・古い版・もう確認ずみ・はじめて）
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

// #グループ許可（管理者だけ）：このグループを使ってよい一覧に足し、グループを記録する
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

// #ルール：確認ずみの人にはルールのカード、まだの人には確認のボタン付きのカード
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

// #未確認：ルールをまだ確認していない人の一覧のカード
function handleUnconfirmedCommand_(context) {
  const rule = getCurrentRuleForGroup_(context.groupId);
  const members = getUnconfirmedMembers_(context.groupId, rule.version);
  sendReplyMessage_(context.event.replyToken, [buildUnconfirmedMembersFlexMessage_(rule, members)], context.groupId, {
    quickReply: buildMainQuickReply_(context.groupId),
  });
  logEventResult_(context.event, 'command_unconfirmed', 'success', 'unconfirmed members sent', '');
}

// #Bot設定：ボットの設定のカード（ほかのグループの数は管理者にだけ）
function handleBotSettingsCommand_(context) {
  const group = getGroupRecord_(context.groupId);
  sendReplyMessage_(context.event.replyToken, [
    buildBotSettingsFlexMessage_(group, { showAccessCounts: isAdminUser_(context.userId) }),
  ], context.groupId);
  logEventResult_(context.event, 'command_bot_settings', 'success', 'settings flex sent', '');
}

// #使い方・#ヘルプ：使い方のカード
function handleUsageCommand_(context) {
  sendReplyMessage_(context.event.replyToken, [buildUsageGuideFlexMessage_({
    watchlistUrl: buildLiffAppLaunchUrl_(context.groupId, 'watchlist'),
  })], context.groupId, { quickReply: buildMainQuickReply_(context.groupId) });
  logEventResult_(context.event, 'command_usage_guide', 'success', 'usage guide sent', context.text);
}

// #注目一覧・#注目実績・#LIFF一覧：画面を開くカード（画面の URL がまだないときは、管理者に伝えてと返す）
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

// #解除 7203：入れた人か管理者なら注目から外す（「↩ 7203 を戻す」付き）。コードがなければ全部外す（管理者だけ）へ
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

// #解除（コードなし。管理者だけ）：このグループの注目を全部外す
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

// #7203：株価を取って注目に入れ、注目のカードを返す。もう注目中ならそのカード、株価が見つからなければ直し方を返す
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

// 注目に入れるときの1行（そのときの株価・時価総額などを残す）
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

// 注目に入れてよい株価か（名前か株価がとれた）
function hasUsableQuoteForWatchAdd_(quote) {
  return !!(quote && (quote.name || quote.price));
}

// 「#解除」「#解除 7203」か
function isWatchRemovalCommand_(text) {
  return /^#解除(\s+[A-Z0-9.-]{1,10})?$/i.test(String(text || '').trim());
}

// 「#解除 7203」の銘柄コード（ないときは空）
function extractTickerFromWatchRemovalCommand_(text) {
  const matched = String(text || '').trim().match(/^#解除\s+([A-Z0-9.-]{1,10})$/i);
  return matched ? normalizeTickerCode_(matched[1]) : '';
}

// グループの知らせでなければ止める（ここに来る前に振りわけているので、念のため）
function assertGroupEvent_(event) {
  if (!event.source || event.source.type !== 'group' || !event.source.groupId) {
    throw new Error('This bot currently supports group events only.');
  }
}

// 送った人の LINE の名前を聞き、名前が変わっていれば MEMBERS を直す。{ userId, displayName } を返す
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

// MEMBERS の名前が、いまの名前と同じか（同じなら書かない）
function isMemberRecordUpToDate_(groupId, userId, displayName) {
  const rows = getTableData_(SHEET_NAMES_.MEMBERS).rows;
  const rowIndex = findRowIndexByKeys_(rows, ['groupId', 'userId'], { groupId: groupId, userId: userId });
  if (rowIndex < 0) {
    return false;
  }
  const row = rows[rowIndex];
  return String(row.displayName || '') === String(displayName) && String(row.active) !== 'false';
}

// いまの版のルールを、もう確認しているか
function hasAgreedCurrentRule_(groupId, userId, ruleVersion) {
  if (getAllowedUserIds_().indexOf(String(userId)) < 0) {
    return false;
  }
  const rows = getTableData_(SHEET_NAMES_.MEMBERS).rows;
  const rowIndex = findRowIndexByKeys_(rows, ['groupId', 'userId'], { groupId: groupId, userId: userId });
  return rowIndex >= 0 && Number(rows[rowIndex].agreedRuleVersion) === Number(ruleVersion);
}

// このグループで使ってよい人か（管理者・使ってよいグループでルールを確認した人）
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

// このことばを使ってよいか（まだ確認していない人も、#ルール は使える）
function isAccessAllowedForCommand_(groupId, userId, text) {
  if (isAccessAllowed_(groupId, userId)) {
    return true;
  }

  if (!isGroupAccessAllowed_(groupId)) {
    return false;
  }

  return text === '#ルール';
}

// 管理者か（Script Properties の ADMIN_USER_IDS）
function isAdminUser_(userId) {
  return !!userId && getAdminUserIds_().indexOf(String(userId)) >= 0;
}

// 使ってよいグループか（ALLOWED_GROUP_IDS が空なら、どのグループでも）
function isGroupAccessAllowed_(groupId) {
  const allowedGroupIds = getAllowedGroupIds_();
  if (allowedGroupIds.length === 0) {
    return true;
  }
  return allowedGroupIds.indexOf(String(groupId || '').trim()) >= 0;
}

// 使えないグループで送られたときの文
function buildAccessDeniedText_() {
  return [
    'このグループでは、まだ使えません。',
    '使いたいときは、管理者に伝えてね。'
  ].join('\n');
}

// ルールを確認した人を、使ってよい人の一覧に足す
function addAllowedUserId_(userId) {
  if (!userId) {
    return getAllowedUserIds_();
  }
  return addScriptPropertyListValue_('ALLOWED_USER_IDS', userId);
}

// グループを、使ってよいグループの一覧に足す
function addAllowedGroupId_(groupId) {
  if (!groupId) {
    return getAllowedGroupIds_();
  }
  return addScriptPropertyListValue_('ALLOWED_GROUP_IDS', groupId);
}
