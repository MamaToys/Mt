import { requireStore } from "@/lib/session";
import { parseView, SearchParams } from "@/lib/params";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/service";
import { PRESET_QUESTIONS } from "@/lib/ai/prompts";
import { AiChat } from "@/components/dash/ai-panel";
import { Card } from "@/components/ui/card";
import { Notes, PageHeader } from "@/components/dash/notices";

export const dynamic = "force-dynamic";

export default async function AiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { store } = await requireStore();
  const view = parseView(await searchParams, store);
  const history = await db.aIAnalysis.findMany({ where: { storeId: store.id, kind: { in: ["question", "campaign"] } }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="AI Analysis" description={`Answers use only the aggregated metrics in your database for ${view.label}${view.compareLabel ? `, compared with ${view.compareLabel}` : ""}.`} />
      <Notes
        notes={[
          "The AI receives structured totals, daily/weekly series, campaign metrics, data gaps and sync freshness — never customer names, emails or addresses.",
          "It is instructed to state when data is unavailable, keep Meta attribution separate from Shopify results, explain its calculations and avoid unsupported causal claims. Always verify important decisions against the numbers on the dashboard.",
        ]}
      />
      {!aiConfigured() ? (
        <Card className="p-6 text-sm">AI analysis is not configured. Set <code>AI_API_KEY</code> in the server environment.</Card>
      ) : (
        <AiChat
          presets={PRESET_QUESTIONS}
          base={{ from: view.range.from, to: view.range.to, compareFrom: view.compare?.from, compareTo: view.compare?.to, filters: { ...view.filters } }}
          history={history.map((h) => ({ id: h.id, question: h.question ?? (h.kind === "campaign" ? `Campaign ${h.campaignExternalId}` : null), output: h.output, createdAt: h.createdAt.toISOString() }))}
        />
      )}
    </div>
  );
}
