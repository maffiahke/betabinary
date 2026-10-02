/**
 * Single source of truth for digit contracts (Even/Odd, Over/Under,
 * Match/Differ): how a stored `Trade.contractType` string is parsed, what
 * each side actually pays, and how likely that side is to win.
 *
 * The server settlement path (`lib/trades.ts`) and the trade panel
 * (`components/trade/*`) both read from here, so the payout quoted when a
 * trade is placed is exactly the payout settlement applies. Previously each
 * side kept its own copy of these numbers, and they had drifted apart —
 * Match/Differ was quoted at 850%/5% but settled at the asset's flat ~95%.
 */

/**
 * Digit-contract metadata is packed into `Trade.contractType` as
 * `"<type>|<side>|<digit>"` (see `app/api/trades/route.ts`). Older rows
 * predate that and hold only the bare type, so parsing has to tolerate it.
 */
export const CONTRACT_TYPES = ["Even/Odd", "Over/Under", "Match/Differ"] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

/** Sides per contract, in up-button / down-button order. */
const SIDES: Record<ContractType, readonly [string, string]> = {
  "Even/Odd": ["Even", "Odd"],
  "Over/Under": ["Over", "Under"],
  "Match/Differ": ["Match", "Differ"],
};

/** Digit the trade panel starts on; also the fallback when a row has none. */
export const DEFAULT_DIGIT = 5;

const EVEN_ODD_PAYOUT_PERCENT = 95;
const MATCH_PAYOUT_PERCENT = 850;
const DIFFER_PAYOUT_PERCENT = 5;

/**
 * Over/Under payout has always been quoted against a denominator of 9 rather
 * than 10. That schedule is preserved verbatim — it is the pricing users
 * already know, and repricing it is out of scope here.
 */
const OVER_UNDER_PAYOUT_BASIS = 9;
const PAYOUT_MARGIN_PERCENT = 95;
const MAX_PAYOUT_PERCENT = 950;

/** Settlement never returns certainties; a 0 or 1 side is always a bug. */
const MIN_WIN_PROBABILITY = 0.01;
const MAX_WIN_PROBABILITY = 0.99;

/**
 * Win rate (as a percentage) at which each contract is settled at its true
 * odds. Even/Odd is an even-odds coin flip, so 50 means "no skew";
 * Match/Differ scale off 1-in-10 and 9-in-10 respectively. A configured rate
 * of 50 therefore plays every contract at its natural probability, and any
 * other rate skews the user by that factor.
 */
const NATURAL_ODDS_ANCHOR_PERCENT = 50;

export interface ParsedContract {
  contractType: ContractType;
  /** "Even" | "Odd" | "Over" | "Under" | "Match" | "Differ" */
  side: string;
  /** Threshold/exact digit 0-9, or null when the row carries none. */
  digit: number | null;
}

export function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}

/** The two sides of a contract, as `[upButtonSide, downButtonSide]`. */
export function contractSides(contractType: ContractType): readonly [string, string] {
  return SIDES[contractType];
}

/**
 * Reads a stored `Trade.contractType`, falling back to the trade's
 * `direction` when the side wasn't packed in (legacy rows). Returns null for
 * anything that isn't one of the digit contracts, so callers can fall back to
 * price-based settlement instead of guessing.
 */
export function parseContract(raw: string, direction?: string): ParsedContract | null {
  if (typeof raw !== "string") return null;

  const [type, side, digitRaw] = raw.split("|");
  if (!isContractType(type)) return null;

  const sides = SIDES[type];

  let digit: number | null = null;
  if (digitRaw !== undefined) {
    const parsed = Number.parseInt(digitRaw, 10);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 9) digit = parsed;
  }

  const stored = typeof side === "string" ? side : "";
  const resolvedSide = sides.includes(stored)
    ? stored
    : direction === "down"
      ? sides[1]
      : sides[0];

  return { contractType: type, side: resolvedSide, digit };
}

/**
 * Profit paid on a win, as a percentage of stake — the same number the trade
 * panel shows on the button. Callers that don't recognise the contract type
 * should use the trade's own stored payout instead.
 */
export function payoutPercentFor(
  contractType: ContractType,
  side: string,
  digit: number | null
): number {
  if (contractType === "Match/Differ") {
    return side === "Match" ? MATCH_PAYOUT_PERCENT : DIFFER_PAYOUT_PERCENT;
  }
  if (contractType === "Even/Odd") return EVEN_ODD_PAYOUT_PERCENT;

  const d = digit ?? DEFAULT_DIGIT;
  const chance =
    ((side === "Under" ? d + 1 : OVER_UNDER_PAYOUT_BASIS - d) / OVER_UNDER_PAYOUT_BASIS) || 0.01;

  return Math.min(MAX_PAYOUT_PERCENT, Math.round((1 / chance) * PAYOUT_MARGIN_PERCENT * 10) / 10);
}

/**
 * True probability that a side wins, given the digit it was placed on.
 * Even/Odd is an even-odds coin flip. Over/Under follows the same 1-in-9 basis
 * its payout is quoted on. Match is 1-in-10 and Differ 9-in-10.
 */
export function naturalWinProbability(
  contractType: ContractType,
  side: string,
  digit: number | null
): number {
  if (contractType === "Even/Odd") return 0.5;
  if (contractType === "Match/Differ") return side === "Match" ? 0.1 : 0.9;

  const d = digit ?? DEFAULT_DIGIT;
  return Math.min(MAX_WIN_PROBABILITY, Math.max(MIN_WIN_PROBABILITY,
    (side === "Under" ? d + 1 : OVER_UNDER_PAYOUT_BASIS - d) / OVER_UNDER_PAYOUT_BASIS
  ));
}

/**
 * Settles a side at its true odds, skewed by the account's configured win
 * rate. `winRatePercent` is the admin-set per-user rate (40 by default).
 *
 * The skew is deliberately bounded: a rate of 100 (or 0) can't make a
 * 1-in-10 contract a certainty, and the cap keeps Match/Differ from
 * collapsing into "always wins" or "always loses" for either side. What the
 * skew does buy is a consistent edge — a 70% account wins Differ and Match
 * more often than an even-money coin flip, without ever making a 10%-odds
 * Match a locked-in win.
 */
export function skewedWinProbability(
  contractType: ContractType,
  side: string,
  digit: number | null,
  winRatePercent: number
): number {
  const natural = naturalWinProbability(contractType, side, digit);

  const configured = Number.isFinite(winRatePercent) ? winRatePercent : NATURAL_ODDS_ANCHOR_PERCENT;
  const skew = configured / NATURAL_ODDS_ANCHOR_PERCENT;

  return Math.min(MAX_WIN_PROBABILITY, Math.max(MIN_WIN_PROBABILITY, natural * skew));
}

/** Human-readable label for a stored contract string, e.g. "Match/Differ · Match 3". */
export function describeContract(raw: string, direction?: string): string {
  const parsed = parseContract(raw, direction);
  if (!parsed) return typeof raw === "string" && raw ? raw : "Trade";

  const { contractType, side, digit } = parsed;
  if (contractType === "Match/Differ") {
    return digit === null ? `Match/Differ · ${side}` : `Match/Differ · ${side} ${digit}`;
  }
  if (contractType === "Over/Under") {
    return digit === null ? `Over/Under · ${side}` : `Over/Under · ${side} ${digit}`;
  }
  return `Even/Odd · ${side}`;
}
