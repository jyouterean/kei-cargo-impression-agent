# Vercelデプロイメント保護の設定方法

## 問題

Vercelのデプロイメント保護（Deployment Protection）が有効になっている場合、Cronエンドポイントにアクセスする際に認証が必要になります。これにより、Vercel Cronからの自動実行や手動実行が失敗します。

## 解決方法

### 方法1: Vercelダッシュボードで保護を無効化（推奨）

1. Vercelダッシュボードにアクセス
2. プロジェクトを選択
3. **Settings** → **Deployment Protection** を開く
4. **「Vercel Authentication」** を無効化するか、**「Protection Bypass for Automation」** を有効化

### 方法2: 特定のパスを保護から除外

Vercelのデプロイメント保護設定で、以下のパスを保護から除外：

```
/api/cron/**
```

### 方法3: 保護バイパストークンを使用

1. Vercelダッシュボードで **Settings** → **Deployment Protection** を開く
2. **「Protection Bypass」** セクションでバイパストークンを取得
3. Cronエンドポイントにアクセスする際に、以下の形式でURLに追加：

```
https://your-project.vercel.app/api/cron/buzz_harvest_x?x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=YOUR_BYPASS_TOKEN
```

**注意**: この方法は手動テスト用で、Vercel Cronからの自動実行には適用されません。

## 推奨設定

### 本番環境
- デプロイメント保護を有効化
- `/api/cron/**` パスを保護から除外
- `CRON_SECRET` による認証でセキュリティを確保

### プレビュー環境
- デプロイメント保護を無効化（開発・テスト用）

## 確認方法

以下のコマンドでCronエンドポイントにアクセスできるか確認：

```bash
curl "https://your-project.vercel.app/api/cron/buzz_harvest_x?token=YOUR_CRON_SECRET"
```

認証ページが表示されず、JSONレスポンスが返ってくれば成功です。

## 参考リンク

- [Vercel Deployment Protection Documentation](https://vercel.com/docs/deployment-protection)
- [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)

