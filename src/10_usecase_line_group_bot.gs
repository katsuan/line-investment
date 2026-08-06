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

  sendReplyMessage_(event.replyToken, [buildJoinGuideTextMessage_()], groupId);
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

  const rule = getCurrentRuleForGroup_(groupId);
  sendReplyMessage_(event.replyToken, [buildWelcomeFlexMessage_(rule, displayNames)], groupId);
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
    logEventResult_(event, 'postback_ignored', 'ignored', 'unsupported action', '');
    return;
  }

  if (!isGroupAccessAllowed_(groupId)) {
    logEventResult_(event, 'postback_denied', 'ignored', 'group is not allowed', '');
    return;
  }

  const ruleVersion = Number(params.ruleVersion || DEFAULT_RULE_VERSION_);

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
      leadText: 'ルール確認を記録しました。\n利用を許可しました。',
    }),
  ], groupId);
  logEventResult_(event, 'agree_rules', 'success', 'rule agreement recorded', '');
}

function handleMessage_(event) {
  assertGroupEvent_(event);

  if (!event.message || event.message.type !== 'text') {
    logEventResult_(event, 'message_ignored', 'ignored', 'non-text message', '');
    return;
  }

  const text = normalizeCommandText_(event.message.text);
  const groupId = event.source.groupId;
  const userId = event.source.userId || '';
  const isSupportedCommand = isSupportedBotCommand_(text);

  if (!isSupportedCommand) {
    logEventResult_(event, 'message_ignored', 'ignored', 'not a supported command', '');
    return;
  }

  if (text === '#グループ許可') {
    if (!isAdminUser_(userId)) {
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: 'グループ許可は管理者のみ実行できます。',
      }], groupId);
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

    sendReplyMessage_(event.replyToken, [{
      type: 'text',
      text: 'このグループを利用許可しました。\n新規参加者には入室時にルール案内を送ります。',
    }], groupId);
    logEventResult_(event, 'command_group_allow', 'success', 'group allowed', groupId);
    return;
  }

  if (!isAccessAllowedForCommand_(groupId, userId, text)) {
    if (isGroupAccessAllowed_(groupId)) {
      const actor = getActorProfileForGroup_(groupId, userId);
      const rule = getCurrentRuleForGroup_(groupId);
      const displayNames = actor.displayName ? [actor.displayName] : [];
      sendReplyMessage_(event.replyToken, [buildRuleConfirmationPromptFlexMessage_(rule, displayNames)], groupId);
      logEventResult_(event, 'message_rule_prompt', 'success', 'rule confirmation prompted for unallowed user', text);
      return;
    }

    sendReplyMessage_(event.replyToken, [{
      type: 'text',
      text: buildAccessDeniedText_(),
    }], groupId);
    logEventResult_(event, 'message_denied', 'ignored', 'group access denied', text);
    return;
  }

  if (text === '#ルール') {
    const rule = getCurrentRuleForGroup_(groupId);
    sendReplyMessage_(event.replyToken, [buildRuleFlexMessage_(rule)], groupId);
    logEventResult_(event, 'command_rules', 'success', 'rule flex sent', '');
    return;
  }

  if (text === '#未確認') {
    const rule = getCurrentRuleForGroup_(groupId);
    const members = getUnconfirmedMembers_(groupId, rule.version);
    const message = members.length === 0
      ? '全員が現在のルールを確認済みです。'
      : [
        'ルール未確認メンバー',
        '',
        members.map(function(member) {
          return '・' + (member.displayName || member.userId);
        }).join('\n'),
        '',
        '現在のルール：Version ' + rule.version,
      ].join('\n');

    sendReplyMessage_(event.replyToken, [{
      type: 'text',
      text: message,
    }], groupId);
    logEventResult_(event, 'command_unconfirmed', 'success', 'unconfirmed members sent', '');
    return;
  }

  if (text === '#Bot設定') {
    const group = getGroupRecord_(groupId);
    sendReplyMessage_(event.replyToken, [buildBotSettingsFlexMessage_(group)], groupId);
    logEventResult_(event, 'command_bot_settings', 'success', 'settings flex sent', '');
    return;
  }

  if (text === '#使い方' || text === '#ヘルプ') {
    sendReplyMessage_(event.replyToken, [buildUsageGuideFlexMessage_()], groupId);
    logEventResult_(event, 'command_usage_guide', 'success', 'usage guide sent', text);
    return;
  }

  if (text === '#LIFF一覧') {
    const liffUrl = buildLiffAppLaunchUrl_(groupId, 'watchlist');
    if (!liffUrl) {
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: 'LIFF_APP_BASE_URL が未設定です。',
      }], groupId);
      logEventResult_(event, 'command_liff_launch', 'ignored', 'LIFF_APP_BASE_URL missing', '');
      return;
    }

    sendReplyMessage_(event.replyToken, [buildLiffLaunchFlexMessage_(liffUrl)], groupId);
    logEventResult_(event, 'command_liff_launch', 'success', 'liff launch url sent', liffUrl);
    return;
  }

  if (text === '#注目一覧') {
    const liffUrl = buildLiffAppLaunchUrl_(groupId, 'watchlist');
    if (!liffUrl) {
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: '画面の起動URLが未設定です。',
      }], groupId);
      logEventResult_(event, 'command_watchlist', 'ignored', 'LIFF_APP_BASE_URL missing', '');
      return;
    }

    sendReplyMessage_(event.replyToken, [buildLiffLaunchFlexMessage_(liffUrl)], groupId);
    logEventResult_(event, 'command_watchlist', 'success', 'watchlist launch sent', liffUrl);
    return;
  }

  if (text === '#注目実績') {
    const liffUrl = buildLiffAppLaunchUrl_(groupId, 'watchlist');
    if (!liffUrl) {
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: '画面の起動URLが未設定です。',
      }], groupId);
      logEventResult_(event, 'command_watch_performance', 'ignored', 'LIFF_APP_BASE_URL missing', '');
      return;
    }

    sendReplyMessage_(event.replyToken, [buildLiffLaunchFlexMessage_(liffUrl)], groupId);
    logEventResult_(event, 'command_watch_performance', 'success', 'watch performance launch sent', liffUrl);
    return;
  }

  if (isWatchRemovalCommand_(text)) {
    const ticker = extractTickerFromWatchRemovalCommand_(text);
    const actor = getActorProfileForGroup_(groupId, userId);

    if (!ticker) {
      if (!isAdminUser_(userId)) {
        sendReplyMessage_(event.replyToken, [{
          type: 'text',
          text: '全解除は管理者のみ実行できます。',
        }], groupId);
        logEventResult_(event, 'command_watch_remove_all', 'ignored', 'admin only', '');
        return;
      }

      const deactivatedRecords = deactivateAllActiveWatchlistRecords_(groupId, userId, actor.displayName);
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: deactivatedRecords.length === 0
          ? '解除対象の注目銘柄はありません。'
          : '注目銘柄を全解除しました。\n対象: ' + deactivatedRecords.length + '件',
      }], groupId);
      logEventResult_(event, 'command_watch_remove_all', 'success', 'all watchlist records deactivated', String(deactivatedRecords.length));
      return;
    }

    const existingRecord = getWatchlistRecordByTicker_(groupId, ticker);
    if (!existingRecord || String(existingRecord.active) === 'false') {
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: ticker + ' は注目銘柄に登録されていません。',
      }], groupId);
      logEventResult_(event, 'command_watch_remove', 'ignored', 'watchlist record not found', ticker);
      return;
    }

    if (!isAdminUser_(userId)) {
      const ownerUserId = String(existingRecord.addedByUserId || '');
      if (!ownerUserId || ownerUserId !== String(userId)) {
        sendReplyMessage_(event.replyToken, [{
          type: 'text',
          text: '単体解除は登録者本人または管理者のみ実行できます。',
        }], groupId);
        logEventResult_(event, 'command_watch_remove', 'ignored', 'not owner or admin', ticker);
        return;
      }
    }

    const deactivatedRecord = deactivateWatchlistRecord_(groupId, ticker, userId, actor.displayName);
    sendReplyMessage_(event.replyToken, [{
      type: 'text',
      text: '注目解除: ' + ticker + '\n' +
        toLineText_(deactivatedRecord.tickerName || existingRecord.tickerName || ticker, ticker) + ' を一覧から外しました。',
    }], groupId);
    logEventResult_(event, 'command_watch_remove', 'success', 'watchlist record deactivated', ticker);
    return;
  }

  if (isSupportedWatchTickerCommand_(text)) {
    const ticker = normalizeTickerCode_(text.slice(1));
    if (!ticker) {
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: '登録するティッカーを指定してください。\n例: #7203 / #AAPL / #MCD / #GOOGL',
      }], groupId);
      logEventResult_(event, 'command_watch_add', 'ignored', 'ticker missing', '');
      return;
    }

    const actor = getActorProfileForGroup_(groupId, userId);
    const activeRecord = getActiveWatchlistRecordByTicker_(groupId, ticker);
    let quoteAtRegistration = null;
    try {
      quoteAtRegistration = getMarketQuoteByTicker_(ticker, { forceRefresh: true });
    } catch (error) {
      logEventResult_(event, 'market_quote_fetch', 'error', 'quote fetch failed on watch add', buildErrorMessage_(error));
    }

    if (!hasUsableQuoteForWatchAdd_(quoteAtRegistration)) {
      sendReplyMessage_(event.replyToken, [{
        type: 'text',
        text: ticker + ' は見つかりませんでした。',
      }], groupId);
      logEventResult_(event, 'command_watch_add', 'ignored', 'watch add quote unavailable', ticker);
      return;
    }

    if (activeRecord) {
      sendReplyMessage_(event.replyToken, [buildWatchAlreadyActiveFlexMessage_(activeRecord, quoteAtRegistration)], groupId);
      logEventResult_(event, 'command_watch_add', 'ignored', 'watchlist record already active', ticker);
      return;
    }

    const record = createWatchlistRecord_({
      groupId: groupId,
      ticker: ticker,
      tickerName: quoteAtRegistration && quoteAtRegistration.name ? quoteAtRegistration.name : '',
      addedAt: nowJst_(),
      addedMarketTicker: quoteAtRegistration && quoteAtRegistration.marketTicker ? quoteAtRegistration.marketTicker : composeMarketTicker_(ticker),
      addedPrice: quoteAtRegistration && quoteAtRegistration.price ? quoteAtRegistration.price : '',
      addedMarketCap: quoteAtRegistration && quoteAtRegistration.marketCap ? quoteAtRegistration.marketCap : '',
      addedChangePercent: quoteAtRegistration && quoteAtRegistration.changePercent ? quoteAtRegistration.changePercent : '',
      addedTradeTime: quoteAtRegistration && quoteAtRegistration.tradeTime ? quoteAtRegistration.tradeTime : '',
      addedByUserId: userId,
      addedByDisplayName: actor.displayName,
      active: true,
    });

    sendReplyMessage_(event.replyToken, [buildWatchRegistrationFlexMessage_(record, quoteAtRegistration)], groupId);
    logEventResult_(event, 'command_watch_add', 'success', 'watchlist record created', ticker);
    return;
  }

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

  if (displayName) {
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

function hydrateRecentWatchlistWithCurrentQuotes_(records, options) {
  const settings = options || {};
  const recentRecords = records.slice(0, DEFAULT_WATCHLIST_RECENT_LIMIT_);
  const quoteMap = getMarketQuoteMapByTickers_(recentRecords.map(function(record) {
    return record.ticker;
  }), {
    forceRefresh: !!settings.forceRefresh,
    useLatestCacheOnly: !settings.forceRefresh,
  });

  return recentRecords.map(function(record) {
    return Object.assign({}, record, {
      currentQuote: quoteMap[normalizeTickerCode_(record.ticker)] || null,
    });
  });
}

function isWatchRemovalCommand_(text) {
  return /^#解除(\s+[A-Z0-9.-]{1,10})?$/i.test(String(text || '').trim());
}

function extractTickerFromWatchRemovalCommand_(text) {
  const matched = String(text || '').trim().match(/^#解除\s+([A-Z0-9.-]{1,10})$/i);
  return matched ? normalizeTickerCode_(matched[1]) : '';
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
    'このBotは現在、許可されたユーザー・グループのみ利用できます。',
    '利用を希望する場合は管理者に連絡してください。'
  ].join('\n');
}

function isSupportedBotCommand_(text) {
  return (
    text === '#ルール' ||
    text === '#未確認' ||
    text === '#グループ許可' ||
    text === '#使い方' ||
    text === '#ヘルプ' ||
    text === '#LIFF一覧' ||
    text === '#Bot設定' ||
    text === '#注目一覧' ||
    text === '#注目実績' ||
    isWatchRemovalCommand_(text) ||
    isSupportedWatchTickerCommand_(text)
  );
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

function buildWatchPerformanceStats_(groupId, options) {
  const settings = options || {};
  const records = getActiveWatchlistByGroup_(groupId);
  const quoteMap = getMarketQuoteMapByTickers_(records.map(function(record) {
    return record.ticker;
  }), {
    forceRefresh: !!settings.forceRefresh,
    useLatestCacheOnly: !settings.forceRefresh,
  });
  const statsByUser = {};
  records.forEach(function(record) {
    const key = String(record.addedByUserId || record.addedByDisplayName || 'unknown');
    if (!statsByUser[key]) {
      statsByUser[key] = {
        userId: record.addedByUserId || '',
        displayName: record.addedByDisplayName || record.addedByUserId || '不明',
        pictureUrl: '',
        pickCount: 0,
        deltaSum: 0,
        deltaCount: 0,
      };
    }

    statsByUser[key].pickCount += 1;

    const quote = quoteMap[normalizeTickerCode_(record.ticker)] || null;
    const current = Number(quote && quote.price);
    const base = Number(record.addedPrice);
    if (!Number.isNaN(current) && !Number.isNaN(base) && base !== 0) {
      statsByUser[key].deltaSum += ((current - base) / base) * 100;
      statsByUser[key].deltaCount += 1;
    }
  });

  const rows = Object.keys(statsByUser)
    .map(function(key) {
      const stat = statsByUser[key];
      if (stat.userId) {
        try {
          const profile = getGroupMemberProfile_(groupId, stat.userId);
          stat.displayName = profile.displayName || stat.displayName;
          stat.pictureUrl = profile.pictureUrl || '';
        } catch (error) {
          stat.pictureUrl = '';
        }
      }
      const average = stat.deltaCount > 0 ? (stat.deltaSum / stat.deltaCount) : null;
      return {
        userId: stat.userId,
        displayName: stat.displayName,
        pictureUrl: stat.pictureUrl,
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
  let previousPickCount = null;

  rows.forEach(function(row, index) {
    const rankingKey = row.rankingAverageDelta + '|' + row.pickCount;
    const previousRankingKey = previousPickCount === null
      ? null
      : previousPickCount;
    if (previousRankingKey === null || rankingKey !== previousRankingKey) {
      currentRank = index + 1;
      previousPickCount = rankingKey;
    }

    if (currentRank <= 5) {
      limitedRows.push(Object.assign({}, row, {
        rank: currentRank,
      }));
    }
  });

  return {
    rows: limitedRows,
    totalCount: records.length,
  };
}

function buildNonTopRandomWatchSpotlightData_(groupId, stats, options) {
  const rows = (stats && stats.rows) || [];
  if (rows.length <= 1) {
    return null;
  }

  const topRow = rows[0];
  const candidates = rows.slice(1).map(function(row) {
    return {
      userId: row.userId || '',
      displayName: row.displayName || '不明',
    };
  });
  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  return buildWatchSpotlightDataForUser_(groupId, selected.userId, selected.displayName, Object.assign({
    limit: 3,
    sortByDeltaDesc: false,
    title: 'ランダム ' + toLineText_(selected.displayName, '不明'),
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
  const records = getActiveWatchlistByGroup_(groupId);
  const filteredRecords = records.filter(function(record) {
    if (userId) {
      return String(record.addedByUserId || '') === String(userId);
    }
    return String(record.addedByDisplayName || record.addedByUserId || '') === String(fallbackDisplayName || '');
  });
  if (filteredRecords.length === 0) {
    return null;
  }

  let displayName = fallbackDisplayName || filteredRecords[0].addedByDisplayName || filteredRecords[0].addedByUserId || '不明';
  let pictureUrl = '';
  if (userId) {
    try {
      const profile = getGroupMemberProfile_(groupId, userId);
      displayName = profile.displayName || displayName;
      pictureUrl = profile.pictureUrl || '';
    } catch (error) {
      pictureUrl = '';
    }
  }

  const quoteMap = getMarketQuoteMapByTickers_(filteredRecords.map(function(row) {
    return row.ticker;
  }), {
    forceRefresh: !!settings.forceRefresh,
    useLatestCacheOnly: !settings.forceRefresh,
  });

  const hydratedRecords = filteredRecords.map(function(record) {
    return Object.assign({}, record, {
      currentQuote: quoteMap[normalizeTickerCode_(record.ticker)] || null,
    });
  });

  hydratedRecords.forEach(function(record) {
    const current = Number(record.currentQuote && record.currentQuote.price);
    const base = Number(record.addedPrice);
    record.currentDelta = (!Number.isNaN(current) && !Number.isNaN(base) && base !== 0)
      ? ((current - base) / base) * 100
      : null;
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
    displayName: displayName,
    pictureUrl: pictureUrl,
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
    const cachedAt = record.currentQuote && record.currentQuote.fetchedAt ? record.currentQuote.fetchedAt : '';
    if (cachedAt && String(cachedAt) > String(latestCachedAt)) {
      latestCachedAt = cachedAt;
    }
  });
  return {
    totalCount: records.length,
    latestCachedAt: latestCachedAt,
    items: hydratedRecords.map(function(record) {
      const quote = record.currentQuote || null;
      const currentPrice = quote && quote.price ? quote.price : '';
      const useMarketCapDelta = quote && quote.marketCap && record.addedMarketCap;
      return {
        ticker: record.ticker,
        name: (quote && quote.name) || record.tickerName || record.ticker,
        marketTicker: record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker),
        marketFlag: buildMarketFlagEmoji_(record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker)),
        currentPrice: currentPrice || '',
        addedPrice: record.addedPrice || '',
        performanceDelta: useMarketCapDelta
          ? formatSignedPercentDeltaFromBaseScaled_(quote.marketCap, record.addedMarketCap)
          : formatSignedPercentDeltaFromBase_(currentPrice, record.addedPrice),
        marketCap: quote && quote.marketCap ? quote.marketCap : '',
        addedMarketCap: record.addedMarketCap || '',
        marketCapDelta: quote && quote.marketCap && record.addedMarketCap
          ? formatSignedPercentDeltaFromBaseScaled_(quote.marketCap, record.addedMarketCap)
          : '',
        per: quote && quote.per ? quote.per : '',
        volume: quote && quote.volume ? quote.volume : '',
        addedAt: formatDateDisplayOnly_(record.addedAt),
        addedByDisplayName: record.addedByDisplayName || record.addedByUserId || '',
        kabutanUrl: buildKabutanUrl_(record.ticker),
        source: 'Google Finance',
      };
    }),
    cached: !settings.forceRefresh,
  };
}

function buildLiffPerformancePayload_(groupId, options) {
  const settings = options || {};
  const stats = buildWatchPerformanceStats_(groupId, {
    forceRefresh: !!settings.forceRefresh,
  });
  const topSpotlight = buildTopPerformerWatchSpotlightData_(groupId, stats, {
    forceRefresh: !!settings.forceRefresh,
  });
  const randomSpotlight = buildNonTopRandomWatchSpotlightData_(groupId, stats, {
    forceRefresh: !!settings.forceRefresh,
  });

  function mapSpotlight_(spotlight) {
    if (!spotlight) {
      return null;
    }
    return {
      title: spotlight.title,
      userId: spotlight.userId,
      displayName: spotlight.displayName,
      pictureUrl: spotlight.pictureUrl,
      pickCount: spotlight.pickCount,
      averageDelta: spotlight.averageDelta,
      items: (spotlight.records || []).map(function(record) {
        const quote = record.currentQuote || null;
        return {
          ticker: record.ticker,
          name: (quote && quote.name) || record.tickerName || record.ticker,
          marketTicker: record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker),
          marketFlag: buildMarketFlagEmoji_(record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker)),
          currentPrice: quote && quote.price ? quote.price : '',
          addedPrice: record.addedPrice || '',
          currentDelta: record.currentDelta,
          currentDeltaText: formatSignedPercentDeltaFromBase_(quote && quote.price ? quote.price : '', record.addedPrice),
          addedAt: formatDateDisplayOnly_(record.addedAt),
          kabutanUrl: buildKabutanUrl_(record.ticker),
        };
      }),
    };
  }

  return {
    totalCount: stats.totalCount || 0,
    ranking: (stats.rows || []).map(function(row) {
      return {
        rank: row.rank,
        userId: row.userId,
        displayName: row.displayName,
        pictureUrl: row.pictureUrl,
        pickCount: row.pickCount,
        averageDelta: row.averageDelta,
      };
    }),
    topSpotlight: mapSpotlight_(topSpotlight),
    randomSpotlight: mapSpotlight_(randomSpotlight),
    cached: !settings.forceRefresh,
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
  const currentPrice = quote && quote.price ? quote.price : '';
  const marketCap = quote && quote.marketCap ? quote.marketCap : '';

  return {
    ticker: normalizedTicker,
    name: (quote && quote.name) || (activeRecord && activeRecord.tickerName) || normalizedTicker,
    marketTicker: marketTicker,
    marketFlag: buildMarketFlagEmoji_(marketTicker),
    currentPrice: currentPrice || '',
    changePercent: quote && quote.changePercent ? quote.changePercent : '',
    marketCap: marketCap || '',
    per: quote && quote.per ? quote.per : '',
    volume: quote && quote.volume ? quote.volume : '',
    kabutanUrl: buildKabutanUrl_(normalizedTicker),
    source: 'Google Finance',
    isWatched: !!activeRecord,
    watchedBy: activeRecord ? (activeRecord.addedByDisplayName || activeRecord.addedByUserId || '') : '',
    watchedAt: activeRecord ? formatDateDisplayOnly_(activeRecord.addedAt) : '',
    addedPrice: activeRecord ? (activeRecord.addedPrice || '') : '',
    performanceDelta: activeRecord
      ? (marketCap && activeRecord.addedMarketCap
        ? formatSignedPercentDeltaFromBaseScaled_(marketCap, activeRecord.addedMarketCap)
        : formatSignedPercentDeltaFromBase_(currentPrice, activeRecord.addedPrice))
      : '',
    cached: !settings.forceRefresh,
  };
}
