import { NextRequest, NextResponse } from "next/server";

/**
 * Verify cron request authentication
 */
export function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    // In development, allow without secret or with "dev" token
    if (process.env.NODE_ENV === "development") {
      const url = new URL(request.url);
      const token = url.searchParams.get("token");
      // Allow if no token or "dev" token in development
      if (!token || token === "dev") {
        return true;
      }
    }
    return process.env.NODE_ENV === "development";
  }

  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Check query parameter (for Vercel Cron)
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token === cronSecret) {
    return true;
  }

  // In development, allow "dev" token for testing
  if (process.env.NODE_ENV === "development" && token === "dev") {
    return true;
  }

  return false;
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Create error response
 */
export function errorResponse(message: string, status: number = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Create success response
 */
export function successResponse<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}

