import { readFileSync, realpathSync, existsSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";

export function assertRenderStorage(env, dataDir, mountInfo) {
  if (env.NODE_ENV !== "production" || env.RENDER !== "true") return;
  // Resolve existing parents too, so a symlink cannot bypass the mount check.
  let parent = resolve(dataDir);
  const suffix = [];
  while (!existsSync(parent)) {
    suffix.unshift(
      parent.slice(dirname(parent).length + (dirname(parent) === "/" ? 0 : 1)),
    );
    parent = dirname(parent);
  }
  const target = resolve(realpathSync(parent), ...suffix);
  const mounts = (mountInfo ?? readFileSync("/proc/self/mountinfo", "utf8"))
    .split("\n")
    .map((line) =>
      line
        .split(" ")[4]
        ?.replace(/\\([0-7]{3})/g, (_, octal) =>
          String.fromCharCode(parseInt(octal, 8)),
        ),
    )
    .filter(Boolean);
  // The Render blueprint mounts persistent application storage at /var/data.
  if (
    !mounts.includes("/var/data") ||
    !(target === "/var/data" || target.startsWith("/var/data" + sep))
  ) {
    throw Error(
      "Persistent storage is not configured: Render requires an attached disk mounted at /var/data and DATA_DIR=/var/data/archetype. Preserve any existing database and backups before changing disks or redeploying. Refusing to create an ephemeral workspace.",
    );
  }
}
