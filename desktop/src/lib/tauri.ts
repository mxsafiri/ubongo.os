/**
 * Tauri bridge — wraps invoke() with a fetch fallback for browser dev mode.
 */

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

let _invoke: InvokeFn | null = null;

async function getTauriInvoke(): Promise<InvokeFn> {
  if (_invoke) return _invoke;

  try {
    // In Tauri, window.__TAURI__ is available
    if ((window as any).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      _invoke = invoke as InvokeFn;
    } else {
      throw new Error("Not in Tauri");
    }
  } catch {
    // Browser dev fallback — proxy to Python server
    _invoke = async (cmd: string, args?: Record<string, unknown>) => {
      const routes: Record<string, { method: string; path: string } | null> = {
        query: { method: "POST", path: "/query" },
        query_agentic: { method: "POST", path: "/query/agentic" },
        get_status: { method: "GET", path: "/status" },
        onboarding_status:   { method: "GET",  path: "/onboarding/status" },
        onboarding_activate: { method: "POST", path: "/onboarding/activate" },
        onboarding_reset:    { method: "POST", path: "/onboarding/reset" },
        toggle_window: null,
        hide_window: null,
        open_url: null,
        open_file: null,
      };
      const route = routes[cmd];
      if (!route) {
        // Handle open_url/open_file in browser mode
        if (cmd === "open_url" && args?.url) {
          window.open(args.url as string, "_blank");
        }
        return null;
      }

      const opts: RequestInit = {
        method: route.method,
        headers: { "Content-Type": "application/json" },
      };
      if (route.method === "POST") opts.body = JSON.stringify(args);

      const r = await fetch(`http://127.0.0.1:8765${route.path}`, opts);
      return r.json();
    };
  }

  return _invoke!;
}

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const fn = await getTauriInvoke();
  return fn(cmd, args) as Promise<T>;
}

/**
 * Convert a local file path into a URL the webview can load (e.g. for
 * <img src>). Uses Tauri's asset protocol in the app, falls back to a
 * file:// URL in browser dev (works in most dev setups).
 */
export function convertFileSrc(path: string, protocol: string = "asset"): string {
  try {
    if ((window as any).__TAURI__) {
      const tauri: any = (window as any).__TAURI__;
      const fn = tauri?.core?.convertFileSrc ?? tauri?.tauri?.convertFileSrc;
      if (typeof fn === "function") return fn(path, protocol);
    }
  } catch {
    /* ignore */
  }
  return `file://${path}`;
}
