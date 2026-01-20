#!/usr/bin/env tsx
/**
 * Debug script to test buzz harvest functionality
 */

import { harvestBuzzTweets } from "../src/lib/modules/buzz-harvester";
import { xClient } from "../src/lib/clients/x-client";

async function main() {
  console.log("🔍 Debugging Buzz Harvest...\n");

  // Test 1: Check X API connection
  console.log("1. Testing X API connection...");
  try {
    const me = await xClient.getMe();
    if (me) {
      console.log(`   ✅ Connected as: @${me.username || me.id}`);
    } else {
      console.log("   ⚠️  getMe() returned null");
    }
  } catch (error) {
    console.error("   ❌ Connection failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Test 2: Test search query
  console.log("\n2. Testing search query...");
  try {
    const testQuery = "軽貨物";
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    console.log(`   Query: "${testQuery}"`);
    console.log(`   Start time: ${startTime}`);
    
    const response = await xClient.searchRecentTweets(testQuery, {
      maxResults: 10,
      startTime,
    });

    console.log(`   ✅ Search successful`);
    console.log(`   Results: ${response.data?.length || 0} tweets`);
    console.log(`   Meta:`, response.meta);
    
    if (response.data && response.data.length > 0) {
      console.log(`   Sample tweet:`, {
        id: response.data[0].id,
        text: response.data[0].text.slice(0, 50) + "...",
        metrics: response.data[0].public_metrics,
      });
    } else {
      console.log("   ⚠️  No tweets found in the last 24 hours");
    }
  } catch (error) {
    console.error("   ❌ Search failed:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("   Stack:", error.stack);
    }
  }

  // Test 3: Run actual harvest
  console.log("\n3. Running buzz harvest...");
  try {
    const result = await harvestBuzzTweets();
    console.log("   ✅ Harvest completed");
    console.log(`   Collected: ${result.collected}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Errors: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log("   Error details:");
      result.errors.forEach((err, i) => {
        console.log(`     ${i + 1}. ${err}`);
      });
    }
  } catch (error) {
    console.error("   ❌ Harvest failed:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("   Stack:", error.stack);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

