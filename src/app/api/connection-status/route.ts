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
    }
  } catch (error) {
    status.x.error = error instanceof Error ? error.message : "接続エラー";
    status.x.connected = false;
    status.x.authenticated = false;
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

