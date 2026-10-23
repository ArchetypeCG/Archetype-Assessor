import test from "node:test";
import assert from "node:assert/strict";
import { assertRenderStorage } from "../server/storage.mjs";
const env = { NODE_ENV: "production", RENDER: "true" };
const mounts =
  "1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /var/data rw - ext4 /dev/disk rw";
test("Render production refuses ephemeral storage before creating a workspace", () => {
  assert.throws(
    () =>
      assertRenderStorage(env, "/var/data/archetype", mounts.split("\n")[0]),
    /attached disk/,
  );
  assert.throws(
    () => assertRenderStorage(env, "/app/data", mounts),
    /attached disk/,
  );
  assert.throws(
    () => assertRenderStorage(env, "/var/database", mounts),
    /attached disk/,
  );
  assert.doesNotThrow(() =>
    assertRenderStorage(env, "/var/data/archetype", mounts),
  );
  assert.doesNotThrow(() =>
    assertRenderStorage({ NODE_ENV: "test" }, "/tmp/data", ""),
  );
});
