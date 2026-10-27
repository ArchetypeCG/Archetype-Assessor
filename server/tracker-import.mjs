// Shared browser/server parser. It contains no organisation or learner data.
const clean = (value) => String(value ?? "").trim();
const key = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const relevantFields = new Set(
  [
    "Pro Ref No",
    "First Name",
    "Last Name",
    "Progress %",
    "Target Progress %",
    "Apprenticeship Title",
    "Level",
    "Start Date",
    "End Date",
    "Actual End",
    "Assessor",
    "IQA",
    "Employer",
    "Risk Assessment Due",
    "ELI DUE",
    "English Reading",
    "English Writing",
    "English SLC",
    "Maths",
    "Comments/1:1 Notes",
    "Notes",
    "EPA Date Achieved",
    "EPA Grade Achieved",
  ].map(key),
);
const absent = (value) =>
  !clean(value) || /^(n\/?a|not applicable|tbc|-+)$/i.test(clean(value));
export const trackerCourseKey = (value) =>
  key(
    clean(value)
      .replace(/\s*(?:·|-)?\s*level\s*[1-8]\s*$/i, "")
      .replace(/\s*-?\s*(no diploma|unit route only|full cost)\s*$/i, "")
      .replace(/team leader\s*\/\s*supervisor/i, "Team Leader")
      .replace(/operations\s*\/\s*departmental manager/i, "Operations Manager"),
  );
function isoDate(value) {
  if (absent(value)) return "";
  if (typeof value === "number")
    return new Date(Math.round((value - 25569) * 86400000))
      .toISOString()
      .slice(0, 10);
  const text = clean(value);
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = m
    ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
    : text.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(Date.parse(iso)) ||
    new Date(iso).toISOString().slice(0, 10) !== iso
  )
    return "";
  return iso;
}
const percentage = (value) => {
  if (absent(value)) return null;
  const n = Number(clean(value).replace(/%$/, ""));
  return Number.isFinite(n)
    ? clean(value).endsWith("%")
      ? n
      : n >= 0 && n <= 1
        ? n * 100
        : n
    : null;
};
const fsStatus = (values) =>
  values.length &&
  values.every((v) =>
    /^(passed?|achieved|exempt|complete[d]?)$/i.test(clean(v)),
  )
    ? values.every((v) => /^exempt$/i.test(clean(v)))
      ? "Exempt"
      : "Achieved"
    : "Pending";
export function parseTrackerSheet(sheetRows) {
  if (
    !Array.isArray(sheetRows) ||
    sheetRows.length > 1100 ||
    sheetRows.some(
      (row) =>
        !Array.isArray(row) ||
        row.length > 100 ||
        row.some(
          (v) =>
            (v !== null &&
              !["string", "number", "boolean"].includes(typeof v)) ||
            (typeof v === "string" && v.length > 20000),
        ),
    )
  )
    throw Error("Invalid or oversized tracker worksheet.");
  const headerIndex = sheetRows
    .slice(0, 100)
    .findIndex(
      (row) =>
        row.some((v) => key(v) === "prorefno") &&
        row.some((v) => key(v) === "apprenticeshiptitle"),
    );
  if (headerIndex < 0) return null;
  const headers = sheetRows[headerIndex].map(clean);
  const indices = new Map(headers.map((h, i) => [key(h), i]));
  const get = (row, heading) => row[indices.get(key(heading))] ?? "";
  const records = [];
  for (let i = headerIndex + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    const originalRef = clean(get(row, "Pro Ref No"));
    const title = clean(get(row, "Apprenticeship Title"));
    if (!originalRef && !title) continue;
    if (!title) throw Error(`Row ${i + 1}: apprenticeship title is missing.`);
    const level = Number(get(row, "Level"));
    if (!Number.isInteger(level) || level < 1 || level > 8)
      throw Error(`Row ${i + 1}: a valid programme level is required.`);
    const fields = {};
    headers.forEach((h, c) => {
      if (h && relevantFields.has(key(h)) && !absent(row[c]))
        fields[h] = row[c];
    });
    const suppliedName = [get(row, "First Name"), get(row, "Last Name")]
      .map(clean)
      .filter(Boolean)
      .join(" ");
    const dates = {};
    const warnings = [];
    for (const [property, heading] of Object.entries({
      startDate: "Start Date",
      plannedEnd: "End Date",
      timelyEnd: "Timely End",
      actualEnd: "Actual End",
      riskDue: "Risk Assessment Due",
      eliDue: "ELI DUE",
      epaDate: "EPA Date Achieved",
    })) {
      dates[property] = isoDate(get(row, heading));
      if (!absent(get(row, heading)) && !dates[property])
        warnings.push(
          `${heading} retained as tracker text; no valid date found`,
        );
    }
    records.push({
      rowNumber: i + 1,
      originalRef,
      ref: originalRef || `WBL-ROW-${i + 1}`,
      suppliedName,
      name: suppliedName || `Learner ${originalRef || `row ${i + 1}`}`,
      course: title,
      courseKey: trackerCourseKey(title),
      level,
      employer: absent(get(row, "Employer"))
        ? "Employer not supplied"
        : clean(get(row, "Employer")),
      assessorName: absent(get(row, "Assessor"))
        ? ""
        : clean(get(row, "Assessor")),
      iqaName: absent(get(row, "IQA")) ? "" : clean(get(row, "IQA")),
      reportedProgress: percentage(get(row, "Progress %")),
      reportedTarget: percentage(get(row, "Target Progress %")),
      english: fsStatus(
        ["English Reading", "English Writing", "English SLC"].map((h) =>
          get(row, h),
        ),
      ),
      maths: fsStatus([get(row, "Maths")]),
      fields,
      warnings,
      ...dates,
    });
  }
  if (!records.length || records.length > 1000)
    throw Error("Provide between 1 and 1,000 tracker records.");
  const counts = new Map();
  for (const r of records) counts.set(r.ref, (counts.get(r.ref) || 0) + 1);
  for (const r of records)
    if (counts.get(r.ref) > 1) {
      r.ref = r.ref.slice(0, 55) + ` [row ${r.rowNumber}]`;
      r.warnings.push(
        "Repeated source reference: kept as a separate record with its worksheet row number",
      );
    }
  return {
    records,
    headerRow: headerIndex + 1,
    missingNames: records.filter((r) => !r.suppliedName).length,
    duplicateReferences: records.filter((r) =>
      r.warnings.some((w) => w.startsWith("Repeated")),
    ).length,
  };
}

