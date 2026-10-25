/**
 * 自己点検（selfcheck.gs の qCheckAll）で何を確かめるか。
 * 00_run の checkAll と、40_test_window の 🩺 自己点検から使われる。
 */

// 使う前の確かめ（selfcheck.gs の qCheckAll）で見ること。GAS エディタで qCheckAll を実行する
var Q_SELF_CHECK = {
  properties: [
    'SPREADSHEET_ID',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'WEBHOOK_KEY',        // Webhook の URL の ?key= と同じ値
    'ADMIN_USER_IDS',     // 管理者（カンマ区切り）
    'ALLOWED_GROUP_IDS',  // 使ってよいグループ（ないと、どのグループでも使えてしまう）
    'LIFF_APP_BASE_URL',
  ],
  secretProperties: ['LINE_CHANNEL_ACCESS_TOKEN', 'WEBHOOK_KEY'],
  spreadsheetId: function() {
    return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  },
  sheets: {
    GROUPS: ['groupId'],
    MEMBERS: ['groupId', 'userId'],
    RULES: ['version'],
    EVENT_LOG: ['timestamp'],
    WATCHLIST: ['groupId'],
    MARKET_DATA: ['ticker'],
  },
  lineTokenProperty: 'LINE_CHANNEL_ACCESS_TOKEN',
  cards: function() {
    const rule = getEnabledRule_() || { version: DEFAULT_RULE_VERSION_ };
    const sampleRecord = {
      groupId: 'Cselfcheck', ticker: '7203', tickerName: 'トヨタ自動車', addedAt: nowJst_(),
      addedMarketTicker: '7203:TYO', addedPrice: '3000', addedByDisplayName: 'テスト', active: true,
    };
    const sampleQuote = { ticker: '7203', marketTicker: '7203:TYO', name: 'トヨタ自動車', price: '3100', changePercent: '1.2' };
    const url = getLiffAppBaseUrl_() || 'https://example.com/liff/';
    return [
      buildJoinGuideFlexMessage_(url),
      buildUnconfirmedMembersFlexMessage_(rule, [{ displayName: 'テスト' }]),
      buildRuleFlexMessage_(rule),
      Object.assign(buildRuleConfirmationPromptFlexMessage_(rule, ['テスト'], ['U00000000000000000000000000000000']), {
        quickReply: buildRuleAgreementQuickReply_(rule.version, ['U00000000000000000000000000000000']),
      }),
      buildUsageGuideFlexMessage_({ watchlistUrl: url }),
      buildBotSettingsFlexMessage_(null, { showAccessCounts: false }),
      buildLiffLaunchFlexMessage_(url, 'watchlist'),
      buildWatchRegistrationFlexMessage_(sampleRecord, sampleQuote, url),
      buildWatchAlreadyActiveFlexMessage_(sampleRecord, sampleQuote, url),
    ];
  },
};
