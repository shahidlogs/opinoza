/**
 * OneSignal External User ID Sync
 *
 * When a user signs in, maps their Clerk ID to their OneSignal push
 * subscription via OneSignal.login(). This is required for the server
 * to target a specific user by Clerk ID when sending push notifications.
 *
 * When signed out, calls OneSignal.logout() to unlink the subscription.
 */
import { useEffect, useRef } from "react";
import { useUser } from "@clerk/react";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalType) => void>;
  }
}

interface OneSignalType {
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
}

function withOneSignal(fn: (os: OneSignalType) => void) {
  if (typeof window === "undefined") return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

export default function OneSignalUserSync() {
  const { isLoaded, isSignedIn, user } = useUser();
  const syncedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user?.id) {
      if (syncedIdRef.current === user.id) return;
      syncedIdRef.current = user.id;
      withOneSignal(async (os) => {
        try {
          await os.login(user.id);
        } catch {
        }
      });
    } else {
      if (syncedIdRef.current === null) return;
      syncedIdRef.current = null;
      withOneSignal(async (os) => {
        try {
          await os.logout();
        } catch {
        }
      });
    }
  }, [isLoaded, isSignedIn, user?.id]);

  return null;
}
