import { today } from "./model.mjs";
export function peopleTables(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS learner_documents(id TEXT PRIMARY KEY,learner_id TEXT NOT NULL,name TEXT NOT NULL,body BLOB NOT NULL); CREATE TABLE IF NOT EXISTS assessor_cpd_files(id TEXT PRIMARY KEY,assessor_id TEXT NOT NULL,name TEXT NOT NULL,body BLOB NOT NULL)",
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
    "telephone",
    "emergencyContactName",
    "emergencyContactRelationship",
    "emergencyContactTelephone",
    "emergencyContactAlternativeTelephone",
    "emergencyContactEmail",
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
  for (const [field, max] of [
    ["telephone", 80],
    ["emergencyContactName", 160],
    ["emergencyContactRelationship", 100],
    ["emergencyContactTelephone", 80],
    ["emergencyContactAlternativeTelephone", 80],
    ["emergencyContactEmail", 254],
  ]) {
    if (Object.hasOwn(p, field)) record[field] = optional(p[field], max);
  }
  if (
    record.emergencyContactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.emergencyContactEmail)
  )
    fail("Enter a valid emergency contact email address.");
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
    db,
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
  if (["cpd.save", "cpd.delete", "cpd.file.remove"].includes(kind)) {
    requireRole(u, ["Manager", "Assessor"]);
    s.cpdRecords ||= [];
    const old = p.id ? s.cpdRecords.find((record) => record.id === p.id) : null;
    if (p.id && !old) fail("CPD entry not found.", 404);
    if (old && u.role !== "Manager" && old.assessorId !== u.id)
      fail("You can only manage your own CPD.", 403);
    if (kind !== "cpd.save") {
      if (!old) fail("Select a CPD entry.");
      if (kind === "cpd.delete")
        s.cpdRecords = s.cpdRecords.filter((record) => record.id !== old.id);
      else {
        if (!old.files.some((file) => file.id === p.fileId))
          fail("CPD attachment not found.", 404);
        old.files = old.files.filter((file) => file.id !== p.fileId);
        old.updated = new Date().toISOString();
      }
      return { recordId: old.id };
    }
    const assessorId =
      p.assessorId || (u.role === "Assessor" ? u.id : old?.assessorId);
    if (u.role !== "Manager" && assessorId !== u.id)
      fail("You can only record your own CPD.", 403);
    if (old && old.assessorId !== assessorId)
      fail("A CPD entry cannot be transferred to another assessor.");
    if (
      !s.users.some(
        (account) =>
          account.id === assessorId &&
          account.role === "Assessor" &&
          (account.active || old),
      )
    )
      fail("Select an assessor.");
    const status = choice(
        p.status || "Completed",
        ["Completed", "Planned", "Draft"],
        "CPD status",
      ),
      recordDate = date(p.date, "CPD date", true),
      hours = Number(p.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 1000)
      fail("CPD hours must be between 0 and 1,000.");
    if (status === "Completed" && recordDate > today())
      fail("Completed CPD cannot be dated in the future.");
    if (!Array.isArray(p.files || []) || (p.files || []).length > 5)
      fail("Upload at most five CPD attachments.");
    const files = [...(old?.files || [])];
    if (files.length + (p.files || []).length > 20)
      fail("A CPD entry can have at most 20 attachments.");
    for (const file of p.files || []) {
      const name = text(file.name, "Attachment filename", 180),
        body = Buffer.from(
          text(file.base64, "Attachment content", 7500000),
          "base64",
        );
      if (!body.length || body.length > 5 * 1024 * 1024)
        fail("CPD attachments must be non-empty and at most 5 MB.");
      const fileId = id();
      db.prepare("INSERT INTO assessor_cpd_files VALUES(?,?,?,?)").run(
        fileId,
        assessorId,
        name,
        body,
      );
      files.push({ id: fileId, name, size: body.length });
    }
    const record = {
      id: old?.id || id(),
      assessorId,
      title: text(p.title, "CPD activity title", 200),
      date: recordDate,
      type: choice(
        p.type,
        [
          "Training",
          "Workshop",
          "Webinar",
          "Reading and research",
          "Professional discussion",
          "Industry practice",
          "Qualification",
          "Other",
        ],
        "CPD activity type",
      ),
      hours,
      status,
      description: text(p.description, "CPD activity details", 20000),
      reflection:
        status === "Completed"
          ? text(p.reflection, "CPD reflection", 20000)
          : optional(p.reflection, 20000),
      impact: optional(p.impact, 20000),
      nextSteps: optional(p.nextSteps, 20000),
      files,
      created: old?.created || new Date().toISOString(),
      updated: new Date().toISOString(),
      by: u.id,
    };
    if (old) Object.assign(old, record);
    else s.cpdRecords.push(record);
    return { recordId: record.id };
  }
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
  if (kind === "assessor.action.setStatus") {
    requireRole(u, ["Manager", "Assessor"]);
    const action = (s.assessorActions || []).find(
      (action) => action.id === p.id,
    );
    if (!action) fail("Assessor action not found.", 404);
    const parent = (s.assessorOneToOnes || []).find(
      (record) => record.id === action.oneToOneId,
    );
    if (
      u.role !== "Manager" &&
      (action.owner !== u.id || !parent || parent.status === "Draft")
    )
      fail("Assessor action not found.", 404);
    const status = choice(p.status, ["Open", "Complete"], "action status");
    if (action.status !== status) {
      action.status = status;
      action.updated = new Date().toISOString();
      if (status === "Complete") {
        action.completedAt = action.updated;
        action.completedBy = u.id;
      } else {
        delete action.completedAt;
        delete action.completedBy;
      }
    }
    return { actionId: action.id };
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
    if (old && old.assessorId !== assessor.id)
      fail("A 1:1 record cannot be moved to another assessor.");
    const linked = p.learnerId
      ? s.learners.find((learner) => learner.id === p.learnerId)
      : null;
    if (
      p.learnerId &&
      (!linked ||
        (linked.assessorId !== assessor.id && old?.learnerId !== linked.id))
    )
      fail("Choose an apprentice from this assessor's caseload.");
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
      learnerId: Object.hasOwn(p, "learnerId")
        ? linked?.id || ""
        : old?.learnerId || "",
      learnerName: Object.hasOwn(p, "learnerId")
        ? linked?.name || ""
        : old?.learnerName || "",
      actionIds: [...(old?.actionIds || [])],
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
    s.assessorActions ||= [];
    if (p.actionItems !== undefined) {
      if (!Array.isArray(p.actionItems) || p.actionItems.length > 20)
        fail("Add at most 20 actions to a 1:1.");
      const suppliedIds = p.actionItems
        .filter((action) => action.id)
        .map((action) => action.id);
      if (
        new Set(suppliedIds).size !== suppliedIds.length ||
        record.actionIds.some((actionId) => !suppliedIds.includes(actionId))
      )
        fail(
          "Keep existing actions in the record and update or complete them instead.",
        );
      record.actionIds = p.actionItems.map((item) => {
        const existing = item.id
          ? s.assessorActions.find(
              (action) =>
                action.id === item.id && action.oneToOneId === record.id,
            )
          : null;
        if (item.id && !existing) fail("1:1 action not found.", 404);
        const status =
          existing && item.originalStatus === item.status
            ? existing.status
            : choice(
                item.status || existing?.status || "Open",
                ["Open", "Complete"],
                "action status",
              );
        const action = {
          ...(existing || {}),
          id: existing?.id || id(),
          source: "assessor-one-to-one",
          oneToOneId: record.id,
          assessorId: assessor.id,
          owner: assessor.id,
          learnerId: record.learnerId,
          learnerName: record.learnerName,
          title: text(item.title, "Action title", 500),
          due: date(item.due, "action due date", true),
          status,
          by: existing?.by || u.id,
          created: existing?.created || new Date().toISOString(),
          updated: new Date().toISOString(),
        };
        if (status === "Complete" && existing?.status !== "Complete") {
          action.completedAt = action.updated;
          action.completedBy = u.id;
        }
        if (status === "Open") {
          delete action.completedAt;
          delete action.completedBy;
        }
        if (existing) Object.assign(existing, action);
        else s.assessorActions.push(action);
        return action.id;
      });
    }
    for (const action of s.assessorActions.filter((action) =>
      record.actionIds.includes(action.id),
    )) {
      action.learnerId = record.learnerId;
      action.learnerName = record.learnerName;
    }
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
  if (["spotlight.unpublish", "spotlight.delete"].includes(kind)) {
    requireRole(u, ["Manager"]);
    const story = (s.successStories || []).find((story) => story.id === p.id);
    if (!story) fail("Post not found.", 404);
    if (kind === "spotlight.delete")
      s.successStories = s.successStories.filter((story) => story.id !== p.id);
    else
      Object.assign(story, {
        published: false,
        updated: new Date().toISOString(),
        by: u.id,
      });
    return { storyId: p.id };
  }
  if (kind === "spotlight.save") {
    requireRole(u, ["Manager"]);
    s.successStories ||= [];
    const old = p.id ? s.successStories.find((r) => r.id === p.id) : null;
    if (p.id && !old) fail("Post not found.", 404);
    const kind = choice(
      p.kind,
      ["Learner success", "Assessor success", "Update"],
      "story type",
    );
    const published = p.published === true;
    const record = {
      id: old?.id || id(),
      kind,
      audience: choice(
        p.audience || old?.audience || "Assessors",
        ["Assessors", "Learners", "Assessors and learners"],
        "post audience",
      ),
      personName:
        kind === "Update"
          ? optional(p.personName, 160) || "Archetype team"
          : text(p.personName, "Person's name", 160),
      title: text(p.title, "Story title", 200),
      achievement:
        kind === "Update"
          ? optional(p.achievement, 250)
          : text(p.achievement, "Achievement", 250),
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
    if (old) Object.assign(old, record);
    else s.successStories.push(record);
    return { storyId: record.id };
  }
  return null;
}
