# 🚚 kei-cargo-impression-agent v2

軽貨物チャンネル特化の X（Twitter）& Threads 自動運用エージェント。バズ学習と Contextual Bandit による投稿最適化。

## 🎯 特徴

- **外部バズ学習**: X の公開投稿からエンゲージメントの高い「勝ちパターン」を抽出
- **自己学習**: 自分の投稿インプレッションを収集し、Bandit アルゴリズムで最適化
- **安全性ポリシー**: 重複検知、NG表現フィルタ、レートリミット、自動停止機能
- **デュアルプラットフォーム**: X と Threads の両方に対応

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    Cron Scheduler                           │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│ Harvest  │ Pattern  │ Generate │ Publish  │ Learn          │
│ (60min)  │ (12h)    │ (6h)     │ (5min)   │ (12h)          │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴───────┬────────┘
     │          │          │          │             │
     ▼          ▼          ▼          ▼             ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ Buzz    │ │ Pattern │ │ Content │ │ Policy  │ │ Bandit  │
│Harvester│→│ Miner   │→│Generator│→│ Engine  │→│ Learner │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
     │                       │           │           │
     ▼                       ▼           ▼           ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                       │
│  external_posts | patterns | scheduled_posts | metrics       │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` を `.env` にコピーして設定:

```bash
cp .env.example .env
```

必要な環境変数:
- `DATABASE_URL`: PostgreSQL 接続文字列
- `X_BEARER_TOKEN`: X API Bearer Token
- `X_OAUTH1_*`: X OAuth 1.0a 認証情報（投稿用）
- `THREADS_ACCESS_TOKEN`: Threads API アクセストークン
- `THREADS_USER_ID`: Threads ユーザーID
- `OPENAI_API_KEY`: OpenAI API キー

### 3. データベースのセットアップ

```bash
# スキーマをプッシュ
npm run db:push

# NG表現をシード
npm run db:seed
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 でダッシュボードにアクセス。

## 📡 API エンドポイント

### Cron エンドポイント

| エンドポイント | 推奨間隔 | 説明 |
|---------------|---------|------|
| `/api/cron/buzz_harvest_x` | 60分 | X からバズ投稿を収集 |
| `/api/cron/pattern_mine` | 12時間 | パターン抽出・Bandit prior 更新 |
| `/api/cron/generate` | 6時間 | 投稿生成・スケジュール |
| `/api/cron/schedule` | 3時間 | スケジュールギャップを埋める |
| `/api/cron/publish` | 5分 | 予定投稿を公開 |
| `/api/cron/metrics` | 60分 | インプレッション収集 |
| `/api/cron/learn` | 12時間 | Bandit 更新・テンプレート最適化 |

### 管理 API

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/api/status` | GET | システム状態・統計 |
| `/api/posts` | GET | 投稿一覧 |
| `/api/learning` | GET | 学習状態 |
| `/api/admin/kill-switch` | GET/POST | 緊急停止スイッチ |

## 🛡️ 安全機能

### PolicyEngine

- **重複検知**: MinHash による類似度チェック（閾値: 88%）
- **NG表現フィルタ**: 誹謗中傷、差別、過度な煽りを検出
- **煽りスコア**: LLM による煽り度判定（閾値: 0.75）
- **レートリミット**: 日次投稿上限、最小間隔
- **連続失敗検知**: 5回連続失敗で自動停止

### Kill Switch

ダッシュボードまたは API から即座にすべての投稿を停止可能。

## 📊 学習システム

### 外部バズ学習

1. X Recent Search で軽貨物関連キーワードを検索
2. BuzzScore（エンゲージメント速度 / フォロワー数の対数）で上位を保存
3. LLM でパターン（format, hook_type, payload_type）を抽出
4. 週次で template_weights を更新

### 自己学習（Contextual Thompson Sampling）

1. 投稿時に arm（format × hook_type × topic × time）を選択
2. T+6h, T+24h, T+48h でインプレッションを収集
3. reward = log(1 + impressions) で Beta 分布を更新
4. 探索と活用のバランスを自動調整

## 🗂️ データベーススキーマ

- `external_posts`: 収集したバズ投稿
- `patterns`: 抽出した構造パターン
- `template_weights`: 週次テンプレート重み
- `arm_priors`: Bandit 学習パラメータ
- `scheduled_posts`: 予約投稿
- `published_posts`: 公開済み投稿
- `metrics`: パフォーマンス指標
- `ng_expressions`: NG表現辞書
- `system_events`: イベントログ

## 🎨 ダッシュボード

Tokyo Night テーマのモダンな監視ダッシュボード:

- リアルタイム投稿状況
- 週間パフォーマンス統計
- 学習状態の可視化
- イベントログ
- Kill Switch

## 📝 開発

```bash
# 開発サーバー
npm run dev

# ビルド
npm run build

# DB スタジオ
npm run db:studio

# 生成テスト
npm run test:generate
```

## ⚠️ 注意事項

- スパム/操作行為は禁止。公式 API のみ使用
- 返信機能は初期設定で OFF
- 投稿内容は必ず人間がレビュー可能な状態を維持
- API レートリミットに注意（特に X Recent Search）

## 📄 ライセンス

MIT
