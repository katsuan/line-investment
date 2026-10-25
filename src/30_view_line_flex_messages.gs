// ボットがグループに入ったとき：何ができるかを1枚に（あとで見返せるようにカードで。H10）
function buildJoinGuideFlexMessage_(watchlistUrl) {
  return buildUsageGuideFlexMessage_({
    leadText: 'Botを追加しました。新しく入った人に、グループの目的とルールを案内します。ルールを確認した人は、銘柄を注目に入れたり、一覧を見たりできます。',
    watchlistUrl: watchlistUrl,
    altText: 'Botを追加しました：#7203 で注目に入れる・#注目一覧 で一覧を見る・#ルール でルールを見る',
    bandText: '👋 Botを追加しました',
    showRuleRow: true,
  });
}

// ルールをまだ確認していない人の一覧（H10：一覧はカードに）
function buildUnconfirmedMembersFlexMessage_(rule, members) {
  const names = members.map(function(member) {
    return '・' + toLineText_(member.displayName, '（名前がわからない人）');
  });
  const isEmpty = members.length === 0;
  return {
    type: 'flex',
    altText: isEmpty
      ? '全員が、いまのルールを確認しています'
      : 'ルールをまだ確認していない人：' + members.length + '人',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: buildCardBandHeader_('📜 ルール・Version ' + rule.version, isEmpty ? '全員が確認しています' : 'まだ確認していない人 ' + members.length + '人'),
      styles: buildCardBandStyles_(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: isEmpty ? '全員が、いまのルールを確認しています。' : names.join('\n'),
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: '確認は、トークで「#ルール」を送ると出る「✅ ルールを確認しました」でできます。',
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          buildCardButton_('📜 ルールを見る', { type: 'message', text: '#ルール' }, true),
        ],
      },
    },
  };
}

function buildWelcomeFlexMessage_(rule, displayNames, targetUserIds) {
  const namesText = displayNames.length > 0 ? displayNames.join('、') + 'さん' : '新しいメンバーさん';
  return buildRuleAgreementCard_({
    altText: '投資情報共有グループへようこそ',
    header: buildCardBandHeader_('👋 ようこそ', '投資情報共有グループへようこそ'),
    leadText: namesText + '、参加ありがとうございます。',
    rule: rule,
    targetUserIds: targetUserIds,
  });
}

function buildRuleConfirmationPromptFlexMessage_(rule, displayNames, targetUserIds) {
  const namesText = displayNames.length > 0 ? displayNames.join('、') + 'さん' : '参加者さん';
  return buildRuleAgreementCard_({
    altText: 'ルール確認のお願い',
    header: buildCardBandHeader_('📜 はじめに', 'ルールの確認をお願いします'),
    leadText: namesText + '、使う前に、ルールを読んで「確認しました」を押してね。',
    rule: rule,
    targetUserIds: targetUserIds,
  });
}

// ルールの確認をお願いするカード（ようこそ・はじめに）：あいさつ → ルール → 確認のしかた
function buildRuleAgreementCard_(options) {
  return {
    type: 'flex',
    altText: options.altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: options.header,
      styles: buildCardBandStyles_(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: options.leadText,
            size: 'sm',
            wrap: true,
          },
        ].concat(buildRuleTextContents_(options.rule, 'sm')),
      },
      footer: buildRuleAgreementFooter_(options.rule.version, options.targetUserIds),
    },
  };
}

// ルールの中身（目的・禁止事項・おことわり）。separatorMargin は区切り線の上下のすきま
function buildRuleTextContents_(rule, separatorMargin) {
  const separator = separatorMargin ? { type: 'separator', margin: separatorMargin } : { type: 'separator' };
  return [
    {
      type: 'text',
      text: toLineText_(rule.purpose, '-'),
      wrap: true,
      size: 'xs',
    },
    separator,
    {
      type: 'text',
      text: '禁止事項',
      weight: 'bold',
      size: 'sm',
    },
    {
      type: 'text',
      text: toLineText_(rule.prohibitedItems, '-'),
      wrap: true,
      size: 'xs',
    },
    Object.assign({}, separator),
    {
      type: 'text',
      text: toLineText_(rule.disclaimer, '-'),
      wrap: true,
      size: 'xxs',
      color: '#666666',
    },
  ];
}

