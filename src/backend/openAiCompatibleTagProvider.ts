import type { AiTagProjectPayload, AiTagProvider } from "./aiTagProvider.js";
import { RepoLensError } from "./errors.js";

type FetchLike = (input: string, init: {
  method: "POST";
  headers: Record<string, string>;
  body: string;
}) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

type OpenAiCompatibleTagProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: FetchLike;
};

export class OpenAiCompatibleTagProvider implements AiTagProvider {
  readonly name = "openai-compatible";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiCompatibleTagProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.model = options.model ?? "gpt-4.1-mini";
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new RepoLensError("ai_not_configured", "Fetch is not available in this runtime.");
    }
    this.fetchImpl = fetchImpl as FetchLike;
  }

  async generateTagSuggestions(payload: AiTagProjectPayload): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You suggest hierarchical tags for a local code project. Prefer existing tag paths when they fit. Only create new paths when existing tags are not enough. Return JSON with suggestions only. Each suggestion must include segments, confidence, rationale, and sourceFields. Do not suggest technology stack tags when techStacks already captures that information unless it is useful for organization."
          },
          {
            role: "user",
            content: JSON.stringify(payload)
          }
        ]
      })
    });

    const text = await response.text();
    if (!response.ok) {
      throw new RepoLensError("ai_request_failed", `AI provider returned ${response.status}: ${text}`);
    }

    try {
      const parsed = JSON.parse(text) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };
      const content = parsed.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Missing message content.");
      }
      return JSON.parse(content);
    } catch (error) {
      throw new RepoLensError("ai_invalid_response", error instanceof Error ? error.message : String(error));
    }
  }
}
