function buildJoinGuideTextMessage_() {
  return {
    type: 'text',
    text: [
      'Botを追加しました。',
      '',
      '新しく入った人に、グループの目的とルールを案内します。',
      'ルールを確認した人は、銘柄を注目に入れたり、一覧を見たりできます。',
      '',
      'つかえる言葉',
      '#7203 … 銘柄を注目に入れる',
      '#注目一覧 … 一覧を画面で見る',
      '#注目実績 … みんなの実績を見る',
      '#解除 7203 … 自分の注目を外す',
      '#ルール … ルールを見る',
      '#使い方 … 使い方を見る',
    ].join('\n'),
  };
}

function buildWelcomeFlexMessage_(rule, displayNames, targetUserIds) {
  const namesText = displayNames.length > 0 ? displayNames.join('、') + 'さん' : '新しいメンバーさん';
  return {
    type: 'flex',
    altText: '投資情報共有グループへようこそ',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: buildCardBandHeader_('👋 ようこそ', '投資情報共有グループへようこそ'),
      styles: buildCardBandStyles_(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: namesText + '、参加ありがとうございます。',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: rule.purpose,
            wrap: true,
            size: 'xs',
          },
          {
            type: 'separator',
            margin: 'sm',
          },
          {
            type: 'text',
            text: '禁止事項',
            weight: 'bold',
            size: 'sm',
          },
          {
            type: 'text',
            text: rule.prohibitedItems,
            wrap: true,
            size: 'xs',
          },
          {
            type: 'separator',
            margin: 'sm',
          },
          {
            type: 'text',
            text: rule.disclaimer,
            wrap: true,
            size: 'xxs',
            color: '#666666',
          },
        ],
      },
      footer: buildRuleAgreementFooter_(),
    },
  };
}

function buildRuleConfirmationPromptFlexMessage_(rule, displayNames, targetUserIds) {
  const namesText = displayNames.length > 0 ? displayNames.join('、') + 'さん' : '参加者さん';
  return {
    type: 'flex',
    altText: 'ルール確認のお願い',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: buildCardBandHeader_('📜 はじめに', 'ルールの確認をお願いします'),
      styles: buildCardBandStyles_(),
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: namesText + '、使う前に、ルールを読んで「確認しました」を押してね。',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: rule.purpose,
            wrap: true,
            size: 'xs',
          },
          {
            type: 'separator',
            margin: 'sm',
          },
          {
            type: 'text',
            text: '禁止事項',
            weight: 'bold',
            size: 'sm',
          },
          {
            type: 'text',
            text: rule.prohibitedItems,
            wrap: true,
            size: 'xs',
          },
          {
            type: 'separator',
            margin: 'sm',
          },
          {
            type: 'text',
            text: rule.disclaimer,
            wrap: true,
            size: 'xxs',
            color: '#666666',
          },
        ],
      },
      footer: buildRuleAgreementFooter_(),
    },
  };
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

// ルールの確認は1回きりなので、カードには置かず、クイックリプライ（buildRuleAgreementQuickReply_）で押してもらう（H2）。
// クイックリプライは次のメッセージで消えるので、カードには、あとで見てもわかる文と、出しなおすボタン（#ルール を送るだけ）を置く
function buildRuleAgreementFooter_() {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: [
      {
        type: 'text',
        text: 'ルールを読んだら、トークのいちばん下に出る「✅ ルールを確認しました」を押してね。出ていないときは、このボタンで出しなおせます。',
        size: 'xs',
        color: '#666666',
        wrap: true,
      },
      buildCardButton_('📜 ルールを確認する', { type: 'message', label: '📜 ルールを確認する', text: '#ルール' }, true),
    ],
  };
}

