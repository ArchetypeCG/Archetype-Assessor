import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackupService, decryptBackup } from "../server/backups.mjs";
import { londonTimestamp, calendarICS } from "../server/scheduling.mjs";
test("encrypted online SQLite backup restores data, detects tampering and never overwrites an existing file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "archetype-backup-test-"));
  const db = new DatabaseSync(join(directory, "source.sqlite"));
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE example (value TEXT)");
    db.prepare("INSERT INTO example VALUES(?)").run(
      "Recoverable evidence content",
    );
    const secret = "test-only-backup-key-with-more-than-32-characters",
      service = createBackupService(db, directory, {
        BACKUP_ENCRYPTION_KEY: secret,
      });
    const info = await service.create(),
      path = await service.downloadPath(info.name);
    assert.ok(info.size > 0);
    assert.equal((await service.status()).files.length, 1);
    const bytes = await readFile(path);
    assert.ok(!bytes.includes(Buffer.from("Recoverable evidence content")));
    const restored = join(directory, "restored.sqlite");
    await decryptBackup(path, restored, secret);
    const check = new DatabaseSync(restored);
    assert.equal(
      check.prepare("SELECT value FROM example").get().value,
      "Recoverable evidence content",
    );
    assert.equal(check.prepare("PRAGMA quick_check").get().quick_check, "ok");
    check.close();
    await assert.rejects(() => decryptBackup(path, restored, secret));
    assert.ok((await readFile(restored)).length > 0);
    await assert.rejects(() =>
      decryptBackup(
        path,
        join(directory, "wrong.sqlite"),
        "wrong-test-only-key-at-least-32-chars",
      ),
    );
    const corrupt = Buffer.from(bytes);
    corrupt[corrupt.length - 1] ^= 1;
    const tampered = join(directory, "tampered.enc");
    await writeFile(tampered, corrupt);
    await assert.rejects(() =>
      decryptBackup(tampered, join(directory, "tampered.sqlite"), secret),
    );
    assert.equal(await service.downloadPath("../source.sqlite"), null);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("calendar uses correct UK summer/winter UTC offsets and rejects nonexistent clock-change times", () => {
  assert.equal(
    new Date(londonTimestamp("2027-06-01", "10:00")).toISOString(),
    "2027-06-01T09:00:00.000Z",
  );
  assert.equal(
    new Date(londonTimestamp("2027-12-01", "10:00")).toISOString(),
    "2027-12-01T10:00:00.000Z",
  );
  assert.throws(() => londonTimestamp("2027-03-28", "01:30"));
  const ics = calendarICS({
    learners: [{ id: "l", name: "Learner" }],
    appointments: [
      {
        id: "a",
        learnerId: "l",
        title: "Review\nBEGIN:VEVENT, injected",
        date: "2027-06-01",
        time: "10:00",
        endTime: "11:00",
        status: "Planned",
        objectives: "Detailed objective",
      },
    ],
  });
  assert.match(ics, /DTSTART:20270601T090000Z/);
  assert.equal((ics.match(/\r\nBEGIN:VEVENT\r\n/g) || []).length, 1);
  assert.match(ics, /Review\\nBEGIN:VEVENT\\, injected/);
});
