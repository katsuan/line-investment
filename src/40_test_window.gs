/**
 * 管理者のテストの窓口（使い心地の決まり H11）。
 * 管理者が、ボットとの 1対1 のトークで「#テスト」（#test も）と送ると、🧪 テストのカードが返る。
 * 見本（ためしのデータ）・自己点検・カードが断られたときの文を、押すだけで見られる。
 * 本物の記録・シート・グループには書かない、送らない。返事（reply）だけで返し、push は使わない。
 * 02_router から呼ばれる（1対1 のトークの知らせ）。
 */

const ADMIN_TEST_SAMPLES_PER_PAGE_ = 4; // 1回の返事は5通まで。見本4通＋説明のぶん

const ADMIN_TEST_MARK_ = '🧪';

// 「#テスト」「#test」か
function isAdminTestCommand_(text) {
  return /^#(テスト|test)$/i.test(String(text || ''));
}

// 1:1 のトークの知らせ。管理者のテストの窓口だけを受けつけ、ほかは黙る（記録もしない）
function handleDirectChatEvent_(event) {
  const userId = (event.source && event.source.userId) || '';
  if (!isAdminUser_(userId) || !event.replyToken) {
    return;
  }

  if (event.type === 'message' && event.message && event.message.type === 'text') {
    if (isAdminTestCommand_(normalizeIncomingCommandText_(event.message.text))) {
      replyAdminTest_(event.replyToken, 'menu');
    }
    return;
  }

  if (event.type === 'postback') {
    const params = parsePostbackData_((event.postback || {}).data);
    if (params.action === 'qtest') {
      replyAdminTest_(event.replyToken, params.kind || 'menu', Number(params.page || 1));
    }
  }
}

// テストの窓口の返事：見本・自己点検・断られたとき・テストのカードのどれか（下にテストのボタン）
function replyAdminTest_(replyToken, kind, page) {
  let messages;
  if (kind === 'samples') {
    messages = buildAdminTestSamplePage_(page);
  } else if (kind === 'check') {
    messages = [buildAdminTestSelfCheckMessage_()];
  } else if (kind === 'fallback') {
    messages = [buildAdminTestFallbackMessage_()];
  } else if (kind === 'sample_tap') {
    messages = [{ type: 'text', text: ADMIN_TEST_MARK_ + ' 見本のボタンを押しました。本物では、このことばがグループに送られます（いまは何も書いていません）。' }];
  } else {
    messages = [buildAdminTestMenuFlexMessage_()];
  }
  // 送り主はグループの名前を使わない（groupId を渡さない＝設定にも書かない）
  sendReplyMessage_(replyToken, messages, '', { quickReply: buildAdminTestQuickReply_() });
}

// 見本に使う画面の URL（ないときは例の URL）
function getAdminTestSampleUrl_() {
  return getLiffAppBaseUrl_() || 'https://example.com/liff/';
}

// 見本に使う注目の行と株価（ためしのデータ）
function buildAdminTestSampleWatch_() {
  return {
    record: {
      groupId: 'Cqtest', ticker: '7203', tickerName: 'トヨタ自動車', addedAt: nowJst_(),
      addedMarketTicker: '7203:TYO', addedPrice: '3000', addedMarketCap: '', addedByDisplayName: 'ためしの人', active: true,
    },
    quote: { ticker: '7203', marketTicker: '7203:TYO', name: 'トヨタ自動車', price: '3100', changePercent: '+1.20', marketCap: '48.5兆', per: '9.8', volume: '12345600' },
  };
}

