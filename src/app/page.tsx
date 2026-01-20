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

type Tab = "dashboard" | "research" | "analytics" | "triggers" | "activity" | "history" | "accounts";

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

  // Force refresh when tab changes to ensure fresh data
  useEffect(() => {
    if (activeTab === "dashboard" || activeTab === "research" || activeTab === "analytics") {
      fetchData();
    }
  }, [activeTab]);

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
              { id: "activity" as Tab, label: "アクティビティ" },
              { id: "history" as Tab, label: "投稿履歴" },
              { id: "research" as Tab, label: "リサーチ結果" },
              { id: "analytics" as Tab, label: "インプレッション分析" },
              { id: "triggers" as Tab, label: "トリガー制御" },
              { id: "accounts" as Tab, label: "アカウント管理" },
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
        {activeTab === "activity" && <ActivityTab />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "research" && <ResearchTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "triggers" && (
          <TriggersTab cronConfig={cronConfig} onToggle={toggleCron} />
        )}
        {activeTab === "accounts" && <AccountsTab />}
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

  const fetchResearch = async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/research?days=7&limit=50");
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const d = await res.json();
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResearch();
    // Refresh every 30 seconds when tab is active
    const interval = setInterval(fetchResearch, 30000);
    
    // Listen for buzz harvest completion event
    const handleBuzzHarvestComplete = () => {
      setTimeout(fetchResearch, 2000); // Wait 2 seconds for data to be saved
    };
    window.addEventListener("buzzHarvestComplete", handleBuzzHarvestComplete);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener("buzzHarvestComplete", handleBuzzHarvestComplete);
    };
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">リサーチサマリー</h3>
          <button
            onClick={fetchResearch}
            disabled={loading}
            className="btn btn-primary text-sm"
            title="データを更新"
          >
            {loading ? "更新中..." : "🔄 更新"}
          </button>
        </div>
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

