/**
 * 呼ばれたものを、中身の処理に振りわける。
 *   LINE の Webhook（合言葉を確かめる）→ グループの知らせは 10_bot、1対1 は 40_test_window
 *   画面（LIFF）からの問い合わせ → 12_liff_api、ようすを見るだけの問い合わせ（health）
 * 01_entry から呼ばれる。
 */

// Webhook の合言葉を確かめ、知らせを1つずつ振りわける。1つが失敗してもほかは続け、失敗は EVENT_LOG に残す。いつも「OK」を返す
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

// 知らせ1つを種類で振りわける：1対1 はテストの窓口、グループは入った・メンバーが入った・ボタン・ことば。ほかのトークは何もしない
function routeLineWebhookEvent_(event) {
  if (event && event.source && event.source.type === 'user') {
    handleDirectChatEvent_(event); // 1対1：管理者のテストの窓口（40_test_window）だけ。ほかは返事も記録もしない
    return;
  }
  if (!event || !event.source || event.source.type !== 'group' || !event.source.groupId) {
    return; // グループの外（複数人トーク）の知らせには、返事も記録もしない
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

// ?action= で振りわける：liff_data は画面への中身、health・ほかは動いているかの文字だけ（個人の情報は返さない）
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
