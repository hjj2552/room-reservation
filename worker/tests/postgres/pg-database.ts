import pg from "pg";
import type { Database, Queryable, QueryResult } from "../../src/infra/database";

const { Pool } = pg;

export class PgDatabase implements Database {
  readonly pool: InstanceType<typeof Pool>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query<Row extends Record<string, unknown>>(text: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    const result = await this.pool.query(text, values);
    return { rows: result.rows as Row[], rowCount: result.rowCount ?? result.rows.length };
  }

  async transaction<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    await client.query("BEGIN");
    try {
      const result = await work({
        query: async <Row extends Record<string, unknown>>(text: string, values: unknown[] = []) => {
          const queryResult = await client.query(text, values);
          return { rows: queryResult.rows as Row[], rowCount: queryResult.rowCount ?? queryResult.rows.length };
        },
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
