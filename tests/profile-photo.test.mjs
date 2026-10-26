import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfilePhoto } from "../server/profile-photo.mjs";
test("profile photos validate raster signatures and enforce size before storing", () => {
  for (const body of [
    Buffer.from("<svg onload='alert(1)'></svg>"),
    Buffer.from("not an image"),
    Buffer.alloc(0),
  ])
    assert.throws(() =>
      validateProfilePhoto({ base64: body.toString("base64") }),
    );
  assert.throws(() => validateProfilePhoto({ base64: "a".repeat(7000001) }));
  assert.throws(() => validateProfilePhoto(null));
  assert.equal(
    validateProfilePhoto({
      base64: Buffer.from([255, 216, 255, 224, 0, 16]).toString("base64"),
    }).type,
    "image/jpeg",
  );
  assert.equal(
    validateProfilePhoto({
      base64: Buffer.from("RIFF0000WEBPcontent").toString("base64"),
    }).type,
    "image/webp",
  );
});
