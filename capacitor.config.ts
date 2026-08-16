import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.creativesos.app",
  appName: "CreativesOS",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  plugins: {
    BackgroundRunner: {
      label: "net.creativesos.app.background.sync",
      src: "runners/background.js",
      event: "creativesosBackgroundSync",
      repeat: true,
      interval: 15,
      autoStart: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
