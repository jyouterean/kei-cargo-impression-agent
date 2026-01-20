import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { systemEvents, externalPosts } from "@/lib/db/schema";
import { desc, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint to check buzz harvest status
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get recent system events related to buzz harvest
    const recentEvents = await db.query.systemEvents.findMany({
      where: (events, { or, like, gte }) =>
        or(
          like(events.eventType, "%buzz_harvest%"),
          like(events.eventType, "%pattern_mine%")
        ),
      orderBy: desc(systemEvents.createdAt),
      limit: 50,
    });

    // Get recent external posts
    const recentPosts = await db.query.externalPosts.findMany({
      where: gte(externalPosts.collectedAt, oneDayAgo),
      orderBy: desc(externalPosts.collectedAt),
      limit: 20,
    });

    // Count posts by query (from metadata)
    const eventsByType = recentEvents.reduce((acc, event) => {
      const type = event.eventType;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(event);
      return acc;
    }, {} as Record<string, typeof recentEvents>);

    // Extract errors
    const errors = recentEvents.filter((e) => e.severity === "error" || e.severity === "critical");

    return NextResponse.json({
      success: true,
      summary: {
        recentPostsCount: recentPosts.length,
        recentEventsCount: recentEvents.length,
        errorsCount: errors.length,
        lastHarvest: recentEvents.find((e) => e.eventType === "buzz_harvest_complete")?.createdAt || null,
      },
      recentPosts: recentPosts.map((p) => ({
        id: p.id,
        text: p.text.slice(0, 100) + "...",
        buzzScore: p.buzzScore,
        collectedAt: p.collectedAt.toISOString(),
      })),
      eventsByType: Object.keys(eventsByType).reduce((acc, key) => {
        acc[key] = eventsByType[key].map((e) => ({
          id: e.id,
          message: e.message,
          severity: e.severity,
          metadata: e.metadata,
          createdAt: e.createdAt.toISOString(),
        }));
        return acc;
      }, {} as Record<string, any[]>),
      errors: errors.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        message: e.message,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
      })),
      recentEvents: recentEvents.slice(0, 20).map((e) => ({
        id: e.id,
        eventType: e.eventType,
        message: e.message,
        severity: e.severity,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
      })),
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