// ルールの確認のクイックリプライ（返事の最後のメッセージに付ける。グループのみんなに見えるので、押せる人は postback の中で決める）
function buildRuleAgreementQuickReply_(ruleVersion, targetUserIds) {
  const label = '✅ ルールを確認しました';
  return {
    items: [
      {
        type: 'action',
        action: {
          type: 'postback',
          label: label,
          data: buildAgreeRulesPostbackData_(ruleVersion, targetUserIds),
          displayText: label,
        },
      },
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
        contents: [
          {
            type: 'text',
            text: rule.purpose,
            wrap: true,
            size: 'xs',
          },
          {
            type: 'separator',
          },
          {
            type: 'text',
            text: '禁止事項',
            weight: 'bold',
            size: 'sm',
          },
          {
            type: 'text',
            text: rule.prohibitedItems,
            wrap: true,
            size: 'xs',
          },
          {
            type: 'separator',
          },
          {
            type: 'text',
            text: rule.disclaimer,
            wrap: true,
            size: 'xxs',
            color: '#666666',
          },
        ],
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
    header: buildCardBandHeader_('❓ 使い方', '注目銘柄を、みんなで共有'),
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
    altText: '使い方：#7203 で注目に入れる・#注目一覧 で一覧を見る・#解除 7203 で外す',
    contents: bubble,
  };
}

function buildWatchPerformanceSummaryFlexMessage_(groupId, summary, topSpotlight, randomSpotlight) {
  const stats = summary || { rows: [], totalCount: 0 };
  const rows = stats.rows || [];
  const topRow = rows.length > 0 ? rows[0] : null;
  const topAverageText = topRow && topRow.averageDelta !== null
    ? ((topRow.averageDelta > 0 ? '+' : '') + topRow.averageDelta.toFixed(2) + '%')
    : '';

  function buildRankBadge_(rank) {
    if (rank === 1) {
      return '🥇';
    }
    if (rank === 2) {
      return '🥈';
    }
    if (rank === 3) {
      return '🥉';
    }
    return '';
  }

  function buildUserAvatar_(row) {
    if (row.pictureUrl) {
      return {
        type: 'box',
        layout: 'vertical',
        width: '36px',
        height: '36px',
        cornerRadius: '18px',
        flex: 0,
        paddingAll: '0px',
        contents: [
          {
            type: 'image',
            url: row.pictureUrl,
            size: 'full',
            aspectMode: 'cover',
            aspectRatio: '1:1',
          },
        ],
      };
    }

    return {
      type: 'box',
      layout: 'vertical',
      width: '36px',
      height: '36px',
      cornerRadius: '18px',
      backgroundColor: '#E8EDF3',
      justifyContent: 'center',
      alignItems: 'center',
      flex: 0,
      contents: [
        {
          type: 'text',
          text: toLineText_(String(row.displayName || '-').slice(0, 1), '-'),
          weight: 'bold',
          color: '#4B5563',
          size: 'sm',
        },
      ],
    };
  }

  function buildRow_(row, index) {
    const averageText = row.averageDelta === null
      ? '-'
      : ((row.averageDelta > 0 ? '+' : '') + row.averageDelta.toFixed(2) + '%');
    return {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'xs',
      paddingTop: '6px',
      paddingBottom: '6px',
      alignItems: 'center',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          alignItems: 'center',
          flex: 6,
          contents: [
            buildUserAvatar_(row),
            {
              type: 'box',
              layout: 'vertical',
              flex: 1,
              spacing: '2px',
              contents: [
                {
                  type: 'text',
                  text: (buildRankBadge_(row.rank) ? buildRankBadge_(row.rank) + ' ' : '') + toLineText_(row.displayName, '不明'),
                  weight: 'bold',
                  size: 'sm',
                  gravity: 'center',
                  maxLines: 1,
                  wrap: true,
                },
              ],
            },
          ],
        },
        {
          type: 'text',
          text: String(row.pickCount),
          size: 'xs',
          weight: 'bold',
          align: 'center',
          flex: 1,
          gravity: 'center',
        },
        {
          type: 'text',
          text: averageText,
          size: 'xs',
          weight: 'bold',
          color: getQuoteChangeColor_(row.averageDelta),
          align: 'end',
          flex: 2,
          gravity: 'center',
          wrap: false,
        },
      ],
    };
  }

  function buildHeaderRow_() {
    return {
      type: 'box',
      layout: 'horizontal',
      margin: 'sm',
      paddingBottom: '4px',
      alignItems: 'center',
      contents: [
        {
          type: 'text',
          text: 'メンバー',
          size: 'xxs',
          color: '#666666',
          weight: 'bold',
          flex: 6,
        },
        {
          type: 'text',
          text: '件数',
          size: 'xxs',
          color: '#666666',
          weight: 'bold',
          align: 'center',
          flex: 1,
        },
        {
          type: 'text',
          text: '平均騰落率',
          size: 'xxs',
          color: '#666666',
          weight: 'bold',
          align: 'end',
          flex: 2,
        },
      ],
    };
  }

  function buildSeparator_() {
    return {
      type: 'separator',
      margin: 'none',
      color: '#E4E7EC',
    };
  }

  const rankingBubble = {
    type: 'bubble',
    size: 'giga',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: rows.length === 0 ? [
        {
          type: 'text',
          text: '注目実績',
          weight: 'bold',
          size: 'md',
        },
        {
          type: 'text',
          text: '注目実績はまだありません。',
          size: 'sm',
          wrap: true,
        },
      ] : [
        {
          type: 'text',
          text: '注目実績',
          weight: 'bold',
          size: 'md',
        },
        buildHeaderRow_(),
        buildSeparator_(),
      ].concat(rows.map(function(row, index) {
        return {
          type: 'box',
          layout: 'vertical',
          contents: [
            buildRow_(row, index),
          ].concat(index < rows.length - 1 ? [buildSeparator_()] : []),
        };
      })).concat([
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'md',
          spacing: 'sm',
          alignItems: 'center',
          contents: [
            {
              type: 'text',
              text: '集計対象: 現在の注目銘柄 ' + String(stats.totalCount || 0) + '件',
              size: 'xs',
              color: '#666666',
              wrap: true,
              flex: 1,
            },
            {
              type: 'box',
              layout: 'horizontal',
              paddingTop: '5px',
              paddingBottom: '5px',
              paddingStart: '10px',
              paddingEnd: '10px',
              cornerRadius: '999px',
              backgroundColor: '#E8EDF3',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 0,
              action: {
                type: 'postback',
                data: 'action=usage_prefill&command=' + encodeURIComponent('#注目一覧'),
                inputOption: 'openKeyboard',
                fillInText: '#注目一覧',
              },
              contents: [
                {
                  type: 'text',
                  text: '#注目一覧',
                  size: 'xxs',
                  weight: 'bold',
                  color: '#4B5563',
                  flex: 0,
                },
              ],
            },
          ],
        },
      ]),
    },
  };

  const spotlightBubbles = [];
  if (topSpotlight && (topSpotlight.records || []).length > 0) {
    spotlightBubbles.push(buildWatchSpotlightFlexMessage_(topSpotlight).contents);
  }
  if (randomSpotlight && (randomSpotlight.records || []).length > 0) {
    spotlightBubbles.push(buildWatchSpotlightFlexMessage_(randomSpotlight).contents);
  }

  return {
    type: 'flex',
    altText: topRow
      ? '注目実績 ' + (buildRankBadge_(topRow.rank) || '🥇') + toLineText_(topRow.displayName, '不明') + ' ' + topAverageText
      : '注目実績',
    contents: spotlightBubbles.length > 0 ? {
      type: 'carousel',
      contents: [rankingBubble].concat(spotlightBubbles),
    } : rankingBubble,
  };
}

