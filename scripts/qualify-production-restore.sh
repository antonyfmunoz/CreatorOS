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
postgres_log="${recovery_root}/postgres.log"
server_started=false

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

required_tables=(
  users businesses posts products communities orders automation_definitions
  relationships account_privacy_requests production_backups
  cut_studio_audio_templates cut_studio_jobs media_processing_jobs
  media_worker_nodes broadcast_studios broadcast_studio_versions
  broadcast_studio_collaborators broadcast_brand_kits
  broadcast_template_catalog broadcast_destinations broadcast_sessions
  broadcast_session_tracks broadcast_audience_messages data_import_jobs
  data_import_records
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
    --argjson migrationCount "${migration_count}" \
    --argjson requiredTableCount "${required_table_count}" \
    --argjson orphanDirectMessages "${orphan_direct_messages}" \
    --argjson rtoSeconds "${rto_seconds}" \
    '{schemaVersion:$schemaVersion,status:$status,backupId:$backupId,dateKey:$dateKey,completedAt:$completedAt,sizeBytes:$sizeBytes,hashMatches:true,manifestMatches:true,privateSource:true,isolatedRestore:true,publicService:false,migrationCount:$migrationCount,requiredTableCount:$requiredTableCount,orphanDirectMessages:$orphanDirectMessages,rtoSeconds:$rtoSeconds}'
)"
printf 'CREATIVESOS_RECOVERY_EVIDENCE=%s\n' "${evidence}"
