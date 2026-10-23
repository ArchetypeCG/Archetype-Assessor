export const sessionTypes = [
  "Teaching session",
  "Progress review",
  "Tripartite review",
  "Workplace observation",
  "Gateway meeting",
  "Employer meeting",
  "EPA preparation",
  "Other",
];
export const reviewTypes = [
  "Progress review",
  "Tripartite review",
  "Gateway meeting",
];
export function londonTimestamp(date, time) {
  const [year, month, day] = date.split("-").map(Number),
    [h, m] = time.split(":").map(Number),
    base = Date.UTC(year, month - 1, day, h, m);
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const matches = [base - 3600000, base].filter((t) => {
    const parts = Object.fromEntries(
      format.formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    return (
      `${parts.year}-${parts.month}-${parts.day}` === date &&
      `${parts.hour}:${parts.minute}` === time
    );
  });
  if (!matches.length)
    throw Object.assign(
      Error(
        "This time does not exist in Europe/London because the clocks change. Choose another time.",
      ),
      { status: 400 },
    );
  return Math.min(...matches);
}
const escape = (x) =>
  String(x ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
const stamp = (t) =>
  new Date(t)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
function fold(line) {
  let out = "",
    size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (size + bytes > 74) {
      out += "\r\n ";
      size = 1;
    }
    out += char;
    size += bytes;
  }
  return out;
}
export function calendarICS(state) {
  const now = stamp(Date.now()),
    lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Archetype//Learning Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Archetype Learning Calendar",
    ];
  for (const a of state.appointments) {
    const learner = state.learners.find((l) => l.id === a.learnerId);
    lines.push(
      "BEGIN:VEVENT",
      `UID:session-${a.id}@archetype`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${stamp(Date.parse(a.updated || a.created || new Date().toISOString()))}`,
      `SEQUENCE:${a.sequence || 0}`,
      `DTSTART:${stamp(londonTimestamp(a.date, a.time))}`,
      `DTEND:${stamp(londonTimestamp(a.date, a.endTime || a.time) + (!a.endTime ? 3600000 : 0))}`,
      `SUMMARY:${escape(a.title)}`,
      `DESCRIPTION:${escape([learner?.name, a.description, a.notes, a.objectives, a.preparation, a.meetingUrl].filter(Boolean).join("\n\n"))}`,
      `LOCATION:${escape(a.location || a.meetingUrl || "")}`,
      `STATUS:${a.status === "Cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
export function schedulingCommand({
  s,
  u,
  kind,
  p,
  l,
  fail,
  requireRole,
  editors,
  id,
  text,
  optional,
  choice,
  date,
  number,
  canSee,
}) {
  const currentStandard = () =>
    s.standards.find((st) => st.id === l.standardId);
  const mapping = () => {
    const cs = currentStandard()?.criteria.map((c) => c.code) || [];
    if (
      !Array.isArray(p.criteria || []) ||
      (p.criteria || []).some((c) => !cs.includes(c))
    )
      fail("Select criteria from the apprentice’s assigned standard.");
    return [...new Set(p.criteria || [])];
  };
  const resources = () => {
    if (
      !Array.isArray(p.resources || []) ||
      (p.resources || []).some(
        (rid) =>
          !s.resources.some(
            (r) =>
              r.id === rid && (!r.standardId || r.standardId === l.standardId),
          ),
      )
    )
      fail("Select resources available for this standard.");
    return [...new Set(p.resources || [])];
  };
  if (["appointment.add", "session.save"].includes(kind)) {
    requireRole(u, editors);
    if (!l) fail("Select a learner.");
    const old = p.id ? s.appointments.find((a) => a.id === p.id) : null;
    if (p.id && (!old || old.learnerId !== l.id))
      fail("Session not found.", 404);
    if (old?.standardId && old.standardId !== l.standardId)
      fail("Sessions from an earlier programme are read-only.");
    const d = date(p.date, "session date", true),
      start = text(p.time, "Start time", 5),
      end = optional(p.endTime, 5);
    const pattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!pattern.test(start) || (end && !pattern.test(end)))
      fail("Enter a valid session time.");
    londonTimestamp(d, start);
    if (end) {
      londonTimestamp(d, end);
      if (end <= start)
        fail("End time must be after start time on the same day.");
    }
    const participants = p.participants || [u.id];
    if (
      !Array.isArray(participants) ||
      participants.some(
        (pid) =>
          !s.users.some(
            (account) =>
              account.id === pid && account.active && canSee(account, l),
          ),
      )
    )
      fail("Participants must have access to this apprentice.");
    const meetingUrl = optional(p.meetingUrl, 2000);
    if (meetingUrl) {
      try {
        if (new URL(meetingUrl).protocol !== "https:")
          fail("Meeting links must use HTTPS.");
      } catch {
        fail("Enter a valid HTTPS meeting link.");
      }
    }
    const item = {
      id: old?.id || id(),
      learnerId: l.id,
      standardId: l.standardId,
      title: text(p.title, "Session title", 200),
      type: choice(p.type || "Teaching session", sessionTypes, "session type"),
      date: d,
      time: start,
      endTime: end,
      timezone: "Europe/London",
      delivery: choice(
        p.delivery || "In person",
        ["In person", "Online", "Hybrid"],
        "delivery method",
      ),
      location: optional(p.location, 1000),
      meetingUrl,
      description: optional(p.description, 10000),
      notes: optional(p.notes, 20000),
      objectives: optional(p.objectives, 10000),
      preparation: optional(p.preparation, 10000),
      criteria: mapping(),
      resources: resources(),
      participants: [...new Set(participants)],
      attendance: choice(
        p.attendance || "Not recorded",
        ["Not recorded", "Attended", "Did not attend", "Rescheduled"],
        "attendance",
      ),
      outcomeNotes: optional(p.outcomeNotes, 20000),
      staffNotes: optional(p.staffNotes, 10000),
      status: choice(
        p.status || "Planned",
        ["Planned", "Completed", "Cancelled"],
        "session status",
      ),
      cancellationReason: optional(p.cancellationReason, 2000),
      by: old?.by || u.id,
      created: old?.created || new Date().toISOString(),
      updated: new Date().toISOString(),
      sequence: (old?.sequence || 0) + 1,
      planId: old?.planId || p.planId || "",
    };
    if (item.status === "Cancelled" && !item.cancellationReason)
      fail("Record why this session was cancelled.");
    if (
      item.status === "Completed" &&
      d > new Date().toISOString().slice(0, 10)
    )
      fail("A future session cannot be marked completed.");
    if (item.planId) {
      const plan = s.learningPlans.find(
        (x) =>
          x.id === item.planId &&
          x.learnerId === l.id &&
          x.standardId === l.standardId,
      );
      if (!plan) fail("Learning-plan activity not found.");
      plan.sessionId = item.id;
      plan.updated = item.updated;
    }
    if (old) Object.assign(old, item);
    else s.appointments.push(item);
    if (
      reviewTypes.includes(item.type) &&
      item.status === "Planned" &&
      p.updateReviewDue !== false
    )
      l.nextReview = d;
    return { sessionId: item.id };
  }
  if (kind === "plan.save") {
    requireRole(u, editors);
    if (!l) fail("Select a learner.");
    const old = p.id ? s.learningPlans.find((x) => x.id === p.id) : null;
    if (p.id && (!old || old.learnerId !== l.id))
      fail("Learning activity not found.", 404);
    if (old && old.standardId !== l.standardId)
      fail("Earlier programme activities are read-only.");
    const start = date(p.startDate, "activity start", true),
      due = date(p.due, "target completion date", true);
    if (due < start)
      fail("Target completion must be on or after the start date.");
    const item = {
      id: old?.id || id(),
      learnerId: l.id,
      standardId: l.standardId,
      title: text(p.title, "Activity title", 200),
      description: text(p.description, "Learning activity details", 20000),
      objectives: text(p.objectives, "Learning objectives", 10000),
      criteria: mapping(),
      resources: resources(),
      startDate: start,
      due,
      plannedHours: number(
        p.plannedHours,
        "Planned learning hours",
        0.25,
        1000,
      ),
      status: choice(
        p.status || "Planned",
        ["Planned", "In progress", "Completed", "Cancelled"],
        "learning activity status",
      ),
      outcomeNotes: optional(p.outcomeNotes, 10000),
      by: old?.by || u.id,
      created: old?.created || new Date().toISOString(),
      updated: new Date().toISOString(),
      sessionId: old?.sessionId || "",
      reflection: old?.reflection || "",
      reflectionBy: old?.reflectionBy || "",
      reflectionDate: old?.reflectionDate || "",
    };
    if (item.status === "Completed" && !item.outcomeNotes)
      fail("Record a completion outcome.");
    if (old) Object.assign(old, item);
    else s.learningPlans.push(item);
    return { activityId: item.id };
  }
  if (kind === "plan.reflect") {
    requireRole(u, [...editors, "Apprentice"]);
    if (!l) fail("Select a learner.");
    const item = s.learningPlans.find(
      (x) => x.id === p.id && x.learnerId === l.id,
    );
    if (!item) fail("Learning activity not found.", 404);
    if (item.standardId !== l.standardId)
      fail("Earlier programme activities are read-only.");
    item.reflection = text(p.reflection, "Your learning reflection", 20000);
    item.reflectionBy = u.id;
    item.reflectionDate = new Date().toISOString();
    item.updated = item.reflectionDate;
    if (item.status === "Planned") item.status = "In progress";
    return {};
  }
  return null;
}
