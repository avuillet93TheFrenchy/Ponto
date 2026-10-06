use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub const STORE_FILE: &str = "settings.json";

const PLACEHOLDERS: [&str; 3] = [
    "colle_ta_cle_ici",
    "colle_ton_access_key_id_ici",
    "colle_ton_access_key_secret_ici",
];

pub fn get(app: &AppHandle, key: &str, env_var: &str) -> Option<String> {
    let from_store = app
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(key))
        .and_then(|v| v.as_str().map(str::trim).map(str::to_string));

    from_store
        .or_else(|| std::env::var(env_var).ok())
        .filter(|v| !v.is_empty() && !PLACEHOLDERS.contains(&v.as_str()))
}
