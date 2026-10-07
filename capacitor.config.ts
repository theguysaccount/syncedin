import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor — wraps the deployed SyncedIn web app in native iOS + Android shells.
 *
 * Strategy: server.url points at production, so each native app is essentially a
 * fast custom browser window onto syncedin.org. Pushes / contacts / share /
 * camera all go through native plugins. Web deploys roll into the apps
 * instantly without resubmitting to the App Store.
 *
 * For a local dev build that points at `http://10.0.2.2:3000` (Android) or
 * `http://localhost:3000` (iOS sim), swap `server.url` to that and run
 * `npm run cap:sync`.
 */
const config: CapacitorConfig = {
  appId: "org.syncedin.app",
  appName: "SyncedIn",
  webDir: "public",
  bundledWebRuntime: false,
  server: {
    url: "https://syncedin.org/login",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
    // Google OAuth needs accounts.google.com + the googleusercontent.com
    // host that Google redirects through. Without these on the whitelist
    // the WebView refuses to navigate to the OAuth screen the moment the
    // user taps "Continue with Google" — sign-in silently fails on the
    // mobile app. (Akash beta feedback, blocker.) Apple OAuth domain
    // added pre-emptively for when we flip Apple sign-in on.
    allowNavigation: [
      "syncedin.org",
      "*.syncedin.org",
      "*.supabase.co",
      "accounts.google.com",
      "*.googleusercontent.com",
      "appleid.apple.com"
    ]
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#f5f7f7ff"
  },
  android: {
    backgroundColor: "#f5f7f7ff",
    allowMixedContent: false
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#f5f7f7"
    }
  }
};

export default config;
// CI/CD active Tue Jun  2 22:24:36 PDT 2026
