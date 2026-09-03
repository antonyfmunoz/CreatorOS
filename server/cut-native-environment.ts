/** Only host runtime/font/temporary-directory settings reach media binaries.
 * Native decoders never need database, cloud, identity or provider credentials.
 * This reduces inherited authority; it is not a process/filesystem sandbox. */
export function cutNativeMediaEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const result: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "LANG", "LC_ALL", "FONTCONFIG_PATH", "FONTCONFIG_FILE"]) {
    if (environment[name] !== undefined) result[name] = environment[name]!;
  }
  return result;
}
