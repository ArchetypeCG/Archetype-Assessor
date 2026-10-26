import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateProfilePhoto,
  fictionalPortraitKey,
} from "../server/profile-photo.mjs";
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

test("all six fictional apprentices receive distinct portraits without overriding removal or real learner identities", () => {
  const names = [
    "Alex Rowan",
    "Taylor Vale",
    "Morgan Ellis",
    "Casey Linden",
    "Jordan Ash",
    "Riley Brook",
  ];
  const keys = names.map((name) =>
    fictionalPortraitKey({ name: name + " (fictional)", fictional: true }),
  );
  assert.equal(new Set(keys).size, 6);
  assert(keys.every(Boolean));
  for (const name of names) {
    assert.equal(fictionalPortraitKey({ name, fictional: false }), "");
    assert.equal(
      fictionalPortraitKey({ name, fictional: true, photoHidden: true }),
      "",
    );
  }
  assert.equal(
    fictionalPortraitKey({ name: "Real Apprentice", fictional: true }),
    "",
  );
  assert.equal(fictionalPortraitKey(null), "");
});