export function removeFictionalLearners(s) {
  const removed = s.learners.filter((l) => l.fictional === true);
  const ids = new Set(removed.map((l) => l.id));
  s.learners = s.learners.filter((l) => !ids.has(l.id));
  for (const collection of [
    "evidence",
    "otj",
    "reviews",
    "tasks",
    "appointments",
    "learningPlans",
    "samplingPlans",
    "quality",
    "messages",
    "privateLearnerNotes",
    "epaOutcomes",
  ]) {
    s[collection] = (s[collection] || []).filter(
      (record) => !ids.has(record.learnerId),
    );
  }
  for (const user of s.users)
    if (ids.has(user.learnerId)) delete user.learnerId;
  return [...ids];
}

export function importTracker(
  s,
  sheetRows,
  { makeId, actorId, importedAt, replaceFictional = true },
) {
  const target = s;
  s = structuredClone(s);
  const parsed = parseTrackerSheet(sheetRows);
  if (!parsed) throw Error("WBL tracker headings were not found.");
  let added = 0,
    updated = 0,
    createdCourses = 0,
    unassigned = 0;
  for (const row of parsed.records) {
    let standard = s.standards.find(
      (st) =>
        trackerCourseKey(st.name) === row.courseKey &&
        Number(st.level) === row.level,
    );
    if (!standard) {
      // A tracker supplies programme details, not an assessable KSB specification.
      standard = {
        id: makeId(),
        name:
          row.course.replace(
            /\s*-?\s*(no diploma|unit route only|full cost)\s*$/i,
            "",
          ) + ` · Level ${row.level}`,
        level: row.level,
        reference: `Tracker · ${row.courseKey.slice(0, 65)} · L${row.level}`,
        version: "KSB schedule not yet supplied",
        criteria: [],
        trackerPlaceholder: true,
      };
      s.standards.push(standard);
      createdCourses++;
    }
    let old = s.learners.find((l) => l.ref === row.ref && !l.fictional);
    if (old && old.standardId !== standard.id)
      throw Error(
        `Row ${row.rowNumber}: existing reference belongs to another programme. Use Assign standard or correct the reference before importing.`,
      );
    const staff = (role, name, previous) =>
      (name
        ? s.users.find(
            (u) => u.active && u.role === role && key(u.name) === key(name),
          )?.id
        : "") ||
      previous ||
      "";
    const assessorId = staff("Assessor", row.assessorName, old?.assessorId),
      iqaId = staff("IQA", row.iqaName, old?.iqaId);
    if (!assessorId || !iqaId) unassigned++;
    const item = {
      ...(old || {}),
      id: old?.id || makeId(),
      ref: row.ref,
      name: row.suppliedName || old?.name || row.name,
      email: old?.email || "",
      employer:
        row.employer === "Employer not supplied"
          ? old?.employer || row.employer
          : row.employer,
      standardId: standard.id,
      level: row.level,
      assessorId,
      iqaId,
      status: old?.status || "Active",
      target: Math.max(
        0,
        Math.min(100, row.reportedTarget ?? old?.target ?? 0),
      ),
      otjTarget: old?.otjTarget ?? 0,
      startDate: row.startDate || old?.startDate || "",
      plannedEnd: row.plannedEnd || old?.plannedEnd || "",
      predictedEnd: old?.predictedEnd || row.plannedEnd,
      lastReview: old?.lastReview || "",
      nextReview: old?.nextReview || "",
      eliDue: row.eliDue || old?.eliDue || "",
      riskDue: row.riskDue || old?.riskDue || "",
      employerDue: old?.employerDue || "",
      english: row.english,
      maths: row.maths,
      epaDate: row.epaDate || old?.epaDate || "",
      gatewayDate: old?.gatewayDate || "",
      gatewayStatus: old?.gatewayStatus || "Not ready",
      notes: old?.notes || "",
      tracker: {
        source: "WBL work-based tracker",
        importedAt,
        importedBy: actorId,
        rowNumber: row.rowNumber,
        originalRef: row.originalRef,
        reportedProgress: row.reportedProgress,
        reportedTarget: row.reportedTarget,
        fields: row.fields,
        warnings: row.warnings,
      },
    };
    if (old) {
      Object.assign(old, item);
      updated++;
    } else {
      s.learners.push(item);
      added++;
    }
  }
  const removedIds = replaceFictional ? removeFictionalLearners(s) : [];
  Object.assign(target, s);
  return {
    added,
    updated,
    createdCourses,
    unassigned,
    removedIds,
    missingNames: parsed.missingNames,
  };
}
