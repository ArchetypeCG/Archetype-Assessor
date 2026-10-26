import { mkdir, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decryptBackup } from "../server/backups.mjs";
const [source, destination] = process.argv.slice(2);
if (!source || !destination)
  throw Error(
    "Usage: node scripts/restore-backup.mjs <encrypted-backup> <NEW-data-directory/archetype.sqlite>. Supply BACKUP_ENCRYPTION_KEY securely in the process environment. The destination must not exist.",
  );
const target = resolve(destination);
await mkdir(dirname(target), { recursive: true, mode: 0o700 });
await decryptBackup(resolve(source), target, process.env.BACKUP_ENCRYPTION_KEY);
let db;
try {
  db = new DatabaseSync(target);
  if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok")
    throw Error("SQLite integrity check failed.");
  const s = JSON.parse(
    db.prepare("SELECT data FROM workspace WHERE id=1").get().data,
  );
  if (!s.users.some((u) => u.active && u.role === "Manager"))
    throw Error("Backup has no active manager account.");
  db.exec("DELETE FROM sessions");
  if (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name='calendar_subscriptions'",
      )
      .get()
  )
    db.exec("DELETE FROM calendar_subscriptions");
  for (const table of ["outlook_connections", "outlook_oauth"]) {
    if (db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(table))
      db.exec(`DELETE FROM ${table}`);
  }
  db.close();
  db = null;
  console.log(
    "Backup restored and verified to the new data directory. All previous login sessions, calendar subscription links and Microsoft 365 connections were invalidated. Stop the live app before changing DATA_DIR to this directory.",
  );
} catch (e) {
  db?.close();
  await unlink(target).catch(() => {});
  throw e;
}
