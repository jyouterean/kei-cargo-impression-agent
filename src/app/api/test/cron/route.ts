import { NextRequest, NextResponse } from "next/server";
import { harvestBuzzTweets } from "@/lib/modules/buzz-harvester";
import { minePatterns } from "@/lib/modules/pattern-miner";
import { generateAndSchedule } from "@/lib/modules/generator";
import { db } from "@/lib/db";
import { externalPosts, patterns, scheduledPosts } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Test endpoint to verify cron functionality
 */
export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};

  try {
    // Test 1: Check database connection
    const dbTest = await db.query.externalPosts.findMany({ limit: 1 });
    results.database = { connected: true, sampleCount: dbTest.length };

    // Test 2: Check existing data
    const [externalCount, patternsCount, scheduledCount] = await Promise.all([
      db.query.externalPosts.findMany({ limit: 1 }),
      db.query.patterns.findMany({ limit: 1 }),
      db.query.scheduledPosts.findMany({ limit: 1 }),
    ]);

    results.dataStatus = {
      externalPosts: externalCount.length > 0,
      patterns: patternsCount.length > 0,
      scheduledPosts: scheduledCount.length > 0,
    };

    // Test 3: Get latest data
    const latestExternal = await db.query.externalPosts.findMany({
      orderBy: desc(externalPosts.collectedAt),
      limit: 5,
    });

    const latestPatterns = await db.query.patterns.findMany({
      orderBy: desc(patterns.extractedAt),
      limit: 5,
    });

    const latestScheduled = await db.query.scheduledPosts.findMany({
      orderBy: desc(scheduledPosts.createdAt),
      limit: 5,
    });

    results.latestData = {
      externalPosts: latestExternal.map((p) => ({
        id: p.id,
        text: p.text.slice(0, 50) + "...",
        buzzScore: p.buzzScore,
        collectedAt: p.collectedAt.toISOString(),
      })),
      patterns: latestPatterns.map((p) => ({
        id: p.id,
        format: p.format,
        hookType: p.hookType,
        extractedAt: p.extractedAt.toISOString(),
      })),
      scheduledPosts: latestScheduled.map((p) => ({
        id: p.id,
        platform: p.platform,
        content: p.content.slice(0, 50) + "...",
        scheduledFor: p.scheduledFor.toISOString(),
        status: p.status,
      })),
    };

    return NextResponse.json({
      success: true,
      results,
      message: "System check completed",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        results,
      },
      { status: 500 }
    );
  }
}

/**
 * Test endpoint to manually trigger and test cron functions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const results: Record<string, any> = {};

    switch (action) {
      case "harvest":
        results.harvest = await harvestBuzzTweets();
        break;

      case "mine":
        results.mine = await minePatterns();
        break;

      case "generate":
        const platform = body.platform || "x";
        const count = body.count || 1;
        results.generate = await generateAndSchedule(platform as "x" | "threads", count);
        break;

      case "all":
        results.harvest = await harvestBuzzTweets();
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        results.mine = await minePatterns();
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        results.generate = await generateAndSchedule("x", 2);
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

