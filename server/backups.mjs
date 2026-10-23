import { backup } from "node:sqlite";
import {
  mkdir,
  readdir,
  stat,
  writeFile,
  appendFile,
  unlink,
  open,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
const MAGIC = Buffer.from("ARCHETYPE-BACKUP-v1\n");
function key(secret) {
  if (!secret || secret.length < 32)
    throw Error("BACKUP_ENCRYPTION_KEY must contain at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}
export async function decryptBackup(source, destination, secret) {
  const f = await open(source, "r");
  try {
    const size = (await f.stat()).size,
      header = Buffer.alloc(MAGIC.length + 12),
      tag = Buffer.alloc(16);
    await f.read(header, 0, header.length, 0);
    await f.read(tag, 0, 16, size - 16);
    if (
      !header.subarray(0, MAGIC.length).equals(MAGIC) ||
      size < header.length + 17
    )
      throw Error("Invalid encrypted backup.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      header.subarray(MAGIC.length),
    );
    decipher.setAuthTag(tag);
    const created = await open(destination, "wx", 0o600);
    await created.close();
    try {
      await pipeline(
        createReadStream(source, { start: header.length, end: size - 17 }),
        decipher,
        createGunzip(),
        createWriteStream(destination, { flags: "w", mode: 0o600 }),
      );
    } catch (e) {
      await unlink(destination).catch(() => {});
      throw Error(
        "Backup decryption failed. Check the encryption key and file integrity.",
      );
    }
  } finally {
    await f.close();
  }
}
export function createBackupService(db, dataDir, env = process.env) {
  const directory = resolve(dataDir, "backups");
  let running = false,
    lastError = "",
    lastOffsite = null;
  const configured = !!env.BACKUP_ENCRYPTION_KEY,
    offsiteConfigured = !!env.S3_BACKUP_BUCKET;
  let timer;
  async function list() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    return (
      await Promise.all(
        (await readdir(directory))
          .filter((n) =>
            /^archetype-\d{13}-[a-f0-9]{8}\.sqlite\.gz\.enc$/.test(n),
          )
          .map(async (name) => ({
            name,
            size: (await stat(resolve(directory, name))).size,
            date: new Date(Number(name.split("-")[1])).toISOString(),
          })),
      )
    ).sort((a, b) => b.date.localeCompare(a.date));
  }
  async function create() {
    if (running)
      throw Object.assign(Error("A backup is already in progress."), {
        status: 409,
      });
    key(env.BACKUP_ENCRYPTION_KEY);
    running = true;
    lastError = "";
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stem = `archetype-${Date.now()}-${randomBytes(4).toString("hex")}`,
      plain = resolve(directory, stem + ".tmp"),
      name = stem + ".sqlite.gz.enc",
      file = resolve(directory, name);
    try {
      await backup(db, plain);
      const iv = randomBytes(12),
        cipher = createCipheriv(
          "aes-256-gcm",
          key(env.BACKUP_ENCRYPTION_KEY),
          iv,
        );
      await writeFile(file, Buffer.concat([MAGIC, iv]), {
        flag: "wx",
        mode: 0o600,
      });
      await pipeline(
        createReadStream(plain),
        createGzip(),
        cipher,
        createWriteStream(file, { flags: "a", mode: 0o600 }),
      );
      await appendFile(file, cipher.getAuthTag());
      if (offsiteConfigured) {
        try {
          const { S3Client, PutObjectCommand } =
            await import("@aws-sdk/client-s3");
          const client = new S3Client({
            region: env.S3_BACKUP_REGION || "auto",
            ...(env.S3_BACKUP_ENDPOINT
              ? { endpoint: env.S3_BACKUP_ENDPOINT }
              : {}),
            forcePathStyle: env.S3_BACKUP_PATH_STYLE === "1",
            credentials: {
              accessKeyId: env.S3_BACKUP_ACCESS_KEY_ID,
              secretAccessKey: env.S3_BACKUP_SECRET_ACCESS_KEY,
            },
          });
          try {
            await client.send(
              new PutObjectCommand({
                Bucket: env.S3_BACKUP_BUCKET,
                Key: `${env.S3_BACKUP_PREFIX || "archetype"}/${name}`,
                Body: createReadStream(file),
                ContentLength: (await stat(file)).size,
                ContentType: "application/octet-stream",
              }),
            );
            lastOffsite = new Date().toISOString();
          } finally {
            client.destroy();
          }
        } catch {
          lastError =
            "Off-site upload failed. The encrypted local backup was saved.";
          throw Object.assign(Error(lastError), { status: 502 });
        }
      }
      const files = await list(),
        retention = Math.max(2, Number(env.BACKUP_RETENTION_DAYS) || 14);
      for (const old of files)
        if (
          Date.now() - Date.parse(old.date) > retention * 86400000 &&
          old.name !== name
        )
          await unlink(resolve(directory, old.name));
      return {
        name,
        offsite: offsiteConfigured,
        size: (await stat(file)).size,
        date: new Date().toISOString(),
      };
    } catch (e) {
      lastError = e.message;
      throw e;
    } finally {
      await unlink(plain).catch(() => {});
      running = false;
    }
  }
  async function status() {
    const files = await list();
    return {
      enabled: configured,
      running,
      lastBackup: files[0]?.date || null,
      lastOffsite,
      offsiteConfigured,
      lastError,
      files,
      retentionDays: Math.max(2, Number(env.BACKUP_RETENTION_DAYS) || 14),
    };
  }
  async function due() {
    if (!configured || running) return;
    const files = await list();
    if (!files[0] || Date.now() - Date.parse(files[0].date) >= 24 * 3600000)
      try {
        await create();
      } catch {
        console.error(
          "Scheduled backup failed. See backup status in Settings.",
        );
      }
  }
  return {
    create,
    status,
    downloadPath: async (name) => {
      if (!(await list()).some((f) => f.name === name)) return null;
      return resolve(directory, name);
    },
    start() {
      if (configured) {
        timer = setInterval(due, 3600000);
        timer.unref();
        setTimeout(due, 5000).unref();
      }
    },
    stop() {
      clearInterval(timer);
    },
  };
}
