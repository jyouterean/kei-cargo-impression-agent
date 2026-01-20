// Configuration and environment variables
export const config = {
  // Kill switch
  killSwitch: process.env.KILL_SWITCH === "true",

  // Rate limits
  maxPostsPerDayX: parseInt(process.env.MAX_POSTS_PER_DAY_X || "40", 10),
  maxPostsPerDayThreads: parseInt(process.env.MAX_POSTS_PER_DAY_THREADS || "10", 10),
  minGapMinutes: parseInt(process.env.MIN_GAP_MINUTES || "20", 10),
  buzzTopKPerDay: parseInt(process.env.BUZZ_TOPK_PER_DAY || "200", 10),

  // Safety thresholds
  duplicateSimThreshold: parseFloat(process.env.DUPLICATE_SIM_THRESHOLD || "0.88"),
  ragebaitScoreThreshold: parseFloat(process.env.RAGEBAIT_SCORE_THRESHOLD || "0.75"),
  maxConsecutiveFails: parseInt(process.env.MAX_CONSECUTIVE_FAILS || "5", 10),

  // Buzz harvest queries
  buzzHarvestQueries: (() => {
    try {
      return JSON.parse(process.env.BUZZ_HARVEST_QUERIES || "[]") as string[];
    } catch {
      return [
        "軽貨物",
        "宅配",
        "軽配送",
        "委託ドライバー",
        "日当",
        "単価",
        "配達員",
        "点呼",
        "確定申告 配送",
      ];
    }
  })(),

  // Topics for content generation
  topics: [
    "単価交渉",
    "燃費改善",
    "確定申告",
    "車両選び",
    "委託vs正社員",
    "繁忙期対策",
    "体力管理",
    "ルート効率",
    "再配達対策",
    "保険選び",
    "開業準備",
    "時間管理",
    "顧客対応",
    "トラブル対処",
    "副業軽貨物",
  ],

  // Format types
  formats: [
    "one_liner",
    "checklist",
    "compare",
    "story",
    "faq",
    "question",
    "myth_bust",
  ] as const,

  // Hook types
  hookTypes: [
    "警告",
    "損失回避",
    "逆説",
    "数字",
    "実体験",
    "炎上予防",
    "テンプレ宣言",
  ] as const,

  // Payload types
  payloadTypes: [
    "ノウハウ",
    "あるある",
    "求人心理",
    "単価比較",
    "税・保険",
    "装備",
    "季節波動",
  ] as const,

  // Time buckets
  timeBuckets: [
    "early_morning", // 5-7
    "morning",       // 7-9
    "late_morning",  // 9-12
    "afternoon",     // 12-15
    "evening",       // 15-18
    "night",         // 18-21
    "late_night",    // 21-24
  ] as const,

  // Initial timing priors for X (higher = more likely to be selected)
  xTimingPriors: {
    0: 0.5,  // Sunday
    1: 1.5,  // Monday - 8時
    2: 1.5,  // Tuesday - 8時
    3: 2.0,  // Wednesday - 9時 (highest)
    4: 1.2,  // Thursday
    5: 1.0,  // Friday
    6: 0.5,  // Saturday
  } as Record<number, number>,

  // Initial timing priors for Threads
  threadsTimingPriors: {
    morning: 2.0,
    early_morning: 1.5,
    late_morning: 1.0,
    afternoon: 0.8,
    evening: 0.5,
    night: 0.3,
    late_night: 0.1,
  } as Record<string, number>,
} as const;

export type Format = (typeof config.formats)[number];
export type HookType = (typeof config.hookTypes)[number];
export type PayloadType = (typeof config.payloadTypes)[number];
export type TimeBucket = (typeof config.timeBuckets)[number];

