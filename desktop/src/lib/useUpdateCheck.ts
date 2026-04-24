/**
 * useUpdateCheck — polls the GitHub Releases API and reports whether a
 * newer version of ubongo is available.
 *
 * Strategy (intentionally simple — no auto-download today):
 *   1. On mount, ask Tauri what version we're running (`app.getVersion`).
 *   2. Hit the GitHub `releases/latest` endpoint.
 *   3. If the published tag is newer than the running version, surface
 *      `{ updateAvailable: true, latest, downloadUrl }`.
 *   4. Re-poll every 4 hours so long-lived sessions notice.
 *
 * The shipping PMG link is constructed from the tag so we never have to
 * keep a hard-coded URL in sync with the version bump.
 *
 * Future iteration: swap the manual fetch + open_url for the official
 * `tauri-plugin-updater`, which downloads + verifies a signed bundle and
 * restarts the app in place. The shape of this hook stays the same.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const REPO = "mxsafiri/ubongo.os";
const POLL_MS = 4 * 60 * 60 * 1000; // 4h
const DISMISS_KEY = "ubongo.update.dismissed.v1";

export interface UpdateInfo {
  current: string;
  latest: string;
  downloadUrl: string;
  notes?: string;
}

interface State {
  loading: boolean;
  updateAvailable: boolean;
  info: UpdateInfo | null;
  error: string | null;
}

/** Compare two semver-ish strings. Returns 1, 0, -1. Tolerates "v" prefix. */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.+-]/)
      .map((p) => parseInt(p, 10))
      .filter((n) => !isNaN(n));
  const aa = parse(a);
  const bb = parse(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function getCurrentVersion(): Promise<string> {
  try {
    if ((window as any).__TAURI__) {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    }
  } catch {
    /* ignore */
  }
  // Browser dev fallback — fall back to a build-time-injected constant.
  return (import.meta as any).env?.VITE_APP_VERSION ?? "0.0.0";
}

export function useUpdateCheck() {
  const [state, setState] = useState<State>({
    loading: true,
    updateAvailable: false,
    info: null,
    error: null,
  });

  // Tag the user dismissed — never nag about the same release again.
  const dismissedRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      dismissedRef.current = localStorage.getItem(DISMISS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const check = useCallback(async () => {
    try {
      const current = await getCurrentVersion();
      const r = await fetch(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        {
          headers: { Accept: "application/vnd.github+json" },
          // GitHub caches aggressively; this also keeps us off rate-limit walls.
          cache: "no-store",
        }
      );
      if (!r.ok) {
        // 404 means no release published yet — not an error, just no update.
        if (r.status === 404) {
          setState({
            loading: false,
            updateAvailable: false,
            info: null,
            error: null,
          });
          return;
        }
        throw new Error(`GitHub ${r.status}`);
      }

      const payload = (await r.json()) as {
        tag_name?: string;
        body?: string;
        assets?: Array<{ name: string; browser_download_url: string }>;
      };

      const latest = (payload.tag_name ?? "").replace(/^v/, "");
      if (!latest) {
        setState({
          loading: false,
          updateAvailable: false,
          info: null,
          error: null,
        });
        return;
      }

      const isNewer = compareVersions(latest, current) > 0;
      const dismissed = dismissedRef.current === latest;

      // Find the macOS aarch64 DMG asset; fall back to the conventional
      // URL pattern if the user's release flow doesn't list assets yet.
      const dmgAsset = payload.assets?.find((a) =>
        /aarch64\.dmg$/i.test(a.name)
      );
      const downloadUrl =
        dmgAsset?.browser_download_url ??
        `https://github.com/${REPO}/releases/latest/download/ubongo_${latest}_aarch64.dmg`;

      setState({
        loading: false,
        updateAvailable: isNewer && !dismissed,
        info: isNewer
          ? { current, latest, downloadUrl, notes: payload.body }
          : null,
        error: null,
      });
    } catch (e: unknown) {
      // Offline / rate-limited / DNS — silently degrade. We still show the
      // app, just no update banner.
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [check]);

  const dismiss = useCallback(() => {
    if (state.info?.latest) {
      try {
        localStorage.setItem(DISMISS_KEY, state.info.latest);
        dismissedRef.current = state.info.latest;
      } catch {
        /* ignore */
      }
    }
    setState((prev) => ({ ...prev, updateAvailable: false }));
  }, [state.info?.latest]);

  return { ...state, recheck: check, dismiss };
}
