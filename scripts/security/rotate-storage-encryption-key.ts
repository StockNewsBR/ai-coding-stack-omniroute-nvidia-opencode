/**
 * Offline STORAGE_ENCRYPTION_KEY migration for a verified SQLite snapshot.
 *
 * This file intentionally has no live-database mode.  The source is opened
 * read-only, the SQLite backup API creates a coherent snapshot, and only the
 * explicit work copy is ever rewritten.
 */

import { createHash, createCipheriv, createDecipheriv, scryptSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const PREFIX = "enc:v1:";
const STATIC_SALT = "omniroute-field-encryption-v1";
const IV_BYTES = 16;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;

type SqliteDatabase = InstanceType<typeof Database>;
type SqliteRow = Record<string, unknown>;

type ScalarEntry = {
  id: string;
  table: string;
  column: string;
  kind: "scalar";
};

type KeyValueEntry = {
  id: string;
  table: "key_value";
  column: "value";
  kind: "key-value";
  namespace: string;
  key: string;
};

type JsonPropertyEntry = {
  id: string;
  table: string;
  column: string;
  kind: "json-property";
  property: string;
};

export type EncryptedFieldEntry = ScalarEntry | KeyValueEntry | JsonPropertyEntry;

/** Fixed registry from M24C.  Do not turn this into automatic field discovery. */
export const ENCRYPTED_FIELD_REGISTRY: readonly EncryptedFieldEntry[] = [
  {
    id: "provider_connections.api_key",
    table: "provider_connections",
    column: "api_key",
    kind: "scalar",
  },
  {
    id: "provider_connections.access_token",
    table: "provider_connections",
    column: "access_token",
    kind: "scalar",
  },
  {
    id: "provider_connections.refresh_token",
    table: "provider_connections",
    column: "refresh_token",
    kind: "scalar",
  },
  {
    id: "provider_connections.id_token",
    table: "provider_connections",
    column: "id_token",
    kind: "scalar",
  },
  {
    id: "key_value.settings.oidcClientSecret",
    table: "key_value",
    column: "value",
    kind: "key-value",
    namespace: "settings",
    key: "oidcClientSecret",
  },
  {
    id: "key_value.obsidian.api_key",
    table: "key_value",
    column: "value",
    kind: "key-value",
    namespace: "obsidian",
    key: "api_key",
  },
  {
    id: "key_value.obsidian.webdav_password",
    table: "key_value",
    column: "value",
    kind: "key-value",
    namespace: "obsidian",
    key: "webdav_password",
  },
  {
    id: "webhooks.metadata_encrypted",
    table: "webhooks",
    column: "metadata_encrypted",
    kind: "scalar",
  },
  {
    id: "cloud_agent_credentials.api_key_encrypted",
    table: "cloud_agent_credentials",
    column: "api_key_encrypted",
    kind: "scalar",
  },
  {
    id: "command_code_auth_sessions.encrypted_api_key",
    table: "command_code_auth_sessions",
    column: "encrypted_api_key",
    kind: "scalar",
  },
  {
    id: "radar_settings.supporter_key_encrypted",
    table: "radar_settings",
    column: "supporter_key_encrypted",
    kind: "scalar",
  },
  {
    id: "proxy_registry.notes.relayAuthEnc",
    table: "proxy_registry",
    column: "notes",
    kind: "json-property",
    property: "relayAuthEnc",
  },
  { id: "version_manager.api_key", table: "version_manager", column: "api_key", kind: "scalar" },
];

export type MigrationExitCode = 2 | 3 | 4 | 5 | 6 | 7;

export class StorageMigrationError extends Error {
  readonly code: MigrationExitCode;
  readonly kind: string;

  constructor(code: MigrationExitCode, kind: string) {
    super(kind);
    this.name = "StorageMigrationError";
    this.code = code;
    this.kind = kind;
  }
}

function fail(code: MigrationExitCode, kind: string): never {
  throw new StorageMigrationError(code, kind);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function deriveKey(secret: string, salt: string | Buffer): Buffer {
  return scryptSync(secret, salt, KEY_BYTES);
}

function legacyKey(secret: string): Buffer {
  const dynamicSalt = createHash("sha256").update(secret).digest().subarray(0, IV_BYTES);
  return deriveKey(secret, dynamicSalt);
}

function assertSecret(secret: unknown): asserts secret is string {
  if (typeof secret !== "string" || secret.length === 0 || secret.includes("\0")) {
    fail(2, "invalid_key_input");
  }
}

function parseCiphertext(value: string): { iv: Buffer; encrypted: Buffer; authTag: Buffer } {
  if (!value.startsWith(PREFIX)) fail(4, "malformed_ciphertext");
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) fail(4, "malformed_ciphertext");
  const [ivHex, encryptedHex, authTagHex] = parts;
  if (
    !/^[0-9a-f]+$/i.test(ivHex) ||
    !/^[0-9a-f]*$/i.test(encryptedHex) ||
    !/^[0-9a-f]+$/i.test(authTagHex) ||
    ivHex.length !== IV_BYTES * 2 ||
    authTagHex.length !== AUTH_TAG_BYTES * 2 ||
    encryptedHex.length % 2 !== 0
  ) {
    fail(4, "malformed_ciphertext");
  }
  return {
    iv: Buffer.from(ivHex, "hex"),
    encrypted: Buffer.from(encryptedHex, "hex"),
    authTag: Buffer.from(authTagHex, "hex"),
  };
}

function decryptWithKey(value: string, key: Buffer): string | null {
  const { iv, encrypted, authTag } = parseCiphertext(value);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function encryptWithDerivedKey(plaintext: string, key: Buffer): string {
  const explicitIv = randomBytes(IV_BYTES);
  const explicitCipher = createCipheriv("aes-256-gcm", key, explicitIv);
  const encrypted = Buffer.concat([
    explicitCipher.update(plaintext, "utf8"),
    explicitCipher.final(),
  ]);
  const authTag = explicitCipher.getAuthTag();
  return `${PREFIX}${explicitIv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

export function encryptStorageValue(
  plaintext: string,
  secret: string,
  salt: string | Buffer = STATIC_SALT
): string {
  assertSecret(secret);
  return encryptWithDerivedKey(plaintext, deriveKey(secret, salt));
}

export type DecryptedStorageValue = {
  plaintext: string;
  source: "new-static" | "old-static" | "old-legacy";
};

type DerivedMigrationKeys = {
  newStatic: Buffer;
  oldStatic: Buffer;
  oldLegacy: Buffer;
};

function deriveMigrationKeys(keys: { newKey: string; oldKey: string }): DerivedMigrationKeys {
  assertSecret(keys.newKey);
  assertSecret(keys.oldKey);
  return {
    newStatic: deriveKey(keys.newKey, STATIC_SALT),
    oldStatic: deriveKey(keys.oldKey, STATIC_SALT),
    oldLegacy: legacyKey(keys.oldKey),
  };
}

function decryptWithDerivedKeys(value: string, keys: DerivedMigrationKeys): DecryptedStorageValue {
  parseCiphertext(value);
  const candidates: Array<[DecryptedStorageValue["source"], Buffer]> = [
    ["new-static", keys.newStatic],
    ["old-static", keys.oldStatic],
    ["old-legacy", keys.oldLegacy],
  ];
  for (const [source, key] of candidates) {
    const plaintext = decryptWithKey(value, key);
    if (plaintext !== null) return { plaintext, source };
  }
  fail(4, "ciphertext_decrypt_failed");
}

export function decryptStorageValue(
  ciphertext: string,
  keys: { newKey: string; oldKey: string }
): DecryptedStorageValue {
  return decryptWithDerivedKeys(ciphertext, deriveMigrationKeys(keys));
}

function isCiphertext(value: string): boolean {
  return value.startsWith(PREFIX);
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return null;
}

function isEmptyValue(value: string | null): boolean {
  return value === null || value.length === 0;
}

function tableNames(db: SqliteDatabase): string[] {
  try {
    return (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
  } catch {
    fail(5, "sqlite_schema_read_failed");
  }
}

function tableColumns(db: SqliteDatabase, table: string): string[] {
  try {
    return (
      db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>
    ).map((row) => row.name);
  } catch {
    fail(5, "sqlite_schema_read_failed");
  }
}

function hasField(db: SqliteDatabase, table: string, column: string): boolean {
  return tableNames(db).includes(table) && tableColumns(db, table).includes(column);
}

function rowPath(table: string, column: string, row: SqliteRow): string[] {
  if (table === "key_value" && column === "value") {
    return [table, String(row.namespace ?? ""), String(row.key ?? "")];
  }
  return [table, column];
}

function addEncryptedLocations(value: unknown, pathParts: string[], locations: Set<string>): void {
  const text = asText(value);
  if (text !== null) {
    if (text.includes(PREFIX)) {
      if (text.startsWith(PREFIX)) locations.add(pathParts.join("."));
      else {
        try {
          addEncryptedLocations(JSON.parse(text), pathParts, locations);
        } catch {
          locations.add(pathParts.join("."));
        }
      }
      return;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed !== text) addEncryptedLocations(parsed, pathParts, locations);
    } catch {
      // Ordinary non-JSON text is not an encrypted value.
    }
    return;
  }
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    for (const [key, nested] of Object.entries(value)) {
      addEncryptedLocations(nested, [...pathParts, key], locations);
    }
  }
}

function assertNoUnknownEncryptedFields(db: SqliteDatabase): void {
  const allowed = new Set(ENCRYPTED_FIELD_REGISTRY.map((entry) => entry.id));
  const locations = new Set<string>();
  for (const table of tableNames(db)) {
    const columns = tableColumns(db, table);
    let rows: SqliteRow[];
    try {
      rows = db
        .prepare(`SELECT rowid AS __migration_rowid, * FROM ${quoteIdentifier(table)}`)
        .all() as SqliteRow[];
    } catch {
      fail(5, "sqlite_rows_read_failed");
    }
    for (const row of rows) {
      for (const column of columns) {
        addEncryptedLocations(row[column], rowPath(table, column, row), locations);
      }
    }
  }
  const unknown = [...locations].filter((location) => !allowed.has(location));
  if (unknown.length > 0) fail(4, "unknown_encrypted_field");
}

type ExtractedField = {
  value: string | null;
  raw: unknown;
};

function extractField(entry: EncryptedFieldEntry, row: SqliteRow): ExtractedField {
  const raw = row[entry.column];
  if (entry.kind === "scalar") return { value: asText(raw), raw };
  if (entry.kind === "key-value") {
    const text = asText(raw);
    if (text === null) fail(4, "encrypted_field_format");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      fail(4, "encrypted_field_format");
    }
    if (parsed === null || parsed === "") return { value: null, raw };
    if (typeof parsed !== "string") fail(4, "encrypted_field_format");
    return { value: parsed, raw };
  }
  const text = asText(raw);
  if (text === null || text === "") return { value: null, raw };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(4, "encrypted_field_format");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    fail(4, "encrypted_field_format");
  const propertyValue = (parsed as Record<string, unknown>)[entry.property];
  if (propertyValue === undefined || propertyValue === null || propertyValue === "")
    return { value: null, raw };
  if (typeof propertyValue !== "string") fail(4, "encrypted_field_format");
  return { value: propertyValue, raw };
}

function updatedRaw(
  entry: EncryptedFieldEntry,
  extracted: ExtractedField,
  ciphertext: string
): unknown {
  if (entry.kind === "scalar")
    return Buffer.isBuffer(extracted.raw) ? Buffer.from(ciphertext, "utf8") : ciphertext;
  const rawText = asText(extracted.raw);
  if (rawText === null) fail(4, "encrypted_field_format");
  if (entry.kind === "key-value") return JSON.stringify(ciphertext);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    fail(4, "encrypted_field_format");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    fail(4, "encrypted_field_format");
  (parsed as Record<string, unknown>)[entry.property] = ciphertext;
  return JSON.stringify(parsed);
}

type PlannedUpdate = {
  entry: EncryptedFieldEntry;
  rowid: number;
  value: unknown;
};

type Inspection = {
  updates: PlannedUpdate[];
  valueCount: number;
  changedCount: number;
  semanticDigest: string;
};

function inspectDatabase(
  db: SqliteDatabase,
  keys: { newKey: string; oldKey: string },
  migratePlaintext: boolean
): Inspection {
  assertNoUnknownEncryptedFields(db);
  const derivedKeys = deriveMigrationKeys(keys);
  const digest = createHash("sha256");
  const updates: PlannedUpdate[] = [];
  let valueCount = 0;
  for (const entry of ENCRYPTED_FIELD_REGISTRY) {
    if (!hasField(db, entry.table, entry.column)) continue;
    let rows: SqliteRow[];
    try {
      rows = db
        .prepare(`SELECT rowid AS __migration_rowid, * FROM ${quoteIdentifier(entry.table)}`)
        .all() as SqliteRow[];
    } catch {
      fail(5, "sqlite_rows_read_failed");
    }
    for (const row of rows) {
      if (
        entry.kind === "key-value" &&
        (row.namespace !== entry.namespace || row.key !== entry.key)
      )
        continue;
      const extracted = extractField(entry, row);
      if (isEmptyValue(extracted.value)) continue;
      valueCount += 1;
      let plaintext: string;
      let migrated = false;
      if (isCiphertext(extracted.value as string)) {
        const decrypted = decryptWithDerivedKeys(extracted.value as string, derivedKeys);
        plaintext = decrypted.plaintext;
        migrated = decrypted.source !== "new-static";
      } else {
        if (!migratePlaintext) fail(4, "plaintext_encrypted_field");
        plaintext = extracted.value as string;
        migrated = true;
      }
      digest.update(entry.id);
      digest.update("\0");
      digest.update(String(row.__migration_rowid));
      digest.update("\0");
      digest.update(plaintext, "utf8");
      digest.update("\0");
      if (migrated) {
        updates.push({
          entry,
          rowid: Number(row.__migration_rowid),
          value: updatedRaw(
            entry,
            extracted,
            encryptWithDerivedKey(plaintext, derivedKeys.newStatic)
          ),
        });
      }
    }
  }
  return {
    updates,
    valueCount,
    changedCount: updates.length,
    semanticDigest: digest.digest("hex"),
  };
}

function integrityCheck(db: SqliteDatabase): void {
  try {
    const result = db.pragma("integrity_check", { simple: true });
    if (result !== "ok") fail(3, "sqlite_integrity_failed");
  } catch (error) {
    if (error instanceof StorageMigrationError) throw error;
    fail(3, "sqlite_integrity_failed");
  }
}

function schemaFingerprint(db: SqliteDatabase): string {
  try {
    const rows = db
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
      )
      .all();
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  } catch {
    fail(5, "sqlite_schema_read_failed");
  }
}

function tableCounts(db: SqliteDatabase): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of tableNames(db)) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() as {
        count: number;
      };
      counts[table] = Number(row.count);
    } catch {
      fail(5, "sqlite_count_read_failed");
    }
  }
  return counts;
}

type Shape = { schema: string; counts: Record<string, number> };

function readShape(db: SqliteDatabase): Shape {
  integrityCheck(db);
  return { schema: schemaFingerprint(db), counts: tableCounts(db) };
}

function sameShape(left: Shape, right: Shape): boolean {
  return (
    left.schema === right.schema && JSON.stringify(left.counts) === JSON.stringify(right.counts)
  );
}

function fileFingerprint(dbPath: string): string {
  const hash = createHash("sha256");
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    hash.update(candidate);
    try {
      hash.update(fs.readFileSync(candidate));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") fail(3, "database_snapshot_read_failed");
      hash.update("missing");
    }
  }
  return hash.digest("hex");
}

function openReadOnly(dbPath: string): SqliteDatabase {
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma("query_only = ON");
    return db;
  } catch {
    fail(5, "sqlite_open_failed");
  }
}

function ensurePaths(dbPath: string, backupDir: string, workDir: string): void {
  const source = path.resolve(dbPath);
  const backup = path.resolve(backupDir);
  const work = path.resolve(workDir);
  if (backup === work || source === backup || source === work) fail(2, "unsafe_path_layout");
  if (!path.isAbsolute(source) || !path.isAbsolute(backup) || !path.isAbsolute(work))
    fail(2, "explicit_absolute_paths_required");
  if (!fs.existsSync(source)) fail(2, "database_path_missing");
  try {
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  } catch {
    fail(5, "migration_directory_unavailable");
  }
}

function writeManifest(manifestPath: string, manifest: Record<string, unknown>): void {
  const temporary = `${manifestPath}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, manifestPath);
    fs.chmodSync(manifestPath, 0o600);
  } catch {
    fail(5, "manifest_write_failed");
  }
}