function buildWatchSpotlightFlexMessage_(spotlight) {
  const data = spotlight || {};
  const records = data.records || [];
  const averageText = data.averageDelta === null
    ? '-'
    : ((data.averageDelta > 0 ? '+' : '') + data.averageDelta.toFixed(2) + '%');

  function buildUserAvatar_() {
    if (data.pictureUrl) {
      return {
        type: 'box',
        layout: 'vertical',
        width: '44px',
        height: '44px',
        cornerRadius: '22px',
        flex: 0,
        paddingAll: '0px',
        contents: [
          {
            type: 'image',
            url: data.pictureUrl,
            size: 'full',
            aspectMode: 'cover',
            aspectRatio: '1:1',
          },
        ],
      };
    }

    return {
      type: 'box',
      layout: 'vertical',
      width: '44px',
      height: '44px',
      cornerRadius: '22px',
      backgroundColor: '#E8EDF3',
      justifyContent: 'center',
      alignItems: 'center',
      flex: 0,
      contents: [
        {
          type: 'text',
          text: toLineText_(String(data.displayName || '-').slice(0, 1), '-'),
          weight: 'bold',
          color: '#4B5563',
          size: 'md',
        },
      ],
    };
  }

  function buildRecordCard_(record) {
    const quote = record.currentQuote || null;
    const displayName = (quote && quote.name) || record.tickerName || record.ticker;
    const currentPrice = quote && quote.price ? quote.price : '';
    const deltaText = formatSignedPercentDeltaFromBase_(currentPrice, record.addedPrice);
    const deltaColor = getQuoteChangeColorFromDelta_(currentPrice, record.addedPrice);
    const marketTicker = record.addedMarketTicker || (quote && quote.marketTicker);
    const marketFlag = buildMarketFlagEmoji_(marketTicker);
    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      paddingAll: '12px',
      cornerRadius: '12px',
      backgroundColor: '#F7F8FA',
      borderWidth: '1px',
      borderColor: '#E4E7EC',
      margin: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'flex-start',
          contents: [
            {
              type: 'text',
              text: toLineText_((marketFlag ? marketFlag + ' ' : '') + displayName, '-'),
              size: 'sm',
              weight: 'bold',
              wrap: true,
              flex: 1,
            },
            {
              type: 'box',
              layout: 'horizontal',
              flex: 0,
              paddingTop: '5px',
              paddingBottom: '5px',
              paddingStart: '10px',
              paddingEnd: '10px',
              cornerRadius: '999px',
              backgroundColor: '#E8EDF3',
              action: {
                type: 'uri',
                uri: buildKabutanUrl_(record.ticker),
              },
              contents: [
                {
                  type: 'text',
                  text: '🔍 ' + record.ticker,
                  size: 'xxs',
                  weight: 'bold',
                  color: '#4B5563',
                  flex: 0,
                },
              ],
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: toLineText_(currentPrice ? formatPrice_(currentPrice) : '-', '-'),
              size: 'sm',
              weight: 'bold',
              flex: 0,
            },
            {
              type: 'text',
              text: toLineText_(deltaText, '-'),
              size: 'xs',
              weight: 'bold',
              color: deltaColor,
              flex: 0,
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'md',
          contents: [
            {
              type: 'box',
              layout: 'baseline',
              flex: 1,
              spacing: 'xs',
              contents: [
                {
                  type: 'text',
                  text: '注目時',
                  size: 'xxs',
                  color: '#666666',
                  flex: 0,
                },
                {
                  type: 'text',
                  text: toLineText_(record.addedPrice ? formatPrice_(record.addedPrice) : '-', '-'),
                  size: 'xs',
                  color: '#444444',
                  weight: 'bold',
                  flex: 0,
                },
              ],
            },
            {
              type: 'box',
              layout: 'baseline',
              flex: 1,
              spacing: 'xs',
              contents: [
                {
                  type: 'text',
                  text: '日付',
                  size: 'xxs',
                  color: '#666666',
                  flex: 0,
                },
                {
                  type: 'text',
                  text: formatDateDisplayOnly_(record.addedAt),
                  size: 'xs',
                  color: '#444444',
                  weight: 'bold',
                  flex: 0,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  return {
    type: 'flex',
    altText: data.displayName
      ? toLineText_(data.title, '注目カード') + ' ' + data.displayName + ' ' + averageText
      : toLineText_(data.title, '注目カード'),
    contents: {
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: records.length === 0 ? [
          {
            type: 'text',
            text: toLineText_(data.title, '注目カード'),
            weight: 'bold',
            size: 'md',
          },
          {
            type: 'text',
            text: '表示できる注目銘柄はまだありません。',
            size: 'sm',
            wrap: true,
          },
        ] : [
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            alignItems: 'center',
            margin: 'sm',
            contents: [
              buildUserAvatar_(),
              {
                type: 'box',
                layout: 'vertical',
                flex: 1,
                spacing: '2px',
                contents: [
                  {
                    type: 'text',
                    text: toLineText_(data.title, '注目カード'),
                    size: 'sm',
                    weight: 'bold',
                    wrap: true,
                    maxLines: 2,
                  },
                  {
                    type: 'text',
                    text: String(data.pickCount || 0) + '件  ' + averageText + '（平均騰落率）',
                    size: 'xs',
                    color: '#666666',
                    wrap: true,
                  },
                ],
              },
            ],
          },
        ].concat(records.map(buildRecordCard_)).concat([
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            justifyContent: 'flex-end',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                flex: 0,
                paddingTop: '8px',
                paddingBottom: '8px',
                paddingStart: '12px',
                paddingEnd: '12px',
                backgroundColor: '#E8EDF3',
                cornerRadius: '999px',
                justifyContent: 'center',
                alignItems: 'center',
                action: {
                  type: 'postback',
                  data: 'action=usage_prefill&command=' + encodeURIComponent('#注目一覧'),
                  inputOption: 'openKeyboard',
                  fillInText: '#注目一覧',
                },
                contents: [
                  {
                    type: 'text',
                    text: '#注目一覧',
                    size: 'xxs',
                    weight: 'bold',
                    color: '#4B5563',
                    flex: 0,
                  },
                ],
              },
            ],
          },
        ]),
      },
    },
  };
}

function buildWatchlistSummaryFlexMessage_(groupId, records, totalCount) {
  const title = '注目一覧';
  const recentRecords = records.slice(0, DEFAULT_WATCHLIST_RECENT_LIMIT_);
  const bubbles = [];
  const maxCarouselBytes = 48000;

  if (recentRecords.length === 0) {
    bubbles.push({
      type: 'bubble',
      size: 'giga',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
          text: title,
          weight: 'bold',
          size: 'md',
          },
          {
          type: 'text',
          text: '注目銘柄はまだ登録されていません。',
          size: 'sm',
          wrap: true,
          }
        ],
      },
    });
  } else {
    for (let start = 0; start < recentRecords.length; start += DEFAULT_WATCHLIST_RECENT_PER_BUBBLE_) {
      const chunk = recentRecords.slice(start, start + DEFAULT_WATCHLIST_RECENT_PER_BUBBLE_);
      const bubbleTitle = bubbles.length === 0 && totalCount > recentRecords.length
        ? title + '（最新' + recentRecords.length + '件）'
        : title;
      const nextBubble = {
        type: 'bubble',
        size: 'giga',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: bubbleTitle,
              weight: 'bold',
              size: 'md',
            }
          ].concat(chunk.map(function(record) {
          const quote = record.currentQuote || null;
          const displayName = (quote && quote.name) || record.tickerName || record.ticker;
          const marketTicker = record.addedMarketTicker || (quote && quote.marketTicker);
          const marketFlag = buildMarketFlagEmoji_(marketTicker);
          const currentPrice = quote && quote.price ? quote.price : '';
          const useMarketCapDelta = quote && quote.marketCap && record.addedMarketCap;
          const performanceDelta = useMarketCapDelta
            ? formatSignedPercentDeltaFromBaseScaled_(quote.marketCap, record.addedMarketCap)
            : formatSignedPercentDeltaFromBase_(currentPrice, record.addedPrice);
          const deltaColor = useMarketCapDelta
            ? getQuoteChangeColorFromDelta_(parseComparableScaledNumber_(quote.marketCap), parseComparableScaledNumber_(record.addedMarketCap))
            : getQuoteChangeColorFromDelta_(currentPrice, record.addedPrice);
          return {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'xs',
            paddingAll: '12px',
            cornerRadius: '12px',
            backgroundColor: '#F7F8FA',
            borderWidth: '1px',
            borderColor: '#E4E7EC',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                alignItems: 'flex-start',
                contents: [
                  {
                    type: 'text',
                    text: toLineText_((marketFlag ? marketFlag + ' ' : '') + displayName, '-'),
                    weight: 'bold',
                    size: 'sm',
                    wrap: true,
                    flex: 1,
                  },
                  {
                    type: 'box',
                    layout: 'horizontal',
                    flex: 0,
                    paddingAll: '5px',
                    paddingStart: '9px',
                    paddingEnd: '9px',
                    backgroundColor: '#E8EDF3',
                    cornerRadius: '999px',
                    action: {
                      type: 'uri',
                      uri: buildKabutanUrl_(record.ticker),
                    },
                    contents: [
                      {
                        type: 'text',
                        text: toLineText_('🔍 ' + record.ticker, ''),
                        size: 'xxs',
                        color: '#4B5563',
                        weight: 'bold',
                        wrap: false,
                        flex: 0,
                      },
                    ],
                  },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                alignItems: 'center',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: toLineText_(currentPrice ? formatPrice_(currentPrice) : '-', '-'),
                    size: 'sm',
                    weight: 'bold',
                    flex: 0,
                  },
                  {
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'xs',
                    flex: 0,
                    contents: [
                      {
                        type: 'text',
                        text: '注目時比',
                        size: 'xxs',
                        color: '#666666',
                        flex: 0,
                      },
                      {
                        type: 'text',
                        text: toLineText_(performanceDelta, '-'),
                        size: 'xs',
                        color: deltaColor,
                        weight: 'bold',
                        flex: 0,
                      },
                    ],
                  },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'md',
                alignItems: 'flex-start',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    spacing: 'xs',
                    contents: [
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'xs',
                        contents: [
                          {
                            type: 'text',
                            text: '時価総額',
                            size: 'xxs',
                            color: '#666666',
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: toLineText_(quote && quote.marketCap ? quote.marketCap : '-', '-'),
                            size: 'xs',
                            color: '#444444',
                            weight: 'bold',
                            flex: 0,
                          },
                        ],
                      },
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'xs',
                        contents: [
                          {
                            type: 'text',
                            text: useMarketCapDelta ? '時価差分' : '価格差分',
                            size: 'xxs',
                            color: '#666666',
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: toLineText_(performanceDelta, '-'),
                            size: 'xs',
                            color: deltaColor,
                            weight: 'bold',
                            flex: 0,
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    spacing: 'xs',
                    contents: [
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'xs',
                        contents: [
                          {
                            type: 'text',
                            text: 'PER',
                            size: 'xxs',
                            color: '#666666',
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: toLineText_(quote && quote.per ? quote.per : '-', '-'),
                            size: 'xs',
                            color: '#444444',
                            weight: 'bold',
                            flex: 0,
                          },
                        ],
                      },
                      {
                        type: 'box',
                        layout: 'baseline',
                        spacing: 'xs',
                        contents: [
                          {
                            type: 'text',
                            text: '出来高',
                            size: 'xxs',
                            color: '#666666',
                            flex: 0,
                          },
                          {
                            type: 'text',
                            text: toLineText_(quote && quote.volume ? formatNumberWithCommas_(quote.volume) : '-', '-'),
                            size: 'xs',
                            color: '#444444',
                            weight: 'bold',
                            flex: 0,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'text',
                text: '注目 ' + toLineText_(record.addedByDisplayName, '-') + ' / ' + formatDateDisplayOnly_(record.addedAt),
                size: 'xs',
                color: '#666666',
                wrap: true,
                align: 'end',
              },
            ],
          };
          })).concat([
            {
              type: 'text',
              text: '取得元: Google Finance',
              size: 'xxs',
              color: '#98A2B3',
              margin: 'md',
              align: 'end',
            }
          ]),
        },
      };

      const candidateBubbles = bubbles.concat([nextBubble]).slice(0, DEFAULT_WATCHLIST_MAX_BUBBLES_);
      const candidateContents = candidateBubbles.length === 1 ? candidateBubbles[0] : {
        type: 'carousel',
        contents: candidateBubbles,
      };
      if (getFlexPayloadByteSize_(candidateContents) > maxCarouselBytes) {
        break;
      }

      bubbles.push(nextBubble);
    }
  }

  return {
    type: 'flex',
    altText: title,
    contents: bubbles.length === 1 ? bubbles[0] : {
      type: 'carousel',
      contents: bubbles.slice(0, DEFAULT_WATCHLIST_MAX_BUBBLES_),
    },
  };
}

