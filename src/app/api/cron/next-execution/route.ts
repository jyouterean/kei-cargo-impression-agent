import { NextRequest, NextResponse } from "next/server";
import { getNextCronExecution, getMinutesUntilNext, cronSchedules } from "@/lib/utils/cron-schedule";

export const dynamic = "force-dynamic";

/**
 * API: Get next execution time for all cron jobs
 */
export async function GET(request: NextRequest) {
  try {
    const nextExecutions: Record<string, {
      nextExecution: string;
      minutesUntilNext: number;
      label: string;
      description: string;
      schedule: string;
    }> = {};

    for (const [key, config] of Object.entries(cronSchedules)) {
      const next = getNextCronExecution(config.expression);
      const minutes = getMinutesUntilNext(config.expression);

      nextExecutions[key] = {
        nextExecution: next.toISOString(),
        minutesUntilNext: minutes,
        label: config.label,
        description: config.description,
        schedule: config.expression,
      };
    }

    return NextResponse.json({ nextExecutions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

