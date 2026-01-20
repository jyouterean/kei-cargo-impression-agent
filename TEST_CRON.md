# Cronエンドポイントのテスト方法

## 実際のVercel URLを確認

画像から推測される実際のURL:
```
https://kei-cargo-impression-agent-kqvtyll9w.vercel.app
```

## テストコマンド

### 1. CRON_SECRETを確認

`.env.local` または Vercel の環境変数から `CRON_SECRET` の値を取得してください。

### 2. ローカル開発環境でテスト

```bash
# 開発サーバーが起動している場合
curl "http://localhost:3000/api/cron/buzz_harvest_x?token=YOUR_CRON_SECRET"
```

### 3. Vercel本番環境でテスト

```bash
# 実際のURLに置き換えてください
curl "https://kei-cargo-impression-agent-kqvtyll9w.vercel.app/api/cron/buzz_harvest_x?token=YOUR_CRON_SECRET"
```

### 4. 開発環境でCRON_SECRETが設定されていない場合

開発環境では、`CRON_SECRET`が設定されていない場合でも動作するように設計されています：

```bash
# 開発環境では token=dev または tokenなしで動作
curl "http://localhost:3000/api/cron/buzz_harvest_x?token=dev"
```

## エラーの種類と対処法

### NOT_FOUND エラー
- URLが間違っている可能性があります
- 実際のVercelプロジェクトURLを確認してください
- Vercelダッシュボードの「Deployments」から確認できます

### Unauthorized エラー
- `CRON_SECRET`が正しく設定されていない可能性があります
- Vercelの環境変数を確認してください

### Authentication Required エラー
- Vercelのデプロイメント保護が有効になっています
- `VERCEL_DEPLOYMENT_PROTECTION.md` を参照して設定を変更してください

## Vercel URLの確認方法

1. Vercelダッシュボードにアクセス
2. プロジェクトを選択
3. 「Deployments」タブを開く
4. 最新のデプロイメントのURLを確認
5. または、「Settings」→「Domains」でカスタムドメインを確認

