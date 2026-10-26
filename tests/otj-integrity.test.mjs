import test from "node:test";
import assert from "node:assert/strict";
import { expectedOtjHours } from "../server/otj-target.mjs";
import { extractEvidenceText, compareText } from "../server/integrity-text.mjs";
import { createIntegrityService } from "../server/integrity.mjs";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as pause } from "node:timers/promises";
import JSZip from "jszip";
const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
test("OTJ expected hours follow programme dates, clamp at each end and remain unset without a valid target", () => {
  const learner = {
    startDate: "2026-01-01",
    plannedEnd: "2026-01-11",
    otjTarget: 100,
  };
  assert.equal(expectedOtjHours(learner, "2026-01-06"), 50);
  assert.equal(expectedOtjHours(learner, "2025-12-01"), 0);
  assert.equal(expectedOtjHours(learner, "2026-02-01"), 100);
  assert.equal(
    expectedOtjHours({ ...learner, otjTarget: 0 }, "2026-01-06"),
    null,
  );
  assert.equal(
    expectedOtjHours({ ...learner, startDate: "" }, "2026-01-06"),
    null,
  );
});
test("internal similarity uses real text overlap, never invents an AI probability and reports insufficient text", async () => {
  assert.equal(compareText(words, [{ text: words }]).similarity, 100);
  assert.equal(
    compareText(words, [
      {
        text: words
          .split(" ")
          .map((w) => `other${w}`)
          .join(" "),
      },
    ]).similarity,
    0,
  );
  assert.equal(compareText("short", [{ text: words }]).similarity, null);
  assert.equal(compareText(words, []).status, "No comparison sources");
  assert.equal(compareText(words, [{ text: words }]).aiStatus, "Reviewed");
  assert.equal(
    compareText(words, [{ text: words }]).aiReview.method,
    "Rule-based writing-pattern review",
  );
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document><w:p><w:t>${words}</w:t></w:p></w:document>`,
  );
  const result = await extractEvidenceText("", [
    {
      name: "work.docx",
      body: await zip.generateAsync({ type: "nodebuffer" }),
    },
    { name: "scan.png", body: Buffer.from("image") },
  ]);
  assert.ok(result.text.includes("word99"));
  assert.deepEqual(result.unsupported, ["scan.png"]);
});
test("queued internal checks run in a separate worker, persist a real comparison and keep extracted text outside the API workspace", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE files(id TEXT PRIMARY KEY,learner_id TEXT,name TEXT,body BLOB)",
  );
  let state = {
    revision: 0,
    evidence: [
      { id: "second", learnerId: "learner", description: words, files: [] },
    ],
  };
  const service = createIntegrityService({
    db,
    get: () => structuredClone(state),
    put: (s) => (state = s),
    enabled: true,
  });
  db.prepare("INSERT INTO evidence_text VALUES(?,?,?)").run(
    "first",
    words,
    new Date().toISOString(),
  );
  service.enqueue(state.evidence[0]);
  service.start();
  try {
    for (
      let n = 0;
      n < 100 && state.evidence[0].integrity.status === "Queued";
      n++
    )
      await pause(100);
    assert.equal(state.evidence[0].integrity.status, "Checked");
    assert.equal(state.evidence[0].integrity.similarity, 100);
    assert.equal(state.revision, 0);
    assert.ok(!JSON.stringify(state).includes('"text":'));
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM integrity_jobs").get().n,
      0,
    );
  } finally {
    service.stop();
    await pause(100);
    db.close();
  }
});

test("PDF uploads contribute actual readable document text to the internal check", async () => {
  const lines = Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 10 }, (_, column) => `word${row * 10 + column}`).join(
      " ",
    ),
  );
  const content =
    "BT /F1 10 Tf 20 700 Td 14 TL " +
    lines.map((line) => `(${line}) Tj T*`).join(" ") +
    " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    "xref\n0 6\n0000000000 65535 f \n" +
    offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractEvidenceText("", [
    { name: "synthetic.pdf", body: Buffer.from(pdf) },
  ]);
  assert.deepEqual(result.unsupported, []);
  assert.ok(result.text.includes("word99"));
  assert.equal(compareText(result.text, [{ text: words }]).similarity, 100);
});

test("each apprentice's OTJ comparison uses their own dated approved log and own programme, not a cached/shared total", async () => {
  const { otjProgress } = await import("../server/otj-target.mjs");
  const a = {
    id: "a",
    name: "A",
    standardId: "a-course",
    startDate: "2026-01-01",
    plannedEnd: "2026-01-11",
    otjTarget: 100,
    hours: 45,
  };
  const b = {
    id: "b",
    name: "B",
    standardId: "b-course",
    startDate: "2026-01-01",
    plannedEnd: "2026-01-21",
    otjTarget: 300,
    hours: 45,
  };
  const logs = [
    {
      learnerId: "a",
      standardId: "a-course",
      date: "2026-01-03",
      status: "Approved",
      hours: 10,
    },
    {
      learnerId: "a",
      standardId: "a-course",
      date: "2026-01-04",
      status: "Approved",
      hours: "0.25",
    },
    {
      learnerId: "a",
      standardId: "a-course",
      date: "2026-01-03",
      status: "Pending",
      hours: 99,
    },
    {
      learnerId: "a",
      standardId: "old-course",
      date: "2026-01-03",
      status: "Approved",
      hours: 50,
    },
    {
      learnerId: "a",
      standardId: "a-course",
      date: "2026-01-08",
      status: "Approved",
      hours: 25,
    },
    {
      learnerId: "b",
      standardId: "b-course",
      date: "2026-01-03",
      status: "Approved",
      hours: 33,
    },
  ];
  assert.deepEqual(otjProgress(a, logs, "2026-01-06"), {
    approved: 10.25,
    expected: 50,
    variance: -39.75,
  });
  assert.deepEqual(otjProgress(b, logs, "2026-01-06"), {
    approved: 33,
    expected: 75,
    variance: -42,
  });
  logs[0].hours = 20;
  assert.equal(otjProgress(a, logs, "2026-01-06").approved, 20.25);
  assert.equal(otjProgress(b, logs, "2026-01-06").approved, 33);
  assert.equal(otjProgress(a, logs, "2026-01-11").approved, 45.25);
});
