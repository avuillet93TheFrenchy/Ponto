use crate::settings;
use serde_json::json;
use tauri::AppHandle;

pub const LARA_FORMAL: &str = "Use the formal, polite register.";
pub const LARA_INFORMAL: &str = "Use the informal, familiar register.";

pub(crate) fn deepl_base_url(api_key: &str) -> &'static str {
    if api_key.ends_with(":fx") {
        "https://api-free.deepl.com"
    } else {
        "https://api.deepl.com"
    }
}

pub(crate) fn deepl_key(app: &AppHandle) -> Result<String, String> {
    settings::get(app, "deeplKey", "DEEPL_API_KEY")
        .ok_or_else(|| "Clé API DeepL manquante. Ajoute-la dans les Paramètres.".to_string())
}

pub(crate) fn lara_credentials(app: &AppHandle) -> Result<crate::lara::LaraCredentials, String> {
    let missing = || "Identifiants Lara manquants. Ajoute-les dans les Paramètres.".to_string();
    Ok(crate::lara::LaraCredentials {
        id: settings::get(app, "laraId", "LARA_ACCESS_KEY_ID").ok_or_else(missing)?,
        secret: settings::get(app, "laraSecret", "LARA_ACCESS_KEY_SECRET").ok_or_else(missing)?,
    })
}

pub(crate) fn deepl_error(status: reqwest::StatusCode, data: &serde_json::Value) -> String {
    let msg = data.get("message").and_then(|v| v.as_str()).unwrap_or("Erreur API DeepL");
    format!("{msg} (code {status})")
}

#[tauri::command]
pub async fn translate_deepl(
    app: AppHandle,
    text: String,
    source: Option<String>,
    target: String,
    formal: Option<bool>,
) -> Result<String, String> {
    let api_key = deepl_key(&app)?;
    deepl(&api_key, &text, source.as_deref(), &target, formal).await
}

fn deepl_body(text: &str, source: Option<&str>, target: &str, formal: Option<bool>) -> serde_json::Value {
    let mut body = json!({ "text": [text], "target_lang": target });
    if let Some(source) = source {
        body["source_lang"] = json!(source);
    }
    if let Some(formal) = formal {
        body["formality"] = json!(if formal { "prefer_more" } else { "prefer_less" });
    }
    body
}

async fn deepl(
    api_key: &str,
    text: &str,
    source: Option<&str>,
    target: &str,
    formal: Option<bool>,
) -> Result<String, String> {
    let endpoint = format!("{}/v2/translate", deepl_base_url(api_key));
    let body = deepl_body(text, source, target, formal);

    let client = crate::http::client();
    let res = client
        .post(&endpoint)
        .header("Authorization", format!("DeepL-Auth-Key {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau DeepL : {e}"))?;

    let status = res.status();
    let data: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Réponse DeepL invalide : {e}"))?;

    if !status.is_success() {
        return Err(deepl_error(status, &data));
    }

    data["translations"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Réponse DeepL sans traduction.".to_string())
}

#[tauri::command]
pub async fn translate_lara(
    app: AppHandle,
    state: tauri::State<'_, crate::lara::LaraState>,
    text: String,
    source: Option<String>,
    target: String,
    formal: Option<bool>,
) -> Result<String, String> {
    let creds = lara_credentials(&app)?;
    let instructions: &[&str] = match formal {
        Some(true) => &[LARA_FORMAL],
        Some(false) => &[LARA_INFORMAL],
        None => &[],
    };
    crate::lara::translate(&state, &creds, &text, source.as_deref(), &target, instructions).await
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn deepl_body_sans_source_laisse_deepl_detecter() {
        assert_eq!(
            super::deepl_body("Hi", None, "JA", None),
            json!({ "text": ["Hi"], "target_lang": "JA" })
        );
    }

    #[test]
    fn deepl_body_avec_source_et_formalite() {
        assert_eq!(
            super::deepl_body("Hi", Some("EN"), "DE", Some(false)),
            json!({ "text": ["Hi"], "source_lang": "EN", "target_lang": "DE", "formality": "prefer_less" })
        );
    }

    #[tokio::test]
    #[ignore]
    async fn deepl_live() {
        dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();
        let key = std::env::var("DEEPL_API_KEY").expect("DEEPL_API_KEY");
        let q = "Could you confirm whether you can attend?";
        let vous = super::deepl(&key, q, Some("EN"), "FR", Some(true)).await.unwrap();
        let tu = super::deepl(&key, q, Some("EN"), "FR", Some(false)).await.unwrap();
        let en = super::deepl(&key, &vous, Some("FR"), "EN-US", None).await.unwrap();
        let ko = super::deepl(&key, q, None, "KO", None).await.unwrap();
        println!("DeepL vous : {vous}\nDeepL tu   : {tu}\nDeepL en   : {en}\nDeepL ko (détection) : {ko}");
    }
}
