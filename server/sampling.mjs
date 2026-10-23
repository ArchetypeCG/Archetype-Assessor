export function samplingCommand({
  s,
  u,
  kind,
  p,
  fail,
  requireRole,
  id,
  text,
  date,
  choice,
  learnerFor,
}) {
  if (typeof kind !== "string" || !kind.startsWith("sampling.")) return null;
  requireRole(u, ["Manager", "IQA"]);
  s.samplingPlans ||= [];
  const learner = learnerFor(s, u, p.learnerId);
  if (kind === "sampling.save") {
    const old = p.id
      ? s.samplingPlans.find((x) => x.id === p.id && x.learnerId === learner.id)
      : null;
    if (p.id && !old) fail("Sampling plan not found.", 404);
    const standard = s.standards.find((x) => x.id === learner.standardId);
    if (old && old.standardId !== standard?.id)
      fail(
        "The apprentice’s programme has changed. Cancel this plan and create a new one for the current standard.",
      );
    if (
      !Array.isArray(p.criteria) ||
      !p.criteria.length ||
      p.criteria.some((c) => !standard?.criteria.some((x) => x.code === c))
    )
      fail("Select valid KSB criteria from the learner’s current standard.");
    const evidenceIds = Array.isArray(p.evidenceIds)
      ? [...new Set(p.evidenceIds)]
      : [];
    if (
      evidenceIds.some(
        (eid) =>
          !s.evidence.some(
            (e) =>
              e.id === eid &&
              e.learnerId === learner.id &&
              e.status === "Accepted" &&
              (!e.standardId || e.standardId === standard.id) &&
              e.criteria.some((c) => p.criteria.includes(c)),
          ),
      )
    )
      fail(
        "Select accepted evidence matching the learner, standard and sampling criteria.",
      );
    const item = {
      id: old?.id || id(),
      learnerId: learner.id,
      standardId: standard.id,
      title: text(p.title, "Plan title", 200),
      date: date(p.date, "sampling date", true),
      criteria: [...new Set(p.criteria)],
      evidenceIds,
      method: choice(
        p.method,
        ["Interim", "Summative", "Risk-based", "Follow-up"],
        "sampling method",
      ),
      risk: choice(p.risk, ["Low", "Medium", "High"], "risk level"),
      notes: typeof p.notes === "string" ? p.notes.slice(0, 10000) : "",
      ownerId: old?.ownerId || u.id,
      status: "Planned",
      createdAt: old?.createdAt || new Date().toISOString(),
    };
    if (old?.status === "Completed")
      fail("Completed plans are read only. Create a follow-up plan.");
    if (old) Object.assign(old, item);
    else s.samplingPlans.push(item);
    return { samplingPlanId: item.id };
  }
  if (kind === "sampling.status") {
    const plan = s.samplingPlans.find(
      (x) => x.id === p.id && x.learnerId === learner.id,
    );
    if (!plan) fail("Sampling plan not found.", 404);
    if (p.status === "Completed") {
      const covered = new Set(
        s.quality
          .filter((q) => q.planId === plan.id)
          .flatMap((q) => q.criteria || []),
      );
      if (!plan.criteria.every((c) => covered.has(c)))
        fail(
          "Record findings covering every selected KSB before completing this plan.",
        );
    }
    plan.status = choice(
      p.status,
      ["Planned", "Completed", "Cancelled"],
      "plan status",
    );
    return {};
  }
  fail("Unknown sampling action.");
}
