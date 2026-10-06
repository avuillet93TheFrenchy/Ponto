mod http;
mod languages;
mod lara;
mod settings;
mod translate;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // The client is created here (not inside .setup()) so it lives for the whole
  // app lifetime instead of being dropped right after setup runs.
  let mut sentry_options = sentry::ClientOptions::default();
  sentry_options.release = sentry::release_name!();
  sentry_options.auto_session_tracking = true;

  // Android: reqwest's default certificate verifier is not usable there (see http.rs).
  #[cfg(target_os = "android")]
  {
    sentry_options.transport = Some(std::sync::Arc::new(http::SentryTransportFactory));
  }

  // With an empty DSN Sentry stays disabled, so builds without SENTRY_DSN still run.
  let sentry_client = sentry::init((
    option_env!("SENTRY_DSN").unwrap_or(""),
    sentry_options,
  ));

  // Caution! Everything before here runs in both the app and the crash reporter
  // processes. The crash reporter re-launches the executable, which is only
  // possible on desktop, so native crash reports are limited to Windows.
  #[cfg(desktop)]
  let _minidump_guard = tauri_plugin_sentry::minidump::init(&sentry_client);
  // Everything after here runs in the app process only.

  let mut builder = tauri::Builder::default();

  // Must be registered before any other plugin (Tauri requirement).
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));
  }

  // The frontend initializes @sentry/browser itself (src/instrument.js), so the
  // plugin must not inject its own copy.
  builder = builder
    .plugin(tauri_plugin_sentry::init_with_no_injection(&sentry_client))
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_store::Builder::new().build());

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());
  }

  builder
    .manage(lara::LaraState::default())
    .invoke_handler(tauri::generate_handler![
      translate::translate_deepl,
      translate::translate_lara,
      languages::deepl_languages,
      languages::lara_languages,
    ])
    .setup(|app| {
      // Register the log plugin in all builds so JS-side logInfo/logError/etc.
      // are always available. Debug keeps Info verbosity; release uses Warn to
      // limit log volume on end-user devices.
      let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Info
      } else {
        log::LevelFilter::Warn
      };
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log_level)
          .build(),
      )?;
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
