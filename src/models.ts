import { generateText } from "ai";
import { Guess } from "./types";

// Bump whenever PROMPT changes, so results from different prompts are never ranked together.
export const PROMPT_VERSION = "v1";

// Same prompt as the original urbanLarger experiment.
export const PROMPT = `You are playing GeoGuessr. Look at this street view image carefully.
Guess the location. Respond ONLY with valid JSON, no other text:
{
  "country": "...",
  "state_province": "...",
  "city": "...",
  "features": ["...", "..."]
}
Where:
- country = the country name (e.g. "France", "Brazil", "Japan")
- state_province = the first-level administrative division — US state, Canadian province, French région, German Bundesland, Russian oblast, Japanese prefecture, Brazilian estado, etc. Use the local/official name.
- city = the nearest city, town, or village
- features = list of 3-5 specific visual clues that led to your guess (e.g. "Cyrillic script on signs", "left-hand traffic", "red laterite soil", "tropical vegetation", "yellow license plates").`;

export type ReasoningSetting = "off" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AskResult {
  guess: Guess;
  refused: boolean;
  raw: string;
  usage: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null };
  latencyMs: number;
}

const NON_ANSWERS = /^(unknown|n\/?a|none|null|unsure|uncertain|not sure|cannot (be )?determined?|can'?t (tell|determine)|undetermined|unidentifiable|-|\?+|\.\.\.)$/i;

export function isNonAnswer(s: string | undefined | null): boolean {
  return !s || NON_ANSWERS.test(s.trim());
}

export function parseGuess(raw: string): Guess {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON found in response: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]);
  return {
    country: String(parsed.country ?? "unknown"),
    state_province: String(parsed.state_province ?? "unknown"),
    city: String(parsed.city ?? "unknown"),
    features: Array.isArray(parsed.features) ? parsed.features.map(String) : [],
  };
}

// Provider-specific knobs, keyed by the gateway prefix ("anthropic/…", "openai/…", "google/…", "spacexai/…").
// "off" matches the original experiment: reasoning disabled, or as low as the model allows.
// Other providers get no extra options and run with their defaults.
function providerOptions(modelId: string, reasoning: ReasoningSetting): Record<string, unknown> {
  const provider = modelId.split("/")[0];
  const on = reasoning !== "off";
  switch (provider) {
    case "anthropic":
      return { anthropic: on ? { thinking: { type: "adaptive" }, effort: reasoning } : { thinking: { type: "disabled" } } };
    case "openai":
      return { openai: { reasoningEffort: on ? reasoning : "none" } };
    case "google":
      return {
        google: {
          thinkingConfig: on
            ? { thinkingLevel: reasoning === "low" || reasoning === "medium" ? reasoning : "high" }
            : { thinkingBudget: 0 }, // Gemini can't fully disable thinking; 0 is the lowest it accepts
        },
      };
    case "spacexai":
    case "xai": {
      // Grok can't disable reasoning: the gateway lists efforts low | medium | high | xhigh,
      // so "off" uses the lowest, "low". The gateway's prefix is now "spacexai"; the options
      // are sent under both keys because it isn't documented which one it forwards.
      const xai = { reasoningEffort: on ? (reasoning === "max" ? "xhigh" : reasoning) : "low" };
      return { xai, spacexai: xai };
    }
    default:
      return {};
  }
}

// Offline stand-in for testing the pipeline without an API key. Only used with --dry-run.
function mockAnswer(): string {
  return JSON.stringify({ country: "Atlantis", state_province: "Nowhere", city: "Mock City", features: ["dry run"] });
}

export async function askModel(
  modelId: string,
  image: Buffer,
  opts: { reasoning: ReasoningSetting; dryRun?: boolean },
): Promise<AskResult> {
  const started = Date.now();
  if (opts.dryRun) {
    const raw = mockAnswer();
    return { guess: parseGuess(raw), refused: false, raw, usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }, latencyMs: 0 };
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result: any = await generateText({
        model: modelId,
        abortSignal: AbortSignal.timeout(240_000),
        maxOutputTokens: opts.reasoning === "off" ? 1024 : 8192,
        providerOptions: providerOptions(modelId, opts.reasoning),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: `data:image/jpeg;base64,${image.toString("base64")}` },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      } as Parameters<typeof generateText>[0]);
      const raw: string = result.text ?? "";
      const usage = {
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        reasoningTokens: result.usage?.outputTokenDetails?.reasoningTokens ?? result.usage?.reasoningTokens ?? null,
      };
      let guess: Guess;
      try {
        guess = parseGuess(raw);
      } catch {
        // A reply with no JSON is treated as a refusal (e.g. "I can't identify locations from images").
        if (raw.trim()) {
          return { guess: { country: "", state_province: "", city: "", features: [] }, refused: true, raw, usage, latencyMs: Date.now() - started };
        }
        throw new Error("Empty response");
      }
      const refused = isNonAnswer(guess.country) && isNonAnswer(guess.state_province) && isNonAnswer(guess.city);
      return { guess, refused, raw, usage, latencyMs: Date.now() - started };
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw lastErr;
}
