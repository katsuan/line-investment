function processLineGroupBotWebhookRequest_(request) {
  try {
    const body = JSON.parse((request && request.postData && request.postData.contents) || '{}');
    const events = body.events || [];

    events.forEach(function(event) {
      try {
        routeLineWebhookEvent_(event);
      } catch (error) {
        logEventResult_(event, 'event_error', 'error', safeJsonStringify_(event), buildErrorMessage_(error));
      }
    });
  } catch (error) {
    appendEventLog_({
      eventType: 'webhook_parse',
      action: 'runLineGroupBotPost',
      result: 'error',
      detail: request && request.postData ? request.postData.contents : '',
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
  const userId = normalizeCommandText_(params.userId || '');

  if (!groupId || !userId) {
    return createJsonOutput_({
      ok: false,
      error: 'groupId and userId are required.',
    });
  }

  if (!isAccessAllowed_(groupId, userId)) {
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
      data: buildLiffWatchlistPayload_(groupId),
    });
  }

  if (view === 'performance') {
    return createJsonOutput_({
      ok: true,
      groupId: groupId,
      view: view,
      generatedAt: nowJst_(),
      data: buildLiffPerformancePayload_(groupId),
    });
  }

  if (view === 'quote') {
    const ticker = normalizeTickerCode_(params.ticker || '');
    if (!ticker) {
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
      data: buildLiffQuotePayload_(groupId, ticker),
    });
  }

  return createJsonOutput_({
    ok: false,
    error: 'unsupported view',
  });
}

function routeLineWebhookEvent_(event) {
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