function buildAgreeRulesPostbackData_(ruleVersion, targetUserIds) {
  const ids = (targetUserIds || []).filter(function(id) {
    return !!id;
  });
  let data = 'action=agree_rules&ruleVersion=' + ruleVersion;
  if (ids.length > 0) {
    const withTargets = data + '&targetUserIds=' + encodeURIComponent(ids.join(','));
    // LINE のボタンのデータは300字まで。こえるとき（大勢が同時に入ったとき）は、だれでも押せる形にする
    if (withTargets.length <= 300) {
      data = withTargets;
    }
  }
  return data;
}

// ルールの確認のボタン（postback）。カードはトークに残り、何日もあとに押されることもあるが、
// 押されるたびにボットが状態を見て返す（もう確認ずみ・古い版・ほかの人のボタンも、やさしく返す）ので、カードに置いてよい
function buildRuleAgreementAction_(ruleVersion, targetUserIds) {
  const label = '✅ ルールを確認しました';
  return {
    type: 'postback',
    label: label,
    data: buildAgreeRulesPostbackData_(ruleVersion, targetUserIds),
    displayText: label,
  };
}

function buildRuleAgreementFooter_(ruleVersion, targetUserIds) {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: 'ルールを読んだら「✅ ルールを確認しました」を押してね。',
        size: 'xs',
        color: '#666666',
        wrap: true,
      },
      buildCardButton_('✅ ルールを確認しました', buildRuleAgreementAction_(ruleVersion, targetUserIds), true),
    ],
  };
}

// 同じボタンを、トークのいちばん下（クイックリプライ）にも出す。押せる人は postback の中で決める
function buildRuleAgreementQuickReply_(ruleVersion, targetUserIds) {
  return {
    items: [
      { type: 'action', action: buildRuleAgreementAction_(ruleVersion, targetUserIds) },
    ],
  };
}

function buildRuleFlexMessage_(rule) {
  return {
    type: 'flex',
    altText: '現在のグループルール',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: buildCardBandHeader_('📜 ルール・Version ' + rule.version, rule.title),
      styles: buildCardBandStyles_(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: buildRuleTextContents_(rule, ''),
      },
    },
  };
}

function buildBotSettingsFlexMessage_(group, options) {
  const showAccessCounts = !!(options && options.showAccessCounts);
  const allowedGroupIds = getAllowedGroupIds_();
  const allowedUserIds = getAllowedUserIds_();
  const accessControlEnabled = allowedGroupIds.length > 0 || allowedUserIds.length > 0;
  return {
    type: 'flex',
    altText: 'Bot設定',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: 'Bot設定',
            weight: 'bold',
            size: 'md',
          },
          {
            type: 'text',
            text: '新規参加案内：有効',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: 'ルールVersion：' + (group && group.ruleVersion ? group.ruleVersion : DEFAULT_RULE_VERSION_),
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: 'ルール確認記録：有効',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: '自動相場投稿：未実装',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: '利用制限：' + (accessControlEnabled ? '有効' : '未設定'),
            size: 'sm',
            wrap: true,
          },
        ].concat(showAccessCounts ? [
          // ほかのグループの数もわかるので、管理者にだけ出す
          {
            type: 'text',
            text: '許可グループ数：' + allowedGroupIds.length + ' / 許可ユーザー数：' + allowedUserIds.length,
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
        ] : []),
      },
    },
  };
}

