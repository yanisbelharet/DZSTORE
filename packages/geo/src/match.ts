import { jaroWinkler, matchKey } from './normalize.ts';

/** How an external name (carrier, customer) was matched to a reference entry (skill dz-geo). */
export type MatchMethod = 'EXACT' | 'NORMALIZED' | 'FUZZY';

export interface MatchCandidate {
  id: number;
  /** Names that identify the entry (current names and aliases), in any script. */
  names: readonly string[];
}

export interface MatchResult {
  id: number;
  method: MatchMethod;
  /** 1 for EXACT/NORMALIZED; the Jaro-Winkler similarity for FUZZY. */
  confidence: number;
}

export interface MatchOptions {
  /** Minimum similarity for a FUZZY match (high: a wrong commune means a lost parcel). */
  threshold?: number;
  /** Required gap between the best and the second candidate (otherwise ambiguous). */
  margin?: number;
}

/**
 * Matches a name against the candidates of ONE wilaya: exact, then normalised, then approximate
 * (Jaro-Winkler, high threshold, unambiguous). Undefined when nothing is reliable: a FUZZY
 * result must be reviewed by a human before use.
 */
export function matchName(
  name: string,
  candidates: readonly MatchCandidate[],
  { threshold = 0.9, margin = 0.03 }: MatchOptions = {},
): MatchResult | undefined {
  const trimmed = name.trim();
  const exact = candidates.filter((c) => c.names.some((n) => n.trim() === trimmed));
  if (exact.length === 1 && exact[0]) return { id: exact[0].id, method: 'EXACT', confidence: 1 };

  const key = matchKey(trimmed);
  if (key.length === 0) return undefined;
  const normalized = candidates.filter((c) => c.names.some((n) => matchKey(n) === key));
  if (normalized.length === 1 && normalized[0]) {
    return { id: normalized[0].id, method: 'NORMALIZED', confidence: 1 };
  }
  if (normalized.length > 1) return undefined;

  const scored = candidates
    .map((c) => ({
      id: c.id,
      score: Math.max(0, ...c.names.map((n) => jaroWinkler(key, matchKey(n)))),
    }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < threshold) return undefined;
  if (second && best.score - second.score < margin) return undefined;
  return { id: best.id, method: 'FUZZY', confidence: Math.round(best.score * 1000) / 1000 };
}
