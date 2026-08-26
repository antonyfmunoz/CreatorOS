#!/usr/bin/env bash
# This script must remain LF-only because it is the recovery image entrypoint.
set -euo pipefail

required=(
  DATABASE_URL
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_PRIVATE_BUCKET_NAME
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required recovery configuration: ${name}" >&2
    exit 1
  fi
done

started_at_epoch="$(date +%s)"
recovery_root="$(mktemp -d /tmp/creativesos-production-restore-XXXXXXXX)"
dump_path="${recovery_root}/production.dump"
manifest_path="${recovery_root}/manifest.json"
cluster_path="${recovery_root}/postgres"
socket_path="${recovery_root}/socket"
postgres_log="${cluster_path}/postgres.log"
migrations_root="/opt/creativesos/migrations"
server_started=false

if [[ ! -f "${migrations_root}/meta/_journal.json" ]]; then
  echo "Recovery image does not contain the migration journal" >&2
  exit 1
fi

cleanup() {
  if [[ "${server_started}" == "true" ]]; then
    gosu postgres pg_ctl -D "${cluster_path}" -m fast -w stop >/dev/null 2>&1 || true
  fi
  if [[ "${recovery_root}" == /tmp/creativesos-production-restore-* ]]; then
    rm -rf -- "${recovery_root}"
  fi
}
trap cleanup EXIT

# The source connection is read-only and is used only to discover the newest
# durable backup receipt. The archive itself is read from private R2 custody.
backup_json="$(
  psql "${DATABASE_URL}" --no-psqlrc -v ON_ERROR_STOP=1 -Atq <<'SQL'
    begin transaction read only;
    set local statement_timeout = '15s';
    select json_build_object(
      'backupId', id,
      'dateKey', date_key,
      'completedAt', completed_at,
      'storageKey', storage_key,
      'manifestStorageKey', manifest_storage_key,
      'sizeBytes', size_bytes,
      'sha256', sha256
    )::text
    from production_backups
    where status = 'completed'
      and storage_key is not null
      and manifest_storage_key is not null
    order by date_key desc, id desc
    limit 1;
    commit;
SQL
)"

if [[ -z "${backup_json}" ]] || ! jq -e '.backupId and .storageKey and .manifestStorageKey and .sha256 and .sizeBytes' <<<"${backup_json}" >/dev/null; then
  echo "No complete production backup receipt was available" >&2
  exit 1
fi

