# LINE投資グループBot

Google Apps Script と LINE Messaging API で動かす、LINE投資グループ向けの初期Bot実装です。

## ファイル構成

- `src/00_entry_webapp.gs`: `doGet` / `doPost` と親委譲用の公開入口
- `src/01_router_webhook_request.gs`: Webhook入力解釈とイベントルーティング
- `src/10_usecase_line_group_bot.gs`: `join` / `memberJoined` / `postback` / コマンド処理
- `src/20_infra_line_messaging_api.gs`: LINE Messaging API 呼び出し
- `src/21_infra_spreadsheet_repository.gs`: スプレッドシート入出力
- `src/30_view_line_flex_messages.gs`: Flex Message生成
- `src/90_setup_investment_group_bot.gs`: 初回セットアップ
- `src/98_shared_utilities.gs`: 共通ユーティリティ
- `src/99_config.gs`: Script Properties と定数
- `src/appsscript.json`: GASマニフェスト
- `docs/liff/`: GitHub Pages で配信する LIFF フロントの静的ファイル

番号は責務の層を表しています。

- `00`: 公開入口
- `01`: request / router
- `10`: usecase
- `20`: infra
- `30`: view
- `90`: setup
- `98-99`: shared / config

公開フロントは `src/` と混在させず、`docs/` 配下へ分離しています。

## 事前準備

1. Google スプレッドシートを1つ作成する
2. LINE Developers で Messaging API チャネルを作成する
3. チャネルアクセストークンを発行する

## Script Properties

Apps Script の `プロジェクトの設定` から Script Properties に以下を設定します。

- `SPREADSHEET_ID`: 利用するスプレッドシートID
- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Messaging API のチャネルアクセストークン
- `ADMIN_USER_IDS`: 任意。将来の管理者制限用にカンマ区切りで保持可能
- `STOCK_EXCHANGE_SUFFIX`: 任意。既定値は `TYO`
- `LIFF_APP_BASE_URL`: 任意。`#注目一覧`・`#注目実績`・カードのボタンで開く画面の URL
- `MARKET_DATA_CACHE_MINUTES`: 任意。相場情報キャッシュ分数。既定値は `5`

## 初回セットアップ

1. `.clasp.json.example` を `.clasp.json` に複製して `scriptId` を入れ、`clasp push` を実行する（`.clasp.json` は git に入れない）
2. Apps Script エディタで `setupInvestmentGroupBot` を1回実行する
3. `GROUPS`, `MEMBERS`, `RULES`, `EVENT_LOG` シートが作成されたことを確認する
4. `RULES` に Version 1 が投入されていることを確認する

## Webアプリ公開

1. Apps Script で `デプロイ > 新しいデプロイ`
2. 種別を `ウェブアプリ` にする
3. 実行ユーザーを `自分`
4. アクセスできるユーザーを `全員`
5. 発行された URL を LINE Developers の Webhook URL に設定する

親 GAS から処理を委譲したい場合は、`doPost` / `doGet` ではなく次を呼び出します。

- `runLineGroupBotPost(request)`
- `runLineGroupBotGet(request)`

これにより、Web アプリの再デプロイ導線を追わずに、親側の入口から同じ本体処理へ渡せます。

## LIFF デバッグ導線

現行の `#注目一覧` / `#注目実績` は継続運用しつつ、LIFF は段階導入します。

- デバッグ用隠しコマンド: `#LIFF一覧`
- 返却内容: GitHub Pages 上の LIFF 起動用 Flex
- LIFF のタブ順: `しらべる / 注目一覧 / 実績`
- LIFF からのデータ取得: `doGet?action=liff_data`

`#LIFF一覧` は通常の使い方ガイドには載せず、デバッグ期間中のみ利用します。

### GitHub Pages デプロイ

このリポジトリでは、`docs/` を GitHub Actions 経由で GitHub Pages へデプロイします。

- workflow: [deploy-github-pages.yml](.github/workflows/deploy-github-pages.yml)
- 対象ブランチ: `main`
- 配布対象: `docs/`

初回のみ GitHub 側で次を確認してください。

1. Repository Settings → Pages
2. Build and deployment の Source を `GitHub Actions` にする

以後は `docs/` 配下を `main` へ push すると、自動で Pages へ反映されます。

### LIFF URL

`LIFF_APP_BASE_URL` には、GitHub Pages 側の LIFF URL を設定します。例:

- `https://<user>.github.io/<repo>/liff/`

Bot 側はこの URL に `groupId` と初期 `view` を付けて返します。

### LIFF フロント設定

`docs/liff/` では `window.APP_CONFIG` を使って設定を読みます。

- `docs/liff/config.js`
  共有してよい LIFF / API 設定
- `docs/liff/config.local.js`
  ローカル専用の debug 設定。Git 管理しない
- `docs/liff/config.local.example.js`
  debug 設定例

設定する値:

- `liffId`
- `apiBaseUrl`

例:

```js
window.APP_CONFIG = {
  liffId: 'YOUR_LIFF_ID',
  apiBaseUrl: 'YOUR_GAS_WEBAPP_URL'
};
```

debug 用の `groupId` / `userId` を使う場合は、`docs/liff/config.local.example.js` を `docs/liff/config.local.js` として複製し、ローカルだけで保持します。

### LIFF API

デバッグ時の LIFF フロントは、GAS の `doGet` に対して次の形式で問い合わせます。

- `action=liff_data`
- `groupId=<LINE groupId>`
- `view=watchlist | performance`
- `userId=<LIFF から得た userId>`

現在の API は `groupId × userId` の既存認可ロジックを流用します。  
本番化前には、LIFF token の検証追加を再評価してください。

## 動作確認

- Bot をグループへ追加して `join` が記録されること
- 新規メンバー追加で歓迎 Flex が返信されること
- `ルールを確認しました` 押下で `MEMBERS.agreedAt` と `agreedRuleVersion` が更新されること
- `#ルール`, `#未確認`, `#Bot設定` が動作すること
- `#LIFF一覧` で LIFF 起動用 Flex が返ること
- `docs/liff/` の画面で `watchlist` / `performance` が個別取得できること

## 注意点

- 初期実装は `group` のみ対応です
- 通常会話には反応しません
- LINE API エラーやイベント例外は `EVENT_LOG` に保存します
- ふつうの会話（`#` で始まらないもの）には返事をせず、`EVENT_LOG` にも書きません
- カードを LINE が受けつけなかったときは、文字だけで返事をして、原因を Script Properties の `LAST_LINE_ERRORS`（最後の5件）と `EVENT_LOG` に残します
- `replyToken` は各イベントで1回のみ利用しています

## 使い心地の決まりとちがうところ

- 入力中の表示：LINE の「入力中…」は1対1のトークでしか出せないため、グループで使うこのボットでは出していません。代わりに、シートや設定を1回の返事で1回だけ読むようにして、返事を速くしています
- 見出しのロゴ・アイコン・紹介のページ：名前とアイコンが決まってから足します
- 送るボタン：ほかのトークを選んで送るのではなく、開いたトークに `#コード` を送るので、ボタンは「💬 グループに送る」です
