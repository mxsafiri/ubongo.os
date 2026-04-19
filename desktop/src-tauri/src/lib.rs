use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    window::Color,
    AppHandle, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// ── Python bridge server port ─────────────────────────────────────────────
const SERVER_PORT: u16 = 8765;

// ── Shared state ──────────────────────────────────────────────────────────
struct AppState {
    server_pid: Option<u32>,
}

// ═══════════════════════════════════════════════════════════════════════════
// TAURI COMMANDS  (called from JavaScript via invoke())
// ═══════════════════════════════════════════════════════════════════════════

/// Helper: send a request and return JSON, handling HTTP errors gracefully.
async fn api_request(
    client: &reqwest::Client,
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{SERVER_PORT}{path}");

    let req = match method {
        "POST" => {
            let mut r = client.post(&url);
            if let Some(b) = body {
                r = r.json(&b);
            }
            r
        }
        _ => client.get(&url),
    };

    let resp = req.send().await.map_err(|e| format!("Server unreachable: {e}"))?;
    let status = resp.status();

    // Try to parse as JSON regardless of status code
    let json = resp.json::<serde_json::Value>().await;

    match json {
        Ok(val) => {
            if status.is_success() {
                Ok(val)
            } else {
                // FastAPI error responses have a "detail" field
                let detail = val.get("detail")
                    .and_then(|d| d.as_str())
                    .unwrap_or("Unknown error");
                Err(detail.to_string())
            }
        }
        Err(_) => {
            if status.is_success() {
                Err("Empty response from server".into())
            } else {
                Err(format!("Server error ({})", status.as_u16()))
            }
        }
    }
}

/// Send a message to the Python backend and return the response.
#[tauri::command]
async fn query(message: String, history: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "message": message, "history": history });
    api_request(&client, "POST", "/query", Some(body)).await
}

/// Send an agentic query (returns tool calls + text).
#[tauri::command]
async fn query_agentic(message: String, history: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "message": message, "history": history });
    api_request(&client, "POST", "/query/agentic", Some(body)).await
}

/// Fetch current provider / usage status.
#[tauri::command]
async fn get_status() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    api_request(&client, "GET", "/status", None).await
}

/// Check whether the user has completed onboarding (has an invite code).
#[tauri::command]
async fn onboarding_status() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    api_request(&client, "GET", "/onboarding/status", None).await
}

/// Validate + save a beta invite code.
#[tauri::command]
async fn onboarding_activate(code: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "code": code });
    api_request(&client, "POST", "/onboarding/activate", Some(body)).await
}

/// Clear the saved invite code (for testing / rotating).
#[tauri::command]
async fn onboarding_reset() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    api_request(&client, "POST", "/onboarding/reset", Some(serde_json::json!({}))).await
}

/// Show or hide the overlay window.
#[tauri::command]
fn toggle_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
            let _ = win.center();
        }
    }
}

/// Hide the overlay (called on blur / ESC).
#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

/// Open a URL in the default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Could not open URL: {e}"))
}

/// Open a file with the default application.
#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Could not open file: {e}"))
}

// ═══════════════════════════════════════════════════════════════════════════
// PYTHON SERVER
// ═══════════════════════════════════════════════════════════════════════════

fn start_python_server(app: &tauri::App, repo_root: &std::path::Path) -> Option<u32> {
    // ── Production path: spawn the PyInstaller-bundled binary ─────────────
    //
    // When the app is bundled (tauri build), `bundle.resources` copies
    // `src-tauri/binaries/ubongo-server/` → `<App>/Contents/Resources/ubongo-server/`.
    // The exe inside that folder is named `ubongo-server` (with `_internal/`
    // next to it holding the Python runtime + site-packages).
    let exe_name = if cfg!(windows) { "ubongo-server.exe" } else { "ubongo-server" };

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("ubongo-server").join(exe_name);
        if bundled.exists() {
            match Command::new(&bundled).spawn() {
                Ok(child) => {
                    let pid = child.id();
                    println!("[ubongo] bundled server started (pid {pid}) at {bundled:?}");
                    return Some(pid);
                }
                Err(e) => {
                    eprintln!("[ubongo] bundled server spawn failed: {e}; falling back to dev mode");
                }
            }
        }
    }

    // ── Dev fallback: `python3 desktop/server/server.py` ──────────────────
    // Used when running `tauri dev` against a source checkout.
    let python = if cfg!(windows) { "python" } else { "python3" };
    let server_script = repo_root.join("desktop").join("server").join("server.py");

    match Command::new(python)
        .arg(&server_script)
        .current_dir(repo_root)
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            println!("[ubongo] dev server started (pid {pid})");
            Some(pid)
        }
        Err(e) => {
            eprintln!("[ubongo] Could not start Python server: {e}");
            None
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM TRAY
// ═══════════════════════════════════════════════════════════════════════════

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_i    = MenuItem::with_id(app, "open",    "Open ubongo",      true, Some("Alt+Space"))?;
    let status_i  = MenuItem::with_id(app, "status",  "Status",           true, None::<&str>)?;
    let sep       = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_i    = MenuItem::with_id(app, "quit",    "Quit",             true, Some("Cmd+Q"))?;

    let menu = Menu::with_items(app, &[&open_i, &status_i, &sep, &quit_i])?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => toggle_window(app.clone()),
            "quit" => app.exit(0),
            _      => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button:       MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_window(app.clone());
            }
        })
        .build(app)?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL SHORTCUT
// ═══════════════════════════════════════════════════════════════════════════

fn register_shortcut(app: &tauri::App) -> tauri::Result<()> {
    // Alt+Space — doesn't conflict with macOS Spotlight (Cmd+Space)
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_window(app.clone());
            }
        })
        .map_err(|e| tauri::Error::Anyhow(e.into()))?;

    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(Mutex::new(AppState { server_pid: None }));

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(state.clone())
        .setup(move |app| {
            // ── Locate repo root (2 levels up from the binary) ──────────
            let repo_root = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap());

            // Walk up to find the directory that contains assistant_cli/
            let mut search = repo_root.clone();
            let ubongo_root = loop {
                if search.join("assistant_cli").exists() {
                    break search.clone();
                }
                if let Some(parent) = search.parent() {
                    search = parent.to_path_buf();
                } else {
                    // Fallback: use cwd
                    break std::env::current_dir().unwrap_or(repo_root.clone());
                }
            };

            // ── Start Python bridge server ────────────────────────────
            let pid = start_python_server(app, &ubongo_root);
            if let Ok(mut s) = state.lock() {
                s.server_pid = pid;
            }

            // ── Give the server a moment to start ─────────────────────
            std::thread::sleep(std::time::Duration::from_millis(800));

            // ── Force WebView background transparent on macOS ──────
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_background_color(Some(Color(0, 0, 0, 0)));
            }

            // ── System tray ───────────────────────────────────────────
            build_tray(app)?;

            // ── Global shortcut ───────────────────────────────────────
            register_shortcut(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            query,
            query_agentic,
            get_status,
            onboarding_status,
            onboarding_activate,
            onboarding_reset,
            toggle_window,
            hide_window,
            open_url,
            open_file,
        ])
        .on_window_event(|window, event| {
            // Hide (don't close) when user clicks the X
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running ubongo");
}
