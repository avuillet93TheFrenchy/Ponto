fn main() {
  // Bakes SENTRY_DSN into the binary at compile time so it is available in
  // production builds too, where the ".env" files are not shipped alongside the
  // installed app. Only this key is forwarded, never a whole file: the ".env"
  // files also hold the DeepL and Lara credentials, which must not end up
  // embedded in the compiled binary.
  //
  // Two sources are supported, in this order of precedence:
  // 1. A real process environment variable (how CI/release pipelines inject
  //    secrets, since there is no checked-out ".env" file there).
  // 2. "../.env.local", then "../.env" (the local developer workflow).
  // `dotenvy::from_filename` never overrides a variable that is already set, so
  // loading the files first and reading `std::env::var` afterwards gives
  // exactly that precedence, and works when the files are absent.
  println!("cargo:rerun-if-changed=../.env.local");
  println!("cargo:rerun-if-changed=../.env");
  println!("cargo:rerun-if-env-changed=SENTRY_DSN");

  let _ = dotenvy::from_filename("../.env.local");
  let _ = dotenvy::from_filename("../.env");

  match std::env::var("SENTRY_DSN") {
    Ok(dsn) if !dsn.is_empty() => println!("cargo:rustc-env=SENTRY_DSN={dsn}"),
    _ => println!(
      "cargo:warning=SENTRY_DSN is not set (neither in the environment nor in ../.env.local or ../.env): \
       Sentry will be disabled in the Rust part of this build."
    ),
  }

  tauri_build::build()
}
