/**
 * Test script for content generation
 * Run with: npx tsx scripts/test-generate.ts
 */

import { generateDraft } from "../src/lib/modules/generator";
import { selectArm } from "../src/lib/modules/bandit";

async function test() {
  console.log("🧪 Testing content generation...\n");

  // Test arm selection
  console.log("1. Testing arm selection (X)...");
  const xArm = await selectArm("x");
  console.log("   Selected arm:", xArm);

  console.log("\n2. Testing arm selection (Threads)...");
  const threadsArm = await selectArm("threads");
  console.log("   Selected arm:", threadsArm);

  // Test content generation
  console.log("\n3. Testing content generation (X)...");
  const xResult = await generateDraft("x");
  if (xResult.success && xResult.post) {
    console.log("   ✅ Generated successfully!");
    console.log("   Format:", xResult.post.format);
    console.log("   Hook:", xResult.post.hookType);
    console.log("   Topic:", xResult.post.topic);
    console.log("   Content:", xResult.post.content);
  } else {
    console.log("   ❌ Failed:", xResult.error);
  }

  console.log("\n4. Testing content generation (Threads)...");
  const threadsResult = await generateDraft("threads");
  if (threadsResult.success && threadsResult.post) {
    console.log("   ✅ Generated successfully!");
    console.log("   Format:", threadsResult.post.format);
    console.log("   Hook:", threadsResult.post.hookType);
    console.log("   Topic:", threadsResult.post.topic);
    console.log("   Content:", threadsResult.post.content);
  } else {
    console.log("   ❌ Failed:", threadsResult.error);
  }

  console.log("\n✨ Test complete!");
  process.exit(0);
}

test().catch(console.error);

