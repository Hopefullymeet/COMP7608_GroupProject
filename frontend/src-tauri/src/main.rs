#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

#[cfg(windows)]
mod browser;
mod worker;

use serde_json::Value;
use tauri::{ipc::Channel, Manager, State};
use worker::Host;

/// Opens the paper page in a browser and returns the browser's name for the status line.
#[tauri::command]
async fn open_paper_url(url: String) -> Result<String, String> {
    let url = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "https" | "http") || url.host().is_none()
        || !url.username().is_empty() || url.password().is_some() {
        return Err("Expected an HTTP or HTTPS paper URL".into());
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || browser::open(url))
            .await.map_err(|error| error.to_string())?
    }
    #[cfg(not(windows))]
    {
        tauri::async_runtime::spawn_blocking(move || open_with_system(url))
            .await.map_err(|error| error.to_string())?
    }
}

/// macOS `open` hands the link to LaunchServices and Linux `xdg-open` to the desktop, so the
/// browser is not our child process. Both exit with an error when no browser handles the link.
#[cfg(not(windows))]
fn open_with_system(url: tauri::Url) -> Result<String, String> {
    use std::{io::Read, process::{Command, Stdio}, thread, time::Duration};
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    let mut child = Command::new(opener).arg(url.as_str())
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped())
        .spawn().map_err(|error| format!("{opener}: {error}"))?;
    // Some Linux openers stay attached to the browser, so stop waiting after a few seconds.
    for _ in 0..30 {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) if status.success() => return Ok("your default browser".into()),
            Some(status) => {
                let mut detail = String::new();
                child.stderr.take().map(|mut stderr| stderr.read_to_string(&mut detail));
                return Err(format!("{opener} failed ({status}): {}", detail.trim()));
            }
            None => thread::sleep(Duration::from_millis(100)),
        }
    }
    Ok("your default browser".into())
}

#[tauri::command]
async fn papertrace_rpc(host: State<'_, Host>, request: Value) -> Result<Value, String> {
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.request(request, None))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn papertrace_subscribe(
    host: State<'_, Host>,
    request: Value,
    channel: Channel<Value>,
) -> Result<Value, String> {
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.request(request, Some(channel)))
        .await
        .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = match std::env::var_os("PAPERTRACE_WORKSPACE") {
                Some(path) => std::path::PathBuf::from(path),
                None => app.path().app_local_data_dir()?.join("local-contract"),
            };
            app.manage(Host::new(directory));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![papertrace_rpc, papertrace_subscribe, open_paper_url])
        .build(tauri::generate_context!())
        .expect("could not start the PaperTrace desktop window")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Host>().stop();
            }
        });
}
