/**
 * 入口：外から呼ばれる関数だけ（投資グループボット）。名前は変えない（変えると動かなくなる）。
 *   doPost・doGet … このプロジェクトをウェブアプリにしたとき（LINE の Webhook・画面からの問い合わせ）
 *   runLineGroupBotPost・runLineGroupBotGet … 入口の GAS（親）から、ライブラリとして呼ばれる
 * 中身の処理は 02_router にある。
 */

// LINE の Webhook（このプロジェクトをウェブアプリにしたとき）。中身は runLineGroupBotPost
function doPost(e) { // qcheck-ok: G3 合言葉と本人の確かめは 02_router・03_auth（isWebhookKeyAccepted_・resolveLiffRequestUserId_）
  return runLineGroupBotPost(e);
}

// 画面（LIFF）からの問い合わせ・ようすを見る問い合わせ。中身は runLineGroupBotGet
function doGet(e) {
  return runLineGroupBotGet(e);
}

// LINE の Webhook の入口（入口の GAS からライブラリとして呼ばれる）。いつも「OK」を返す
function runLineGroupBotPost(request) {
  return processLineGroupBotWebhookRequest_(request);
}

// 画面からの問い合わせの入口（入口の GAS からライブラリとして呼ばれる）。JSON か文字を返す
function runLineGroupBotGet(request) {
  return processLineGroupBotHealthCheckRequest_(request);
}
