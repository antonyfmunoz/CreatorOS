/* global addEventListener, CapacitorDevice, CapacitorKV */

// Background Runner is intentionally a bounded wake signal, not a persistent
// media or network daemon. The authenticated WebView owns private outbox data;
// the next app resume/network event performs the durable flush.
addEventListener("creativesosBackgroundSync", async (_event, resolve, reject) => {
  try {
    const network = await CapacitorDevice.getNetworkStatus();
    await CapacitorKV.set(
      "creativesos:last-background-wake",
      JSON.stringify({
        at: new Date().toISOString(),
        connected: Boolean(network.connected),
        connectionType: network.connectionType || "unknown",
      }),
    );
    resolve({ connected: Boolean(network.connected) });
  } catch (error) {
    reject(error instanceof Error ? error.message : "Background wake failed");
  }
});
