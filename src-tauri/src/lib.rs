mod compartir;
mod crypto;
mod migrations;

use tauri::Manager;

/// Devuelve información básica del entorno para la pantalla de ajustes.
#[tauri::command]
fn app_info(app: tauri::AppHandle) -> serde_json::Value {
    let dir = app
        .path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "dataDir": dir,
        "dbPath": format!("{}/writeflow.db", dir),
    })
}

/// Reinicia la aplicación.
///
/// Existe por un fallo de WebView2, no nuestro: si se cambia la distribución de
/// teclado de Windows con la aplicación ya abierta, el motor web se queda con la
/// anterior. Se escribe con el teclado inglés aunque Windows diga español, y no
/// funcionan ni las tildes ni la ñ. Microsoft lo tiene reconocido y sin arreglar;
/// el único remedio es reiniciar la aplicación, así que al menos que sea un clic.
#[tauri::command]
fn reiniciar(app: tauri::AppHandle) {
    app.restart()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)] // en móvil no hay bloque de instancia única que lo mute
    let mut builder = tauri::Builder::default();

    // Una sola instancia: si Windows abre `writeflow://…` con la app ya en
    // marcha, el enlace llega a la ventana existente en lugar de abrir otra.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
                let _ = w.unminimize();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:writeflow.db", migrations::all())
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(compartir::init())
        .setup(|_app| {
            // En Linux y Windows en modo desarrollo hay que registrar el
            // esquema a mano; el instalador lo hace por su cuenta.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = _app.deep_link().register_all();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            crypto::crypto_new_salt,
            crypto::crypto_derive_key,
            crypto::crypto_key_fingerprint,
            crypto::crypto_encrypt,
            crypto::crypto_decrypt,
            compartir::compartir_archivo,
            reiniciar,
        ])
        .run(tauri::generate_context!())
        .expect("error al arrancar WriteFlow");
}