function buildLiffLaunchFlexMessage_(liffUrl, view) {
  const isPerformance = view === 'performance';
  const band = isPerformance ? '🏆 注目実績' : '📋 注目一覧';
  const title = isPerformance ? 'みんなの実績を見る' : '注目一覧を画面で見る';
  return {
    type: 'flex',
    altText: isPerformance ? '注目実績を開く' : '注目一覧を開く',
    contents: {
      type: 'bubble',
      header: buildCardBandHeader_(band, title),
      styles: buildCardBandStyles_(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: isPerformance
              ? '注目した銘柄が、そのあと何%動いたかの順位を見られます。'
              : '注目中の銘柄と、いまの株価を表で見られます。',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: '画面の上のタブで、一覧・実績・しらべるを切りかえられます。',
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          buildCardButton_(isPerformance ? '🏆 実績を開く' : '📋 注目一覧を開く', { type: 'uri', uri: liffUrl }, true),
        ],
      },
    },
  };
}

function buildUsageGuideFlexMessage_(options) {
  const settings = options || {};
  const cards = [
    {
      command: '#7203 / #AAPL',
      detail: '気になる銘柄を注目に入れる',
      quickActionText: '#7203',
    },
    {
      command: '#注目一覧',
      detail: '注目中の銘柄を画面でまとめて見る',
      quickActionText: '#注目一覧',
    },
    {
      command: '#解除 7203',
      detail: '自分が入れた注目を外す',
      quickActionText: '#解除 ',
    },
  ];
  if (settings.showRuleRow) {
    cards.push({
      command: '#ルール',
      detail: 'グループのルールを見る・確認する',
      quickActionText: '#ルール',
    });
  }

  function buildKeyboardPrefillAction_(text) {
    return {
      type: 'postback',
      data: 'action=usage_prefill&command=' + encodeURIComponent(text),
      inputOption: 'openKeyboard',
      fillInText: text,
    };
  }

  // 1行：コマンド（押すと入力欄に入る）と説明
  function buildUsageRow_(card) {
    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '12px',
      cornerRadius: '12px',
      backgroundColor: '#F4F7F6',
      action: card.quickActionText ? buildKeyboardPrefillAction_(card.quickActionText) : undefined,
      contents: [
        {
          type: 'text',
          text: card.command + (card.quickActionText ? '  ✏️' : ''),
          size: 'sm',
          weight: 'bold',
          color: BOT_ACCENT_COLOR_,
          wrap: true,
        },
        {
          type: 'text',
          text: card.detail,
          size: 'xs',
          color: '#666666',
          wrap: true,
        },
      ],
    };
  }

  const bodyContents = [];
  if (settings.leadText) {
    bodyContents.push({
      type: 'text',
      text: settings.leadText,
      size: 'sm',
      weight: 'bold',
      wrap: true,
    });
  }
  bodyContents.push({
    type: 'text',
    text: '「#」のあとに銘柄コードを送ると、注目に入ります。下の言葉を押すと、入力欄に入ります。',
    size: 'xs',
    color: '#666666',
    wrap: true,
  });
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: cards.map(buildUsageRow_),
  });

  const bubble = {
    type: 'bubble',
    size: 'mega',
    header: buildCardBandHeader_(settings.bandText || '❓ 使い方', '注目銘柄を、みんなで共有'),
    styles: buildCardBandStyles_(),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: bodyContents,
    },
  };
  if (settings.watchlistUrl) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        buildCardButton_('📋 注目一覧を開く', { type: 'uri', uri: settings.watchlistUrl }, true),
      ],
    };
  }

  return {
    type: 'flex',
    altText: settings.altText || '使い方：#7203 で注目に入れる・#注目一覧 で一覧を見る・#解除 7203 で外す',
    contents: bubble,
  };
}