function readManifest(manifestPath: string): Record<string, unknown> | null {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    fail(7, "manifest_read_failed");
  }
}

async function sqliteBackup(source: SqliteDatabase, targetPath: string): Promise<void> {
  try {
    await source.backup(targetPath);
    fs.chmodSync(targetPath, 0o600);
  } catch {
    fail(3, "sqlite_backup_failed");
  }
}

function applyUpdates(
  db: SqliteDatabase,
  updates: PlannedUpdate[],
  failAfterUpdates?: number
): void {
  const transaction = db.transaction(() => {
    let applied = 0;
    for (const update of updates) {
      try {
        const result = db
          .prepare(
            `UPDATE ${quoteIdentifier(update.entry.table)} SET ${quoteIdentifier(update.entry.column)} = ? WHERE rowid = ?`
          )
          .run(update.value, update.rowid);
        if (result.changes !== 1) fail(5, "sqlite_update_failed");
        applied += 1;
        if (failAfterUpdates !== undefined && applied >= failAfterUpdates)
          fail(5, "injected_transaction_failure");
      } catch (error) {
        if (error instanceof StorageMigrationError) throw error;
        fail(5, "sqlite_update_failed");
      }
    }
  });
  try {
    transaction();
  } catch (error) {
    if (error instanceof StorageMigrationError) throw error;
    fail(5, "sqlite_transaction_failed");
  }
}

