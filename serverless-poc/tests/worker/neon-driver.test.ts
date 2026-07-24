import { neon, neonConfig } from "@neondatabase/serverless";
import { expect, it } from "vitest";

it("executes the Neon HTTP driver inside the Workers runtime", async () => {
  let requestBody = "";
  const originalFetch = neonConfig.fetchFunction;
  neonConfig.fetchFunction = async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        command: "SELECT",
        fields: [{ name: "answer", dataTypeID: 23 }],
        rowAsArray: false,
        rowCount: 1,
        rows: [[42]],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const sql = neon("postgresql://p3_user:p3_password@p3.example.neon.tech/p3");
  let rows;
  try {
    rows = await sql`SELECT ${42}::integer AS answer`;
  } finally {
    neonConfig.fetchFunction = originalFetch;
  }

  expect(rows).toEqual([{ answer: 42 }]);
  expect(requestBody).toContain("SELECT $1::integer AS answer");
  expect(requestBody).not.toContain("p3_password");
});
