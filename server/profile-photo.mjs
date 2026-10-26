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
