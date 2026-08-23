#!/usr/bin/env bash
set -euo pipefail

readonly archive_name="ffmpeg-N-126242-geb0bfa852e-linux64-gpl.tar.xz"
readonly archive_sha256="352202878590cd9642efe1533cb9d5d60e534fd9b694b0a8a832045bbc04cf55"
readonly archive_url="https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-08-22-12-58/${archive_name}"
readonly install_root="${RUNNER_TEMP:-/tmp}/creativesos-ffmpeg"
readonly archive_path="${install_root}/${archive_name}"

rm -rf "${install_root}"
mkdir -p "${install_root}"
curl --fail --location --retry 3 --retry-all-errors --output "${archive_path}" "${archive_url}"
echo "${archive_sha256}  ${archive_path}" | sha256sum --check --strict
tar --extract --xz --file "${archive_path}" --directory "${install_root}"

ffmpeg_bin="$(find "${install_root}" -type f -path '*/bin/ffmpeg' -print -quit)"
ffprobe_bin="$(find "${install_root}" -type f -path '*/bin/ffprobe' -print -quit)"
if [[ -z "${ffmpeg_bin}" || -z "${ffprobe_bin}" ]]; then
  echo "Pinned FFmpeg archive did not contain ffmpeg and ffprobe" >&2
  exit 1
fi

bin_dir="$(dirname "${ffmpeg_bin}")"
if [[ "${bin_dir}" != "$(dirname "${ffprobe_bin}")" ]]; then
  echo "Pinned FFmpeg archive binaries were not colocated" >&2
  exit 1
fi

if ! "${ffmpeg_bin}" -hide_banner -filters 2>&1 | grep -qE '[[:space:]]libvmaf[[:space:]]'; then
  echo "Pinned FFmpeg runtime does not expose the required libvmaf filter" >&2
  exit 1
fi

echo "${bin_dir}" >> "${GITHUB_PATH}"
"${ffmpeg_bin}" -hide_banner -version | head -n 1
echo "Verified libvmaf-capable media qualification runtime"
