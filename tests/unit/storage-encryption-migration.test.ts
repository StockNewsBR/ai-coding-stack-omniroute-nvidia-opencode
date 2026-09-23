import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import {
  decryptStorageValue,
  encryptStorageValue,
  restoreStorageBackup,
  runStorageKeyMigration,
  StorageMigrationError,
} from "../../scripts/security/rotate-storage-encryption-key.ts";

const OLD_KEY = "synthetic-old-storage-key-aaaaaaaa";
const NEW_KEY = "synthetic-new-storage-key-bbbbbbbb";
const WRONG_KEY = "synthetic-wrong-storage-key-cccccccc";

type Fixture = {
  root: string;
  dbPath: string;
  backupDir: string;
  workDir: string;
  oldApiKey: string;
};

function legacySalt(secret: string): Buffer {
  return createHash("sha256").update(secret).digest().subarray(0, 16);
}

function oldCipher(value: string, legacy = false): string {
  return encryptStorageValue(value, OLD_KEY, legacy ? legacySalt(OLD_KEY) : undefined);
}

function createFixture(
  t: TestContext,
  options: { plaintext?: boolean; corrupt?: boolean; unknown?: boolean } = {}
): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-storage-migration-test-"));
  const dbPath = path.join(root, "source.sqlite");
  const backupDir = path.join(root, "backup");
  const workDir = path.join(root, "work");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE provider_connections (
      id TEXT PRIMARY KEY, api_key TEXT, access_token TEXT, refresh_token TEXT, id_token TEXT
    );
    CREATE TABLE key_value (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY (namespace, key));
    CREATE TABLE webhooks (id TEXT PRIMARY KEY, metadata_encrypted BLOB);
    CREATE TABLE cloud_agent_credentials (provider_id TEXT PRIMARY KEY, api_key_encrypted TEXT NOT NULL);
    CREATE TABLE command_code_auth_sessions (id TEXT PRIMARY KEY, encrypted_api_key TEXT);
    CREATE TABLE radar_settings (id INTEGER PRIMARY KEY, supporter_key_encrypted TEXT);
    CREATE TABLE proxy_registry (id TEXT PRIMARY KEY, notes TEXT);
    CREATE TABLE version_manager (id INTEGER PRIMARY KEY, api_key TEXT);
  `);
  const apiKey = options.plaintext ? "plain-provider-value" : oldCipher("provider-value");
  const corrupted = options.corrupt
    ? `${apiKey.slice(0, -1)}${apiKey.endsWith("0") ? "1" : "0"}`
    : apiKey;
  db.prepare("INSERT INTO provider_connections VALUES (?, ?, ?, ?, ?)").run(
    "provider-1",
    options.corrupt ? corrupted : apiKey,
    oldCipher("access-value", true),
    oldCipher("refresh-value"),
    oldCipher("id-value")
  );
  db.prepare("INSERT INTO key_value VALUES (?, ?, ?)").run(
    "settings",
    "oidcClientSecret",
    JSON.stringify(oldCipher("oidc-value"))
  );
  db.prepare("INSERT INTO key_value VALUES (?, ?, ?)").run(
    "obsidian",
    "api_key",
    JSON.stringify(oldCipher("obsidian-api"))
  );
  db.prepare("INSERT INTO key_value VALUES (?, ?, ?)").run(
    "obsidian",
    "webdav_password",
    JSON.stringify(oldCipher("webdav-value"))
  );
  db.prepare("INSERT INTO webhooks VALUES (?, ?)").run(
    "webhook-1",
    Buffer.from(oldCipher("webhook-value"))
  );
  db.prepare("INSERT INTO cloud_agent_credentials VALUES (?, ?)").run(
    "cloud-1",
    oldCipher("cloud-value")
  );
  db.prepare("INSERT INTO command_code_auth_sessions VALUES (?, ?)").run(
    "command-1",
    oldCipher("command-value")
  );
  db.prepare("INSERT INTO radar_settings VALUES (?, ?)").run(1, oldCipher("radar-value"));
  db.prepare("INSERT INTO proxy_registry VALUES (?, ?)").run(
    "proxy-1",
    JSON.stringify({ relayAuthEnc: oldCipher("relay-value"), label: "fixture" })
  );
  db.prepare("INSERT INTO version_manager VALUES (?, ?)").run(1, oldCipher("version-value"));
  if (options.unknown) {
    db.exec("CREATE TABLE unexpected_secrets (id INTEGER PRIMARY KEY, value TEXT)");
    db.prepare("INSERT INTO unexpected_secrets VALUES (?, ?)").run(
      1,
      oldCipher("unexpected-value")
    );
  }
  db.close();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, dbPath, backupDir, workDir, oldApiKey: apiKey };
}

function assertMigrationError(error: unknown, kind: string): void {
  assert.ok(error instanceof StorageMigrationError);
  assert.equal(error.kind, kind);
}

test("migrates the fixed registry, including legacy derivation, with fresh-process verification", async (t) => {
  const fixture = createFixture(t);
  const before = fs.readFileSync(fixture.dbPath);
  const result = await runStorageKeyMigration({
    dbPath: fixture.dbPath,
    backupDir: fixture.backupDir,
    workDir: fixture.workDir,
    oldKey: OLD_KEY,
    newKey: NEW_KEY,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.valueCount, 13);
  assert.equal(result.changedCount, 13);
  assert.deepEqual(fs.readFileSync(fixture.dbPath), before);
  assert.ok(result.backupPath && fs.existsSync(result.backupPath));
  assert.ok(result.workPath && fs.existsSync(result.workPath));
  const migrated = new Database(fixture.workDir + "/storage-key-rotation-work.sqlite", {
    readonly: true,
  });
  const row = migrated
    .prepare("SELECT api_key FROM provider_connections WHERE id = 'provider-1'")
    .get() as {
    api_key: string;
  };
  assert.equal(
    decryptStorageValue(row.api_key, { newKey: NEW_KEY, oldKey: NEW_KEY }).plaintext,
    "provider-value"
  );
  migrated.close();
});

test("duplicate execution is idempotent and does not rewrite the verified copy", async (t) => {
  const fixture = createFixture(t);
  const first = await runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY });
  const workBefore = fs.readFileSync(first.workPath!);
  const second = await runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY });
  assert.equal(second.status, "already-complete");
  assert.deepEqual(fs.readFileSync(first.workPath!), workBefore);
});

test("wrong old key fails before any migration artifact or database write", async (t) => {
  const fixture = createFixture(t);
  const before = fs.readFileSync(fixture.dbPath);
  await assert.rejects(
    runStorageKeyMigration({ ...fixture, oldKey: WRONG_KEY, newKey: NEW_KEY }),
    (error) => {
      assertMigrationError(error, "ciphertext_decrypt_failed");
      return true;
    }
  );
  assert.deepEqual(fs.readFileSync(fixture.dbPath), before);
  assert.equal(
    fs.existsSync(path.join(fixture.backupDir, "storage-key-rotation-backup.sqlite")),
    false
  );
});

test("wrong new key is rejected by verify-only against a migrated snapshot", async (t) => {
  const fixture = createFixture(t);
  await runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY });
  await assert.rejects(
    runStorageKeyMigration({
      ...fixture,
      oldKey: WRONG_KEY,
      newKey: "another-wrong-storage-key-dddddddd",
      verifyOnly: true,
    }),
    (error) => {
      assertMigrationError(error, "ciphertext_decrypt_failed");
      return true;
    }
  );
});

test("corrupt ciphertext aborts preflight", async (t) => {
  const fixture = createFixture(t, { corrupt: true });
  await assert.rejects(
    runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY }),
    (error) => {
      assertMigrationError(error, "ciphertext_decrypt_failed");
      return true;
    }
  );
});

test("mixed plaintext/encrypted fields fail closed unless explicitly opted in", async (t) => {
  const fixture = createFixture(t, { plaintext: true });
  await assert.rejects(
    runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY }),
    (error) => {
      assertMigrationError(error, "plaintext_encrypted_field");
      return true;
    }
  );
  const result = await runStorageKeyMigration({
    ...fixture,
    oldKey: OLD_KEY,
    newKey: NEW_KEY,
    migratePlaintext: true,
  });
  assert.equal(result.status, "complete");
});

test("unknown encrypted fields abort before writes", async (t) => {
  const fixture = createFixture(t, { unknown: true });
  await assert.rejects(
    runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY }),
    (error) => {
      assertMigrationError(error, "unknown_encrypted_field");
      return true;
    }
  );
});

test("transaction failure rolls back the work copy and preserves the source", async (t) => {
  const fixture = createFixture(t);
  const before = fs.readFileSync(fixture.dbPath);
  await assert.rejects(
    runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY, failAfterUpdates: 1 }),
    (error) => {
      assertMigrationError(error, "injected_transaction_failure");
      return true;
    }
  );
  assert.deepEqual(fs.readFileSync(fixture.dbPath), before);
  const work = new Database(path.join(fixture.workDir, "storage-key-rotation-work.sqlite"), {
    readonly: true,
  });
  const row = work
    .prepare("SELECT api_key FROM provider_connections WHERE id = 'provider-1'")
    .get() as {
    api_key: string;
  };
  assert.equal(row.api_key, fixture.oldApiKey);
  work.close();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixture.workDir, "storage-key-rotation-manifest.json"), "utf8")
  );
  assert.equal(manifest.status, "failed");
  assert.equal(manifest.errorCode, "injected_transaction_failure");
});

test("backup restore returns the untouched pre-migration snapshot", async (t) => {
  const fixture = createFixture(t);
  const source = new Database(fixture.dbPath, { readonly: true });
  const sourceDigest = createHash("sha256")
    .update(
      JSON.stringify(source.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all())
    )
    .update(JSON.stringify(source.prepare("SELECT * FROM provider_connections").all()))
    .digest("hex");
  source.close();
  const result = await runStorageKeyMigration({ ...fixture, oldKey: OLD_KEY, newKey: NEW_KEY });
  const restoredPath = path.join(fixture.root, "restored.sqlite");
  restoreStorageBackup(result.backupPath!, restoredPath);
  const restored = new Database(restoredPath, { readonly: true });
  const restoredDigest = createHash("sha256")
    .update(
      JSON.stringify(restored.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all())
    )
    .update(JSON.stringify(restored.prepare("SELECT * FROM provider_connections").all()))
    .digest("hex");
  restored.close();
  assert.equal(restoredDigest, sourceDigest);
});

test("dry-run and verify-only never rewrite the source", async (t) => {
  const fixture = createFixture(t);
  const before = fs.readFileSync(fixture.dbPath);
  const dryRun = await runStorageKeyMigration({
    ...fixture,
    oldKey: OLD_KEY,
    newKey: NEW_KEY,
    dryRun: true,
  });
  assert.equal(dryRun.status, "dry-run");
  const verify = await runStorageKeyMigration({
    ...fixture,
    oldKey: OLD_KEY,
    newKey: NEW_KEY,
    verifyOnly: true,
  });
  assert.equal(verify.status, "verify-only");
  assert.deepEqual(fs.readFileSync(fixture.dbPath), before);
});

test("SQLite/directory errors are reported without touching a database", async (t) => {
  const fixture = createFixture(t);
  const blockedPath = path.join(fixture.root, "not-a-directory");
  fs.writeFileSync(blockedPath, "fixture");
  await assert.rejects(
    runStorageKeyMigration({
      ...fixture,
      workDir: blockedPath,
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
    }),
    (error) => {
      assertMigrationError(error, "migration_directory_unavailable");
      return true;
    }
  );
});

test("CLI uses separate protected files and never prints key material", async (t) => {
  const fixture = createFixture(t);
  const oldKeyFile = path.join(fixture.root, "old.key");
  const newKeyFile = path.join(fixture.root, "new.key");
  fs.writeFileSync(oldKeyFile, `${OLD_KEY}\n`, { mode: 0o600 });
  fs.writeFileSync(newKeyFile, `${NEW_KEY}\n`, { mode: 0o600 });
  const scriptPath = path.resolve("scripts/security/rotate-storage-encryption-key.ts");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx/esm",
      scriptPath,
      "--db",
      fixture.dbPath,
      "--backup-dir",
      fixture.backupDir,
      "--work-dir",
      fixture.workDir,
      "--old-key-file",
      oldKeyFile,
      "--new-key-file",
      newKeyFile,
      "--verify-only",
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /status=verify-only/);
  assert.equal(result.stdout.includes(OLD_KEY), false);
  assert.equal(result.stdout.includes(NEW_KEY), false);
  assert.equal(result.stderr.includes(OLD_KEY), false);
  assert.equal(result.stderr.includes(NEW_KEY), false);
});
