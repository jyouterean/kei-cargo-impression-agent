# X API 認証情報の設定ガイド

## 📋 画像から取得できる認証情報と環境変数の対応

### 方法1: Bearer Token を使用（最も簡単・推奨）

画像の **「ベアラートークン (Bearer Token)」** セクションから：

1. Bearer Token をコピー（「再生成」の左側に表示されているトークン）
2. Vercel の環境変数に設定：

```
X_BEARER_TOKEN=ここにBearer Tokenを貼り付け
```

✅ **これだけで認証が完了します！** Bearer Tokenだけでユーザー情報の取得や検索ができます。

---

### 方法2: OAuth 1.0a を使用（投稿にも必要）

画像の **「OAuth 1.0 キー (OAuth 1.0 Key)」** セクションから：

#### 1. Consumer Key（コンシューマーキー）
- 「表示する (Show)」ボタンをクリックしてトークンを表示
- コピーして以下に設定：

```
X_OAUTH1_CONSUMER_KEY=ここにConsumer Keyを貼り付け
```

#### 2. Consumer Secret（コンシューマーシークレット）
⚠️ **画像には表示されていませんが、必要です！**
- 「コンシューマーキー」の下に「コンシューマーシークレット」があるはずです
- 「表示する (Show)」ボタンで表示してコピー：

```
X_OAUTH1_CONSUMER_SECRET=ここにConsumer Secretを貼り付け
```

#### 3. Access Token（アクセストークン）と Access Token Secret
⚠️ **画像の「@keiikamotu」は実際のトークンではありません！**

- 「生成する (Generate)」ボタンをクリック
- Access Token と Access Token Secret が生成されます
- 両方ともコピー：

```
X_OAUTH1_ACCESS_TOKEN=ここにAccess Tokenを貼り付け
X_OAUTH1_ACCESS_TOKEN_SECRET=ここにAccess Token Secretを貼り付け
```

**重要**: 
- Access Token を生成する前に、X Developer Portal で **「App Permissions」を「Read and Write」** に設定してください
- 権限を変更した後は、**必ず Access Token を再生成**してください

---

### 方法3: OAuth 2.0（現在は未使用）

画像の **「OAuth 2.0 キー」** は、**現在のコードでは使用していません**。
設定する必要はありません。

---

## 🎯 推奨設定

### 最小限の設定（検索とユーザー情報取得のみ）

```
X_BEARER_TOKEN=あなたのBearer Token
```

### 完全な設定（検索 + 投稿）

```
X_BEARER_TOKEN=あなたのBearer Token
X_OAUTH1_CONSUMER_KEY=あなたのConsumer Key
X_OAUTH1_CONSUMER_SECRET=あなたのConsumer Secret
X_OAUTH1_ACCESS_TOKEN=あなたのAccess Token
X_OAUTH1_ACCESS_TOKEN_SECRET=あなたのAccess Token Secret
```

---

## ✅ Vercel への設定方法

1. Vercel ダッシュボードを開く
2. プロジェクト → Settings → Environment Variables
3. 上記の環境変数を一つずつ追加：
   - **Key**: `X_BEARER_TOKEN`
   - **Value**: トークンの値
   - **Environment**: Production, Preview, Development すべてにチェック
4. 保存後、再デプロイ

---

## 🔍 確認方法

設定後、管理者画面の「接続状況」タブで確認：
- ✅ 接続済み → 成功
- ❌ エラーメッセージ → 上記の設定を再確認

