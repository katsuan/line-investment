function processLineGroupBotWebhookRequest_(request) {
  if (!isWebhookKeyAccepted_(request)) {
    return createOkTextOutput_(); // 合言葉がちがう知らせは、何もしない（記録もしない）
  }

  try {
    const body = JSON.parse((request && request.postData && request.postData.contents) || '{}');
    const events = body.events || [];

    events.forEach(function(event) {
      try {
        routeLineWebhookEvent_(event);
      } catch (error) {
        logEventResult_(event, 'event_error', 'error', safeJsonStringify_(event).slice(0, 1000), buildErrorMessage_(error));
      }
    });
  } catch (error) {
    appendEventLog_({
      eventType: 'webhook_parse',
      action: 'runLineGroupBotPost',
      result: 'error',
      detail: request && request.postData ? String(request.postData.contents || '').slice(0, 500) : '',
      errorMessage: buildErrorMessage_(error),
    });
  }

  return createOkTextOutput_();
}

function processLineGroupBotHealthCheckRequest_(request) {
  const action = normalizeCommandText_((request && request.parameter && request.parameter.action) || '');
  if (action === 'liff_data') {
    return processLineGroupBotLiffDataRequest_(request);
  }

  const text = action === 'health'
    ? 'LINE Investment Group Bot is healthy.'
    : 'LINE Investment Group Bot is running.';

  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.TEXT);
}

function processLineGroupBotLiffDataRequest_(request) {
  const params = (request && request.parameter) || {};
  const groupId = normalizeCommandText_(params.groupId || '');
  const view = normalizeCommandText_(params.view || 'watchlist');
  const forceRefresh = String(params.refresh || '') === '1';

  if (!isValidLineGroupId_(groupId)) {
    return createJsonOutput_({
      ok: false,
      error: 'groupId is required.',
    });
  }

  // 本人は、LINE に確かめた印（ID トークンかアクセストークン）で決める。画面から送られた userId は使わない
  const userId = resolveLiffRequestUserId_(params);
  if (!userId) {
    return createJsonOutput_({
      ok: false,
      error: 'login required',
    });
  }

  // 管理者のほかは、そのグループにいまいて、ルールを確認した人だけ
  if (!isAccessAllowed_(groupId, userId) || (!isAdminUser_(userId) && !isLineGroupMember_(groupId, userId))) {
    return createJsonOutput_({
      ok: false,
      error: 'access denied',
    });
  }

  if (view === 'watchlist') {
    return createJsonOutput_({
      ok: true,
      groupId: groupId,
      view: view,
      generatedAt: nowJst_(),
      data: buildLiffWatchlistPayload_(groupId, {
        forceRefresh: forceRefresh,
      }),
    });
  }

  if (view === 'performance') {
    return createJsonOutput_({
      ok: true,
      groupId: groupId,
      view: view,
      generatedAt: nowJst_(),
      data: buildLiffPerformancePayload_(groupId, {
        forceRefresh: forceRefresh,
      }),
    });
  }

  if (view === 'quote') {
    const ticker = normalizeTickerCode_(params.ticker || '');
    if (!isValidTickerCode_(ticker)) {
      return createJsonOutput_({
        ok: false,
        error: 'ticker is required for quote view',
      });
    }

    return createJsonOutput_({
      ok: true,
      groupId: groupId,
      view: view,
      generatedAt: nowJst_(),
      data: buildLiffQuotePayload_(groupId, ticker, {
        forceRefresh: forceRefresh,
      }),
    });
  }

  return createJsonOutput_({
    ok: false,
    error: 'unsupported view',
  });
}

function routeLineWebhookEvent_(event) {
  if (!event || !event.source || event.source.type !== 'group' || !event.source.groupId) {
    return; // グループの外（1対1・複数人トーク）の知らせには、返事も記録もしない
  }
  switch (event.type) {
    case 'join':
      handleJoin_(event);
      return;
    case 'memberJoined':
      handleMemberJoined_(event);
      return;
    case 'postback':
      handlePostback_(event);
      return;
    case 'message':
      handleMessage_(event);
      return;
    default:
      logEventResult_(event, 'event_ignored', 'ignored', 'unsupported event type: ' + event.type, '');
  }
}
