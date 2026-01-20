#!/usr/bin/env tsx
/**
 * Test all cron jobs and verify they produce results
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "dev";

interface TestResult {
  name: string;
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

async function testCron(cronName: string): Promise<TestResult> {
  const startTime = Date.now();
  try {
    const url = `${BASE_URL}/api/cron/trigger`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cronName }),
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      return {
        name: cronName,
        success: false,
        error: data.error || `HTTP ${response.status}`,
        duration,
      };
    }

    return {
      name: cronName,
      success: true,
      data,
      duration,
    };
  } catch (error) {
    return {
      name: cronName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function checkDatabase() {
  try {
    const response = await fetch(`${BASE_URL}/api/test/cron`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log("🧪 Testing all Cron jobs...\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`CRON_SECRET: ${CRON_SECRET ? "***" : "not set"}\n`);

  // Check database status first
  console.log("📊 Checking database status...");
  const dbStatus = await checkDatabase();
  if (dbStatus.success) {
    console.log("✅ Database connected");
    console.log("   Data status:", dbStatus.results.dataStatus);
    console.log("   Latest data counts:", {
      externalPosts: dbStatus.results.latestData?.externalPosts?.length || 0,
      patterns: dbStatus.results.latestData?.patterns?.length || 0,
      scheduledPosts: dbStatus.results.latestData?.scheduledPosts?.length || 0,
    });
  } else {
    console.log("❌ Database check failed:", dbStatus.error);
  }
  console.log("");

  // Test each cron job
  const crons = [
    "buzz_harvest_x",
    "pattern_mine",
    "generate",
    "schedule",
    "publish",
    "metrics",
    "learn",
  ];

  const results: TestResult[] = [];

  for (const cron of crons) {
    console.log(`🔄 Testing ${cron}...`);
    const result = await testCron(cron);
    results.push(result);

    if (result.success) {
      console.log(`   ✅ Success (${result.duration}ms)`);
      if (result.data?.data) {
        const data = result.data.data;
        if (data.collected !== undefined) {
          console.log(`   📥 Collected: ${data.collected}`);
        }
        if (data.extracted !== undefined) {
          console.log(`   🔍 Extracted: ${data.extracted}`);
        }
        if (data.generated !== undefined) {
          console.log(`   ✨ Generated: ${data.generated}`);
        }
        if (data.published !== undefined) {
          console.log(`   📤 Published: ${data.published}`);
        }
        if (data.skipped) {
          console.log(`   ⏭️  Skipped: ${data.reason || "unknown"}`);
        }
      }
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
    console.log("");

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  console.log("\n📋 Summary:");
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  console.log(`   ✅ Success: ${successCount}/${results.length}`);
  console.log(`   ❌ Failed: ${failCount}/${results.length}`);

  // Check database again after tests
  console.log("\n📊 Checking database status after tests...");
  const dbStatusAfter = await checkDatabase();
  if (dbStatusAfter.success) {
    const before = dbStatus.results.latestData || {};
    const after = dbStatusAfter.results.latestData || {};
    console.log("   Changes:");
    console.log(`   - External posts: ${before.externalPosts?.length || 0} → ${after.externalPosts?.length || 0}`);
    console.log(`   - Patterns: ${before.patterns?.length || 0} → ${after.patterns?.length || 0}`);
    console.log(`   - Scheduled posts: ${before.scheduledPosts?.length || 0} → ${after.scheduledPosts?.length || 0}`);
  }

  // Exit with error code if any test failed
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

