#!/usr/bin/env tsx
/**
 * Test all functions (excluding buzz harvest which is disabled due to cost)
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "dev";

async function testCron(cronName: string): Promise<{
  success: boolean;
  response: any;
  error?: string;
}> {
  const url = `${BASE_URL}/api/cron/${cronName}?token=${CRON_SECRET}`;
  console.log(`\n🧪 Testing: ${cronName}`);
  console.log(`   URL: ${url}`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok && data.success !== false) {
      console.log(`   ✅ Success`);
      if (data.result) {
        console.log(`   Result:`, JSON.stringify(data.result, null, 2).slice(0, 500));
      }
      return { success: true, response: data };
    } else {
      console.log(`   ❌ Failed:`, data.error || data.message || "Unknown error");
      return { success: false, response: data, error: data.error || data.message };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Error:`, errorMessage);
    return { success: false, response: null, error: errorMessage };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Testing All Functions (Buzz Harvest Disabled)");
  console.log("=".repeat(60));

  const results: Record<string, { success: boolean; error?: string }> = {};

  // Test functions in order (excluding buzz_harvest_x)
  const crons = [
    "pattern_mine", // Extract patterns from existing external posts
    "generate",     // Generate posts
    "schedule",     // Schedule posts
    "publish",      // Publish scheduled posts
    "metrics",      // Collect metrics
    "learn",        // Update learning
  ];

  for (const cron of crons) {
    const result = await testCron(cron);
    results[cron] = {
      success: result.success,
      error: result.error,
    };

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Test Summary");
  console.log("=".repeat(60));

  const successCount = Object.values(results).filter((r) => r.success).length;
  const totalCount = Object.keys(results).length;

  for (const [cron, result] of Object.entries(results)) {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${cron}: ${result.success ? "OK" : result.error || "Failed"}`);
  }

  console.log(`\n${successCount}/${totalCount} tests passed`);

  if (successCount === totalCount) {
    console.log("\n🎉 All functions are working correctly!");
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${totalCount - successCount} function(s) failed`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

