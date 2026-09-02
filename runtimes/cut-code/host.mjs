// Local qualification harness, not a production job dispatcher. Docker access
// must never be exposed to an application user or passed into the child container.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { validateRequest, MAX_ARTIFACT_BYTES } from './request.mjs';

const execute = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function docker(args, options = {}) {
  return execute('docker', args, { timeout: 15_000, maxBuffer: 128 * 1024, windowsHide: true, ...options });
}

export function assertIsolation(container, image, inputPath, name, user) {
  const host = container.HostConfig;
  const mounts = container.Mounts;
  if (container.Name !== `/${name}` || container.Image !== image || container.Config.User !== user || container.Config.Labels?.['creativesos.cut-code'] !== name || host.NetworkMode !== 'none' || !host.ReadonlyRootfs || host.Privileged || host.PidMode === 'host' || host.IpcMode === 'host' || host.Memory !== 2 * 1024 ** 3 || host.MemorySwap !== host.Memory || host.NanoCpus !== 1_000_000_000 || host.PidsLimit !== 256 || host.CapAdd?.length || !host.CapDrop?.includes('ALL') || !host.SecurityOpt?.some((value) => value.startsWith('no-new-privileges')) || !host.SecurityOpt?.some((value) => value.startsWith('seccomp={')) || host.LogConfig?.Type !== 'none' || Object.keys(host.PortBindings ?? {}).length || !host.Tmpfs?.['/tmp']?.includes('size=268435456')) throw new Error('Container isolation configuration was not preserved.');
  if (mounts.length !== 1 || mounts[0].Type !== 'bind' || mounts[0].Destination !== '/input' || mounts[0].RW) throw new Error('Unexpected container filesystem exposure.');
  // Docker Desktop translates Windows paths. The exact input is also bound in
  // HostConfig, allowing comparison without trusting the translated mount path.
  const binding = host.Mounts?.[0];
  if (!binding || binding.Source !== inputPath || binding.Target !== '/input' || !binding.ReadOnly) throw new Error('Unexpected source mount.');
}

export async function renderIsolated({ request: rawRequest, source, image, signal, timeoutMs = 120_000 }) {
  const request = validateRequest(rawRequest);
  if (!Buffer.isBuffer(source) || !source.length || source.length > 25 * 1024 ** 2) throw new Error('Invalid source archive.');
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('An immutable local image identity is required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) throw new Error('Invalid execution deadline.');
  signal?.throwIfAborted();
  const uid = process.platform === 'linux' ? process.getuid() : 1000;
  const gid = process.platform === 'linux' ? process.getgid() : 1000;
  if (uid === 0) throw new Error('Run the host harness as a non-root user.');
  const user = `${uid}:${gid}`;
  const name = `creativesos-cut-code-${randomUUID()}`;
  const temporaryRoot = await realpath(tmpdir());
  const input = await mkdtemp(path.join(temporaryRoot, 'creativesos-cut-code-'));
  let created = false;
  try {
    await writeFile(path.join(input, 'request.json'), JSON.stringify(request), { flag: 'wx' });
    await writeFile(path.join(input, 'source.zip'), source, { flag: 'wx' });
    const mount = `type=bind,source=${input},target=/input,readonly`;
    await docker(['create', '--pull=never', '--name', name, '--label', `creativesos.cut-code=${name}`, '--network', 'none', '--read-only', '--user', user, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--security-opt', `seccomp=${path.join(root, 'seccomp.json')}`, '--cpus', '1', '--memory', '2g', '--memory-swap', '2g', '--pids-limit', '256', '--shm-size', '256m', '--tmpfs', '/tmp:rw,nosuid,nodev,size=268435456,mode=1777', '--log-driver', 'none', '--init', '--mount', mount, image]);
    created = true;
    const descriptor = JSON.parse((await docker(['inspect', name])).stdout)[0];
    assertIsolation(descriptor, image, input, name, user);
    const actualSeccomp = descriptor.HostConfig.SecurityOpt.find((option) => option.startsWith('seccomp={')).slice('seccomp='.length);
    if (JSON.stringify(JSON.parse(actualSeccomp)) !== JSON.stringify(JSON.parse(await readFile(path.join(root, 'seccomp.json'), 'utf8')))) throw new Error('Unexpected seccomp policy.');
    signal?.throwIfAborted();
    const result = await docker(['start', '--attach', name], { timeout: timeoutMs, signal, maxBuffer: Math.ceil(MAX_ARTIFACT_BYTES * 4 / 3) + 16_384 });
    const state = JSON.parse((await docker(['inspect', name])).stdout)[0].State;
    if (state.Running || state.ExitCode !== 0 || state.OOMKilled) throw new Error(`Isolated render failed (exit ${state.ExitCode}, memory limit ${state.OOMKilled}). ${result.stderr.trim().slice(0, 400)}`);
    const payload = JSON.parse(result.stdout);
    const artifact = Buffer.from(payload.artifact, 'base64');
    const receipt = payload.receipt;
    if (!artifact.length || artifact.length >= MAX_ARTIFACT_BYTES || receipt.bytes !== artifact.length || receipt.artifactSha256 !== hash(artifact) || receipt.sourceSha256 !== hash(source) || receipt.width !== request.width || receipt.height !== request.height || receipt.mode !== request.mode || receipt.frames !== (request.mode === 'still' ? 1 : request.durationInFrames)) throw new Error('Artifact did not match its request and receipt.');
    return { artifact, receipt, isolation: { network: 'none', rootFilesystem: 'readonly', user, cpu: 1, memoryBytes: descriptor.HostConfig.Memory, inputReadOnly: true, image } };
  } finally {
    // A killed Docker client does not imply a stopped container. Remove the
    // exact uniquely named container on success, error, timeout and cancellation.
    // Also attempt this after create errors: the daemon may have created it even
    // when the client disconnected before reporting success.
    await docker(['rm', '--force', name]).catch((error) => {
      if (!created && /No such container/.test(error.stderr ?? '')) return;
      throw new Error(`Could not confirm cleanup of ${name}.`);
    });
    const resolved = await realpath(input);
    if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith('creativesos-cut-code-')) throw new Error('Refusing an unexpected cleanup path.');
    await rm(resolved, { recursive: true });
  }
}