// 返事の見本を全部（カードと文。ためしのデータ）
function buildAdminTestSampleMessages_() {
  const rule = buildDefaultRuleRecord_();
  const url = getAdminTestSampleUrl_();
  const watch = buildAdminTestSampleWatch_();
  const record = watch.record;
  const quote = watch.quote;
  return [
    buildJoinGuideFlexMessage_(url),
    buildWelcomeFlexMessage_(rule, ['ためしの人'], []),
    buildRuleConfirmationPromptFlexMessage_(rule, ['ためしの人'], []),
    buildRuleFlexMessage_(rule),
    buildUnconfirmedMembersFlexMessage_(rule, [{ displayName: 'ためしの人' }, { displayName: '' }]),
    buildUnconfirmedMembersFlexMessage_(rule, []),
    buildUsageGuideFlexMessage_({ watchlistUrl: url, leadText: 'ためしの人さん、ルールの確認を記録しました。今日から使えます。' }),
    buildWatchRegistrationFlexMessage_(record, quote, url),
    buildWatchAlreadyActiveFlexMessage_(record, quote, url),
    buildLiffLaunchFlexMessage_(url, 'watchlist'),
    buildLiffLaunchFlexMessage_(url, 'performance'),
    buildBotSettingsFlexMessage_(null, { showAccessCounts: false }),
    { type: 'text', text: '注目から外しました：7203\nトヨタ自動車' },
    { type: 'text', text: 'XYZQ の株価が見つかりませんでした。\nコードを確かめて、もう一度送ってね。\n例：#7203（日本株）・#AAPL（米国株）' },
    { type: 'text', text: 'ルールが新しくなりました。読んでから、もう一度「確認しました」を押してね。' },
    { type: 'text', text: 'このボタンは、案内した人のためのものです。\nルールは「#ルール」で見られます。' },
  ];
}

// 見本を何回に分けて見せるか
function getAdminTestSamplePageCount_() {
  return Math.ceil(buildAdminTestSampleMessages_().length / ADMIN_TEST_SAMPLES_PER_PAGE_);
}

// 見本のその回の分（説明の文＋見本4通。すべて 🧪 付き）
function buildAdminTestSamplePage_(page) {
  const all = buildAdminTestSampleMessages_();
  const pageCount = Math.ceil(all.length / ADMIN_TEST_SAMPLES_PER_PAGE_);
  const current = Math.min(Math.max(Math.floor(page) || 1, 1), pageCount);
  const start = (current - 1) * ADMIN_TEST_SAMPLES_PER_PAGE_;
  const samples = all.slice(start, start + ADMIN_TEST_SAMPLES_PER_PAGE_).map(markAsAdminTestSample_);
  return [{
    type: 'text',
    text: ADMIN_TEST_MARK_ + ' 見本 ' + current + '/' + pageCount + '（' + (start + 1) + '〜' + (start + samples.length) + '通目）。中身はためしのデータです。カードのボタンは見本なので、押しても本物には書きません。',
  }].concat(samples);
}

// 見本だとわかるように 🧪 を付ける。押せるものは、本物に書かないもの（画面・URL を開く）だけ残す
function markAsAdminTestSample_(message) {
  const copy = JSON.parse(JSON.stringify(message));
  delete copy.quickReply;
  if (copy.type === 'text') {
    copy.text = ADMIN_TEST_MARK_ + '（見本）' + copy.text;
    return copy;
  }
  copy.altText = (ADMIN_TEST_MARK_ + '（見本）' + (copy.altText || '')).slice(0, 400);
  const bubble = copy.contents || {};
  const firstHeaderText = bubble.header && bubble.header.contents && bubble.header.contents[0];
  if (firstHeaderText && firstHeaderText.type === 'text') {
    firstHeaderText.text = ADMIN_TEST_MARK_ + ' 見本・' + firstHeaderText.text;
  } else if (bubble.body && bubble.body.contents) {
    bubble.body.contents.unshift({ type: 'text', text: ADMIN_TEST_MARK_ + ' 見本', size: 'xs', color: '#666666' });
  }
  disableNonUriActions_(bubble);
  return copy;
}

// 見本の中の「文字を送る・postback」は、押すとグループ用のことばが 1:1 に届くだけなので、文字を送らない形（入力欄に入れるだけ）にする
function disableNonUriActions_(node) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (node.action && node.action.type !== 'uri') {
    const label = node.action.label;
    const text = node.action.text || node.action.fillInText || '';
    node.action = {
      type: 'postback',
      data: 'action=qtest&kind=sample_tap',
      inputOption: 'openKeyboard',
      fillInText: text,
    };
    if (label) {
      node.action.label = label;
    }
  }
  Object.keys(node).forEach(function(key) {
    disableNonUriActions_(node[key]);
  });
}

