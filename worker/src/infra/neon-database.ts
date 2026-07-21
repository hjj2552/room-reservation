import { Client, neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Database, Queryable, QueryResult } from "./database";

type Sql = NeonQueryFunction<false, false>;

export class NeonDatabase implements Database {
  private readonly sql: Sql;

  constructor(private readonly connectionString: string) {
    this.sql = neon(connectionString);
  }

  async query<Row extends Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<Row>> {
    const rows = await this.sql.query(text, values) as Row[];
    return { rows, rowCount: rows.length };
  }

  async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    const client = new Client(this.connectionString);
    await client.connect();
    try {
      await client.query("BEGIN");
      try {
        const result = await work({
          query: async <Row extends Record<string, unknown>>(text: string, values: unknown[] = []) => {
            const result = await client.query(text, values);
            return {
              rows: result.rows as Row[],
              rowCount: result.rowCount ?? result.rows.length,
            };
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } finally {
      await client.end();
    }
  }
}
