package com.rafaeldiazrios.writeflow

import android.app.Activity
import android.content.Intent
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

/**
 * Argumentos que llegan desde `compartir.rs`.
 *
 * Es una clase pública con propiedades mutables a propósito: Tauri la rellena
 * por reflexión y las reglas de ProGuard de `tauri-android` conservan
 * justamente las clases anotadas con `@InvokeArg`.
 */
@InvokeArg
class ArgumentosCompartir {
    /** Ruta absoluta dentro de la caché privada de la aplicación. */
    lateinit var ruta: String

    /** Tipo MIME, para que el sistema ofrezca las aplicaciones adecuadas. */
    lateinit var mime: String

    /** Nombre que se le enseña al usuario en el selector. */
    lateinit var titulo: String
}

/**
 * Entrega un archivo al menú de compartir de Android.
 *
 * En Android una aplicación no puede pasarle a otra una ruta del sistema de
 * archivos: desde Android 7 eso lanza `FileUriExposedException`. Hay que
 * publicar el archivo a través de un `FileProvider`, que devuelve una URI
 * `content://` temporal, y conceder permiso de lectura sobre ella con
 * `FLAG_GRANT_READ_URI_PERMISSION`. El permiso dura lo que dura la operación y
 * solo alcanza al archivo concreto: el resto de la carpeta privada sigue
 * siendo inaccesible.
 *
 * El proveedor ya viene declarado en `AndroidManifest.xml` con la autoridad
 * `${applicationId}.fileprovider`, y `res/xml/file_paths.xml` expone la raíz de
 * la caché, que es donde `compartir.rs` deja el archivo.
 */
@TauriPlugin
class CompartirPlugin(private val actividad: Activity) : Plugin(actividad) {
    @Command
    fun compartir(invocacion: Invoke) {
        try {
            val args = invocacion.parseArgs(ArgumentosCompartir::class.java)
            val archivo = File(args.ruta)
            if (!archivo.exists()) {
                invocacion.reject("El archivo no existe: ${args.ruta}")
                return
            }

            val uri = FileProvider.getUriForFile(
                actividad,
                "${actividad.packageName}.fileprovider",
                archivo,
            )

            val envio = Intent(Intent.ACTION_SEND).apply {
                type = args.mime
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TITLE, args.titulo)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            // El selector se lanza desde la actividad, así que no hace falta
            // FLAG_ACTIVITY_NEW_TASK: la aplicación vuelve al frente al cerrarlo.
            val selector = Intent.createChooser(envio, args.titulo)
            selector.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            actividad.startActivity(selector)

            invocacion.resolve()
        } catch (e: Exception) {
            invocacion.reject(e.message ?: "No se pudo compartir el archivo")
        }
    }
}