function buildWatchRegistrationFlexMessage_(record, quote, watchlistUrl) {
  const pickerName = toLineText_(record.addedByDisplayName, '');
  const title = (quote && quote.name) || record.tickerName || ('銘柄コード ' + record.ticker);
  const altLabel = '(' + record.ticker + ')' + title;
  return buildWatchQuoteCard_({
    record: record,
    quote: quote,
    watchlistUrl: watchlistUrl,
    altText: pickerName
      ? '📌 ' + altLabel + 'を' + pickerName + 'がピックしました'
      : '📌 ' + altLabel + 'をピックしました',
    bandText: '📌 注目に入れました・' + formatDateDisplayOnly_(record.addedAt),
    price: record.addedPrice || (quote && quote.price),
    changePercent: record.addedChangePercent || (quote && quote.changePercent),
    sinceAdded: null,
  });
}

function buildWatchAlreadyActiveFlexMessage_(record, quote, watchlistUrl) {
  const currentPrice = quote && quote.price ? quote.price : '';
  const performanceDelta = formatWatchPerformanceDelta_(record, quote);
  return buildWatchQuoteCard_({
    record: record,
    quote: quote,
    watchlistUrl: watchlistUrl,
    altText: record.ticker + ' はすでに注目中です',
    bandText: '📌 もう注目中です・' + formatDateDisplayOnly_(record.addedAt) + 'から',
    price: currentPrice || record.addedPrice,
    changePercent: quote && quote.changePercent ? quote.changePercent : '',
    sinceAdded: {
      text: '注目したときから ' + toLineText_(performanceDelta, '-'),
      color: getSignedTextColor_(performanceDelta),
    },
  });
}

// 注目のカード（H2）：色の帯（区分・日付と銘柄名）→ 株価（大きく）→ 指標 → 注目した人 → ボタン2つまで
function buildWatchQuoteCard_(options) {
  const record = options.record;
  const quote = options.quote;
  const title = (quote && quote.name) || record.tickerName || ('銘柄コード ' + record.ticker);
  const marketTicker = record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker);
  const marketFlag = buildMarketFlagEmoji_(marketTicker);
  const metricBoxes = buildAvailableMetricBoxes_(quote);

  const bodyContents = [
    {
      type: 'box',
      layout: 'baseline',
      contents: [
        {
          type: 'text',
          text: formatPrice_(options.price),
          weight: 'bold',
          size: 'xxl',
          flex: 0,
        },
        {
          type: 'text',
          text: formatPercent_(options.changePercent),
          size: 'sm',
          color: getQuoteChangeColor_(options.changePercent),
          margin: 'md',
        },
      ],
    },
  ];

  if (options.sinceAdded) {
    bodyContents.push({
      type: 'text',
      text: options.sinceAdded.text,
      size: 'sm',
      weight: 'bold',
      color: options.sinceAdded.color,
      wrap: true,
    });
  }

  if (metricBoxes.length > 0) {
    bodyContents.push({
      type: 'separator',
      margin: 'md',
    });
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: metricBoxes,
    });
  }

  bodyContents.push({
    type: 'text',
    text: '注目 ' + toLineText_(record.addedByDisplayName, '-') + '・' + toLineText_(marketTicker, '-') + '・Google Finance',
    size: 'xxs',
    color: '#666666',
    wrap: true,
    margin: 'md',
  });

  const buttons = [];
  if (options.watchlistUrl) {
    buttons.push(buildCardButton_('📋 注目一覧を見る', { type: 'uri', uri: options.watchlistUrl }, true));
  }
  buttons.push(buildCardButton_('🔍 株探で見る', { type: 'uri', uri: buildKabutanUrl_(record.ticker) }, !options.watchlistUrl));

  return {
    type: 'flex',
    altText: options.altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: buildCardBandHeader_(options.bandText, toLineText_((marketFlag ? marketFlag + ' ' : '') + title, '銘柄情報')),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: buttons,
      },
      styles: buildCardBandStyles_(),
    },
  };
}

function buildAvailableMetricBoxes_(quote) {
  const contents = [];

  if (quote && quote.marketCap) {
    contents.push(buildMetricBox_('時価総額', toLineText_(quote.marketCap, '-')));
  }
  if (quote && quote.per) {
    contents.push(buildMetricBox_('PER', toLineText_(quote.per, '-')));
  }
  if (quote && quote.volume) {
    contents.push(buildMetricBox_('出来高', formatNumberWithCommas_(quote.volume)));
  }

  return contents;
}

