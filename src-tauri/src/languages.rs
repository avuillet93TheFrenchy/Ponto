use crate::translate::{deepl_base_url, deepl_error, deepl_key, lara_credentials};
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

#[derive(Serialize, Debug, PartialEq)]
pub struct DeeplTarget {
    pub code: String,
    pub formality: bool,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct DeeplLanguages {
    pub source: Vec<String>,
    pub target: Vec<DeeplTarget>,
}

#[tauri::command]
pub async fn deepl_languages(app: AppHandle) -> Result<DeeplLanguages, String> {
    fetch_deepl(&deepl_key(&app)?).await
}

#[tauri::command]
pub async fn lara_languages(
    app: AppHandle,
    state: tauri::State<'_, crate::lara::LaraState>,
) -> Result<Vec<String>, String> {
    crate::lara::languages(&state, &lara_credentials(&app)?).await
}

async fn fetch_deepl(api_key: &str) -> Result<DeeplLanguages, String> {
    let client = crate::http::client();
    let source = deepl_list(&client, api_key, "source").await?;
    let target = deepl_list(&client, api_key, "target").await?;
    parse_deepl(&source, &target)
}

async fn deepl_list(client: &reqwest::Client, api_key: &str, kind: &str) -> Result<Value, String> {
    let res = client
        .get(format!("{}/v2/languages?type={kind}", deepl_base_url(api_key)))
        .header("Authorization", format!("DeepL-Auth-Key {api_key}"))
        .send()
        .await
        .map_err(|e| format!("Erreur réseau DeepL : {e}"))?;
    let status = res.status();
    let data: Value = res
        .json()
        .await
        .map_err(|e| format!("Réponse DeepL invalide : {e}"))?;
    if !status.is_success() {
        return Err(deepl_error(status, &data));
    }
    Ok(data)
}

fn parse_deepl(source: &Value, target: &Value) -> Result<DeeplLanguages, String> {
    let invalid = || "Liste des langues DeepL invalide.".to_string();
    let code = |v: &Value| v.get("language").and_then(Value::as_str).map(str::to_string);
    let source = source.as_array().ok_or_else(invalid)?.iter().filter_map(|v| code(v)).collect();
    let target = target
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .filter_map(|v| {
            Some(DeeplTarget {
                code: code(v)?,
                formality: v.get("supports_formality").and_then(Value::as_bool).unwrap_or(false),
            })
        })
        .collect();
    Ok(DeeplLanguages { source, target })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_deepl_garde_codes_et_formalite() {
        let source = json!([{ "language": "JA", "name": "Japanese" }]);
        let target = json!([
            { "language": "JA", "name": "Japanese", "supports_formality": true },
            { "language": "KO", "name": "Korean", "supports_formality": false },
            { "language": "ZH-HANS", "name": "Chinese (simplified)" }
        ]);
        assert_eq!(
            parse_deepl(&source, &target).unwrap(),
            DeeplLanguages {
                source: vec!["JA".into()],
                target: vec![
                    DeeplTarget { code: "JA".into(), formality: true },
                    DeeplTarget { code: "KO".into(), formality: false },
                    DeeplTarget { code: "ZH-HANS".into(), formality: false },
                ],
            }
        );
    }

    #[test]
    fn parse_deepl_refuse_une_reponse_qui_n_est_pas_une_liste() {
        assert!(parse_deepl(&json!({ "message": "Forbidden" }), &json!([])).is_err());
    }

    #[tokio::test]
    #[ignore]
    async fn deepl_languages_live() {
        dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();
        let key = std::env::var("DEEPL_API_KEY").expect("DEEPL_API_KEY");
        let langs = fetch_deepl(&key).await.unwrap();
        assert!(langs.source.iter().any(|c| c == "KO"));
        assert!(langs.target.iter().any(|t| t.code == "JA" && t.formality));
        println!("DeepL : {} sources, {} cibles", langs.source.len(), langs.target.len());
    }

    #[tokio::test]
    #[ignore]
    async fn lara_languages_live() {
        dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();
        let creds = crate::lara::LaraCredentials {
            id: std::env::var("LARA_ACCESS_KEY_ID").expect("LARA_ACCESS_KEY_ID"),
            secret: std::env::var("LARA_ACCESS_KEY_SECRET").expect("LARA_ACCESS_KEY_SECRET"),
        };
        let codes = crate::lara::languages(&crate::lara::LaraState::default(), &creds).await.unwrap();
        assert!(codes.iter().any(|c| c == "zh-CN"));
        println!("Lara : {} locales", codes.len());
    }
}
