use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use hmac::{Hmac, KeyInit, Mac};
use md5::{Digest, Md5};
use serde_json::{json, Value};
use sha2::Sha256;
use tokio::sync::Mutex;

const BASE_URL: &str = "https://api.laratranslate.com";
const SDK_NAME: &str = "traducteur-tauri";
const SDK_VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct LaraCredentials {
    pub id: String,
    pub secret: String,
}

#[derive(Default)]
pub struct LaraState(Mutex<Option<(String, String)>>);

fn lara_date() -> String {
    httpdate::fmt_http_date(std::time::SystemTime::now())
}

fn content_md5(body: &str) -> String {
    BASE64.encode(Md5::digest(body.as_bytes())) // NOSONAR rust:S4790
}

fn sign(secret: &str, method: &str, path: &str, md5: &str, content_type: &str, date: &str) -> String {
    let challenge = format!("{method}\n{path}\n{md5}\n{content_type}\n{date}");
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .expect("HMAC accepte une clé de n'importe quelle taille");
    mac.update(challenge.as_bytes());
    BASE64.encode(mac.finalize().into_bytes())
}

fn api_error(status: u16, body: &Value) -> String {
    let msg = body
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("erreur inconnue");
    match status {
        401 | 403 => format!("Identifiants Lara refusés ({status}) : {msg}"),
        _ => format!("Erreur API Lara ({status}) : {msg}"),
    }
}

async fn authenticate(client: &reqwest::Client, creds: &LaraCredentials) -> Result<String, String> {
    let body = json!({ "id": creds.id }).to_string();
    let date = lara_date();
    let md5 = content_md5(&body);
    let signature = sign(&creds.secret, "POST", "/v2/auth", &md5, "application/json", &date);

    let res = client
        .post(format!("{BASE_URL}/v2/auth"))
        .header("Content-Type", "application/json")
        .header("X-Lara-Date", &date)
        .header("Content-MD5", &md5)
        .header("Authorization", format!("Lara:{signature}"))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau Lara : {e}"))?;

    let status = res.status().as_u16();
    let data: Value = res
        .json()
        .await
        .map_err(|e| format!("Réponse d'authentification Lara invalide : {e}"))?;

    if !(200..300).contains(&status) {
        return Err(api_error(status, &data));
    }
    data.get("token")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Réponse d'authentification Lara sans jeton.".to_string())
}

enum Attempt {
    Ok(Value),
    Unauthorized,
}

async fn call_once(
    client: &reqwest::Client,
    token: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<&str>,
) -> Result<Attempt, String> {
    let mut request = client
        .request(method, format!("{BASE_URL}{path}"))
        .header("X-Lara-Date", lara_date())
        .header("X-Lara-SDK-Name", SDK_NAME)
        .header("X-Lara-SDK-Version", SDK_VERSION)
        .header("Authorization", format!("Bearer {token}"));
    if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body.to_string());
    }
    let res = request
        .send()
        .await
        .map_err(|e| format!("Erreur réseau Lara : {e}"))?;

    let http_status = res.status().as_u16();
    let raw = res
        .text()
        .await
        .map_err(|e| format!("Réponse Lara illisible : {e}"))?;

    let last = raw
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<Value>(line.trim()).ok())
        .ok_or_else(|| format!("Réponse Lara vide (code {http_status})."))?;

    let status = last
        .get("status")
        .and_then(Value::as_u64)
        .map(|s| s as u16)
        .unwrap_or(http_status);
    if status == 401 {
        return Ok(Attempt::Unauthorized);
    }
    let payload = last.get("data").cloned().unwrap_or(last);
    if !(200..300).contains(&status) {
        return Err(api_error(status, &payload));
    }
    Ok(Attempt::Ok(payload))
}

