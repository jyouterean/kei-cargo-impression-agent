"use client";

import { useEffect, useState } from "react";

interface SystemStatus {
  system: { killSwitch: boolean; timestamp: string };
  queue: { pending: number; nextScheduled?: string };
  todayStats: {
    x: { posted: number; limit: number };
    threads: { posted: number; limit: number };
    errors: number;
  };
  weekStats: {
    externalPostsCollected: number;
    totalPosts: number;
    avgImpressions: number;
    avgEngagement: number;
  };
  recentEvents: Array<{ type: string; severity: string; message: string; time: string }>;
}

interface CronConfig {
  [key: string]: { enabled: boolean; lastRun: string | null };
}

type Tab = "dashboard" | "research" | "analytics" | "triggers";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [cronConfig, setCronConfig] = useState<CronConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  const fetchData = async () => {
    try {
      const [statusRes, cronRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/cron-config"),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
        setKillSwitchActive(data.system?.killSwitch || false);
      }
      if (cronRes.ok) {
        setCronConfig(await cronRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleKillSwitch = async () => {
    try {
      const res = await fetch("/api/admin/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !killSwitchActive }),
      });
      if (res.ok) setKillSwitchActive(!killSwitchActive);
    } catch (err) {
      console.error("Failed to toggle kill switch:", err);
    }
  };

  const toggleCron = async (cronName: string, enabled: boolean) => {
    try {
      const res = await fetch("/api/cron-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronName, enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setCronConfig(data.config);
      }
    } catch (err) {
      console.error("Failed to toggle cron:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-[var(--accent-cyan)] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">🚚</span>
              <span className="bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] bg-clip-text text-transparent">
                軽貨物インプレッションエージェント
              </span>
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">管理者ダッシュボード</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--text-muted)]">
              {killSwitchActive ? "🔴 停止中" : "🟢 稼働中"}
            </span>
            <button
              onClick={toggleKillSwitch}
              className={`kill-switch ${killSwitchActive ? "active" : ""}`}
              title="Kill Switch"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 border-t border-[var(--border-color)]">
          {[
            { id: "dashboard" as Tab, label: "📊 ダッシュボード", icon: "📊" },
            { id: "research" as Tab, label: "🔍 リサーチ結果", icon: "🔍" },
            { id: "analytics" as Tab, label: "📈 インプレッション分析", icon: "📈" },
            { id: "triggers" as Tab, label: "⚙️ トリガー制御", icon: "⚙️" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-[var(--accent-cyan)] border-b-2 border-[var(--accent-cyan)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && <DashboardTab status={status} />}
        {activeTab === "research" && <ResearchTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "triggers" && (
          <TriggersTab cronConfig={cronConfig} onToggle={(name, enabled) => toggleCron(name, enabled)} />
        )}
      </main>
    </div>
  );
}

// Dashboard Tab Component
function DashboardTab({ status }: { status: SystemStatus | null }) {
  if (!status) return <div>データなし</div>;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card stat-card-x">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-x">X</span>
            <span className="text-2xl">𝕏</span>
          </div>
          <div className="metric-value">
            {status.todayStats.x.posted}/{status.todayStats.x.limit}
          </div>
          <p className="metric-label">本日の投稿</p>
        </div>

        <div className="card stat-card-threads">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-threads">Threads</span>
            <span className="text-2xl">🧵</span>
          </div>
          <div className="metric-value">
            {status.todayStats.threads.posted}/{status.todayStats.threads.limit}
          </div>
          <p className="metric-label">本日の投稿</p>
        </div>

        <div className="card stat-card-success">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-success">週間平均</span>
            <span className="text-2xl">👁️</span>
          </div>
          <div className="metric-value">
            {Math.round(status.weekStats.avgImpressions).toLocaleString()}
          </div>
          <p className="metric-label">インプレッション</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-info">キュー</span>
            <span className="text-2xl">📋</span>
          </div>
          <div className="metric-value">{status.queue.pending}</div>
          <p className="metric-label">予約投稿</p>
        </div>
      </div>

      {/* Recent Events */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📜</span> 最近のイベント
        </h3>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {status.recentEvents.map((event, i) => (
            <div key={i} className="event-item">
              <div
                className={`event-dot event-dot-${event.severity === "error" ? "error" : event.severity === "warn" ? "warn" : "info"}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{event.message}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {event.type} · {new Date(event.time).toLocaleString("ja-JP")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Research Tab Component
function ResearchTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/research?days=7&limit=50")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div>読み込み中...</div>;
  if (!data) return <div>データなし</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">📊 リサーチサマリー</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-[var(--accent-cyan)]">
              {data.summary.totalCollected}
            </p>
            <p className="text-sm text-[var(--text-muted)]">収集投稿数</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--accent-purple)]">
              {data.summary.avgBuzzScore.toFixed(2)}
            </p>
            <p className="text-sm text-[var(--text-muted)]">平均BuzzScore</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--accent-green)]">
              {data.summary.totalPatterns}
            </p>
            <p className="text-sm text-[var(--text-muted)]">抽出パターン数</p>
          </div>
        </div>
      </div>

      {/* Top Buzz Posts */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">🔥 トップバズ投稿</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>投稿内容</th>
                <th>BuzzScore</th>
                <th>エンゲージメント</th>
                <th>収集日時</th>
              </tr>
            </thead>
            <tbody>
              {data.topBuzzPosts.slice(0, 10).map((post: any) => (
                <tr key={post.id}>
                  <td className="max-w-md truncate">{post.text.slice(0, 100)}...</td>
                  <td>
                    <span className="text-[var(--accent-orange)] font-semibold">
                      {post.buzzScore.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    {post.metrics.likes + post.metrics.reposts + post.metrics.replies}
                  </td>
                  <td className="text-sm text-[var(--text-muted)]">
                    {new Date(post.collectedAt).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pattern Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <h4 className="font-semibold mb-4">フォーマット分布</h4>
          <div className="space-y-2">
            {Object.entries(data.patternStats.formats)
              .sort(([, a], [, b]) => (b as any).avgBuzz - (a as any).avgBuzz)
              .slice(0, 5)
              .map(([name, stats]: [string, any]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm">{name}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {stats.count}件 · {stats.avgBuzz.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-4">フックタイプ分布</h4>
          <div className="space-y-2">
            {Object.entries(data.patternStats.hookTypes)
              .sort(([, a], [, b]) => (b as any).avgBuzz - (a as any).avgBuzz)
              .slice(0, 5)
              .map(([name, stats]: [string, any]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm">{name}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {stats.count}件 · {stats.avgBuzz.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-4">ペイロードタイプ分布</h4>
          <div className="space-y-2">
            {Object.entries(data.patternStats.payloadTypes)
              .sort(([, a], [, b]) => (b as any).avgBuzz - (a as any).avgBuzz)
              .slice(0, 5)
              .map(([name, stats]: [string, any]) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm">{name}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {stats.count}件 · {stats.avgBuzz.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Analytics Tab Component
function AnalyticsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`/api/analytics?days=${days}`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  if (loading) return <div>読み込み中...</div>;
  if (!data) return <div>データなし</div>;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">📊 インプレッション分析</h3>
          <select
            value={days}
            onChange={(e) => {
              setDays(Number(e.target.value));
              setLoading(true);
            }}
            className="px-3 py-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-sm"
          >
            <option value={7}>過去7日</option>
            <option value={30}>過去30日</option>
            <option value={90}>過去90日</option>
          </select>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-[var(--accent-cyan)]">
              {data.summary.totalPosts}
            </p>
            <p className="text-sm text-[var(--text-muted)]">総投稿数</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--accent-purple)]">
              {Math.round(data.summary.totalImpressions).toLocaleString()}
            </p>
            <p className="text-sm text-[var(--text-muted)]">総インプレッション</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--accent-green)]">
              {Math.round(data.summary.avgImpressions).toLocaleString()}
            </p>
            <p className="text-sm text-[var(--text-muted)]">平均インプレッション</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--accent-yellow)]">
              {Math.round(data.summary.avgEngagement * 10) / 10}
            </p>
            <p className="text-sm text-[var(--text-muted)]">平均エンゲージメント</p>
          </div>
        </div>
      </div>

      {/* Daily Trend */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">📈 日次トレンド</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>投稿数</th>
                <th>インプレッション</th>
                <th>エンゲージメント</th>
              </tr>
            </thead>
            <tbody>
              {data.dailyTrend.slice(-14).map((day: any) => (
                <tr key={day.date}>
                  <td>{day.date}</td>
                  <td>{day.posts}</td>
                  <td className="text-[var(--accent-cyan)]">
                    {Math.round(day.impressions).toLocaleString()}
                  </td>
                  <td className="text-[var(--accent-green)]">
                    {Math.round(day.engagement * 10) / 10}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Performance by Format/Hook/Topic */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <h4 className="font-semibold mb-4">フォーマット別パフォーマンス</h4>
          <div className="space-y-3">
            {data.performanceByFormat.slice(0, 5).map((item: any) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-[var(--accent-cyan)]">
                    {Math.round(item.avgImpressions).toLocaleString()}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill progress-fill-blue"
                    style={{
                      width: `${Math.min(100, (item.avgImpressions / Math.max(...data.performanceByFormat.map((p: any) => p.avgImpressions))) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {item.count}件投稿
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-4">フックタイプ別パフォーマンス</h4>
          <div className="space-y-3">
            {data.performanceByHook.slice(0, 5).map((item: any) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-[var(--accent-purple)]">
                    {Math.round(item.avgImpressions).toLocaleString()}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill progress-fill-purple"
                    style={{
                      width: `${Math.min(100, (item.avgImpressions / Math.max(...data.performanceByHook.map((p: any) => p.avgImpressions))) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {item.count}件投稿
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-4">トピック別パフォーマンス</h4>
          <div className="space-y-3">
            {data.performanceByTopic.slice(0, 5).map((item: any) => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-[var(--accent-green)]">
                    {Math.round(item.avgImpressions).toLocaleString()}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill progress-fill-green"
                    style={{
                      width: `${Math.min(100, (item.avgImpressions / Math.max(...data.performanceByTopic.map((p: any) => p.avgImpressions))) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {item.count}件投稿
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Triggers Tab Component
function TriggersTab({
  cronConfig,
  onToggle,
}: {
  cronConfig: CronConfig | null;
  onToggle: (name: string, enabled: boolean) => void;
}) {
  if (!cronConfig) return <div>読み込み中...</div>;

  const cronNames: Record<string, { label: string; description: string; schedule: string }> = {
    buzz_harvest_x: {
      label: "バズ収集 (X)",
      description: "Xのバズ投稿を収集・分析",
      schedule: "60分ごと",
    },
    pattern_mine: {
      label: "パターン抽出",
      description: "収集した投稿から構造パターンを抽出",
      schedule: "12時間ごと",
    },
    generate: {
      label: "投稿生成",
      description: "新しい投稿を生成・スケジュール",
      schedule: "6時間ごと",
    },
    schedule: {
      label: "スケジュール管理",
      description: "予約投稿のギャップを埋める",
      schedule: "3時間ごと",
    },
    publish: {
      label: "投稿公開",
      description: "予定時刻になった投稿を公開",
      schedule: "5分ごと",
    },
    metrics: {
      label: "メトリクス収集",
      description: "インプレッション・エンゲージメントを収集",
      schedule: "60分ごと",
    },
    learn: {
      label: "学習更新",
      description: "Bandit学習・テンプレート最適化",
      schedule: "12時間ごと",
    },
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">⚙️ Cronトリガー設定</h3>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          各CronジョブのON/OFFを切り替えます。無効化されたCronは実行されません。
        </p>
        <div className="space-y-4">
          {Object.entries(cronNames).map(([key, info]) => {
            const config = cronConfig[key];
            if (!config) return null;

            return (
              <div
                key={key}
                className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-semibold">{info.label}</h4>
                    <span
                      className={`badge ${config.enabled ? "badge-success" : "badge-error"}`}
                    >
                      {config.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mb-2">
                    {info.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                    <span>📅 {info.schedule}</span>
                    {config.lastRun && (
                      <span>🕒 最終実行: {new Date(config.lastRun).toLocaleString("ja-JP")}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onToggle(key, !config.enabled)}
                  className={`px-6 py-2 rounded font-medium transition-colors ${
                    config.enabled
                      ? "bg-[var(--accent-red)] hover:bg-opacity-80"
                      : "bg-[var(--accent-green)] hover:bg-opacity-80"
                  }`}
                >
                  {config.enabled ? "無効化" : "有効化"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
