import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import { db } from "./db";

const migrationFiles = readMigrationFiles({
  migrationsFolder: path.resolve(process.cwd(), "migrations"),
});

export const expectedMigrationLedger = Object.freeze({
  count: migrationFiles.length,
  latest: migrationFiles.at(-1)?.folderMillis ?? null,
});

export type RuntimeMigrationLedger = {
  count: number;
  latest: number | null;
};

type ReleaseEnvironment = Record<string, string | undefined>;

function exactHex(value: string | undefined, lengths: number[]) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return lengths.includes(normalized.length) && /^[0-9a-f]+$/.test(normalized)
    ? normalized
    : null;
}

function safeBuildValue(value: string | undefined, maximumLength = 128) {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= maximumLength && /^[a-zA-Z0-9._:+-]+$/.test(normalized)
    ? normalized
    : null;
}

function safeTimestamp(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const parsed = Date.parse(normalized);
  return normalized && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function buildReleaseIdentity(
  environment: ReleaseEnvironment,
  actualMigrations: RuntimeMigrationLedger,
) {
  const production = environment.NODE_ENV === "production";
  const sourceCommit = exactHex(environment.CREATIVESOS_SOURCE_COMMIT, [40, 64]);
  const sourceFingerprint = exactHex(environment.CREATIVESOS_SOURCE_FINGERPRINT, [64]);
  const buildId = safeBuildValue(environment.CREATIVESOS_BUILD_ID);
  const builtAt = safeTimestamp(environment.CREATIVESOS_BUILD_TIME);
  const sourceDirty = environment.CREATIVESOS_SOURCE_DIRTY === "true"
    ? true
    : environment.CREATIVESOS_SOURCE_DIRTY === "false"
      ? false
      : null;
  const buildIdentityVerified = !production || Boolean(
    sourceCommit && sourceFingerprint && buildId && builtAt && sourceDirty === false,
  );
  const migrationParity = actualMigrations.count === expectedMigrationLedger.count
    && actualMigrations.latest === expectedMigrationLedger.latest;

  return {
    status: buildIdentityVerified && migrationParity ? "verified" as const : "unverified" as const,
    app: "creativesos",
    build: {
      id: buildId,
      sourceCommit,
      sourceFingerprint,
      sourceDirty,
      builtAt,
      identityVerified: buildIdentityVerified,
    },
    migrations: {
      expected: expectedMigrationLedger,
      actual: actualMigrations,
      parity: migrationParity,
    },
  };
}

export async function getReleaseIdentity(environment: ReleaseEnvironment = process.env) {
  const rows = await db.execute(sql`
    select count(*)::int as count, max(created_at)::bigint as latest
    from "drizzle"."__drizzle_migrations"
  `);
  const row = rows[0];
  return buildReleaseIdentity(environment, {
    count: Number(row?.count ?? 0),
    latest: row?.latest == null ? null : Number(row.latest),
  });
}
