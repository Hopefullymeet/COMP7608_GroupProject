#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
mod macos_menu;
mod worker;

use serde_json::Value;
use tauri::{ipc::Channel, Manager, State};
use worker::Host;

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

#[tauri::command]
fn set_menu_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    macos_menu::install(&app, language == "zh-CN").map_err(|error| error.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = (app, language);
    Ok(())
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
        .invoke_handler(tauri::generate_handler![papertrace_rpc, papertrace_subscribe, set_menu_language])
        .build(tauri::generate_context!())
        .expect("could not start the PaperTrace desktop window")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Host>().stop();
            }
        });
}
