/**
 * Calculate next cron execution time from cron expression
 */
export function getNextCronExecution(cronExpression: string): Date {
  const now = new Date();
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    // Invalid cron expression
    return new Date(now.getTime() + 60 * 60 * 1000); // Default to 1 hour
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const next = new Date(now);
  next.setSeconds(0, 0);

  // Helper to parse cron field (handles *, numbers, ranges, lists, step)
  function parseCronField(field: string, max: number): number[] {
    if (field === "*") {
      return Array.from({ length: max }, (_, i) => i);
    }

    const values: number[] = [];

    // Handle step values (e.g., */5, 0-10/2)
    if (field.includes("/")) {
      const [range, step] = field.split("/");
      const stepNum = parseInt(step, 10);
      
      if (range === "*") {
        for (let i = 0; i < max; i += stepNum) {
          values.push(i);
        }
      } else if (range.includes("-")) {
        const [start, end] = range.split("-").map((x) => parseInt(x, 10));
        for (let i = start; i <= end; i += stepNum) {
          values.push(i);
        }
      } else {
        const start = parseInt(range, 10);
        for (let i = start; i < max; i += stepNum) {
          values.push(i);
        }
      }
      return values;
    }

    // Handle ranges (e.g., 5-10)
    if (field.includes("-")) {
      const [start, end] = field.split("-").map((x) => parseInt(x, 10));
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
      return values;
    }

    // Handle lists (e.g., 5,10,15)
    if (field.includes(",")) {
      return field.split(",").map((x) => parseInt(x.trim(), 10));
    }

    // Single number
    return [parseInt(field, 10)];
  }

  const validMinutes = parseCronField(minute, 60);
  const validHours = parseCronField(hour, 24);
  const validDaysOfMonth = parseCronField(dayOfMonth, 32); // 1-31
  const validMonths = parseCronField(month, 13); // 0-11 or 1-12
  const validDaysOfWeek = parseCronField(dayOfWeek, 7); // 0-6 or 1-7

  // Find next valid minute
  let found = false;
  let attempts = 0;
  const maxAttempts = 365 * 24 * 60; // Max 1 year search

  while (!found && attempts < maxAttempts) {
    const currentMinute = next.getMinutes();
    const currentHour = next.getHours();
    const currentDay = next.getDate();
    const currentMonth = next.getMonth() + 1; // 1-12
    const currentDayOfWeek = next.getDay(); // 0-6 (Sun-Sat)

    // Check if current time matches cron expression
    const minuteMatch = validMinutes.includes(currentMinute);
    const hourMatch = validHours.includes(currentHour);
    const dayOfMonthMatch = dayOfMonth === "*" || validDaysOfMonth.includes(currentDay);
    const monthMatch = month === "*" || validMonths.includes(currentMonth) || validMonths.includes(currentMonth - 1);
    const dayOfWeekMatch = dayOfWeek === "*" || validDaysOfWeek.includes(currentDayOfWeek) || validDaysOfWeek.includes(currentDayOfWeek === 0 ? 7 : currentDayOfWeek);

    if (minuteMatch && hourMatch && dayOfMonthMatch && monthMatch && dayOfWeekMatch && next > now) {
      found = true;
      break;
    }

    // Move to next minute
    next.setMinutes(currentMinute + 1);
    if (next.getMinutes() === 0) {
      next.setHours(currentHour + 1);
      if (next.getHours() === 0) {
        next.setDate(currentDay + 1);
      }
    }

    attempts++;
  }

  return found ? next : new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * Get minutes until next execution
 */
export function getMinutesUntilNext(cronExpression: string): number {
  const next = getNextCronExecution(cronExpression);
  const now = new Date();
  return Math.max(0, Math.floor((next.getTime() - now.getTime()) / (60 * 1000)));
}

/**
 * Cron schedule definitions
 */
export const cronSchedules: Record<string, { expression: string; label: string; description: string }> = {
  buzz_harvest_x: {
    expression: "0 * * * *", // Every hour at :00
    label: "バズ収集 (X)",
    description: "Xのバズ投稿を収集・分析",
  },
  pattern_mine: {
    expression: "0 6,18 * * *", // At 6:00 and 18:00
    label: "パターン抽出",
    description: "収集した投稿から構造パターンを抽出",
  },
  generate: {
    expression: "0 5,11,17,23 * * *", // At 5:00, 11:00, 17:00, 23:00
    label: "投稿生成",
    description: "新しい投稿を生成・スケジュール",
  },
  schedule: {
    expression: "0 */3 * * *", // Every 3 hours at :00
    label: "スケジュール管理",
    description: "予約投稿のギャップを埋める",
  },
  publish: {
    expression: "*/5 * * * *", // Every 5 minutes
    label: "投稿公開",
    description: "予定時刻になった投稿を公開",
  },
  metrics: {
    expression: "30 * * * *", // Every hour at :30
    label: "メトリクス収集",
    description: "インプレッション・エンゲージメントを収集",
  },
  learn: {
    expression: "0 3,15 * * *", // At 3:00 and 15:00
    label: "学習更新",
    description: "Bandit学習・テンプレート最適化",
  },
};

