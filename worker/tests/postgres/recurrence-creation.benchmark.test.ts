import { expect, it } from "vitest";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { PgDatabase } from "./pg-database";
import { recurrenceQueryCounts, setupRecurrenceFixture } from "./recurrence-fixture";

// Opt-in only, on a disposable local PostgreSQL database provisioned by the caller.
it.skipIf(process.env.RECURRENCE_BENCHMARK !== "1")("measures recurrence creation on real PostgreSQL", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.TZ !== "UTC") throw new Error("Run the recurrence benchmark with TZ=UTC");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/testing_")) {
    throw new Error("Recurrence benchmark requires a local testing_ database");
  }
  const statements: string[] = [];
  const database = new PgDatabase(url.toString(), sql => statements.push(sql));
  const fixture = await setupRecurrenceFixture(database);
  const measurements: unknown[] = [];
  try {
    for (const scenario of [
      { name: "FAIL_ALL_30", count: 30, policy: "FAIL_ALL", conflicts: 0 },
      { name: "FAIL_ALL_366", count: 366, policy: "FAIL_ALL", conflicts: 0 },
      { name: "SKIP_CONFLICTS_366", count: 366, policy: "SKIP_CONFLICTS", conflicts: 0 },
      { name: "SKIP_CONFLICTS_366_WITH_36_CONFLICTS", count: 366, policy: "SKIP_CONFLICTS", conflicts: 36 },
    ]) {
      const samples: Array<Record<string, unknown> & { ms: number }> = [];
      // Two warmups, then five measured calls; setup/cleanup and assertions are outside timing.
      for (let iteration = -2; iteration < 5; iteration += 1) {
        await fixture.clear();
        for (let index = 0; index < scenario.conflicts; index += 1) await fixture.blocker(index * 10);
        const command = fixture.command(scenario.count, scenario.policy);
        statements.length = 0;
        const start = performance.now();
        const result = await fixture.products.createRecurrence(command, "testing-admin");
        const ms = performance.now() - start;
        const queries = recurrenceQueryCounts(statements);
        const histories = Number((await database.query(
          "SELECT count(*) AS count FROM reservation_histories WHERE reservation_purpose=$1", [fixture.purpose],
        )).rows[0]!.count);
        expect(result).toMatchObject({ totalCandidates: scenario.count,
          createdCount: scenario.count - scenario.conflicts, cancelledCount: scenario.conflicts,
          skippedCount: 0, failedCount: 0 });
        expect(histories).toBe(scenario.count);
        if (iteration >= 0) samples.push({ ms, ...queries, created: result.createdCount,
          cancelled: result.cancelledCount, skipped: result.skippedCount, histories });
      }
      const times = samples.map(sample => sample.ms).sort((a, b) => a - b);
      measurements.push({ scenario: scenario.name,
        medianMs: times[2], minMs: times[0], maxMs: times[4], samples });
    }
    await mkdir("test-results", { recursive: true });
    await writeFile("test-results/recurrence-benchmark.json", JSON.stringify(measurements, null, 2));
  } finally {
    await fixture.close();
    await database.close();
  }
}, 180_000);
