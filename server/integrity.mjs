import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
export function createIntegrityService({
  db,
  get,
  put,
  enabled,
  internet = { enabled: false },
}) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS integrity_jobs(evidence_id TEXT PRIMARY KEY,version TEXT NOT NULL,status TEXT NOT NULL);CREATE TABLE IF NOT EXISTS evidence_text(evidence_id TEXT PRIMARY KEY,text TEXT NOT NULL,checked_at TEXT NOT NULL)",
  );
  db.prepare(
    "UPDATE integrity_jobs SET status='Queued' WHERE status='Processing'",
  ).run();
  let running = false,
    closed = false,
    worker,
    timer,
    deadline;
  function enqueue(e) {
    if (!enabled) {
      e.integrity = { status: "Not checked", aiStatus: "Not checked" };
      return;
    }
    e.contentVersion = randomUUID();
    e.integrity = { status: "Queued", aiStatus: "Queued" };
    db.prepare(
      "INSERT OR REPLACE INTO integrity_jobs VALUES(?,?,'Queued')",
    ).run(e.id, e.contentVersion);
  }
  function pump() {
    if (!enabled || running || closed) return;
    const job = db
      .prepare("SELECT * FROM integrity_jobs WHERE status='Queued' LIMIT 1")
      .get();
    if (!job) return;
    const evidence = get().evidence.find((e) => e.id === job.evidence_id);
    if (!evidence || evidence.contentVersion !== job.version) {
      db.prepare(
        "DELETE FROM integrity_jobs WHERE evidence_id=? AND version=?",
      ).run(job.evidence_id, job.version);
      return;
    }
    running = true;
    db.prepare(
      "UPDATE integrity_jobs SET status='Processing' WHERE evidence_id=? AND version=?",
    ).run(job.evidence_id, job.version);
    const files = evidence.files
        .map((f) =>
          db
            .prepare("SELECT name,body FROM files WHERE id=? AND learner_id=?")
            .get(f.id, evidence.learnerId),
        )
        .filter(Boolean),
      corpus = [];
    let corpusCharacters = 0;
    for (const row of db
      .prepare(
        "SELECT text FROM evidence_text WHERE evidence_id!=? ORDER BY checked_at DESC LIMIT 2000",
      )
      .iterate(evidence.id)) {
      if (corpusCharacters + row.text.length > 8000000) break;
      corpus.push(row);
      corpusCharacters += row.text.length;
    }
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      worker?.terminate();
      running = false;
      if (closed) return;
      db.exec("BEGIN IMMEDIATE");
      try {
        const s = get(),
          e = s.evidence.find((e) => e.id === job.evidence_id);
        if (e?.contentVersion === job.version) {
          e.integrity = result?.report || {
            status: "Check unavailable",
            aiStatus: "Not checked",
            reason:
              "The internal text check could not finish. Try again or review the work manually.",
          };
          if (result?.text)
            db.prepare(
              "INSERT OR REPLACE INTO evidence_text VALUES(?,?,?)",
            ).run(e.id, result.text, new Date().toISOString());
          put(s);
        }
        db.prepare(
          "DELETE FROM integrity_jobs WHERE evidence_id=? AND version=?",
        ).run(job.evidence_id, job.version);
        db.exec("COMMIT");
      } catch {
        db.exec("ROLLBACK");
      }
    }
    worker = new Worker(new URL("./integrity-worker.mjs", import.meta.url), {
      workerData: {
        description: evidence.description,
        files,
        corpus,
        internet,
      },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    worker.once("message", finish);
    worker.once("error", () => finish(null));
    worker.once("exit", (code) => {
      if (code !== 0) finish(null);
    });
    deadline = setTimeout(() => finish(null), 45000);
    deadline.unref();
  }
  return {
    enqueue,
    start() {
      if (enabled) {
        timer = setInterval(pump, 1000);
        timer.unref();
        pump();
      }
    },
    stop() {
      closed = true;
      clearInterval(timer);
      clearTimeout(deadline);
      worker?.terminate();
    },
  };
}
