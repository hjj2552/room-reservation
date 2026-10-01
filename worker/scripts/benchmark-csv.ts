import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { ProductService } from "../src/services/product-service";
import { CsvDatabase, reservationRow } from "../tests/helpers/csv";

const phase = process.argv[2];
if (phase !== "before" && phase !== "after") throw new Error("Specify before or after");
const filter = { excludeCancelled: false };
const dates = ["2026-12-31T14:59:59Z", "2026-12-31T15:00:00Z", "2026-06-30T14:59:58Z", "2026-01-01T00:00:07Z"];
const purposes = ["testing-normal", 'testing-comma, "quote"\r\nnext', "=1+1", " +CMD", "-1", "\t@SUM(1,1)", "'already safe"];
const rows = Array.from({ length: 2_000 }, (_, index) => {
  const start = new Date(Date.parse(dates[index % dates.length]!) + Math.floor(index / dates.length) * 1_000);
  return reservationRow({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    current_room_name: 'testing-room, "quoted"', applicant_name: "testing-applicant",
    applicant_email: index % 2 ? "testing-csv@example.test" : null,
    applicant_phone: index % 3 ? "01000000000" : null,
    purpose: purposes[index % purposes.length],
    start_at: index % 2 ? start : start.toISOString(),
    end_at: new Date(start.getTime() + 3_600_000).toISOString(),
    created_at: index % 2 ? new Date("2025-12-31T15:00:09Z") : "2026-06-30T15:00:03Z",
  });
}).sort((a, b) => new Date(a.start_at as string).getTime() - new Date(b.start_at as string).getTime());
const service = new ProductService(new CsvDatabase(rows), () => new Date("2026-01-01T00:00:00Z"));
const times: number[] = [];
let csv = "";
// Data preparation is complete. Time the entire service call, including its fake DB query.
for (let iteration = -2; iteration < 7; iteration += 1) {
  const start = performance.now();
  csv = await service.exportReservationsCsv(filter);
  const ms = performance.now() - start;
  if (iteration >= 0) times.push(ms);
}
const emptyCsv = await new ProductService(new CsvDatabase([]), () => new Date()).exportReservationsCsv(filter);
let formatterConstructions = 0;
const original = Intl.DateTimeFormat;
// Count in a separate untimed call so instrumentation does not affect the timing comparison.
Intl.DateTimeFormat = new Proxy(original, { construct(target, args) {
  formatterConstructions += 1;
  return Reflect.construct(target, args);
} });
try { await service.exportReservationsCsv(filter); } finally { Intl.DateTimeFormat = original; }
await mkdir("test-results", { recursive: true });
if (phase === "after") {
  if (csv !== await readFile("test-results/csv-before.csv", "utf8")) throw new Error("Full CSV output changed");
  const baseline = JSON.parse(await readFile("test-results/csv-before.json", "utf8"));
  if (emptyCsv !== baseline.emptyCsv) throw new Error("Empty CSV output changed");
}
const sorted = [...times].sort((a, b) => a - b);
const report = { phase, rows: rows.length, warmups: 2, samples: times,
  medianMs: sorted[3], minMs: sorted[0], maxMs: sorted[6],
  formatterConstructions, csvBytes: Buffer.byteLength(csv), emptyCsv,
  ...(phase === "after" ? { identicalToBefore: true } : {}) };
await writeFile(`test-results/csv-${phase}.csv`, csv);
await writeFile(`test-results/csv-${phase}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
