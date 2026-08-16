import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import {
  PushNotifications,
  type Token,
} from "@capacitor/push-notifications";
import { apiRequest } from "@/lib/queryClient";
import { safeNativeAppPath } from "@/lib/native-links";

const INSTALLATION_KEY = "creativesos:native-installation-id:v1";
export const nativeWakeEvent = "creativesos:native-wake";
let initialized = false;

export function isNativeRuntime() {
  return Capacitor.isNativePlatform();
}

export function nativeInstallationId() {
  let id = localStorage.getItem(INSTALLATION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(INSTALLATION_KEY, id);
  }
  return id;
}

function navigateApp(path: string) {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function navigateFromNotification(data: Record<string, unknown> | undefined) {
  const path = safeNativeAppPath(data?.url ?? data?.path ?? data?.linkTo);
  if (path) navigateApp(path);
}

export async function initializeNativeRuntime() {
  if (!isNativeRuntime() || initialized) return;
  initialized = true;
  await Promise.all([
    App.addListener("appUrlOpen", ({ url }) => {
      const path = safeNativeAppPath(url);
      if (path) navigateApp(path);
    }),
    App.addListener("resume", () => {
      window.dispatchEvent(new CustomEvent(nativeWakeEvent, { detail: { source: "resume" } }));
    }),
    Network.addListener("networkStatusChange", (status) => {
      if (status.connected) {
        window.dispatchEvent(new CustomEvent(nativeWakeEvent, { detail: { source: "network" } }));
      }
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      navigateFromNotification(notification.data);
    }),
  ]);
}

export async function nativePushPermission() {
  if (!isNativeRuntime()) return "unsupported" as const;
  return (await PushNotifications.checkPermissions()).receive;
}

export async function registerNativePush() {
  if (!isNativeRuntime()) throw new Error("Install the CreativesOS mobile app to enable device notifications.");
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") throw new Error("Device notification permission was not granted.");

  let resolveToken: (token: Token) => void = () => undefined;
  let rejectToken: (error: Error) => void = () => undefined;
  const tokenPromise = new Promise<Token>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });
  const registration = await PushNotifications.addListener("registration", resolveToken);
  const registrationError = await PushNotifications.addListener("registrationError", (error) => {
    rejectToken(new Error(error.error));
  });
  const timeout = window.setTimeout(() => rejectToken(new Error("Device registration timed out. Try again.")), 30_000);
  let token: Token;
  try {
    await PushNotifications.register().catch((error: unknown) => {
      rejectToken(error instanceof Error ? error : new Error("Device registration failed."));
    });
    token = await tokenPromise;
  } finally {
    window.clearTimeout(timeout);
    await Promise.all([registration.remove(), registrationError.remove()]);
  }

  const platform = Capacitor.getPlatform();
  const info = await App.getInfo();
  const response = await apiRequest("POST", "/api/mobile/devices", {
    installationId: nativeInstallationId(),
    platform,
    provider: platform === "ios" ? "apns" : "fcm",
    pushToken: token.value,
    appVersion: `${info.version} (${info.build})`,
  });
  return response.json();
}

export async function revokeNativePush() {
  if (!isNativeRuntime()) return;
  await apiRequest(
    "DELETE",
    `/api/mobile/devices/${encodeURIComponent(nativeInstallationId())}`,
  );
  await PushNotifications.unregister();
  await PushNotifications.removeAllDeliveredNotifications();
}
