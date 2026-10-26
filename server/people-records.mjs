import { today } from "./model.mjs";
export function peopleTables(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS learner_documents(id TEXT PRIMARY KEY,learner_id TEXT NOT NULL,name TEXT NOT NULL,body BLOB NOT NULL)",
  );
}
export function saveLearnerSupport({
  s,
  u,
  p,
  learner,
  db,
  id,
  optional,
  text,
  date,
  choice,
  fail,
}) {
  const fields = [
    "address",
    "dateOfBirth",
    "alsStatus",
    "alsDetails",
    "reasonableAdjustments",
    "supportReviewDate",
  ];
  if (
    !fields.some((f) => Object.hasOwn(p, f)) &&
    !Object.hasOwn(p, "supportFiles")
  )
    return;
  s.learnerSupportRecords ||= [];
  const old = s.learnerSupportRecords.find((r) => r.learnerId === learner.id);
  const record = {
    ...(old || { learnerId: learner.id, documents: [] }),
    updated: new Date().toISOString(),
    by: u.id,
  };
  record.documents ||= [];
  if (Object.hasOwn(p, "address")) record.address = optional(p.address, 2000);
  if (Object.hasOwn(p, "dateOfBirth")) {
    record.dateOfBirth = date(p.dateOfBirth, "date of birth");
    if (record.dateOfBirth > today())
      fail("Date of birth cannot be in the future.");
  }
  if (Object.hasOwn(p, "alsStatus"))
    record.alsStatus = choice(
      p.alsStatus || "Not recorded",
      [
        "Not recorded",
        "Assessment pending",
        "No additional support",
        "Support in place",
      ],
      "ALS status",
    );
  if (Object.hasOwn(p, "alsDetails"))
    record.alsDetails = optional(p.alsDetails, 20000);
  if (Object.hasOwn(p, "reasonableAdjustments"))
    record.reasonableAdjustments = optional(p.reasonableAdjustments, 20000);
  if (Object.hasOwn(p, "supportReviewDate"))
    record.supportReviewDate = date(p.supportReviewDate, "support review date");
  if (p.supportFiles !== undefined) {
    if (!Array.isArray(p.supportFiles) || p.supportFiles.length > 5)
      fail("Upload at most five documents at a time.");
    if (record.documents.length + p.supportFiles.length > 100)
      fail("An apprentice can have at most 100 supporting documents.");
    const category = choice(
      p.documentCategory || "Certificate",
      [
        "Certificate",
        "ALS assessment or diagnosis",
        "Medical information",
        "Other",
      ],
      "document category",
    );
    for (const file of p.supportFiles) {
      const name = text(file.name, "Document filename", 180),
        body = Buffer.from(
          text(file.base64, "Document content", 7500000),
          "base64",
        );
      if (!body.length || body.length > 5 * 1024 * 1024)
        fail("Each document must be non-empty and at most 5 MB.");
      const documentId = id();
      db.prepare("INSERT INTO learner_documents VALUES(?,?,?,?)").run(
        documentId,
        learner.id,
        name,
        body,
      );
      record.documents.push({
        id: documentId,
        name,
        size: body.length,
        category,
        by: u.id,
        created: new Date().toISOString(),
      });
    }
  }
  if (old) Object.assign(old, record);
  else s.learnerSupportRecords.push(record);
}
export function peopleCommand(ctx) {
  const {
    s,
    u,
    kind,
    p,
    l,
    fail,
    requireRole,
    id,
    text,
    optional,
    date,
    choice,
  } = ctx;
  if (kind === "learner.document.remove") {
    requireRole(u, ["Manager", "Assessor"]);
    if (!l) fail("Select an apprentice.");
    const record = s.learnerSupportRecords.find((r) => r.learnerId === l.id);
    if (!record?.documents.some((d) => d.id === p.id))
      fail("Document not found.", 404);
    record.documents = record.documents.filter((d) => d.id !== p.id);
    record.updated = new Date().toISOString();
    record.by = u.id;
    return {};
  }
  if (kind === "assessor.oneToOne.save") {
    requireRole(u, ["Manager"]);
    s.assessorOneToOnes ||= [];
    const old = p.id ? s.assessorOneToOnes.find((r) => r.id === p.id) : null;
    if (p.id && !old) fail("1:1 record not found.", 404);
    const assessor = s.users.find(
      (a) =>
        a.id === p.assessorId &&
        a.role === "Assessor" &&
        (a.active || old?.assessorId === a.id),
    );
    if (!assessor) fail("Select an assessor.");
    const status = choice(
        p.status,
        ["Planned", "Draft", "Completed"],
        "1:1 status",
      ),
      meetingDate = date(p.date, "1:1 date", true);
    if (status === "Completed" && meetingDate > today())
      fail("A completed 1:1 cannot be in the future.");
    const record = {
      id: old?.id || id(),
      assessorId: assessor.id,
      title: text(p.title, "1:1 title", 200),
      date: meetingDate,
      status,
      summary:
        status === "Completed"
          ? text(p.summary, "Meeting summary", 20000)
          : optional(p.summary, 20000),
      performance: optional(p.performance, 20000),
      wellbeing: optional(p.wellbeing, 20000),
      development: optional(p.development, 20000),
      actions: optional(p.actions, 20000),
      confidentialNotes: optional(p.confidentialNotes, 20000),
      nextDate: date(p.nextDate, "next 1:1 date"),
      created: old?.created || new Date().toISOString(),
      createdBy: old?.createdBy || u.id,
      updated: new Date().toISOString(),
      by: u.id,
      history: old?.history || [],
    };
    if (record.nextDate && record.nextDate < record.date)
      fail("The next 1:1 date must be on or after the meeting date.");
    if (old) {
      const { history, ...previous } = old;
      record.history = [
        ...(history || []),
        { ...previous, archivedAt: record.updated, archivedBy: u.id },
      ];
      Object.assign(old, record);
    } else s.assessorOneToOnes.push(record);
    return { recordId: record.id };
  }
  if (kind === "spotlight.save") {
    requireRole(u, ["Manager"]);
    s.successStories ||= [];
    const old = p.id ? s.successStories.find((r) => r.id === p.id) : null;
    if (p.id && !old) fail("Success story not found.", 404);
    const kind = choice(
      p.kind,
      ["Learner success", "Assessor success"],
      "story type",
    );
    const published = p.published === true;
    const record = {
      id: old?.id || id(),
      kind,
      personName: text(p.personName, "Person's name", 160),
      title: text(p.title, "Story title", 200),
      achievement: text(p.achievement, "Achievement", 250),
      story: text(p.story, "Success story", 10000),
      quote: optional(p.quote, 2000),
      published,
      created: old?.created || new Date().toISOString(),
      updated: new Date().toISOString(),
      publishedAt: published
        ? new Date().toISOString()
        : old?.publishedAt || "",
      by: u.id,
    };
    if (published)
      for (const story of s.successStories) story.published = false;
    if (old) Object.assign(old, record);
    else s.successStories.push(record);
    return { storyId: record.id };
  }
  return null;
}
