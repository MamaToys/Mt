import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { DateRange, toDbDate } from "../metrics/dates";
import type { Filters } from "../reports/queries";
import { buildAiContext } from "./context";
import { CAMPAIGN_INSTRUCTIONS, FULL_STRUCTURE, SUMMARY_INSTRUCTIONS, SYSTEM_PROMPT } from "./prompts";

export const DEFAULT_AI_MODEL = "claude-opus-5-5";

export class AiUnavailableError extends Error {}

export interface AnalyzeRequest {
  storeId: string;
  userId?: string;
  kind: "daily_summary" | "question" | "campaign";
  question?: string;
  range: DateRange;
  compare: DateRange | null;
  filters?: Filters;
  campaignId?: string;
}

export function aiConfigured(): boolean {
  return !!env.ai.apiKey;
}

/**
 * Runs an analysis server-side. The API key never reaches the browser; the
 * model receives only the structured aggregate metrics from buildAiContext,
 * and both the input and output are stored in AIAnalysis for traceability.
 */
export async function analyze(req: AnalyzeRequest): Promise<{ id: string; output: string; createdAt: Date }> {
  if (!env.ai.apiKey) throw new AiUnavailableError("AI is not configured. Set AI_API_KEY on the server.");
  const context = await buildAiContext(req.storeId, req.range, req.compare, req.filters, req.kind === "campaign" ? req.campaignId : undefined);

  const instructions =
    req.kind === "daily_summary" ? SUMMARY_INSTRUCTIONS : req.kind === "campaign" ? CAMPAIGN_INSTRUCTIONS : `${FULL_STRUCTURE}\n\nQuestion: ${req.question}`;
  const model = env.ai.model ?? DEFAULT_AI_MODEL;
  const client = new Anthropic({ apiKey: env.ai.apiKey });

  const stream = client.beta.messages.stream({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: req.kind === "daily_summary" ? "medium" : "high" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `<metrics>\n${JSON.stringify(context)}\n</metrics>\n\n${instructions}`,
      },
    ],
  });
  const message = await stream.finalMessage();

  let output: string;
  if (message.stop_reason === "refusal") {
    output = "The AI declined to answer this request. Try rephrasing the question.";
  } else {
    output = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (message.stop_reason === "max_tokens") output += "\n\n_(Answer truncated.)_";
  }

  const row = await db.aIAnalysis.create({
    data: {
      storeId: req.storeId,
      kind: req.kind,
      question: req.question ?? null,
      campaignExternalId: req.campaignId ?? null,
      dateFrom: toDbDate(req.range.from),
      dateTo: toDbDate(req.range.to),
      input: JSON.parse(JSON.stringify(context)) as Prisma.InputJsonValue,
      output,
      model: message.model,
      createdById: req.userId ?? null,
    },
  });
  return { id: row.id, output, createdAt: row.createdAt };
}
