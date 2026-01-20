import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const accountSchema = z.object({
  name: z.string().min(1).max(64),
  platform: z.enum(["x", "threads"]),
  xBearerToken: z.string().optional(),
  xOAuthConsumerKey: z.string().optional(),
  xOAuthConsumerSecret: z.string().optional(),
  xOAuthAccessToken: z.string().optional(),
  xOAuthAccessTokenSecret: z.string().optional(),
  threadsAccessToken: z.string().optional(),
  threadsUserId: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  maxPostsPerDay: z.number().int().min(1).max(100).optional(),
  minGapMinutes: z.number().int().min(1).max(1440).optional(),
});

/**
 * GET: List all accounts
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform");
    const activeOnly = url.searchParams.get("activeOnly") === "true";

    let allAccounts = await db.query.accounts.findMany({
      orderBy: desc(accounts.createdAt),
    });

    if (platform) {
      allAccounts = allAccounts.filter((a) => a.platform === platform);
    }

    if (activeOnly) {
      allAccounts = allAccounts.filter((a) => a.isActive);
    }

    // Mask sensitive data
    const maskedAccounts = allAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      platform: account.platform,
      isActive: account.isActive,
      maxPostsPerDay: account.maxPostsPerDay,
      minGapMinutes: account.minGapMinutes,
      hasCredentials: {
        x: !!(account.xBearerToken || account.xOAuthAccessToken),
        threads: !!(account.threadsAccessToken && account.threadsUserId),
      },
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      lastUsedAt: account.lastUsedAt?.toISOString(),
    }));

    return NextResponse.json({ accounts: maskedAccounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST: Create new account
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = accountSchema.parse(body);

    const [newAccount] = await db
      .insert(accounts)
      .values({
        name: validated.name,
        platform: validated.platform,
        xBearerToken: validated.xBearerToken || null,
        xOAuthConsumerKey: validated.xOAuthConsumerKey || null,
        xOAuthConsumerSecret: validated.xOAuthConsumerSecret || null,
        xOAuthAccessToken: validated.xOAuthAccessToken || null,
        xOAuthAccessTokenSecret: validated.xOAuthAccessTokenSecret || null,
        threadsAccessToken: validated.threadsAccessToken || null,
        threadsUserId: validated.threadsUserId || null,
        isActive: validated.isActive ?? true,
        maxPostsPerDay: validated.maxPostsPerDay || (validated.platform === "x" ? 40 : 10),
        minGapMinutes: validated.minGapMinutes || 20,
      })
      .returning();

    return NextResponse.json({
      account: {
        id: newAccount.id,
        name: newAccount.name,
        platform: newAccount.platform,
        isActive: newAccount.isActive,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT: Update account
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    const validated = accountSchema.partial().parse(updates);

    const [updatedAccount] = await db
      .update(accounts)
      .set({
        ...validated,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, id))
      .returning();

    if (!updatedAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({
      account: {
        id: updatedAccount.id,
        name: updatedAccount.name,
        platform: updatedAccount.platform,
        isActive: updatedAccount.isActive,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE: Delete account
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get("id") || "", 10);

    if (!id || isNaN(id)) {
      return NextResponse.json({ error: "Account ID is required" }, { status: 400 });
    }

    await db.delete(accounts).where(eq(accounts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

