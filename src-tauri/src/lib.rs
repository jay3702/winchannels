/// Read a local file and return its contents as a UTF-8 string.
/// Used to load SRT subtitle sidecar files from a network share.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{}: {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
