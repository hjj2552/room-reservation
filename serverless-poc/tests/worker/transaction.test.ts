import { expect, it } from "vitest";
import { runTransaction, type TransactionClient } from "../../src/infra/neon-transaction";

class RecordingClient implements TransactionClient {
  readonly queries: string[] = [];

  constructor(private readonly failOn?: string) {}

  async query(queryText: string): Promise<void> {
    this.queries.push(queryText);
    if (queryText === this.failOn) throw new Error(`failed: ${queryText}`);
  }
}

it("commits the request-scoped Neon transaction on success", async () => {
  const client = new RecordingClient();
  const result = await runTransaction(client, async (transaction) => {
    await transaction.query("INSERT PROBE");
    return "committed";
  });

  expect(result).toBe("committed");
  expect(client.queries).toEqual(["BEGIN", "INSERT PROBE", "COMMIT"]);
});

it("rolls back and preserves the original transaction error", async () => {
  const client = new RecordingClient("INSERT PROBE");

  await expect(
    runTransaction(client, async (transaction) => {
      await transaction.query("INSERT PROBE");
    }),
  ).rejects.toThrow("failed: INSERT PROBE");
  expect(client.queries).toEqual(["BEGIN", "INSERT PROBE", "ROLLBACK"]);
});
