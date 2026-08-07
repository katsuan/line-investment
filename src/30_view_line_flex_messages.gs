function buildJoinGuideTextMessage_() {
  return {
    type: 'text',
    text: [
      'Botを追加しました。',
      '',
      'このBotは、新しく参加したメンバーに',
      'グループの目的とルールを案内します。',
      '',
      '利用できるコマンド',
      '#ルール',
      '#未確認',
      '#グループ許可',
      '#使い方',
      '#ヘルプ',
      '#注目一覧',
      '#解除 7203',
      '#注目実績',
      '#Bot設定',
    ].join('\n'),
  };
}

function buildWelcomeFlexMessage_(rule, displayNames) {
  const namesText = displayNames.length > 0 ? displayNames.join('、') + 'さん' : '新しいメンバーさん';
  const agreementButtonLabel = buildAgreementButtonLabel_(displayNames);
  return {
    type: 'flex',
    altText: '投資情報共有グループへようこそ',
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
            text: '🏛️ 投資情報共有グループへようこそ',
            weight: 'bold',
            size: 'md',
            wrap: true,
          },
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
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'postback',
              label: agreementButtonLabel,
              data: 'action=agree_rules&ruleVersion=' + rule.version,
              displayText: agreementButtonLabel,
            },
          },
        ],
      },
    },
  };
}

function buildRuleConfirmationPromptFlexMessage_(rule, displayNames) {
  const namesText = displayNames.length > 0 ? displayNames.join('、') + 'さん' : '参加者さん';
  const agreementButtonLabel = buildAgreementButtonLabel_(displayNames);
  return {
    type: 'flex',
    altText: 'ルール確認のお願い',
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
            text: 'ルール確認のお願い',
            weight: 'bold',
            size: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: namesText + '、コマンド実行には先にルール確認が必要です。',
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
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'postback',
              label: agreementButtonLabel,
              data: 'action=agree_rules&ruleVersion=' + rule.version,
              displayText: agreementButtonLabel,
            },
          },
        ],
      },
    },
  };
}

function buildAgreementButtonLabel_(displayNames) {
  if (displayNames.length === 1) {
    return '→' + displayNames[0] + 'さん ルール確認しました';
  }

  if (displayNames.length > 1) {
    return '→参加者のみなさん ルール確認しました';
  }

  return '→参加者さん ルール確認しました';
}

function buildRuleFlexMessage_(rule) {
  return {
    type: 'flex',
    altText: '現在のグループルール',
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
            text: rule.title,
            weight: 'bold',
            size: 'md',
            wrap: true,
          },
          {
            type: 'text',
            text: 'Version ' + rule.version,
            size: 'xs',
            color: '#666666',
          },
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

function buildBotSettingsFlexMessage_(group) {
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
          {
            type: 'text',
            text: '許可グループ数：' + allowedGroupIds.length + ' / 許可ユーザー数：' + allowedUserIds.length,
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
        ],
      },
    },
  };
}

