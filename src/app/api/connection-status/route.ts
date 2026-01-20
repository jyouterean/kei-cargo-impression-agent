import { NextRequest } from "next/server";
import { xClient } from "@/lib/clients/x-client";
import { threadsClient } from "@/lib/clients/threads-client";

export const dynamic = "force-dynamic";

/**
 * API: Get SNS connection status
 */
export async function GET() {
  const status = {
    x: {
      connected: false,
      authenticated: false,
      username: null as string | null,
      error: null as string | null,
    },
    threads: {
      connected: false,
      authenticated: false,
      username: null as string | null,
      error: null as string | null,
    },
    timestamp: new Date().toISOString(),
  };

  // Check X connection
  try {
    const me = await xClient.getMe();
    if (me) {
      status.x.connected = true;
      status.x.authenticated = true;
      status.x.username = me.username;
    } else {
      status.x.error = "認証に失敗しました: ユーザー情報が取得できませんでした";
      status.x.connected = false;
      status.x.authenticated = false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    status.x.error = errorMessage;
    status.x.connected = false;
    status.x.authenticated = false;
    
    // Log detailed error for debugging
    console.error("[X Connection Error]", {
      error: errorMessage,
      hasBearerToken: !!process.env.X_BEARER_TOKEN,
      hasOAuth: !!(
        process.env.X_OAUTH1_CONSUMER_KEY &&
        process.env.X_OAUTH1_CONSUMER_SECRET &&
        process.env.X_OAUTH1_ACCESS_TOKEN &&
        process.env.X_OAUTH1_ACCESS_TOKEN_SECRET
      ),
    });
  }

  // Check Threads connection
  try {
    const profile = await threadsClient.getProfile();
    if (profile) {
      status.threads.connected = true;
      status.threads.authenticated = true;
      status.threads.username = profile.username;
    } else {
      status.threads.error = "認証に失敗しました";
    }
  } catch (error) {
    status.threads.error = error instanceof Error ? error.message : "接続エラー";
  }

  return Response.json(status);
}

