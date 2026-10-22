// qcheck-ok: G3 合言葉と本人の確かめは 01_router（isWebhookKeyAccepted_・resolveLiffRequestUserId_）
function doPost(e) {
  return runLineGroupBotPost(e);
}

function doGet(e) {
  return runLineGroupBotGet(e);
}

function runLineGroupBotPost(request) {
  return processLineGroupBotWebhookRequest_(request);
}

function runLineGroupBotGet(request) {
  return processLineGroupBotHealthCheckRequest_(request);
}
