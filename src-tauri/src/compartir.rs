//! Compartir un archivo desde Android.
//!
//! En Windows la exportación termina en el diálogo «guardar como»: eliges una
//! carpeta y ahí queda el archivo. En Android ese diálogo no existe, y tampoco
//! existe una carpeta pública donde una aplicación pueda dejar cosas sin pedir
//! permisos. El camino de salida es el **menú de compartir** del sistema: se
//! escribe el archivo en la caché privada de la aplicación y se le entrega al
//! sistema una referencia temporal para que el usuario elija destino (Drive,
//! correo, WhatsApp, «Guardar en Archivos»…).
//!
//! El trabajo sucio lo hace `CompartirPlugin.kt`, dentro del propio módulo de
//! la aplicación Android. Aquí solo se registra ese plugin, se escribe el
//! archivo y se le pasa la ruta.

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

/// Lo que se le manda al lado Kotlin.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PeticionCompartir {
    ruta: String,
    mime: String,
    titulo: String,
}

#[derive(Deserialize)]
struct RespuestaVacia {}

#[cfg(target_os = "android")]
struct Compartidor<R: Runtime>(PluginHandle<R>);

/// Registra el plugin Android. En escritorio no hace nada: el archivo se guarda
/// con el diálogo nativo y no hay nada que compartir.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("compartir")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api
                    .register_android_plugin("com.rafaeldiazrios.writeflow", "CompartirPlugin")?;
                _app.manage(Compartidor(handle));
            }
            Ok(())
        })
        .build()
}

/// Escribe `datos` en la caché de la aplicación y abre el menú de compartir.
///
/// El nombre se limpia de separadores de ruta: llega desde la interfaz y puede
/// contener el título de una novela escrito por el usuario.
#[tauri::command]
pub async fn compartir_archivo<R: Runtime>(
    app: tauri::AppHandle<R>,
    nombre: String,
    mime: String,
    datos: Vec<u8>,
) -> Result<(), String> {
    let limpio: String = nombre
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '-',
            otro => otro,
        })
        .collect();
    let limpio = limpio.trim().trim_start_matches('.').to_string();
    if limpio.is_empty() {
        return Err("El nombre del archivo está vacío".into());
    }

    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("No se encontró la carpeta de caché: {e}"))?
        .join("compartir");
    std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear {dir:?}: {e}"))?;

    // Se vacía antes de escribir: si no, cada exportación deja una copia en la
    // caché y el usuario nunca ve esa carpeta para limpiarla.
    if let Ok(entradas) = std::fs::read_dir(&dir) {
        for e in entradas.flatten() {
            let _ = std::fs::remove_file(e.path());
        }
    }

    let ruta = dir.join(&limpio);
    std::fs::write(&ruta, &datos).map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;

    #[cfg(target_os = "android")]
    {
        let estado = app
            .try_state::<Compartidor<R>>()
            .ok_or_else(|| "El plugin de compartir no está registrado".to_string())?;
        estado
            .0
            .run_mobile_plugin::<RespuestaVacia>(
                "compartir",
                PeticionCompartir {
                    ruta: ruta.to_string_lossy().to_string(),
                    mime,
                    titulo: limpio,
                },
            )
            .map_err(|e| format!("Android rechazó el envío: {e}"))?;
        Ok(())
    }

    #[cfg(not(target_os = "android"))]
    {
        // Silencia los avisos de «campo sin usar» en escritorio.
        let _ = (mime, RespuestaVacia {});
        let _ = std::mem::size_of::<PeticionCompartir>();
        Err(format!(
            "Compartir solo existe en Android; en este sistema usa «guardar como». \
             (El archivo de prueba quedó en {})",
            ruta.display()
        ))
    }
}
