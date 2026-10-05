/**
 * Run a sync from the command line — useful for large initial imports that
 * exceed serverless time limits:
 *
 *   npm run sync -- <storeId> [recent|daily|manual] [budgetMinutes]
 *   npm run sync -- --all [recent|daily]
 */
import { runAllStores, runStoreSync, RunMode } from "../src/lib/sync/orchestrator";
import { db } from "../src/lib/db";

async function main() {
  const [target, modeArg, minutes] = process.argv.slice(2);
  const mode = (modeArg ?? "manual") as RunMode;
  if (!target) throw new Error("Usage: npm run sync -- <storeId|--all> [recent|daily|manual] [budgetMinutes]");
  const res = target === "--all" ? await runAllStores(mode, "cli") : [await runStoreSync(target, mode, "cli", Number(minutes ?? 60) * 60_000)];
  console.log(JSON.stringify(res, null, 2));
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
