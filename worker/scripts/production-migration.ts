import {
  applyProductionMigration,
  preflightProductionMigration,
  ProductionMigrationError,
  verifyProductionMigration,
} from "./production-migration-lib";

const operation = process.argv[2];

try {
  if (operation === "preflight") {
    await preflightProductionMigration();
    process.stdout.write("Production migration identity and ledger verified.\n");
  } else if (operation === "apply") {
    await applyProductionMigration();
    process.stdout.write("Production database migrations completed.\n");
  } else if (operation === "verify") {
    await verifyProductionMigration();
    process.stdout.write("Production migration ledger and V2 schema verified.\n");
  } else {
    throw new ProductionMigrationError("configuration", "Production migration operation is invalid.");
  }
} catch (error) {
  const message = error instanceof ProductionMigrationError
    ? error.message
    : "Production migration operation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