function freshProcessVerify(
  dbPath: string,
  keys: { newKey: string; oldKey: string },
  allowPlaintext = false
): void {
  const registry = JSON.stringify(ENCRYPTED_FIELD_REGISTRY);
  const source = `
    import fs from "node:fs";
    import { createRequire } from "node:module";
    import { createDecipheriv, createHash, scryptSync } from "node:crypto";
    const require = createRequire(process.cwd() + "/package.json");
    const Database = require("better-sqlite3");
    const PREFIX = ${JSON.stringify(PREFIX)};
    const SALT = ${JSON.stringify(STATIC_SALT)};
    const registry = ${registry};
    const input = fs.readFileSync(0, "utf8").split(/\\r?\\n/);
    const newKey = input[0] || "";
    const oldKey = input[1] || "";
    const allowPlaintext = ${allowPlaintext ? "true" : "false"};
    const derive = (key, salt) => scryptSync(key, salt, ${KEY_BYTES});
    const legacy = (key) => derive(key, createHash("sha256").update(key).digest().subarray(0, ${IV_BYTES}));
    const candidates = [derive(newKey, SALT), derive(oldKey, SALT), legacy(oldKey)];
    const decrypt = (value, key) => {
      if (typeof value !== "string" || !value.startsWith(PREFIX)) throw new Error("ciphertext");
      const parts = value.slice(PREFIX.length).split(":");
      if (parts.length !== 3) throw new Error("ciphertext");
      const iv = Buffer.from(parts[0], "hex");
      const encrypted = Buffer.from(parts[1], "hex");
      const tag = Buffer.from(parts[2], "hex");
      const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: ${AUTH_TAG_BYTES} });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    };
    const text = (value) => Buffer.isBuffer(value) ? value.toString("utf8") : value;
    const read = (entry, row) => {
      if (entry.kind === "scalar") return text(row[entry.column]);
      if (entry.kind === "key-value") {
        const parsed = JSON.parse(text(row[entry.column]));
        return typeof parsed === "string" ? parsed : null;
      }
      const parsed = JSON.parse(text(row[entry.column]));
      return typeof parsed[entry.property] === "string" ? parsed[entry.property] : null;
    };
    let db;
    try {
      db = new Database(process.env.OMNIROUTE_VERIFY_DB, { readonly: true, fileMustExist: true });
      if (db.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("integrity");
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
      for (const entry of registry) {
        if (!tables.has(entry.table)) continue;
        const columns = new Set(db.prepare("PRAGMA table_info(\\\"" + entry.table.replaceAll("\\\"", "\\\"\\\"") + "\\\")").all().map((r) => r.name));
        if (!columns.has(entry.column)) continue;
        const rows = db.prepare("SELECT * FROM \\\"" + entry.table.replaceAll("\\\"", "\\\"\\\"") + "\\\"").all();
        for (const row of rows) {
          if (entry.kind === "key-value" && (row.namespace !== entry.namespace || row.key !== entry.key)) continue;
          const value = read(entry, row);
          if (value === null || value === "") continue;
          if (!value.startsWith(PREFIX)) {
            if (allowPlaintext) continue;
            throw new Error("plaintext");
          }
          let ok = false;
          for (const candidate of candidates) {
            try { decrypt(value, candidate); ok = true; break; } catch {}
          }
          if (!ok) throw new Error("decrypt");
        }
      }
    } catch {
      process.exitCode = 1;
    } finally {
      db?.close();
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      OMNIROUTE_VERIFY_DB: dbPath,
    },
    input: `${keys.newKey}\n${keys.oldKey}\n`,
    stdio: ["pipe", "ignore", "ignore"],
  });
  if (result.status !== 0) fail(6, "fresh_process_verification_failed");
}

export function restoreStorageBackup(backupPath: string, targetPath: string): void {
  if (!path.isAbsolute(backupPath) || !path.isAbsolute(targetPath))
    fail(2, "explicit_absolute_paths_required");
  if (path.resolve(backupPath) === path.resolve(targetPath) || !fs.existsSync(backupPath))
    fail(3, "backup_unavailable");
  const temporary = `${targetPath}.restore.tmp`;
  try {
    fs.copyFileSync(backupPath, temporary);
    fs.chmodSync(temporary, 0o600);
    fs.renameSync(temporary, targetPath);
  } catch {
    fail(7, "backup_restore_failed");
  }
}

export type StorageMigrationOptions = {
  dbPath: string;
  backupDir: string;
  workDir: string;
  oldKey: string;
  newKey: string;
  dryRun?: boolean;
  verifyOnly?: boolean;
  migratePlaintext?: boolean;
  targetVersion?: string;
  failAfterUpdates?: number;
};

export type StorageMigrationResult = {
  status: "complete" | "dry-run" | "verify-only" | "already-complete";
  valueCount: number;
  changedCount: number;
  backupPath: string | null;
  workPath: string | null;
  manifestPath: string | null;
};

export async function runStorageKeyMigration(
  options: StorageMigrationOptions
): Promise<StorageMigrationResult> {
  const dbPath = path.resolve(options.dbPath);
  const backupDir = path.resolve(options.backupDir);
  const workDir = path.resolve(options.workDir);
  assertSecret(options.oldKey);
  assertSecret(options.newKey);
  if (options.oldKey === options.newKey) fail(2, "keys_must_be_distinct");
  if (options.dryRun && options.verifyOnly) fail(2, "incompatible_modes");
  ensurePaths(dbPath, backupDir, workDir);

  const backupPath = path.join(backupDir, "storage-key-rotation-backup.sqlite");
  const workPath = path.join(workDir, "storage-key-rotation-work.sqlite");
  const manifestPath = path.join(workDir, "storage-key-rotation-manifest.json");

  const existingManifest = readManifest(manifestPath);
  if (existingManifest?.status === "complete" && fs.existsSync(workPath)) {
    const verificationDb = openReadOnly(workPath);
    try {
      const inspection = inspectDatabase(
        verificationDb,
        { newKey: options.newKey, oldKey: options.newKey },
        false
      );
      freshProcessVerify(workPath, { newKey: options.newKey, oldKey: options.newKey });
      return {
        status: "already-complete",
        valueCount: inspection.valueCount,
        changedCount: 0,
        backupPath: fs.existsSync(backupPath) ? backupPath : null,
        workPath,
        manifestPath,
      };
    } finally {
      verificationDb.close();
    }
  }
  if (existingManifest && existingManifest.status !== "complete")
    fail(7, "incomplete_manifest_exists");
  if (fs.existsSync(backupPath) || fs.existsSync(workPath)) fail(7, "migration_artifact_exists");

  const source = openReadOnly(dbPath);
  let sourceShape: Shape;
  let sourceInspection: Inspection;
  const sourceBefore = fileFingerprint(dbPath);
  try {
    sourceShape = readShape(source);
    sourceInspection = inspectDatabase(
      source,
      { newKey: options.newKey, oldKey: options.oldKey },
      options.migratePlaintext === true
    );
    freshProcessVerify(
      dbPath,
      { newKey: options.newKey, oldKey: options.oldKey },
      options.migratePlaintext === true
    );
    if (fileFingerprint(dbPath) !== sourceBefore) fail(3, "source_changed_during_preflight");
    if (options.verifyOnly || options.dryRun) {
      return {
        status: options.verifyOnly ? "verify-only" : "dry-run",
        valueCount: sourceInspection.valueCount,
        changedCount: sourceInspection.changedCount,
        backupPath: null,
        workPath: null,
        manifestPath: null,
      };
    }
    await sqliteBackup(source, backupPath);
    if (fileFingerprint(dbPath) !== sourceBefore) fail(3, "source_changed_after_backup");
  } finally {
    source.close();
  }

  const runningManifest = {
    version: 1,
    status: "running",
    sourceFingerprint: sourceBefore,
    sourceSchema: sourceShape!.schema,
    sourceCounts: sourceShape!.counts,
    backupPath,
    workPath,
    rollback: { restoreFrom: backupPath, originalDb: dbPath },
    targetVersion: options.targetVersion ?? null,
    valueCount: sourceInspection!.valueCount,
    changedCount: sourceInspection!.changedCount,
    createdAt: new Date().toISOString(),
  };
  writeManifest(manifestPath, runningManifest);

  try {
    const backupDb = openReadOnly(backupPath);
    try {
      const backupShape = readShape(backupDb);
      if (!sameShape(sourceShape!, backupShape)) fail(6, "backup_shape_mismatch");
    } finally {
      backupDb.close();
    }
    fs.copyFileSync(backupPath, workPath);
    fs.chmodSync(workPath, 0o600);
    const workDb = new Database(workPath);
    try {
      const workShape = readShape(workDb);
      if (!sameShape(sourceShape!, workShape)) fail(6, "work_shape_mismatch");
      const workInspection = inspectDatabase(
        workDb,
        { newKey: options.newKey, oldKey: options.oldKey },
        options.migratePlaintext === true
      );
      if (
        workInspection.valueCount !== sourceInspection!.valueCount ||
        workInspection.semanticDigest !== sourceInspection!.semanticDigest ||
        workInspection.changedCount !== sourceInspection!.changedCount
      ) {
        fail(6, "preflight_mismatch");
      }
      applyUpdates(workDb, workInspection.updates, options.failAfterUpdates);
    } finally {
      workDb.close();
    }

    const migratedDb = openReadOnly(workPath);
    try {
      const migratedShape = readShape(migratedDb);
      if (!sameShape(sourceShape!, migratedShape)) fail(6, "migrated_shape_mismatch");
      const migratedInspection = inspectDatabase(
        migratedDb,
        { newKey: options.newKey, oldKey: options.newKey },
        false
      );
      if (
        migratedInspection.valueCount !== sourceInspection!.valueCount ||
        migratedInspection.semanticDigest !== sourceInspection!.semanticDigest
      ) {
        fail(6, "semantic_verification_mismatch");
      }
      freshProcessVerify(workPath, { newKey: options.newKey, oldKey: options.newKey });
    } finally {
      migratedDb.close();
    }
    if (fileFingerprint(dbPath) !== sourceBefore) fail(3, "source_changed_during_migration");
    writeManifest(manifestPath, {
      ...runningManifest,
      status: "complete",
      completedAt: new Date().toISOString(),
    });
    return {
      status: "complete",
      valueCount: sourceInspection!.valueCount,
      changedCount: sourceInspection!.changedCount,
      backupPath,
      workPath,
      manifestPath,
    };
  } catch (error) {
    const migrationError =
      error instanceof StorageMigrationError
        ? error
        : new StorageMigrationError(5, "migration_failed");
    writeManifest(manifestPath, {
      ...runningManifest,
      status: "failed",
      errorCode: migrationError.kind,
      failedAt: new Date().toISOString(),
    });
    throw migrationError;
  }
}

type CliOptions = Omit<StorageMigrationOptions, "oldKey" | "newKey"> & {
  oldKeyFile?: string;
  newKeyFile?: string;
};

function cliValue(argv: string[], index: number, option: string): [string, number] {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) fail(2, `${option}_missing`);
  return [value, index + 1];
}

function parseCli(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--db") [options.dbPath, index] = cliValue(argv, index, "db");
    else if (arg === "--backup-dir")
      [options.backupDir, index] = cliValue(argv, index, "backup_dir");
    else if (arg === "--work-dir") [options.workDir, index] = cliValue(argv, index, "work_dir");
    else if (arg === "--old-key-file")
      [options.oldKeyFile, index] = cliValue(argv, index, "old_key_file");
    else if (arg === "--new-key-file")
      [options.newKeyFile, index] = cliValue(argv, index, "new_key_file");
    else if (arg === "--target-version")
      [options.targetVersion, index] = cliValue(argv, index, "target_version");
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--verify-only") options.verifyOnly = true;
    else if (arg === "--migrate-plaintext") options.migratePlaintext = true;
    else if (arg === "--old-key" || arg === "--new-key") fail(2, "secret_cli_argument_forbidden");
    else if (arg === "--help") {
      console.log(
        "rotate-storage-encryption-key.ts --db PATH --backup-dir PATH --work-dir PATH [--dry-run|--verify-only]"
      );
      process.exitCode = 0;
      return options as CliOptions;
    } else fail(2, "unknown_argument");
  }
  if (!options.dbPath || !options.backupDir || !options.workDir) fail(2, "explicit_paths_required");
  return options as CliOptions;
}

function readSecretFile(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    if ((stat.mode & 0o077) !== 0) fail(2, "secret_file_permissions");
    return fs.readFileSync(filePath, "utf8").replace(/\r?\n$/, "");
  } catch (error) {
    if (error instanceof StorageMigrationError) throw error;
    fail(2, "secret_file_unavailable");
  }
}

function readSecretFd(variable: string): string {
  const value = process.env[variable];
  if (!value || !/^\d+$/.test(value)) fail(2, "secret_fd_unavailable");
  try {
    return fs.readFileSync(Number(value), "utf8").replace(/\r?\n$/, "");
  } catch {
    fail(2, "secret_fd_unavailable");
  }
}

function mainSecrets(options: CliOptions): { oldKey: string; newKey: string } {
  const oldKey = options.oldKeyFile
    ? readSecretFile(options.oldKeyFile)
    : readSecretFd("OMNIROUTE_STORAGE_OLD_KEY_FD");
  const newKey = options.newKeyFile
    ? readSecretFile(options.newKeyFile)
    : readSecretFd("OMNIROUTE_STORAGE_NEW_KEY_FD");
  assertSecret(oldKey);
  assertSecret(newKey);
  return { oldKey, newKey };
}

async function main(): Promise<void> {
  try {
    const options = parseCli(process.argv.slice(2));
    if (process.exitCode === 0 && !options.dbPath) return;
    const result = await runStorageKeyMigration({ ...options, ...mainSecrets(options) });
    console.log(
      `STORAGE_MIGRATION status=${result.status} values=${result.valueCount} changed=${result.changedCount}`
    );
  } catch (error) {
    const migrationError =
      error instanceof StorageMigrationError
        ? error
        : new StorageMigrationError(5, "migration_failed");
    console.error(`STORAGE_MIGRATION status=FAILED code=${migrationError.kind}`);
    process.exitCode = migrationError.code;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) void main();
