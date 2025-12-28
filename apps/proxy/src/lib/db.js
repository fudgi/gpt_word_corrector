import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function createDb({ dbPath }) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS installations (
      install_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      banned INTEGER NOT NULL DEFAULT 0,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_installations_token_hash
      ON installations(token_hash);
  `);

  const upsertStatement = db.prepare(`
    INSERT INTO installations (
      install_id,
      token_hash,
      created_at,
      last_seen_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(install_id) DO UPDATE SET
      token_hash = excluded.token_hash,
      last_seen_at = excluded.last_seen_at
  `);
  const findByTokenHashStatement = db.prepare(`
    SELECT
      install_id as installId,
      token_hash as tokenHash,
      banned,
      plan,
      created_at as createdAt,
      last_seen_at as lastSeenAt
    FROM installations
    WHERE token_hash = ?
  `);
  const touchStatement = db.prepare(`
    UPDATE installations
    SET last_seen_at = ?
    WHERE install_id = ?
  `);

  function upsertInstallationToken(installId, tokenHash, now) {
    upsertStatement.run(installId, tokenHash, now, now);
  }

  function findInstallationByTokenHash(tokenHash) {
    return findByTokenHashStatement.get(tokenHash) || null;
  }

  function touchInstallation(installId, now) {
    touchStatement.run(now, installId);
  }

  return {
    upsertInstallationToken,
    findInstallationByTokenHash,
    touchInstallation,
  };
}

export { createDb };
