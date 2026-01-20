import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { learningState, systemEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API: Get/Set kill switch status
 */
export async function GET() {
  try {
    const state = await db.query.learningState.findFirst({
      where: eq(learningState.key, "kill_switch"),
    });

    return Response.json({
      killSwitch: (state?.value as { active?: boolean })?.active || false,
      envKillSwitch: process.env.KILL_SWITCH === "true",
      effectiveKillSwitch:
        process.env.KILL_SWITCH === "true" ||
        (state?.value as { active?: boolean })?.active ||
        false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const active = Boolean(body.active);

    const existing = await db.query.learningState.findFirst({
      where: eq(learningState.key, "kill_switch"),
    });

    if (existing) {
      await db
        .update(learningState)
        .set({ value: { active }, updatedAt: new Date() })
        .where(eq(learningState.id, existing.id));
    } else {
      await db.insert(learningState).values({
        key: "kill_switch",
        value: { active },
      });
    }

    // Log the action
    await db.insert(systemEvents).values({
      eventType: "kill_switch_toggle",
      severity: active ? "warn" : "info",
      message: `Kill switch ${active ? "activated" : "deactivated"}`,
      metadata: { active },
    });

    return Response.json({ success: true, killSwitch: active });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

