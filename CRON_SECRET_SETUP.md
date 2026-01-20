# CRON_SECRET の設定方法

## 概要
`CRON_SECRET`は、Cronジョブの認証用のシークレットトークンです。
Vercel Cronや手動実行時に、このトークンを使用してCronエンドポイントを保護します。

## 設定方法

### 1. ランダムな文字列を生成

ターミナルで以下のコマンドを実行して、セキュアなランダム文字列を生成します：

```bash
openssl rand -base64 32
```

例:
```
+jv6kCVk8yKhFhx4+FkO1SWuoyzLzKD6isMKAx7dzYs=
```

### 2. ローカル開発環境（.env.local）

プロジェクトルートに `.env.local` ファイルを作成（または編集）し、以下を追加：

```bash
CRON_SECRET=生成したランダム文字列
```

例:
```bash
CRON_SECRET=+jv6kCVk8yKhFhx4+FkO1SWuoyzLzKD6isMKAx7dzYs=
```

### 3. Vercel本番環境

1. Vercelダッシュボードにアクセス
2. プロジェクトを選択
3. Settings → Environment Variables
4. 以下の環境変数を追加：
   - **Name**: `CRON_SECRET`
   - **Value**: 生成したランダム文字列
   - **Environment**: Production, Preview, Development すべてにチェック

### 4. vercel.json の設定確認

`vercel.json` のCron設定で、`token` パラメータに `CRON_SECRET` を使用していることを確認：

```json
{
  "crons": [
    {
      "path": "/api/cron/buzz_harvest_x",
      "schedule": "0 * * * *"
    }
  ]
}
```

Vercelは自動的に `CRON_SECRET` 環境変数を `token` クエリパラメータとして渡します。

## セキュリティ注意事項

- ✅ **絶対にGitにコミットしない**（`.env.local`は`.gitignore`に含まれています）
- ✅ **本番環境と開発環境で異なる値を使用**することを推奨
- ✅ **定期的に変更**することを推奨（特に漏洩が疑われる場合）
- ✅ **長いランダム文字列を使用**（最低32文字以上推奨）

## トラブルシューティング

### 開発環境で認証エラーが出る場合

開発環境では、`CRON_SECRET`が設定されていない場合でも動作するように設計されています。
ただし、手動実行時にエラーが出る場合は、`.env.local`に`CRON_SECRET`を設定してください。

### 本番環境で認証エラーが出る場合

1. Vercelの環境変数が正しく設定されているか確認
2. `CRON_SECRET`の値に余分なスペースや改行がないか確認
3. Vercelのデプロイログで環境変数が読み込まれているか確認
