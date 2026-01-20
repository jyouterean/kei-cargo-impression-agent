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

interface ConnectionStatus {
  x: {
    connected: boolean;
    authenticated: boolean;
    username: string | null;
    error: string | null;
  };
  threads: {
    connected: boolean;
    authenticated: boolean;
    username: string | null;
    error: string | null;
  };
  timestamp: string;
}

type Tab = "dashboard" | "research" | "analytics" | "triggers";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [cronConfig, setCronConfig] = useState<CronConfig | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killSwitchActive, setKillSwitchActive] = useState(false);

  const fetchData = async () => {
    try {
      setError(null);
      const [statusRes, cronRes, connectionRes] = await Promise.all([
        fetch("/api/status").catch(() => null),
        fetch("/api/cron-config").catch(() => null),
        fetch("/api/connection-status").catch(() => null),
      ]);

      if (statusRes?.ok) {
        const data = await statusRes.json();
        setStatus(data);
        setKillSwitchActive(data.system?.killSwitch || false);
      }

      if (cronRes?.ok) {
        setCronConfig(await cronRes.json());
      }

      if (connectionRes?.ok) {
        setConnectionStatus(await connectionRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
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
      if (res.ok) {
        setKillSwitchActive(!killSwitchActive);
        await fetchData();
      }
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4" />
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">軽貨物インプレッションエージェント</h1>
              <p className="text-sm text-gray-600 mt-1">管理者ダッシュボード</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="status-indicator">
                <span className={`status-dot ${killSwitchActive ? "disconnected" : "connected"}`} />
                <span className="text-sm text-gray-700">
                  {killSwitchActive ? "停止中" : "稼働中"}
                </span>
              </div>
              <button
                onClick={toggleKillSwitch}
                className={`toggle-switch ${killSwitchActive ? "active" : ""}`}
                title="Kill Switch"
              />
            </div>
          </div>

          {/* SNS Connection Status */}
          {connectionStatus && (
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className={`status-dot ${connectionStatus.x.connected && connectionStatus.x.authenticated ? "connected" : connectionStatus.x.error ? "disconnected" : "unknown"}`} />
                <span className="text-gray-700">
                  X: {connectionStatus.x.connected && connectionStatus.x.authenticated
                    ? `@${connectionStatus.x.username || "接続済み"}`
                    : connectionStatus.x.error || "未接続"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`status-dot ${connectionStatus.threads.connected && connectionStatus.threads.authenticated ? "connected" : connectionStatus.threads.error ? "disconnected" : "unknown"}`} />
                <span className="text-gray-700">
                  Threads: {connectionStatus.threads.connected && connectionStatus.threads.authenticated
                    ? `@${connectionStatus.threads.username || "接続済み"}`
                    : connectionStatus.threads.error || "未接続"}
                </span>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-4 border-t border-gray-200">
            {[
              { id: "dashboard" as Tab, label: "ダッシュボード" },
              { id: "research" as Tab, label: "リサーチ結果" },
              { id: "analytics" as Tab, label: "インプレッション分析" },
              { id: "triggers" as Tab, label: "トリガー制御" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === "dashboard" && <DashboardTab status={status} />}
        {activeTab === "research" && <ResearchTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "triggers" && (
          <TriggersTab cronConfig={cronConfig} onToggle={toggleCron} />
        )}
      </main>
    </div>
  );
}

// Dashboard Tab Component
function DashboardTab({ status }: { status: SystemStatus | null }) {
  if (!status) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <p>データがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-primary">X</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {status.todayStats.x.posted}/{status.todayStats.x.limit}
          </div>
          <p className="text-sm text-gray-600">本日の投稿</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-info">Threads</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {status.todayStats.threads.posted}/{status.todayStats.threads.limit}
          </div>
          <p className="text-sm text-gray-600">本日の投稿</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-success">週間平均</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {Math.round(status.weekStats.avgImpressions).toLocaleString()}
          </div>
          <p className="text-sm text-gray-600">インプレッション</p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="badge badge-warning">キュー</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {status.queue.pending}
          </div>
          <p className="text-sm text-gray-600">予約投稿</p>
        </div>
      </div>

      {/* Recent Events */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">最近のイベント</h3>
        {status.recentEvents && status.recentEvents.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {status.recentEvents.map((event, i) => (
              <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                <span
                  className={`status-dot ${event.severity === "error" ? "disconnected" : event.severity === "warn" ? "unknown" : "connected"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{event.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {event.type} · {new Date(event.time).toLocaleString("ja-JP")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state py-8">
            <p className="text-gray-500">イベントがありません</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Research Tab Component
function ResearchTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/research?days=7&limit=50")
      .then((res) => {
        if (!res.ok) throw new Error("データの取得に失敗しました");
        return res.json();
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner mx-auto mb-4" />
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (!data || !data.topBuzzPosts || data.topBuzzPosts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔍</div>
        <p>リサーチデータがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">リサーチサマリー</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-blue-600">
              {data.summary?.totalCollected || 0}
            </p>
            <p className="text-sm text-gray-600">収集投稿数</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">
              {(data.summary?.avgBuzzScore || 0).toFixed(2)}
            </p>
            <p className="text-sm text-gray-600">平均BuzzScore</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {data.summary?.totalPatterns || 0}
            </p>
            <p className="text-sm text-gray-600">抽出パターン数</p>
          </div>
        </div>
      </div>

      {/* Top Buzz Posts */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">トップバズ投稿</h3>
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
                  <td className="max-w-md">{post.text?.slice(0, 100) || "-"}...</td>
                  <td>
                    <span className="font-semibold text-orange-600">
                      {(post.buzzScore || 0).toFixed(2)}
                    </span>
                  </td>
                  <td>
                    {((post.metrics?.likes || 0) + (post.metrics?.reposts || 0) + (post.metrics?.replies || 0))}
                  </td>
                  <td className="text-sm text-gray-600">
                    {post.collectedAt ? new Date(post.collectedAt).toLocaleString("ja-JP") : "-"}
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
          <h4 className="font-semibold mb-4 text-gray-900">フォーマット分布</h4>
          <div className="space-y-2">
            {data.patternStats?.formats ? (
              Object.entries(data.patternStats.formats)
                .sort(([, a], [, b]) => {
                  const aBuzz = (a as any)?.avgBuzz || 0;
                  const bBuzz = (b as any)?.avgBuzz || 0;
                  return bBuzz - aBuzz;
                })
                .slice(0, 5)
                .map(([name, stats]: [string, any]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{name}</span>
                    <span className="text-xs text-gray-600">
                      {stats.count || 0}件 · {(stats.avgBuzz || 0).toFixed(2)}
                    </span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-gray-500">データなし</p>
            )}
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-4 text-gray-900">フックタイプ分布</h4>
          <div className="space-y-2">
            {data.patternStats?.hookTypes ? (
              Object.entries(data.patternStats.hookTypes)
                .sort(([, a], [, b]) => {
                  const aBuzz = (a as any)?.avgBuzz || 0;
                  const bBuzz = (b as any)?.avgBuzz || 0;
                  return bBuzz - aBuzz;
                })
                .slice(0, 5)
                .map(([name, stats]: [string, any]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{name}</span>
                    <span className="text-xs text-gray-600">
                      {stats.count || 0}件 · {(stats.avgBuzz || 0).toFixed(2)}
                    </span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-gray-500">データなし</p>
            )}
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold mb-4 text-gray-900">ペイロードタイプ分布</h4>
          <div className="space-y-2">
            {data.patternStats?.payloadTypes ? (
              Object.entries(data.patternStats.payloadTypes)
                .sort(([, a], [, b]) => {
                  const aBuzz = (a as any)?.avgBuzz || 0;
                  const bBuzz = (b as any)?.avgBuzz || 0;
                  return bBuzz - aBuzz;
                })
                .slice(0, 5)
                .map(([name, stats]: [string, any]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{name}</span>
                    <span className="text-xs text-gray-600">
                      {stats.count || 0}件 · {(stats.avgBuzz || 0).toFixed(2)}
                    </span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-gray-500">データなし</p>
            )}
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
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?days=${days}`)
      .then((res) => {
        if (!res.ok) throw new Error("データの取得に失敗しました");
        return res.json();
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "エラーが発生しました");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner mx-auto mb-4" />
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📈</div>
        <p>分析データがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">インプレッション分析</h3>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-1 bg-white border border-gray-300 rounded text-sm"
          >
            <option value={7}>過去7日</option>
            <option value={30}>過去30日</option>
            <option value={90}>過去90日</option>
          </select>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-2xl font-bold text-blue-600">{data.summary?.totalPosts || 0}</p>
            <p className="text-sm text-gray-600">総投稿数</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">
              {Math.round(data.summary?.totalImpressions || 0).toLocaleString()}
            </p>
            <p className="text-sm text-gray-600">総インプレッション</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">
              {Math.round(data.summary?.avgImpressions || 0).toLocaleString()}
            </p>
            <p className="text-sm text-gray-600">平均インプレッション</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">
              {Math.round((data.summary?.avgEngagement || 0) * 10) / 10}
            </p>
            <p className="text-sm text-gray-600">平均エンゲージメント</p>
          </div>
        </div>
      </div>

      {/* Daily Trend */}
      {data.dailyTrend && data.dailyTrend.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">日次トレンド</h3>
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
                    <td>{day.posts || 0}</td>
                    <td className="text-blue-600">
                      {Math.round(day.impressions || 0).toLocaleString()}
                    </td>
                    <td className="text-green-600">
                      {Math.round((day.engagement || 0) * 10) / 10}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  if (!cronConfig) {
    return (
      <div className="empty-state">
        <div className="loading-spinner mx-auto mb-4" />
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

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
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 text-gray-900">Cronトリガー設定</h3>
        <p className="text-sm text-gray-600 mb-6">
          各CronジョブのON/OFFを切り替えます。無効化されたCronは実行されません。
        </p>
        <div className="space-y-3">
          {Object.entries(cronNames).map(([key, info]) => {
            const config = cronConfig[key];
            if (!config) return null;

            return (
              <div
                key={key}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-gray-900">{info.label}</h4>
                    <span className={`badge ${config.enabled ? "badge-success" : "badge-danger"}`}>
                      {config.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{info.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>📅 {info.schedule}</span>
                    {config.lastRun && (
                      <span>🕒 最終実行: {new Date(config.lastRun).toLocaleString("ja-JP")}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onToggle(key, !config.enabled)}
                  className={`btn ${config.enabled ? "btn-danger" : "btn-success"}`}
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