function buildLiffLaunchFlexMessage_(liffUrl) {
  return {
    type: 'flex',
    altText: '注目一覧を開く',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'text',
            text: '注目一覧を開く',
            weight: 'bold',
            size: 'md',
          },
          {
            type: 'text',
            text: '一覧と実績を画面で確認できます。',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: '注目実績は画面内のタブから切り替えできます。',
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
          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'uri',
              label: '画面を開く',
              uri: liffUrl,
            },
          },
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
      detail: '気になる銘柄を注目登録',
      quickActionText: '#7203',
    },
    {
      command: '#注目一覧',
      detail: '注目中の銘柄をまとめて確認',
      quickActionText: '#注目一覧',
    },
    {
      command: '#解除 7203',
      detail: '自分の注目銘柄を一覧から外す',
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

  function buildUsageCard_(card) {
    return {
      type: 'box',
      layout: 'vertical',
      flex: 0,
      spacing: 'xs',
      paddingAll: '12px',
      cornerRadius: '12px',
      backgroundColor: '#F7F8FA',
      borderWidth: '1px',
      borderColor: '#E4E7EC',
      contents: [
        {
          type: 'text',
          text: card.command,
          size: 'sm',
          weight: 'bold',
          color: '#0F766E',
          wrap: true,
        },
        {
          type: 'text',
          text: card.detail,
          size: 'xs',
          color: '#666666',
          wrap: true,
        },
      ].concat(card.quickActionText ? [
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          spacing: 'sm',
          alignItems: 'center',
          contents: [
            {
              type: 'text',
              text: '試す👉',
              size: 'xxs',
              color: '#666666',
              flex: 0,
            },
            {
              type: 'box',
              layout: 'horizontal',
              paddingTop: '6px',
              paddingBottom: '6px',
              paddingStart: '10px',
              paddingEnd: '10px',
              cornerRadius: '999px',
              backgroundColor: '#E8EDF3',
              justifyContent: 'center',
              alignItems: 'center',
              flex: 0,
              action: buildKeyboardPrefillAction_(card.quickActionText),
              contents: [
                {
                  type: 'text',
                  text: card.command,
                  size: 'xxs',
                  weight: 'bold',
                  color: '#4B5563',
                  align: 'center',
                  wrap: false,
                  flex: 0,
                },
              ],
            },
          ],
        },
      ] : []),
    };
  }

  return {
    type: 'flex',
    altText: '使い方ガイド',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: '使い方ガイド',
            weight: 'bold',
            size: 'md',
          },
          {
            type: 'text',
            text: settings.leadText || 'ルール確認を記録しました。\n利用を許可しました。',
            size: 'sm',
            wrap: true,
          },
          {
            type: 'text',
            text: 'コマンドは # から始めて送信してください。',
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
          {
            type: 'text',
            text: 'まずは気になる銘柄を1つ注目登録してみてください。',
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: cards.map(buildUsageCard_),
          },
          {
            type: 'text',
            text: '気になることがあれば、遠慮なくグループで質問してください。',
            size: 'xs',
            color: '#666666',
            wrap: true,
          },
        ],
      },
    },
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
                text: '注目 ' + toLineText_(record.addedByDisplayName || record.addedByUserId, '-') + ' / ' + formatDateDisplayOnly_(record.addedAt),
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

function buildWatchRegistrationFlexMessage_(record, quote) {
  const title = (quote && quote.name) || record.tickerName || ('銘柄コード ' + record.ticker);
  const marketTicker = record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker);
  const marketFlag = buildMarketFlagEmoji_(marketTicker);
  const metricBoxes = buildAvailableMetricBoxes_(quote);
  const pickerName = toLineText_(record.addedByDisplayName, '');
  const altLabel = '(' + record.ticker + ')' + title;
  const altText = pickerName
    ? '📌 ' + altLabel + 'を' + pickerName + 'がピックしました'
    : '📌 ' + altLabel + 'をピックしました';

  return {
    type: 'flex',
    altText: altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'flex-start',
            contents: [
              {
                type: 'text',
                text: toLineText_((marketFlag ? marketFlag + ' ' : '') + title, '銘柄情報'),
                weight: 'bold',
                size: 'md',
                wrap: true,
                flex: 1,
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 0,
                spacing: 'xs',
                contents: [
                  {
                    type: 'text',
                    text: toLineText_(marketTicker, '-'),
                    size: 'xxs',
                    color: '#666666',
                    align: 'end',
                    wrap: false,
                  },
                  {
                    type: 'text',
                    text: 'Google Finance',
                    size: 'xxs',
                    color: '#98A2B3',
                    align: 'end',
                    wrap: false,
                  },
                ],
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: formatPrice_(record.addedPrice || (quote && quote.price)),
                weight: 'bold',
                size: 'xl',
                flex: 0,
              },
              {
                type: 'text',
                text: formatPercent_(record.addedChangePercent || (quote && quote.changePercent)),
                size: 'sm',
                color: getQuoteChangeColor_(record.addedChangePercent || (quote && quote.changePercent)),
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
            text: '注目 ' + toLineText_(record.addedByDisplayName || record.addedByUserId, '-') + ' / ' + formatDateDisplayOnly_(record.addedAt),
            size: 'xs',
            color: '#666666',
            wrap: true,
            align: 'end',
          },
        ]),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            flex: 1,
            paddingAll: '10px',
            backgroundColor: '#E8EDF3',
            cornerRadius: '999px',
            justifyContent: 'center',
            alignItems: 'center',
            action: {
              type: 'uri',
              uri: buildKabutanUrl_(record.ticker),
            },
            contents: [
              {
                type: 'text',
                text: toLineText_('🔍' + record.ticker, ''),
                size: 'sm',
                weight: 'bold',
                color: '#4B5563',
                flex: 0,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            flex: 1,
            paddingAll: '10px',
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
                size: 'sm',
                weight: 'bold',
                color: '#4B5563',
                flex: 0,
              },
            ],
          },
        ],
      },
    },
  };
}

