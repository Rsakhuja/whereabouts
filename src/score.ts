import {
  CITY_ALIASES, COUNTRY_ALIASES, ADMIN_ALIASES, SCOPED_ADMIN_ALIASES, SCOPED_CITY_ALIASES,
  CityID, CountryID, AdminID,
} from "./ontology";
import { Guess, GroundTruth, ModelScore } from "./types";

export function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Tries the full string first, then falls back to the parenthetical content alone.
// This recovers cases like "東京都 (Tokyo)" — stripping the parenthetical for the
// primary match leaves only non-Latin script, which normalizes to "" — so a
// non-Latin-script guess with a Latin gloss in parens can still resolve.
function resolveWithParenFallback<T extends string>(input: string, aliases: Record<string, T>): T | null {
  const direct = aliases[normalize(input)];
  if (direct) return direct;

  // normalize() strips every non-Latin character, so "臺北市" or "Мінск" would become "".
  // Native-script aliases are stored as the lowercased original instead.
  const raw = aliases[input.trim().toLowerCase()];
  if (raw) return raw;

  const parenMatch = input.match(/\(([^)]*)\)/);
  if (parenMatch) {
    const fromParen = aliases[normalize(parenMatch[1])];
    if (fromParen) return fromParen;
  }

  return null;
}

// Same as resolveWithParenFallback, plus a fallback across comma-separated segments —
// e.g. "Suginami-ku, Tokyo" resolves via its "Tokyo" segment. Used for country/admin,
// where a compound guess naming the right region should get credit. NOT used for
// city: a ward/neighborhood named alongside the city (e.g. "Suginami-ku, Tokyo")
// should not count as correctly guessing the city itself.
function resolveWithSegmentFallback<T extends string>(input: string, aliases: Record<string, T>): T | null {
  const direct = resolveWithParenFallback(input, aliases);
  if (direct) return direct;

  for (const segment of input.split(",")) {
    const fromSegment = aliases[normalize(segment)];
    if (fromSegment) return fromSegment;
  }

  return null;
}

export function resolveCountry(input: string): CountryID | null {
  return resolveWithSegmentFallback(input, COUNTRY_ALIASES);
}

// `country` is the country this name should be read in (the truth's country for ground
// truth, the guess's own country for a guess). Country-specific names are tried first, so
// "Punjab" with country India resolves to Indian Punjab rather than Pakistan's.
export function resolveAdmin(input: string, country: CountryID | null = null): AdminID | null {
  const scoped = country ? SCOPED_ADMIN_ALIASES[country] : undefined;
  return (scoped && resolveWithSegmentFallback(input, scoped)) || resolveWithSegmentFallback(input, ADMIN_ALIASES);
}

export function resolveCity(input: string, country: CountryID | null = null): CityID | null {
  const scoped = country ? SCOPED_CITY_ALIASES[country] : undefined;
  return (scoped && resolveWithParenFallback(input, scoped)) || resolveWithParenFallback(input, CITY_ALIASES);
}

export function scoreGuess(guess: Guess, truth: GroundTruth): ModelScore {
  const guessCountry = resolveCountry(guess.country);
  const guessAdmin = resolveAdmin(guess.state_province, guessCountry);
  const guessCity = resolveCity(guess.city, guessCountry);

  const unresolved_fields: string[] = [];

  const countryMatch = (() => {
    if (!guessCountry || !truth.country_id) { unresolved_fields.push("country"); return false; }
    return guessCountry === truth.country_id;
  })();

  const stateMatch = (() => {
    if (!guessAdmin || !truth.admin_id) { unresolved_fields.push("state_province"); return false; }
    return guessAdmin === truth.admin_id;
  })();

  const cityMatch = (() => {
    if (!guessCity || !truth.city_id) { unresolved_fields.push("city"); return false; }
    return guessCity === truth.city_id;
  })();

  const points = [countryMatch, stateMatch, cityMatch].filter(Boolean).length;
  const result: ModelScore = {
    guess,
    points,
    breakdown: { country: countryMatch, state_province: stateMatch, city: cityMatch },
  };
  if (unresolved_fields.length) result.unresolved_fields = unresolved_fields;
  return result;
}
