export function validateProfilePhoto(file) {
  if (!file || typeof file.base64 !== "string" || file.base64.length > 7000000)
    throw Error("Choose a JPG, PNG or WebP image up to 5 MB.");
  const body = Buffer.from(file.base64, "base64");
  if (!body.length || body.length > 5 * 1024 * 1024)
    throw Error("Choose an image up to 5 MB.");
  let type;
  if (
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    type = "image/png";
  else if (body[0] === 255 && body[1] === 216 && body[2] === 255)
    type = "image/jpeg";
  else if (
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP"
  )
    type = "image/webp";
  else
    throw Error(
      "Choose a JPG, PNG or WebP image. SVG and other file types are not supported.",
    );
  return { body, type };
}

const practicePortraits = [
  "harper",
  "elliot",
  "sienna",
  "nathan",
  "amara",
  "lucas",
  "zara",
  "dylan",
  "maya",
  "toby",
  "leila",
  "oscar",
  "nina",
  "felix",
  "isabel",
  "reuben",
  "esme",
  "adam",
  "clara",
  "samir",
];
const namedPortraits = {
  "Alex Rowan": "alex",
  "Taylor Vale": "taylor",
  "Morgan Ellis": "morgan",
  "Casey Linden": "casey",
  "Jordan Ash": "jordan",
  "Riley Brook": "riley",
  "Harper Wren": "harper",
  "Elliot Finch": "elliot",
  "Sienna Blake": "sienna",
  "Nathan Reed": "nathan",
  "Amara Stone": "amara",
  "Lucas Hart": "lucas",
  "Zara Quinn": "zara",
  "Dylan Frost": "dylan",
  "Maya Rivers": "maya",
  "Toby Lane": "toby",
  "Leila Hayes": "leila",
  "Oscar Birch": "oscar",
  "Nina Wells": "nina",
  "Felix Meadow": "felix",
  "Isabel Crane": "isabel",
  "Reuben Fox": "reuben",
  "Esme Dale": "esme",
  "Adam Westbrook": "adam",
  "Clara Moss": "clara",
  "Samir Oak": "samir",
};
// Only explicitly fictional records receive generated portraits. Stable practice references
// retain their portrait when a name is edited; uploaded and removed photos take priority.
export function fictionalPortraitKey(learner) {
  if (!learner?.fictional || learner.photoHidden) return "";
  if (
    learner.practiceBatch ===
    "twenty-additional-fictional-apprentices-2026-10-26-v1"
  ) {
    const match = /^PRACTICE-(\d{3})(?:-|$)/.exec(learner.ref || "");
    if (match && practicePortraits[Number(match[1]) - 1])
      return practicePortraits[Number(match[1]) - 1];
  }
  const name = String(learner.name || "")
    .replace(/\s*\(fictional\)\s*$/, "")
    .trim();
  return Object.hasOwn(namedPortraits, name) ? namedPortraits[name] : "";
}
