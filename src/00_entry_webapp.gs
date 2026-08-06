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
