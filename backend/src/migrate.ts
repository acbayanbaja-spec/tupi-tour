import { runMigrations } from "./db/migrate.js";

runMigrations()
  .then(() => {
    console.log("Migration script finished successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration script failed:", err);
    process.exit(1);
  });