function buildWatchAlreadyActiveFlexMessage_(record, quote) {
  const title = (quote && quote.name) || record.tickerName || ('銘柄コード ' + record.ticker);
  const marketTicker = record.addedMarketTicker || (quote && quote.marketTicker) || composeMarketTicker_(record.ticker);
  const marketFlag = buildMarketFlagEmoji_(marketTicker);
  const metricBoxes = buildAvailableMetricBoxes_(quote);
  const currentPrice = quote && quote.price ? quote.price : '';
  const currentChangePercent = quote && quote.changePercent ? quote.changePercent : '';
  const performanceDelta = quote && quote.marketCap && record.addedMarketCap
    ? formatSignedPercentDeltaFromBaseScaled_(quote.marketCap, record.addedMarketCap)
    : formatSignedPercentDeltaFromBase_(currentPrice, record.addedPrice);
  const deltaColor = quote && quote.marketCap && record.addedMarketCap
    ? getQuoteChangeColorFromDelta_(parseComparableScaledNumber_(quote.marketCap), parseComparableScaledNumber_(record.addedMarketCap))
    : getQuoteChangeColorFromDelta_(currentPrice, record.addedPrice);

  return {
    type: 'flex',
    altText: record.ticker + ' はすでに注目中です',
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
            text: 'すでに注目中です',
            size: 'xs',
            color: '#666666',
            weight: 'bold',
          },
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'flex-start',
            contents: [
              {
                type: 'text',
                text: toLineText_((marketFlag ? marketFlag + ' ' : '') + title, '銘柄情報'),
                weight: 'bold',
                size: 'md',
                wrap: true,
                flex: 1,
              },
              {
                type: 'box',
                layout: 'vertical',
                flex: 0,
                spacing: 'xs',
                contents: [
                  {
                    type: 'text',
                    text: toLineText_(marketTicker, '-'),
                    size: 'xxs',
                    color: '#666666',
                    align: 'end',
                    wrap: false,
                  },
                  {
                    type: 'text',
                    text: 'Google Finance',
                    size: 'xxs',
                    color: '#98A2B3',
                    align: 'end',
                    wrap: false,
                  },
                ],
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: formatPrice_(currentPrice || record.addedPrice),
                weight: 'bold',
                size: 'xl',
                flex: 0,
              },
              {
                type: 'text',
                text: formatPercent_(currentChangePercent),
                size: 'sm',
                color: getQuoteChangeColor_(currentChangePercent),
                margin: 'md',
              },
            ],
          },
          {
            type: 'text',
            text: 'ピック時から ' + toLineText_(performanceDelta, '-'),
            size: 'xs',
            color: deltaColor,
            wrap: true,
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
            text: '注目 ' + toLineText_(record.addedByDisplayName || record.addedByUserId, '-') + ' / ' + formatDateDisplayOnly_(record.addedAt),
            size: 'xs',
            color: '#666666',
            wrap: true,
            align: 'end',
          },
        ]),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            flex: 1,
            paddingAll: '10px',
            backgroundColor: '#E8EDF3',
            cornerRadius: '999px',
            justifyContent: 'center',
            alignItems: 'center',
            action: {
              type: 'uri',
              uri: buildKabutanUrl_(record.ticker),
            },
            contents: [
              {
                type: 'text',
                text: toLineText_('🔍' + record.ticker, ''),
                size: 'sm',
                weight: 'bold',
                color: '#4B5563',
                flex: 0,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            flex: 1,
            paddingAll: '10px',
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
                size: 'sm',
                weight: 'bold',
                color: '#4B5563',
                flex: 0,
              },
            ],
          },
        ],
      },
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