// 自己点検（qCheckAll）の結果を文にする
function buildAdminTestSelfCheckMessage_() {
  let summary;
  try {
    const result = qCheckAll();
    const count = { '✅': 0, '⚠️': 0, '❌': 0 };
    const lines = result.results.map(function(r) {
      count[r.level] = (count[r.level] || 0) + 1;
      return r.level + ' [' + r.area + '] ' + r.text;
    });
    summary = [
      ADMIN_TEST_MARK_ + ' 自己点検（設定・シート・LINE・カード）',
      '✅ ' + count['✅'] + '　⚠️ ' + count['⚠️'] + '　❌ ' + count['❌'],
      '',
    ].concat(lines).join('\n');
  } catch (error) {
    summary = ADMIN_TEST_MARK_ + ' 自己点検が途中で止まりました。GAS エディタで qCheckAll を動かして、実行ログを見てね。';
  }
  return { type: 'text', text: summary.slice(0, 4900) };
}

// カードが断られたときにグループに届く文の見本
function buildAdminTestFallbackMessage_() {
  const watch = buildAdminTestSampleWatch_();
  const sample = buildWatchRegistrationFlexMessage_(watch.record, watch.quote, getAdminTestSampleUrl_());
  return {
    type: 'text',
    text: (ADMIN_TEST_MARK_ + ' カードが断られたとき、グループにはこの文だけが届きます（本物は push で送りなおし、原因は LAST_LINE_ERRORS と EVENT_LOG に残ります）。\n\n' +
      buildFlexFallbackText_(sample) + '\n\n（カードを出せなかったので、文字だけで返しました）').slice(0, 4900),
  };
}

// 🧪 テストのカード（何を試せるか）
function buildAdminTestMenuFlexMessage_() {
  const pageCount = getAdminTestSamplePageCount_();
  const items = [
    '見本：返事のカードと文を全部（' + pageCount + '回に分けて）',
    '自己点検：設定・シート・LINE・カードのようす',
    '断られたとき：カードが通らないときの文の返事',
  ];
  return {
    type: 'flex',
    altText: ADMIN_TEST_MARK_ + ' テスト：見本・自己点検・断られたときの返事を試せます',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: buildCardBandHeader_(ADMIN_TEST_MARK_ + ' 管理者だけ', 'テストの窓口'),
      styles: buildCardBandStyles_(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: 'トークのいちばん下のボタンで試せます。本物の記録・シート・グループには書きません。',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: items.map(function(item) {
              return '・' + item;
            }).join('\n'),
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
          {
            type: 'text',
            text: '季節の絵文字は、このボットでは使っていません。ボタンが消えたら「#テスト」を送ると出なおします。',
            size: 'xxs',
            color: '#666666',
            wrap: true,
          },
        ],
      },
    },
  };
}

// 押すと返事が来るものだけ（1回きりではないが、いまの画面の続きなのでクイックリプライに。H2）
function buildAdminTestQuickReply_() {
  const items = [];
  const pageCount = getAdminTestSamplePageCount_();
  for (let page = 1; page <= pageCount; page += 1) {
    items.push(buildAdminTestQuickReplyItem_(ADMIN_TEST_MARK_ + ' 見本 ' + page + '/' + pageCount, 'kind=samples&page=' + page));
  }
  items.push(buildAdminTestQuickReplyItem_('🩺 自己点検', 'kind=check'));
  items.push(buildAdminTestQuickReplyItem_('⚠️ 断られたとき', 'kind=fallback'));
  items.push(buildAdminTestQuickReplyItem_(ADMIN_TEST_MARK_ + ' テストのカード', 'kind=menu'));
  return { items: items.slice(0, 13) };
}

// テストの窓口のクイックリプライ1つ（postback）
function buildAdminTestQuickReplyItem_(label, query) {
  return {
    type: 'action',
    action: { type: 'postback', label: label, data: 'action=qtest&' + query, displayText: label },
  };
}
