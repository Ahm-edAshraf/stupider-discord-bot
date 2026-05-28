import { config } from "../config";

export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GroqResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

export class GroqRateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
  }
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function callGroq(messages: GroqMessage[], maxTokens: number): Promise<GroqResult> {
  if (!config.ai.groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ai.groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.ai.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.95,
      top_p: 0.9,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as GroqResponse;

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number.parseFloat(retryAfter) * 1_000 : null;
    throw new GroqRateLimitError(payload.error?.message ?? "Groq rate limit hit.", retryAfterMs);
  }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Groq request failed with HTTP ${response.status}.`);
  }

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Groq returned an empty response.");
  }

  const inputTokens =
    payload.usage?.prompt_tokens ?? estimateTokens(messages.map((message) => message.content).join("\n"));
  const outputTokens = payload.usage?.completion_tokens ?? estimateTokens(content);
  const totalTokens = payload.usage?.total_tokens ?? inputTokens + outputTokens;

  return { content, inputTokens, outputTokens, totalTokens };
}