// Activity Tab Component
function ActivityTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = async () => {
    try {
      setError(null);
      const res = await fetch("/api/activity?limit=100");
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 30000);
    return () => clearInterval(interval);
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

  if (!data || !data.activities || data.activities.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <p>アクティビティがありません</p>
      </div>
    );
  }

  const getActionIcon = (type: string, action: string) => {
    if (type === "post") return "📝";
    if (type === "scheduled") return "⏰";
    if (type === "harvest") return "🔍";
    if (type === "system") {
      if (action.includes("error") || action.includes("エラー")) return "❌";
      if (action.includes("warn") || action.includes("警告")) return "⚠️";
      return "ℹ️";
    }
    return "📌";
  };

  const getActionColor = (type: string, status?: string) => {
    if (type === "post" && status === "published") return "text-green-600";
    if (type === "scheduled") return "text-blue-600";
    if (type === "harvest") return "text-purple-600";
    if (type === "system") {
      if (status === "error" || status === "critical") return "text-red-600";
      if (status === "warn") return "text-yellow-600";
      return "text-gray-600";
    }
    return "text-gray-700";
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "たった今";
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    return time.toLocaleString("ja-JP");
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">アクティビティタイムライン</h3>
          <span className="text-sm text-gray-600">全{data.total || 0}件</span>
        </div>
        <div className="space-y-4 max-h-[800px] overflow-y-auto">
          {data.activities.map((activity: any) => (
            <div
              key={activity.id}
              className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="text-2xl">{getActionIcon(activity.type, activity.action)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-semibold ${getActionColor(activity.type, activity.status)}`}>
                    {activity.action}
                  </span>
                  {activity.platform && (
                    <span className={`badge ${activity.platform === "x" ? "badge-primary" : "badge-info"}`}>
                      {activity.platform === "x" ? "X" : "Threads"}
                    </span>
                  )}
                  {activity.status && activity.status !== "published" && (
                    <span className={`badge ${activity.status === "pending" ? "badge-warning" : "badge-danger"}`}>
                      {activity.status}
                    </span>
                  )}
                </div>
                {activity.content && (
                  <p className="text-sm text-gray-700 mb-2 line-clamp-2">{activity.content}</p>
                )}
                {activity.metrics && (
                  <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
                    {activity.metrics.impressions !== undefined && (
                      <span>👁️ {activity.metrics.impressions.toLocaleString()}</span>
                    )}
                    {activity.metrics.likes !== undefined && (
                      <span>❤️ {activity.metrics.likes}</span>
                    )}
                    {activity.metrics.reposts !== undefined && (
                      <span>🔄 {activity.metrics.reposts}</span>
                    )}
                    {activity.metrics.replies !== undefined && (
                      <span>💬 {activity.metrics.replies}</span>
                    )}
                  </div>
                )}
                {activity.metadata && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {activity.metadata.format && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        フォーマット: {activity.metadata.format}
                      </span>
                    )}
                    {activity.metadata.hookType && (
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                        フック: {activity.metadata.hookType}
                      </span>
                    )}
                    {activity.metadata.topic && (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                        トピック: {activity.metadata.topic}
                      </span>
                    )}
                    {activity.metadata.buzzScore !== undefined && (
                      <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">
                        BuzzScore: {activity.metadata.buzzScore.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {formatTimeAgo(activity.timestamp)} · {new Date(activity.timestamp).toLocaleString("ja-JP")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// History Tab Component
function HistoryTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("all");

  const fetchHistory = async () => {
    try {
      setError(null);
      setLoading(true);
      const url = platform === "all" ? "/api/posts/history?limit=100" : `/api/posts/history?limit=100&platform=${platform}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const d = await res.json();
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [platform]);

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

  if (!data || !data.posts || data.posts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <p>投稿履歴がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">投稿履歴と結果</h3>
          <div className="flex items-center gap-4">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="px-3 py-1 bg-white border border-gray-300 rounded text-sm"
            >
              <option value="all">すべて</option>
              <option value="x">X</option>
              <option value="threads">Threads</option>
            </select>
            <span className="text-sm text-gray-600">全{data.total || 0}件</span>
          </div>
        </div>
        <div className="space-y-4">
          {data.posts.map((post: any) => (
            <div
              key={post.id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`badge ${post.platform === "x" ? "badge-primary" : "badge-info"}`}>
                    {post.platform === "x" ? "X" : "Threads"}
                  </span>
                  {post.metadata.format && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      {post.metadata.format}
                    </span>
                  )}
                  {post.metadata.hookType && (
                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                      {post.metadata.hookType}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(post.publishedAt).toLocaleString("ja-JP")}
                </span>
              </div>
              <p className="text-sm text-gray-900 mb-3 whitespace-pre-wrap">{post.content}</p>
              {post.metrics && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-3 border-t border-gray-200">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">インプレッション</p>
                    <p className="text-lg font-bold text-blue-600">
                      {post.metrics.impressions?.toLocaleString() || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">いいね</p>
                    <p className="text-lg font-bold text-red-600">{post.metrics.likes || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">リポスト</p>
                    <p className="text-lg font-bold text-green-600">{post.metrics.reposts || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">リプライ</p>
                    <p className="text-lg font-bold text-purple-600">{post.metrics.replies || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">エンゲージ率</p>
                    <p className="text-lg font-bold text-orange-600">
                      {post.metrics.engagementRate ? `${post.metrics.engagementRate.toFixed(2)}%` : "-"}
                    </p>
                  </div>
                </div>
              )}
              {post.latestMetric && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    最終更新: {new Date(post.latestMetric.collectedAt).toLocaleString("ja-JP")} 
                    (投稿後{post.latestMetric.hoursAfterPublish}時間)
                  </p>
                </div>
              )}
              {post.externalId && (
                <div className="mt-2">
                  <a
                    href={`https://twitter.com/i/web/status/${post.externalId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    投稿を見る →
                  </a>
                </div>
              )}
            </div>
          ))}
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
  const [nextExecutions, setNextExecutions] = useState<Record<string, {
    nextExecution: string;
    minutesUntilNext: number;
    label: string;
    description: string;
    schedule: string;
  }> | null>(null);
  const [triggering, setTriggering] = useState<Record<string, boolean>>({});
  const [triggerResults, setTriggerResults] = useState<Record<string, {
    success: boolean;
    message: string;
    duration?: number;
    timestamp: string;
    data?: any;
  }>>({});

  const fetchNextExecutions = async () => {
    try {
      const res = await fetch("/api/cron/next-execution");
      if (res.ok) {
        const data = await res.json();
        setNextExecutions(data.nextExecutions);
      }
    } catch (error) {
      console.error("Failed to fetch next executions:", error);
    }
  };

  useEffect(() => {
    fetchNextExecutions();
    const interval = setInterval(fetchNextExecutions, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const handleManualTrigger = async (cronName: string) => {
    if (!confirm(`「${cronName}」を今すぐ実行しますか？`)) return;

    setTriggering((prev) => ({ ...prev, [cronName]: true }));
    setTriggerResults((prev) => {
      const newResults = { ...prev };
      delete newResults[cronName];
      return newResults;
    });

    try {
      const res = await fetch("/api/cron/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cronName }),
      });

      const data = await res.json();

      setTriggerResults((prev) => ({
        ...prev,
        [cronName]: {
          success: data.success || false,
          message: data.success
            ? `実行成功 (${data.duration}ms)`
            : data.error || "実行に失敗しました",
          duration: data.duration,
          timestamp: new Date().toISOString(),
          data: data.data, // Store full response data for detailed display
        },
      }));

      // Refresh data after successful execution
      if (data.success) {
        // Refresh cron config and other data
        setTimeout(async () => {
          // Refresh cron config
          try {
            const cronRes = await fetch("/api/cron-config");
            if (cronRes.ok) {
              const cronData = await cronRes.json();
              // Force parent component to refresh
              window.location.reload();
            }
          } catch (err) {
            console.error("Failed to refresh cron config:", err);
          }
        }, 1500);
      }
    } catch (error) {
      setTriggerResults((prev) => ({
        ...prev,
        [cronName]: {
          success: false,
          message: error instanceof Error ? error.message : "実行エラー",
          timestamp: new Date().toISOString(),
        },
      }));
    } finally {
      setTriggering((prev) => ({ ...prev, [cronName]: false }));
    }
  };

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

  const formatMinutesUntilNext = (minutes: number) => {
    if (minutes < 1) return "まもなく";
    if (minutes < 60) return `${minutes}分後`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) return `${hours}時間${mins}分後`;
    const days = Math.floor(hours / 24);
    const hrs = hours % 24;
    return `${days}日${hrs}時間後`;
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

            const nextExec = nextExecutions?.[key];

            const isTriggering = triggering[key];
            const result = triggerResults[key];

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
                    {isTriggering && (
                      <span className="badge badge-warning">実行中...</span>
                    )}
                    {result && (
                      <span className={`badge ${result.success ? "badge-success" : "badge-danger"}`}>
                        {result.success ? "✓ 成功" : "✗ 失敗"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{info.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                    <span>📅 {info.schedule}</span>
                    {config.lastRun && (
                      <span>🕒 最終実行: {new Date(config.lastRun).toLocaleString("ja-JP")}</span>
                    )}
                    {nextExec && config.enabled && (
                      <span className="text-blue-600 font-semibold">
                        ⏰ 次回実行まで: {formatMinutesUntilNext(nextExec.minutesUntilNext)}
                      </span>
                    )}
                    {nextExec && (
                      <span className="text-gray-400">
                        ({new Date(nextExec.nextExecution).toLocaleString("ja-JP")})
                      </span>
                    )}
                  </div>
                  {result && (
                    <div className={`mt-2 text-xs px-3 py-2 rounded ${
                      result.success
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {result.message || (result.success ? "実行完了" : "実行失敗")}
                      {result.duration && ` (${result.duration}ms)`}
                      {result.data && result.data.data && (
                        <div className="mt-1 text-xs">
                          {result.data.data.collected !== undefined && `収集: ${result.data.data.collected}件`}
                          {result.data.data.extracted !== undefined && `抽出: ${result.data.data.extracted}件`}
                          {result.data.data.generated !== undefined && `生成: ${result.data.data.generated}件`}
                          {result.data.data.published !== undefined && `公開: ${result.data.data.published}件`}
                          {result.data.data.skipped && ` (スキップ: ${result.data.data.reason || "不明"})`}
                        </div>
                      )}
                      <span className="text-gray-500 ml-2">
                        {new Date(result.timestamp).toLocaleTimeString("ja-JP")}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleManualTrigger(key)}
                    disabled={isTriggering}
                    className={`btn ${isTriggering ? "btn-disabled" : "btn-primary"}`}
                    title="今すぐ実行"
                  >
                    {isTriggering ? "実行中..." : "▶ 実行"}
                  </button>
                  <button
                    onClick={() => onToggle(key, !config.enabled)}
                    className={`btn ${config.enabled ? "btn-danger" : "btn-success"}`}
                  >
                    {config.enabled ? "無効化" : "有効化"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Accounts Tab Component
function AccountsTab() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchAccounts = async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleAddAccount = async (formData: FormData) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          platform: formData.get("platform"),
          xBearerToken: formData.get("xBearerToken") || undefined,
          xOAuthConsumerKey: formData.get("xOAuthConsumerKey") || undefined,
          xOAuthConsumerSecret: formData.get("xOAuthConsumerSecret") || undefined,
          xOAuthAccessToken: formData.get("xOAuthAccessToken") || undefined,
          xOAuthAccessTokenSecret: formData.get("xOAuthAccessTokenSecret") || undefined,
          threadsAccessToken: formData.get("threadsAccessToken") || undefined,
          threadsUserId: formData.get("threadsUserId") || undefined,
          maxPostsPerDay: parseInt(formData.get("maxPostsPerDay") as string) || undefined,
          minGapMinutes: parseInt(formData.get("minGapMinutes") as string) || undefined,
          isActive: formData.get("isActive") === "on",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "アカウントの追加に失敗しました");
      }
      setShowAddForm(false);
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!confirm("本当にこのアカウントを削除しますか？")) return;

    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("アカウントの削除に失敗しました");
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    }
  };

  const handleToggleActive = async (account: any) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: account.id,
          isActive: !account.isActive,
        }),
      });

      if (!res.ok) throw new Error("更新に失敗しました");
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner mx-auto mb-4" />
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">アカウント管理</h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn btn-success"
          >
            {showAddForm ? "キャンセル" : "+ アカウント追加"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {showAddForm && (
          <div className="border border-gray-200 rounded-lg p-6 mb-6 bg-gray-50">
            <h4 className="font-semibold mb-4 text-gray-900">新しいアカウントを追加</h4>
            <form action={handleAddAccount} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">アカウント名</label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="例: 軽貨物アカウント1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">プラットフォーム</label>
                  <select
                    name="platform"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  >
                    <option value="x">X</option>
                    <option value="threads">Threads</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-300 pt-4">
                <h5 className="font-medium mb-2 text-gray-900">X API認証情報</h5>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Bearer Token</label>
                    <input
                      type="password"
                      name="xBearerToken"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="任意"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Consumer Key</label>
                    <input
                      type="password"
                      name="xOAuthConsumerKey"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="任意"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Consumer Secret</label>
                    <input
                      type="password"
                      name="xOAuthConsumerSecret"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="任意"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Access Token</label>
                    <input
                      type="password"
                      name="xOAuthAccessToken"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="任意"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Access Token Secret</label>
                    <input
                      type="password"
                      name="xOAuthAccessTokenSecret"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="任意"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-300 pt-4">
                <h5 className="font-medium mb-2 text-gray-900">Threads API認証情報</h5>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Access Token</label>
                    <input
                      type="password"
                      name="threadsAccessToken"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="任意"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">User ID</label>
                    <input
                      type="text"
                      name="threadsUserId"
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="任意"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-gray-300 pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">1日の最大投稿数</label>
                  <input
                    type="number"
                    name="maxPostsPerDay"
                    min="1"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最小投稿間隔（分）</label>
                  <input
                    type="number"
                    name="minGapMinutes"
                    min="1"
                    max="1440"
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    placeholder="20"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">アクティブ</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-300">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  追加
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="empty-state py-8">
              <p className="text-gray-500">アカウントがありません</p>
            </div>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-gray-900">{account.name}</h4>
                    <span className={`badge ${account.platform === "x" ? "badge-primary" : "badge-info"}`}>
                      {account.platform === "x" ? "X" : "Threads"}
                    </span>
                    <span className={`badge ${account.isActive ? "badge-success" : "badge-danger"}`}>
                      {account.isActive ? "アクティブ" : "無効"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>📊 最大投稿数/日: {account.maxPostsPerDay}</span>
                    <span>⏱️ 最小間隔: {account.minGapMinutes}分</span>
                    <span>
                      {account.hasCredentials.x ? "✅ X認証" : "❌ X未認証"} ·{" "}
                      {account.hasCredentials.threads ? "✅ Threads認証" : "❌ Threads未認証"}
                    </span>
                  </div>
                  {account.lastUsedAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      最終使用: {new Date(account.lastUsedAt).toLocaleString("ja-JP")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(account)}
                    className={`btn ${account.isActive ? "btn-danger" : "btn-success"}`}
                  >
                    {account.isActive ? "無効化" : "有効化"}
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(account.id)}
                    className="btn btn-danger"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
