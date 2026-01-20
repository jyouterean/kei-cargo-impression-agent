# Cronトリガー動作確認ガイド

## テストエンドポイント

### 1. システム状態確認
```bash
GET /api/test/cron
```
データベース接続と既存データの確認

### 2. 手動実行テスト
```bash
POST /api/test/cron
Content-Type: application/json

{
  "action": "harvest"  # または "mine", "generate", "all"
}
```

## Cronトリガーの手動実行

### トリガー制御タブから実行
1. ダッシュボードの「トリガー制御」タブを開く
2. 実行したいCronジョブの「▶ 実行」ボタンをクリック
3. 確認ダイアログで「OK」を選択
4. 実行結果が表示される

### APIから直接実行
```bash
POST /api/cron/trigger
Content-Type: application/json

{
  "cronName": "buzz_harvest_x"  # または他のCron名
}
```

## 各Cronの動作確認手順

### 1. バズ収集 (buzz_harvest_x)
```bash
# 手動実行
curl -X POST "http://localhost:3000/api/cron/trigger" \
  -H "Content-Type: application/json" \
  -d '{"cronName": "buzz_harvest_x"}'
```

**確認方法:**
- リサーチタブで「トップバズ投稿」にデータが表示される
- アクティビティタブで「バズ収集」アクションが表示される

### 2. パターン抽出 (pattern_mine)
```bash
curl -X POST "http://localhost:3000/api/cron/trigger" \
  -H "Content-Type: application/json" \
  -d '{"cronName": "pattern_mine"}'
```

**確認方法:**
- リサーチタブで「フォーマット分布」「フックタイプ分布」にデータが表示される
- アクティビティタブで「パターン抽出」アクションが表示される

### 3. 投稿生成 (generate)
```bash
curl -X POST "http://localhost:3000/api/cron/trigger" \
  -H "Content-Type: application/json" \
  -d '{"cronName": "generate"}'
```

**確認方法:**
- ダッシュボードの「キュー」数が増える
- アクティビティタブで「スケジュール予約」アクションが表示される
- 投稿履歴タブで予約投稿が表示される

### 4. 投稿公開 (publish)
```bash
curl -X POST "http://localhost:3000/api/cron/trigger" \
  -H "Content-Type: application/json" \
  -d '{"cronName": "publish"}'
```

**確認方法:**
- 投稿履歴タブで公開済み投稿が表示される
- アクティビティタブで「投稿」アクションが表示される

### 5. メトリクス収集 (metrics)
```bash
curl -X POST "http://localhost:3000/api/cron/trigger" \
  -H "Content-Type: application/json" \
  -d '{"cronName": "metrics"}'
```

**確認方法:**
- 投稿履歴タブでインプレッション数が更新される
- インプレッション分析タブでデータが更新される

## データがダッシュボードに表示されない場合

### 確認事項
1. **データベースにデータが存在するか**
   ```bash
   GET /api/test/cron
   ```

2. **リサーチAPIが正しく動作しているか**
   ```bash
   GET /api/research?days=30&limit=100
   ```

3. **ブラウザのコンソールでエラーを確認**
   - F12で開発者ツールを開く
   - Consoleタブでエラーを確認

4. **タブを切り替えて再読み込み**
   - タブを切り替えると自動的にデータが再取得されます

## トラブルシューティング

### エラー: "Cron is disabled"
- トリガー制御タブで該当Cronを「有効化」してください

### エラー: "Kill switch is active"
- ヘッダーのKill SwitchをOFFにしてください

### データが表示されない
1. ブラウザをリロード（F5）
2. タブを切り替えて再読み込み
3. 30秒待って自動更新を確認
4. `/api/test/cron`でデータベースの状態を確認

