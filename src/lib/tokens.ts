/**
 * Rough token estimate for English-like text. Real tokenizers differ by model;
 * averaging a character-based and a word-based heuristic lands within ~15% for
 * typical prose and code.
 */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const byChars = trimmed.length / 4;
  const words = trimmed.split(/\s+/).length;
  const punctuation = (trimmed.match(/[^\w\s]/g) ?? []).length;
  const byWords = words * 1.3 + punctuation * 0.3;
  return Math.max(1, Math.round((byChars + byWords) / 2));
}

export interface CostEstimate {
  perRequest: number;
  perDay: number;
  perMonth: number;
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  requestsPerDay: number,
  costPer1kIn: number,
  costPer1kOut: number,
): CostEstimate {
  const perRequest = (inputTokens / 1000) * costPer1kIn + (outputTokens / 1000) * costPer1kOut;
  const perDay = perRequest * requestsPerDay;
  return { perRequest, perDay, perMonth: perDay * 30 };
}

export function formatUsd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(5)}`;
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
