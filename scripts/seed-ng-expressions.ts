/**
 * Seed script for NG expressions
 * Run with: npx tsx scripts/seed-ng-expressions.ts
 */

import { db } from "../src/lib/db";
import { ngExpressions } from "../src/lib/db/schema";

const ngList = [
  // 誹謗中傷
  { pattern: "死ね", category: "誹謗中傷", severity: 1.0 },
  { pattern: "クズ", category: "誹謗中傷", severity: 0.9 },
  { pattern: "バカ", category: "誹謗中傷", severity: 0.7 },
  { pattern: "アホ", category: "誹謗中傷", severity: 0.6 },

  // 差別
  { pattern: "外人", category: "差別", severity: 0.8 },

  // 過度な煽り
  { pattern: "業界の闘", category: "煽り", severity: 0.7 },
  { pattern: "知らないと損", category: "煽り", severity: 0.5 },
  { pattern: "今すぐ", category: "煽り", severity: 0.4 },
  { pattern: "必見", category: "煽り", severity: 0.3 },

  // スパム的表現
  { pattern: "LINE登録", category: "スパム", severity: 0.8 },
  { pattern: "プロフから", category: "スパム", severity: 0.7 },
  { pattern: "DMください", category: "スパム", severity: 0.6 },
  { pattern: "詳細はプロフ", category: "スパム", severity: 0.7 },

  // 虚偽・誇張
  { pattern: "月収100万", category: "虚偽", severity: 0.8 },
  { pattern: "絶対に", category: "誇張", severity: 0.4 },
  { pattern: "100%", category: "誇張", severity: 0.5 },
  { pattern: "確実に", category: "誇張", severity: 0.5 },

  // 特定企業批判（具体名は避けつつパターン）
  { pattern: "ブラック企業", category: "批判", severity: 0.6 },
  { pattern: "詐欺会社", category: "批判", severity: 0.9 },
];

async function seed() {
  console.log("Seeding NG expressions...");

  for (const item of ngList) {
    try {
      await db.insert(ngExpressions).values({
        pattern: item.pattern,
        patternType: "contains",
        category: item.category,
        severity: item.severity,
        isActive: true,
      });
      console.log(`  ✓ Added: ${item.pattern}`);
    } catch (error) {
      console.log(`  - Skipped (exists): ${item.pattern}`);
    }
  }

  console.log("Done!");
  process.exit(0);
}

seed().catch(console.error);