backup_id="$(jq -r '.backupId' <<<"${backup_json}")"
date_key="$(jq -r '.dateKey' <<<"${backup_json}")"
completed_at="$(jq -r '.completedAt' <<<"${backup_json}")"
normalized_completed_at="${completed_at}"
if [[ "${normalized_completed_at}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+$ ]]; then
  normalized_completed_at="${normalized_completed_at}Z"
fi
if ! completed_at_epoch="$(date -u -d "${normalized_completed_at}" +%s)"; then
  echo "Production backup completion time was invalid" >&2
  exit 1
fi
raw_backup_age_seconds="$((started_at_epoch - completed_at_epoch))"
if (( raw_backup_age_seconds < -300 )); then
  echo "Production backup completion time was unexpectedly in the future" >&2
  exit 1
fi
backup_age_seconds="${raw_backup_age_seconds}"
if (( backup_age_seconds < 0 )); then
  backup_age_seconds=0
fi
max_backup_age_seconds=108000
if (( backup_age_seconds > max_backup_age_seconds )); then
  echo "Newest production backup exceeded the recovery-point limit" >&2
  exit 1
fi
storage_key="$(jq -r '.storageKey' <<<"${backup_json}")"
manifest_storage_key="$(jq -r '.manifestStorageKey' <<<"${backup_json}")"
expected_size="$(jq -r '.sizeBytes' <<<"${backup_json}")"
expected_hash="$(jq -r '.sha256' <<<"${backup_json}")"

export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION=auto
export AWS_EC2_METADATA_DISABLED=true
r2_endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

aws --no-cli-pager --endpoint-url "${r2_endpoint}" s3 cp \
  "s3://${R2_PRIVATE_BUCKET_NAME}/${storage_key}" "${dump_path}" \
  --only-show-errors
aws --no-cli-pager --endpoint-url "${r2_endpoint}" s3 cp \
  "s3://${R2_PRIVATE_BUCKET_NAME}/${manifest_storage_key}" "${manifest_path}" \
  --only-show-errors

chmod 0600 "${dump_path}" "${manifest_path}"
actual_size="$(stat -c %s "${dump_path}")"
actual_hash="$(sha256sum "${dump_path}" | awk '{print $1}')"
manifest_schema="$(jq -r '.schemaVersion' "${manifest_path}")"
manifest_size="$(jq -r '.sizeBytes' "${manifest_path}")"
manifest_hash="$(jq -r '.sha256' "${manifest_path}")"

if [[ "${manifest_schema}" != "creativesos.backup-manifest.v2" ]] \
  || [[ "${actual_size}" != "${expected_size}" ]] \
  || [[ "${manifest_size}" != "${expected_size}" ]] \
  || [[ "${actual_hash}" != "${expected_hash}" ]] \
  || [[ "${manifest_hash}" != "${expected_hash}" ]]; then
  echo "Production archive failed manifest integrity validation" >&2
  exit 1
fi

mkdir -p "${cluster_path}" "${socket_path}"
chmod 0711 "${recovery_root}"
chown -R postgres:postgres "${cluster_path}" "${socket_path}"
gosu postgres initdb -D "${cluster_path}" -A trust --no-locale --encoding=UTF8 >/dev/null
gosu postgres pg_ctl -D "${cluster_path}" -l "${postgres_log}" \
  -o "-k ${socket_path} -c listen_addresses='' -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
  -w start >/dev/null
server_started=true

createdb -h "${socket_path}" -U postgres creativesos_restore
pg_restore -h "${socket_path}" -U postgres -d creativesos_restore \
  --no-owner --no-acl --exit-on-error "${dump_path}"

archive_migration_count="$(psql -h "${socket_path}" -U postgres -d creativesos_restore --no-psqlrc -Atq -c 'select count(*) from drizzle.__drizzle_migrations')"
expected_migration_count="$(jq -r '.entries | length' "${migrations_root}/meta/_journal.json")"
expected_latest_migration="$(jq -r '.entries[-1].when' "${migrations_root}/meta/_journal.json")"
migration_batch="${recovery_root}/pending-migrations.sql"
declare -A applied_migrations=()
while IFS= read -r applied_migration; do
  if [[ -n "${applied_migration}" ]]; then
    applied_migrations["${applied_migration}"]=1
  fi
done < <(psql -h "${socket_path}" -U postgres -d creativesos_restore --no-psqlrc -Atq -c 'select created_at from drizzle.__drizzle_migrations')

migrations_applied=0
{
  printf '\\set ON_ERROR_STOP on\n'
  printf 'begin;\n'
  printf 'select pg_advisory_xact_lock(84231859);\n'
  while IFS=$'\t' read -r migration_tag migration_timestamp; do
    if [[ -n "${applied_migrations[$migration_timestamp]:-}" ]]; then
      continue
    fi
    migration_file="${migrations_root}/${migration_tag}.sql"
    if [[ ! -f "${migration_file}" ]]; then
      echo "Recovery image is missing migration ${migration_tag}" >&2
      exit 1
    fi
    migration_hash="$(sha256sum "${migration_file}" | awk '{print $1}')"
    cat "${migration_file}"
    printf '\ninsert into drizzle.__drizzle_migrations (hash, created_at) values (\047%s\047, %s);\n' "${migration_hash}" "${migration_timestamp}"
    migrations_applied="$((migrations_applied + 1))"
  done < <(jq -r '.entries[] | [.tag, (.when | tostring)] | @tsv' "${migrations_root}/meta/_journal.json")
  printf 'commit;\n'
} > "${migration_batch}"
chmod 0600 "${migration_batch}"
psql -h "${socket_path}" -U postgres -d creativesos_restore --no-psqlrc -v ON_ERROR_STOP=1 -q -f "${migration_batch}"

required_tables=(
  users businesses posts products communities orders automation_definitions
  relationships account_privacy_requests production_backups
  relationship_native_action_receipts
  cut_studio_audio_templates cut_studio_jobs media_processing_jobs
  media_worker_nodes broadcast_studios broadcast_studio_versions
  broadcast_studio_collaborators broadcast_brand_kits
  broadcast_template_catalog broadcast_destinations broadcast_sessions
  broadcast_session_tracks broadcast_audience_messages data_import_jobs
  data_import_records competitive_benchmark_remediations
)
quoted_tables="$(printf "'%s'," "${required_tables[@]}")"
quoted_tables="${quoted_tables%,}"
required_table_count="$(
  psql -h "${socket_path}" -U postgres -d creativesos_restore --no-psqlrc -Atq -c \
    "select count(*) from information_schema.tables where table_schema = 'public' and table_name in (${quoted_tables})"
)"
if [[ "${required_table_count}" != "${#required_tables[@]}" ]]; then
  echo "Restored production archive is missing mandatory tables" >&2
  exit 1
fi

migration_count="$(psql -h "${socket_path}" -U postgres -d creativesos_restore --no-psqlrc -Atq -c 'select count(*) from drizzle.__drizzle_migrations')"
latest_migration="$(psql -h "${socket_path}" -U postgres -d creativesos_restore --no-psqlrc -Atq -c 'select max(created_at) from drizzle.__drizzle_migrations')"
if [[ "${migration_count}" != "${expected_migration_count}" ]] || [[ "${latest_migration}" != "${expected_latest_migration}" ]]; then
  echo "Recovered migration ledger does not match the current release" >&2
  exit 1
fi
orphan_direct_messages="$(
  psql -h "${socket_path}" -U postgres -d creativesos_restore --no-psqlrc -Atq -c \
    'select count(*) from direct_messages dm left join conversations c on c.id = dm.conversation_id where c.id is null'
)"
if [[ "${orphan_direct_messages}" != "0" ]]; then
  echo "Restored production archive contains orphan direct messages" >&2
  exit 1
