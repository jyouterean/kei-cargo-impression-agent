import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================
// External Posts (X) - Collected from buzz harvesting
// ============================================================
export const externalPosts = pgTable(
  "external_posts",
  {
    id: serial("id").primaryKey(),
    externalId: varchar("external_id", { length: 64 }).notNull().unique(),
    platform: varchar("platform", { length: 16 }).notNull().default("x"),
    text: text("text").notNull(),
    authorId: varchar("author_id", { length: 64 }).notNull(),
    authorFollowersCount: integer("author_followers_count").default(0),
    createdAt: timestamp("created_at").notNull(),
    collectedAt: timestamp("collected_at").notNull().defaultNow(),
    // Public metrics
    likeCount: integer("like_count").default(0),
    repostCount: integer("repost_count").default(0),
    replyCount: integer("reply_count").default(0),
    quoteCount: integer("quote_count").default(0),
    // Calculated scores
    buzzScore: real("buzz_score").default(0),
    velocity: real("velocity").default(0),
    // Flags
    isJapanese: boolean("is_japanese").default(true),
    hasKeywordMatch: boolean("has_keyword_match").default(true),
    isSpamSuspect: boolean("is_spam_suspect").default(false),
  },
  (table) => [
    index("external_posts_buzz_score_idx").on(table.buzzScore),
    index("external_posts_collected_at_idx").on(table.collectedAt),
  ]
);

// ============================================================
// Patterns - Extracted structural patterns from buzz posts
// ============================================================
export const patterns = pgTable(
  "patterns",
  {
    id: serial("id").primaryKey(),
    externalPostId: integer("external_post_id")
      .references(() => externalPosts.id)
      .notNull(),
    extractedAt: timestamp("extracted_at").notNull().defaultNow(),
    // Structural elements
    format: varchar("format", { length: 32 }), // one_liner, checklist, compare, story, faq, question, myth_bust
    hookType: varchar("hook_type", { length: 32 }), // 警告, 損失回避, 逆説, 数字, 実体験, 炎上予防, テンプレ宣言
    payloadType: varchar("payload_type", { length: 32 }), // ノウハウ, あるある, 求人心理, 単価比較, 税・保険, 装備, 季節波動
    rhetorical: varchar("rhetorical", { length: 32 }), // 箇条書き, 対比, BeforeAfter, 結論→理由, 質問→回答
    lengthBucket: varchar("length_bucket", { length: 16 }), // short, medium, long
    emojiDensity: varchar("emoji_density", { length: 16 }), // none, low, medium, high
    punctuationStyle: varchar("punctuation_style", { length: 32 }),
    // Quality flags
    tabooFlags: jsonb("taboo_flags").$type<string[]>().default([]),
    qualityScore: real("quality_score").default(1.0),
  },
  (table) => [
    index("patterns_format_idx").on(table.format),
    index("patterns_hook_type_idx").on(table.hookType),
  ]
);

// ============================================================
// Template Weights - Weekly optimized template distribution
// ============================================================
export const templateWeights = pgTable(
  "template_weights",
  {
    id: serial("id").primaryKey(),
    weekStart: timestamp("week_start").notNull(),
    platform: varchar("platform", { length: 16 }).notNull(),
    format: varchar("format", { length: 32 }),
    hookType: varchar("hook_type", { length: 32 }),
    payloadType: varchar("payload_type", { length: 32 }),
    weight: real("weight").notNull().default(1.0),
    sampleCount: integer("sample_count").default(0),
    avgBuzzScore: real("avg_buzz_score").default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("template_weights_week_idx").on(table.weekStart),
    uniqueIndex("template_weights_unique_idx").on(
      table.weekStart,
      table.platform,
      table.format,
      table.hookType,
      table.payloadType
    ),
  ]
);

