// Sorts the clues a model says it used ("features") into categories with simple keyword
// rules. Rules are deliberately transparent and deterministic; they will miss some phrasings.
// A clue can fall into more than one category; one that matches nothing counts as "other".

export const CLUE_CATEGORIES = [
  { key: "script", label: "Script & language", re: /\b(script|alphabet|cyrillic|latin|arabic|devanagari|bengali|hangul|kanji|hiragana|katakana|chinese characters?|thai|georgian|tamil|telugu|kannada|urdu|language|written in|text in|characters)\b/i },
  { key: "signs", label: "Signs & shop names", re: /\b(signs?|signage|shop|store|storefront|brand|logo|billboard|advert|banner|name of|reads|reading|written|chain|company|restaurant|caf[eé]|pharmacy|bank)\b/i },
  { key: "roads", label: "Road markings & driving side", re: /\b(left[- ]hand|right[- ]hand|driving|drive on|traffic|lane|road markings?|line markings?|centre line|center line|crosswalk|zebra|pedestrian crossing|kerb|curb|pavement|sidewalk|asphalt|road)\b/i },
  { key: "vehicles", label: "Vehicles & plates", re: /\b(cars?|vehicles?|bus(es)?|taxis?|cabs?|tuk[- ]?tuks?|rickshaws?|motorbikes?|motorcycles?|scooters?|trucks?|vans?|license plates?|licence plates?|number plates?|plates?|tram|metro|transmilenio)\b/i },
  { key: "architecture", label: "Architecture & buildings", re: /\b(architecture|architectural|buildings?|fa[cç]ades?|balcon(y|ies)|roofs?|rooftops?|brick|concrete|tower|apartment|high[- ]rise|skyscrapers?|colonial|houses?|windows?|style|tiles?)\b/i },
  { key: "nature", label: "Vegetation, terrain & climate", re: /\b(vegetation|trees?|palms?|plants?|tropical|arid|desert|climate|mountains?|hills?|terrain|soil|sky|weather|humid|foliage|greenery|grass|landscape|coast|sea|river)\b/i },
  { key: "infrastructure", label: "Poles, wires & street furniture", re: /\b(poles?|utility|power lines?|wires?|cables?|bollards?|street ?lights?|lamp ?posts?|traffic lights?|signals?|guard ?rails?|barriers?|fences?|bus stops?|street furniture|manholes?)\b/i },
  { key: "landmarks", label: "Landmarks", re: /\b(landmark|famous|monument|cathedral|church|mosque|temple|fort|palace|museum|stadium|statue|tower of|iconic|historic)\b/i },
  // Screen elements left in the captures (watermarks, map icons). Worth tracking: a model citing
  // these is reading the capture, not the place.
  { key: "interface", label: "Map interface & watermarks", re: /(\bwatermark|\bgoogle\b|©|copyright|\bstreet ?view (logo|interface|overlay)|navigation arrows?|map (icon|marker|pin)s?)/i },
] as const;

export type ClueCategory = (typeof CLUE_CATEGORIES)[number]["key"] | "other";

export function categorize(clue: string): ClueCategory[] {
  const hits = CLUE_CATEGORIES.filter((c) => c.re.test(clue)).map((c) => c.key);
  return hits.length ? hits : ["other"];
}

// Categories cited at least once in a guess's list of clues.
export function categoriesForGuess(features: string[]): ClueCategory[] {
  return [...new Set(features.flatMap(categorize))];
}