fi

finished_at_epoch="$(date +%s)"
rto_seconds="$((finished_at_epoch - started_at_epoch))"
evidence="$(
  jq -cn \
    --arg schemaVersion "creativesos.production-restore-drill.v1" \
    --arg status "production_restore_verified" \
    --arg backupId "${backup_id}" \
    --arg dateKey "${date_key}" \
    --arg completedAt "${completed_at}" \
    --argjson sizeBytes "${actual_size}" \
    --argjson backupAgeSeconds "${backup_age_seconds}" \
    --argjson maxBackupAgeSeconds "${max_backup_age_seconds}" \
    --argjson archiveMigrationCount "${archive_migration_count}" \
    --argjson migrationsApplied "${migrations_applied}" \
    --argjson migrationCount "${migration_count}" \
    --argjson latestMigration "${latest_migration}" \
    --argjson requiredTableCount "${required_table_count}" \
    --argjson orphanDirectMessages "${orphan_direct_messages}" \
    --argjson rtoSeconds "${rto_seconds}" \
    '{schemaVersion:$schemaVersion,status:$status,backupId:$backupId,dateKey:$dateKey,completedAt:$completedAt,sizeBytes:$sizeBytes,backupAgeSeconds:$backupAgeSeconds,maxBackupAgeSeconds:$maxBackupAgeSeconds,hashMatches:true,manifestMatches:true,privateSource:true,isolatedRestore:true,publicService:false,archiveMigrationCount:$archiveMigrationCount,migrationsApplied:$migrationsApplied,migrationCount:$migrationCount,latestMigration:$latestMigration,requiredTableCount:$requiredTableCount,orphanDirectMessages:$orphanDirectMessages,rtoSeconds:$rtoSeconds}'
)"
printf 'CREATIVESOS_RECOVERY_EVIDENCE=%s\n' "${evidence}"
