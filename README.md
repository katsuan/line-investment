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
- `pages/liff/`: GitHub Pages で配信する LIFF フロントの静的ファイル
- `RULES/`: このプロジェクト固有の運用前提、公開構成、段階導入ルール

番号は責務の層を表しています。

- `00`: 公開入口
- `01`: request / router
- `10`: usecase
- `20`: infra
- `30`: view
- `90`: setup
- `98-99`: shared / config

公開フロントは `src/` と混在させず、`pages/` 配下へ分離しています。

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
- `LIFF_APP_BASE_URL`: 任意。`#LIFF一覧` 用の GitHub Pages URL
- `MARKET_DATA_CACHE_MINUTES`: 任意。相場情報キャッシュ分数。既定値は `5`

## 初回セットアップ

1. `clasp push` を実行する
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
- LIFF のタブ順: `銘柄検索 / 注目一覧 / 注目実績`
- LIFF からのデータ取得: `doGet?action=liff_data`

`#LIFF一覧` は通常の使い方ガイドには載せず、デバッグ期間中のみ利用します。

### LIFF URL

`LIFF_APP_BASE_URL` には、GitHub Pages 側の LIFF URL を設定します。例:

- `https://<user>.github.io/<repo>/pages/liff/`

Bot 側はこの URL に `groupId` と初期 `view` を付けて返します。

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
- `pages/liff/` の画面で `watchlist` / `performance` が個別取得できること

## 注意点

- 初期実装は `group` のみ対応です
- 通常会話には反応しません
- LINE API エラーやイベント例外は `EVENT_LOG` に保存します
- `replyToken` は各イベントで1回のみ利用しています
- LIFF 段階導入の前提は [RULES/README.md](/Users/katsu/GitHub/T-FONTE投資部/RULES/README.md) と [RULES/01_liff_and_public_frontend_rules.md](/Users/katsu/GitHub/T-FONTE投資部/RULES/01_liff_and_public_frontend_rules.md) を参照してください