function buildMetricBox_(label, value) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    contents: [
      {
        type: 'text',
        text: toLineText_(label, '-'),
        size: 'xxs',
        color: '#666666',
        align: 'center',
      },
      {
        type: 'text',
        text: toLineText_(value || '-', '-'),
        size: 'sm',
        weight: 'bold',
        align: 'center',
        wrap: true,
      },
    ],
  };
}

function getQuoteChangeColor_(value) {
  const number = Number(value);
  if (Number.isNaN(number) || number === 0) {
    return '#666666';
  }
  return number > 0 ? '#0B8F55' : '#C0392B';
}

// 「+1.23%」は緑、「-1.23%」は赤、それ以外（「-」だけ・0）は灰色
function getSignedTextColor_(text) {
  const value = String(text || '');
  if (/^\+\d/.test(value)) {
    return '#0B8F55';
  }
  if (/^-\d/.test(value)) {
    return '#C0392B';
  }
  return '#666666';
}

// ---- カードの共通の形（使い心地の決まり H2・H3） ----

// この画面・ボットの色（LIFF 画面の --ls-accent と同じ）
const BOT_ACCENT_COLOR_ = '#0F766E';
const BOT_ACCENT_SUB_TEXT_COLOR_ = '#D2EEE8';

// 色の帯：小さく区分・日付、太く見出し
function buildCardBandHeader_(smallText, titleText) {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'text',
        text: toLineText_(smallText, '-'),
        size: 'xs',
        color: BOT_ACCENT_SUB_TEXT_COLOR_,
        wrap: true,
      },
      {
        type: 'text',
        text: toLineText_(titleText, '-'),
        size: 'lg',
        weight: 'bold',
        color: '#FFFFFF',
        wrap: true,
      },
    ],
  };
}

function buildCardBandStyles_() {
  return {
    header: {
      backgroundColor: BOT_ACCENT_COLOR_,
    },
  };
}

// 行動のボタン（1枚に2つまで）。isPrimary はいちばん押してほしいもの
function buildCardButton_(label, action, isPrimary) {
  return {
    type: 'button',
    style: isPrimary ? 'primary' : 'secondary',
    color: isPrimary ? BOT_ACCENT_COLOR_ : '#E8EDF3',
    height: 'sm',
    action: Object.assign({ label: label }, action),
  };
}

// 返事の最後に付ける、次にすること（H3）。グループのみんなに見える
// leadingItems：その返事にだけ付ける操作（先頭に出す）
function buildMainQuickReply_(groupId, leadingItems) {
  const items = (leadingItems || []).slice();
  const watchlistUrl = groupId ? buildLiffAppLaunchUrl_(groupId, 'watchlist') : '';
  const performanceUrl = groupId ? buildLiffAppLaunchUrl_(groupId, 'performance') : '';
  if (watchlistUrl) {
    items.push({ type: 'action', action: { type: 'uri', label: '📋 注目一覧', uri: watchlistUrl } });
  }
  if (performanceUrl) {
    items.push({ type: 'action', action: { type: 'uri', label: '🏆 注目実績', uri: performanceUrl } });
  }
  items.push({
    type: 'action',
    action: {
      type: 'postback',
      label: '📌 銘柄を注目する',
      data: 'action=usage_prefill&command=' + encodeURIComponent('#'),
      inputOption: 'openKeyboard',
      fillInText: '#',
    },
  });
  items.push({ type: 'action', action: { type: 'message', label: '❓ 使い方', text: '#使い方' } });
  return { items: items };
}

// クイックリプライの1つ：押すと文字を送る
function buildMessageQuickReplyItem_(label, text) {
  return { type: 'action', action: { type: 'message', label: label, text: text } };
}
