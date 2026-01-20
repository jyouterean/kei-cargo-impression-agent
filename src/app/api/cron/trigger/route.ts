import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth, unauthorizedResponse, errorResponse } from "@/lib/utils/cron-auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes max for manual triggers (especially for generate)

/**
 * POST: Manually trigger a cron job
 * This endpoint can be called from the frontend, so we allow it in development
 * In production, you may want to add additional authentication
 */
export async function POST(request: NextRequest) {
  // Allow manual triggers from frontend (no strict auth required for manual triggers)
  // In production, you might want to add session-based auth here
  // For now, we allow it to make testing easier

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
    
    // Build authentication - use token in query param (for Vercel Cron compatibility)
    // If no secret is set, allow in development mode
    let authUrl = fullUrl;
    if (cronSecret) {
      authUrl = `${fullUrl}?token=${encodeURIComponent(cronSecret)}`;
    } else if (process.env.NODE_ENV === "development") {
      // In development, add a dummy token or use Authorization header
      authUrl = `${fullUrl}?token=dev`;
    }

    // Trigger the cron job
    const startTime = Date.now();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    
    // Also try Authorization header if we have a secret
    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
    }
    
    const response = await fetch(authUrl, {
      method: "GET",
      headers,
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

