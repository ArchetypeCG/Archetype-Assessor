export const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const fmt = (d) =>
  d
    ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString(
        "en-GB",
        { day: "numeric", month: "short", year: "numeric" },
      )
    : "Not set";
export const initials = (n) =>
  (n || "?")
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
export const csv = (rows) => {
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const cell = (x) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
  return (
    "\uFEFF" +
    [
      columns.map(cell).join(","),
      ...rows.map((r) =>
        columns
          .map((k) =>
            cell(
              typeof r[k] === "string" && /^[=+@\-\t\r]/.test(r[k])
                ? "'" + r[k]
                : r[k],
            ),
          )
          .join(","),
      ),
    ].join("\r\n")
  );
};
export function download(name, data, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function filePayload(files) {
  if (files.length > 5) throw Error("Choose at most 5 files.");
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise((resolve, reject) => {
          if (file.size > 5 * 1024 * 1024)
            return reject(Error("Each file must be smaller than 5 MB."));
          if (!file.size)
            return reject(Error("Empty files cannot be attached."));
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ name: file.name, base64: reader.result.split(",")[1] });
          reader.onerror = () => reject(Error("Could not read attachment."));
          reader.readAsDataURL(file);
        }),
    ),
  );
}
export function parseStandard(raw) {
  const out = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.trim().match(/^([KSB]\d+)\s*[:.\-–\t ]\s*(.*)$/i);
    if (match) {
      current = {
        code: match[1].toUpperCase(),
        type: { K: "Knowledge", S: "Skill", B: "Behaviour" }[
          match[1][0].toUpperCase()
        ],
        text: match[2],
      };
      out.push(current);
    } else if (current && line.trim()) current.text += " " + line.trim();
  }
  return out.filter((x) => x.text);
}
export const reportRows = (ls, s) =>
  ls.map((l) => ({
    ref: l.ref,
    name: l.name,
    status: l.status,
    employer: l.employer,
    standard: s.standards.find((x) => x.id === l.standardId)?.name,
    standardId: l.standardId,
    level: l.level,
    assessorId: l.assessorId,
    assessor: s.users.find((x) => x.id === l.assessorId)?.name,
    iqaId: l.iqaId,
    progress: l.progress,
    target: l.target,
    variance: l.variance,
    rag: l.rag,
    otjHours: l.hours,
    otjTarget: l.otjTarget,
    nextReview: l.nextReview,
    initialReviewDate: l.initialReviewDate || "",
    eliDue: l.eliDue,
    riskDue: l.riskDue,
    employerDue: l.employerDue,
    plannedEnd: l.plannedEnd,
    predictedEnd: l.predictedEnd,
    english: l.english,
    maths: l.maths,
    gatewayStatus: l.gatewayStatus,
  }));