// ============================================================
// Arm Priors - Bandit learning priors from external patterns
// ============================================================
export const armPriors = pgTable("arm_priors", {
  id: serial("id").primaryKey(),
  armId: varchar("arm_id", { length: 128 }).notNull().unique(),
  platform: varchar("platform", { length: 16 }).notNull(),
  format: varchar("format", { length: 32 }),
  hookType: varchar("hook_type", { length: 32 }),
  topic: varchar("topic", { length: 64 }),
  lengthBucket: varchar("length_bucket", { length: 16 }),
  timeBucket: varchar("time_bucket", { length: 16 }),
  dayOfWeek: integer("day_of_week"),
  emojiDensity: varchar("emoji_density", { length: 16 }),
  // Thompson Sampling parameters
  alpha: real("alpha").notNull().default(1.0),
  beta: real("beta").notNull().default(1.0),
  // UCB parameters
  totalReward: real("total_reward").default(0),
  pullCount: integer("pull_count").default(0),
  source: varchar("source", { length: 32 }).default("external_patterns"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// Scheduled Posts - Posts waiting to be published
// ============================================================
export const scheduledPosts = pgTable(
  "scheduled_posts",
  {
    id: serial("id").primaryKey(),
    platform: varchar("platform", { length: 16 }).notNull(),
    content: text("content").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // Generation metadata
    armId: varchar("arm_id", { length: 128 }),
    format: varchar("format", { length: 32 }),
    hookType: varchar("hook_type", { length: 32 }),
    topic: varchar("topic", { length: 64 }),
    // Status
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending, published, failed, cancelled
    retryCount: integer("retry_count").default(0),
    // Similarity check
    contentHash: varchar("content_hash", { length: 64 }),
    similarityChecked: boolean("similarity_checked").default(false),
  },
  (table) => [
    index("scheduled_posts_status_idx").on(table.status),
    index("scheduled_posts_scheduled_for_idx").on(table.scheduledFor),
  ]
);

// ============================================================
// Published Posts - Successfully posted content
// ============================================================
export const publishedPosts = pgTable(
  "published_posts",
  {
    id: serial("id").primaryKey(),
    scheduledPostId: integer("scheduled_post_id").references(
      () => scheduledPosts.id
    ),
    platform: varchar("platform", { length: 16 }).notNull(),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    content: text("content").notNull(),
    publishedAt: timestamp("published_at").notNull().defaultNow(),
    // Generation metadata
    armId: varchar("arm_id", { length: 128 }),
    format: varchar("format", { length: 32 }),
    hookType: varchar("hook_type", { length: 32 }),
    topic: varchar("topic", { length: 64 }),
    // Similarity tracking
    contentHash: varchar("content_hash", { length: 64 }),
    minhashSignature: jsonb("minhash_signature").$type<number[]>(),
  },
  (table) => [
    index("published_posts_platform_idx").on(table.platform),
    index("published_posts_published_at_idx").on(table.publishedAt),
    uniqueIndex("published_posts_external_id_idx").on(
      table.platform,
      table.externalId
    ),
  ]
);

// ============================================================
// Metrics - Collected performance metrics
// ============================================================
export const metrics = pgTable(
  "metrics",
  {
    id: serial("id").primaryKey(),
    publishedPostId: integer("published_post_id")
      .references(() => publishedPosts.id)
      .notNull(),
    collectedAt: timestamp("collected_at").notNull().defaultNow(),
    hoursAfterPublish: integer("hours_after_publish").notNull(), // 6, 24, 48
    // X metrics
    impressionCount: integer("impression_count"),
    likeCount: integer("like_count"),
    repostCount: integer("repost_count"),
    replyCount: integer("reply_count"),
    quoteCount: integer("quote_count"),
    profileVisits: integer("profile_visits"),
    // Threads metrics
    threadsLikes: integer("threads_likes"),
    threadsReplies: integer("threads_replies"),
    threadsReposts: integer("threads_reposts"),
    threadsQuotes: integer("threads_quotes"),
    // Calculated reward
    reward: real("reward"),
  },
  (table) => [
    index("metrics_published_post_idx").on(table.publishedPostId),
    index("metrics_hours_idx").on(table.hoursAfterPublish),
  ]
);

// ============================================================
// Learning State - Bandit algorithm state
// ============================================================
export const learningState = pgTable("learning_state", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// System Events - Audit log and monitoring
// ============================================================
export const systemEvents = pgTable(
  "system_events",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("info"), // debug, info, warn, error, critical
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("system_events_type_idx").on(table.eventType),
    index("system_events_severity_idx").on(table.severity),
    index("system_events_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================
// NG Expressions - Blocked terms and patterns
// ============================================================
export const ngExpressions = pgTable("ng_expressions", {
  id: serial("id").primaryKey(),
  pattern: text("pattern").notNull(),
  patternType: varchar("pattern_type", { length: 16 }).notNull().default("exact"), // exact, regex, contains
  category: varchar("category", { length: 32 }), // 誹謗中傷, 差別, 煽り, スパム, etc.
  severity: real("severity").notNull().default(1.0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// Rate Limit State - Track API usage
// ============================================================
export const rateLimitState = pgTable("rate_limit_state", {
  id: serial("id").primaryKey(),
  platform: varchar("platform", { length: 16 }).notNull(),
  endpoint: varchar("endpoint", { length: 64 }).notNull(),
  windowStart: timestamp("window_start").notNull(),
  requestCount: integer("request_count").default(0),
  limitRemaining: integer("limit_remaining"),
  resetAt: timestamp("reset_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Type exports
export type ExternalPost = typeof externalPosts.$inferSelect;
export type NewExternalPost = typeof externalPosts.$inferInsert;
export type Pattern = typeof patterns.$inferSelect;
export type NewPattern = typeof patterns.$inferInsert;
export type TemplateWeight = typeof templateWeights.$inferSelect;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type NewScheduledPost = typeof scheduledPosts.$inferInsert;
export type PublishedPost = typeof publishedPosts.$inferSelect;
export type NewPublishedPost = typeof publishedPosts.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type SystemEvent = typeof systemEvents.$inferSelect;

