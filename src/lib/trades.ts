import { prisma } from "./prisma";
import { getPrice, tickPrice } from "./prices";

// Global default win rate (%) applied to every user that doesn't have a
// per-user winRate configured. Platform policy: 40%.
const GLOBAL_WIN_RATE = 40;

export async function settleExpiredTrades(userId?: string) {
  const now = new Date();
  const openTrades = await prisma.trade.findMany({
    where: {
      status: "open",
      expiresAt: { lte: now },
      ...(userId ? { userId } : {}),
    },
  });

  if (openTrades.length === 0) return;

  // Batch-fetch winRate for all unique users involved
  const userIds = [...new Set(openTrades.map((t) => t.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, winRate: true },
  });
  const winRateMap = new Map(users.map((u) => [u.id, u.winRate]));

  for (const trade of openTrades) {
    const userWinRate = winRateMap.get(trade.userId);
    let won: boolean;
    let closePrice = 0;

    // Use the per-user win rate if set, otherwise the global default (40%).
    const effectiveWinRate =
      userWinRate != null && userWinRate > 0 ? userWinRate : GLOBAL_WIN_RATE;

    if (effectiveWinRate > 0 && effectiveWinRate < 100) {
      // Win rate is set (or global default applies) — use it to determine outcome
      won = Math.random() * 100 < effectiveWinRate;
    } else {
      // Edge case win rate — fall back to price-based settlement
      closePrice = await getPrice(trade.assetId);
      won =
        trade.direction === "up"
          ? closePrice > trade.openPrice
          : closePrice < trade.openPrice;
    }

    const profit = won ? trade.stake * (trade.payout / 100) : -trade.stake;

    // Claim this trade atomically before doing anything else. updateMany
    // with `status: "open"` in the WHERE clause means only the first caller
    // to reach this line actually updates a row — if another request
    // (e.g. a second browser tab/device polling the same account) already
    // settled this same trade a moment earlier, count will be 0 here and we
    // skip it entirely. Without this guard, two overlapping calls to
    // settleExpiredTrades (easy to trigger with multiple tabs open, since
    // syncFromApi() polls on every price tick) could both see the trade as
    // still "open", both proceed, and on a win both credit the payout —
    // double-crediting a single win, which is what was actually happening
    // here, not a sign error in the profit math itself.
    const claim = await prisma.trade.updateMany({
      where: { id: trade.id, status: "open" },
      data: {
        status: won ? "won" : "lost",
        closePrice: 0,
        profit,
        settledAt: now,
      },
    });

    if (claim.count === 0) {
      // Another concurrent call already claimed and settled this trade.
      // Don't touch balance — that already happened (exactly once) there.
      continue;
    }

    if (won) {
      await prisma.user.update({
        where: { id: trade.userId },
        data: { balance: { increment: trade.stake + profit } },
      });
    }
  }
}

export async function settleAndFetchTrades(userId: string) {
  await settleExpiredTrades(userId);
  return prisma.trade.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export { tickPrice };