async fn authorized(
    state: &LaraState,
    creds: &LaraCredentials,
    method: reqwest::Method,
    path: &str,
    body: Option<&str>,
) -> Result<Value, String> {
    let client = crate::http::client();
    let mut cache = state.0.lock().await;
    let cached = match cache.as_ref() {
        Some((id, token)) if *id == creds.id => Some(token.clone()),
        _ => None,
    };

    let token = match cached {
        Some(t) => t,
        None => authenticate(&client, creds).await?,
    };

    let token = match call_once(&client, &token, method.clone(), path, body).await? {
        Attempt::Ok(payload) => {
            *cache = Some((creds.id.clone(), token));
            return Ok(payload);
        }
        Attempt::Unauthorized => authenticate(&client, creds).await?,
    };

    match call_once(&client, &token, method, path, body).await? {
        Attempt::Ok(payload) => {
            *cache = Some((creds.id.clone(), token));
            Ok(payload)
        }
        Attempt::Unauthorized => {
            *cache = None;
            Err("Lara refuse le jeton d'authentification (401).".to_string())
        }
    }
}

pub async fn translate(
    state: &LaraState,
    creds: &LaraCredentials,
    text: &str,
    source: Option<&str>,
    target: &str,
    instructions: &[&str],
) -> Result<String, String> {
    let mut body = json!({ "q": text, "target": target });
    if let Some(source) = source {
        body["source"] = json!(source);
    }
    if !instructions.is_empty() {
        body["instructions"] = json!(instructions);
    }
    let payload = authorized(state, creds, reqwest::Method::POST, "/v2/translate", Some(&body.to_string())).await?;
    payload
        .get("translation")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Réponse Lara sans traduction.".to_string())
}

pub async fn languages(state: &LaraState, creds: &LaraCredentials) -> Result<Vec<String>, String> {
    let payload = authorized(state, creds, reqwest::Method::GET, "/v2/languages", None).await?;
    parse_languages(&payload)
}

fn parse_languages(payload: &Value) -> Result<Vec<String>, String> {
    payload
        .as_array()
        .map(|codes| codes.iter().filter_map(Value::as_str).map(str::to_string).collect())
        .ok_or_else(|| "Liste des langues Lara invalide.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_languages_lit_un_tableau_de_locales() {
        assert_eq!(parse_languages(&json!(["ja-JP", "zh-CN"])).unwrap(), vec!["ja-JP", "zh-CN"]);
        assert!(parse_languages(&json!({ "message": "x" })).is_err());
    }

    #[test]
    fn signature_matches_node_crypto() {
        // Valeurs de référence calculées avec node:crypto (même algorithme que le SDK).
        let md5 = content_md5(&json!({ "id": "abc" }).to_string());
        assert_eq!(md5, "MeRXbpZYPnWCqmRZ/pCiHA==");
        assert_eq!(
            sign("secret", "POST", "/v2/auth", &md5, "application/json", "Thu, 24 Sep 2026 10:00:00 GMT"),
            "TwcmZbAllFkUUGpJ/N/cbkRt8cpCdnKZVmycvGQhbdQ="
        );
    }

    #[tokio::test]
    #[ignore]
    async fn lara_live() {
        dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();
        let creds = LaraCredentials {
            id: std::env::var("LARA_ACCESS_KEY_ID").expect("LARA_ACCESS_KEY_ID"),
            secret: std::env::var("LARA_ACCESS_KEY_SECRET").expect("LARA_ACCESS_KEY_SECRET"),
        };
        let state = LaraState::default();
        let text = "The meeting has been moved to Thursday afternoon.";
        let first = translate(&state, &creds, text, Some("en-US"), "fr-FR", &[]).await.unwrap();
        println!("Lara (Rust) : {first}");
        let q = "Could you confirm whether you can attend?";
        let vous = translate(&state, &creds, q, Some("en-US"), "fr-FR", &[crate::translate::LARA_FORMAL]).await.unwrap();
        let tu = translate(&state, &creds, q, Some("en-US"), "fr-FR", &[crate::translate::LARA_INFORMAL]).await.unwrap();
        let ja = translate(&state, &creds, q, None, "ja-JP", &[]).await.unwrap();
        println!("Lara vous : {vous}\nLara tu   : {tu}\nLara ja (détection) : {ja}");
    }
}
