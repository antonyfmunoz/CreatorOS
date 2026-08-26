// Some managed Windows environments intermittently fail uv_os_get_passwd
// before tsx can start, even when USERNAME and USERPROFILE are available.
// Keep the workaround opt-in through NODE_OPTIONS and scoped to that native
// lookup; application identity and authentication never use os.userInfo().
if (process.platform === "win32") {
  const os = require("node:os");
  try {
    os.userInfo();
  } catch (error) {
    if (error?.code !== "ERR_SYSTEM_ERROR") throw error;
    os.userInfo = () => ({
      uid: -1,
      gid: -1,
      username: process.env.USERNAME || "windows-user",
      homedir: process.env.USERPROFILE || os.homedir(),
      shell: null,
    });
  }
}