function getFlexPayloadByteSize_(contents) {
  return Utilities.newBlob(JSON.stringify(contents)).getBytes().length;
}

function buildWatchlistDetailFlexMessage_(record, quote) {
  const title = (quote && quote.name) ? quote.name : '銘柄情報';
  const marketTicker = quote && quote.marketTicker ? quote.marketTicker : composeMarketTicker_(record.ticker);
  const metricBoxes = buildAvailableMetricBoxes_(quote);

  return {
    type: 'flex',
    altText: record.ticker + ' ' + toLineText_(title, '銘柄情報'),
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: toLineText_(title, '銘柄情報'),
            weight: 'bold',
            size: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: toLineText_(marketTicker, '-'),
            size: 'xs',
            color: '#666666',
          },
          {
            type: 'box',
            layout: 'baseline',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: formatPrice_(quote && quote.price),
                weight: 'bold',
                size: 'xl',
                flex: 0,
              },
              {
                type: 'text',
                text: formatPercent_(quote && quote.changePercent),
                size: 'sm',
                color: getQuoteChangeColor_(quote && quote.changePercent),
                margin: 'md',
              },
            ],
          },
          {
            type: 'separator',
            margin: 'md',
          },
        ].concat(metricBoxes.length > 0 ? [{
          type: 'box',
          layout: 'horizontal',
          margin: 'md',
          contents: metricBoxes,
        }] : []).concat([
          {
            type: 'text',
            text: '取得時刻: ' + ((quote && quote.tradeTime) || (quote && quote.fetchedAt) || nowJst_()),
            size: 'xs',
            color: '#666666',
            margin: 'md',
            wrap: true,
          },
        ]),
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'uri',
              label: '株探を見る',
              uri: buildKabutanUrl_(record.ticker),
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'message',
              label: '注目一覧を見る',
              text: '#注目一覧',
            },
          },
        ],
      },
    },
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
  const useMarketCap = !!(quote && quote.marketCap && record.addedMarketCap);
  const performanceDelta = useMarketCap
    ? formatSignedPercentDeltaFromBaseScaled_(quote.marketCap, record.addedMarketCap)
    : formatSignedPercentDeltaFromBase_(currentPrice, record.addedPrice);
  const deltaColor = useMarketCap
    ? getQuoteChangeColorFromDelta_(parseComparableScaledNumber_(quote.marketCap), parseComparableScaledNumber_(record.addedMarketCap))
    : getQuoteChangeColorFromDelta_(currentPrice, record.addedPrice);
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
      color: deltaColor,
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

function getQuoteChangeColorFromDelta_(currentValue, baseValue) {
  const current = Number(currentValue);
  const base = Number(baseValue);
  if (Number.isNaN(current) || Number.isNaN(base) || current === base) {
    return '#666666';
  }
  return current > base ? '#0B8F55' : '#C0392B';
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
function buildMainQuickReply_(groupId) {
  const items = [];
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
