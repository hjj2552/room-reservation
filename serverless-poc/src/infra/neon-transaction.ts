import { Client } from "@neondatabase/serverless";

export interface TransactionClient {
  query(queryText: string, values?: unknown[]): Promise<unknown>;
}

export async function runTransaction<T>(
  client: TransactionClient,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Transaction and rollback both failed");
    }
    throw error;
  }
}

export async function withNeonTransaction<T>(
  connectionString: string,
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = new Client(connectionString);
  await client.connect();
  try {
    return await runTransaction(client, work);
  } finally {
    await client.end();
  }
}
