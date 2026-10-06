//! The HTTP client every Rust command (DeepL, Lara) and, on Android, the Sentry transport use.
//!
//! reqwest 0.13 checks TLS certificates with `rustls-platform-verifier`, which on Android needs a
//! Kotlin component and a JNI initialisation Ponto does not have: without them every HTTPS request
//! panics. On Android the client therefore trusts the Mozilla roots bundled in `webpki-root-certs`
//! instead; other platforms keep the system verifier.

use std::sync::OnceLock;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// The shared client for the commands. Cloning a `reqwest::Client` shares its connection pool.
pub fn client() -> reqwest::Client {
    CLIENT.get_or_init(build_client).clone()
}

/// A new client with the platform's TLS setup, for callers that must not share a pool
/// (the Sentry transport runs on its own thread and runtime).
pub fn build_client() -> reqwest::Client {
    let builder = reqwest::Client::builder();
    #[cfg(target_os = "android")]
    let builder = builder.tls_certs_only(android_roots());
    builder.build().expect("the HTTP client configuration is valid")
}

#[cfg(target_os = "android")]
fn android_roots() -> Vec<reqwest::Certificate> {
    webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .filter_map(|root| reqwest::Certificate::from_der(root.as_ref()).ok())
        .collect()
}

/// Sends Sentry events through [`build_client`] instead of the client the sentry crate would create.
#[cfg(target_os = "android")]
pub struct SentryTransportFactory;

#[cfg(target_os = "android")]
impl sentry::TransportFactory for SentryTransportFactory {
    fn create_transport_with_options(&self, options: sentry::TransportOptions) -> std::sync::Arc<dyn sentry::Transport> {
        std::sync::Arc::new(
            sentry::transports::ReqwestHttpTransportOptions::from(options)
                .with_client(build_client())
                .build(),
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn le_client_se_construit() {
        let _ = super::client();
        let _ = super::build_client();
    }
}
