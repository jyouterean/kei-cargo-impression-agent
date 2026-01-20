import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, unauthorizedResponse, errorResponse } from "@/lib/utils/cron-auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for manual triggers

/**
 * POST: Manually trigger a cron job
 */
export async function POST(request: NextRequest) {
  // Verify authentication (use CRON_SECRET or allow in development)
  if (!verifyCronAuth(request) && process.env.NODE_ENV !== "development") {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { cronName } = body;

    if (!cronName || typeof cronName !== "string") {
      return errorResponse("Cron name is required", 400);
    }

    if (config.killSwitch) {
      return errorResponse("Kill switch is active", 503);
    }

    // Map cron names to API endpoints
    const cronEndpoints: Record<string, string> = {
      buzz_harvest_x: "/api/cron/buzz_harvest_x",
      pattern_mine: "/api/cron/pattern_mine",
      generate: "/api/cron/generate",
      schedule: "/api/cron/schedule",
      publish: "/api/cron/publish",
      metrics: "/api/cron/metrics",
      learn: "/api/cron/learn",
    };

    const endpoint = cronEndpoints[cronName];
    if (!endpoint) {
      return errorResponse(`Unknown cron job: ${cronName}`, 400);
    }

    // Get base URL from request
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const fullUrl = `${baseUrl}${endpoint}`;

    // Get CRON_SECRET for authentication
    const cronSecret = process.env.CRON_SECRET;
    const token = cronSecret ? `?token=${encodeURIComponent(cronSecret)}` : "";

    // Trigger the cron job
    const startTime = Date.now();
    const response = await fetch(`${fullUrl}${token}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.detail || errorJson.title || errorJson.message || errorText;
      } catch {
        // Keep original error text
      }
      
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          status: response.status,
          duration,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data,
      duration,
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(`Failed to trigger cron: ${message}`, 500);
  }
}

