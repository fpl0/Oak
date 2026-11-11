// `bun run db:backup`: a manual `VACUUM INTO` copy of the learner database (contracts §11.10), next to the
// daily automatic ones in <data>/backups. Safe while the server runs (SQLite WAL, the server is the only
// writer and VACUUM INTO reads a consistent snapshot). Prints the path of the copy.
import { existsSync } from "node:fs";
import { loadConfig } from "../../server/src/config.ts";
import { openDb } from "../../server/src/db/index.ts";
import { safetyCopy } from "../../server/src/services/backup.ts";

const config = loadConfig();
if (!existsSync(config.dbPath)) {
  console.error(`no database at ${config.dbPath} (set OAK_DATA_DIR, or start Oak once first)`);
  process.exit(1);
}
const db = openDb(config.dbPath, { migrate: false });
try {
  console.info(safetyCopy(db, config.backupsDir, "manual", new Date()));
} finally {
  db.close();
}
