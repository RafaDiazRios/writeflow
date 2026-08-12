# WriteFlow en Android

La versión móvil no es un proyecto aparte: es **el mismo código** con otra piel. El
esquema de la base de datos, los repositorios, el motor de sincronización, el cifrado
en Rust, la búsqueda FTS5 y todo el contenido (prompts, ejercicios, plantillas) se
comparten sin un solo cambio. Lo único que se bifurca es cómo se reparte la pantalla y
qué se puede editar.

---

## Qué hace y qué no

| | Escritorio | Android |
|---|---|---|
| Diario, calendario, prompts, «en este día» | ✅ | ✅ |
| Terapia narrativa | ✅ | ✅ |
| Búsqueda global | ✅ | ✅ |
| Sincronización y cifrado | ✅ | ✅ |
| Novela y ensayos | editar | **leer** |
| Exportar `.docx` / `.epub` | guardar como | **compartir** |
| Insertar imágenes | disco | galería |

La novela se lee y no se edita **por decisión, no por límite técnico**. El binder con
arrastrar y soltar, el inspector y el tablero de tramas necesitan sitio; encogerlos a
cinco pulgadas produce una versión peor de las dos cosas. En el móvil se repasa un
capítulo en el metro y se consulta una ficha de personaje, que es lo que de verdad se
hace con un teléfono en la mano.

---

## Sacar archivos del móvil

En Android no existe el diálogo «guardar como», y una aplicación tampoco puede dejar
un archivo en una carpeta pública sin pedir permisos. El camino de salida es el **menú
de compartir**: WriteFlow genera el archivo, se lo entrega al sistema y eres tú quien
elige destino —Drive, correo, WhatsApp, «Guardar en Archivos»— o a qué aplicación se
lo mandas.

Es el mismo código de exportación del escritorio. Lo único que cambia es el último
paso: `saveTextFile` y `saveBinaryFile` miran en qué sistema están y, en el móvil,
llaman a `compartirArchivo` en lugar de abrir el diálogo.

Está en tres sitios:

- **Diario → Compartir \<mes\>**: todas las entradas del mes en un `.docx`.
- **Leer → un proyecto → Compartir**: el mismo menú del escritorio, con `.docx`,
  manuscrito, `.epub`, Markdown y HTML.
- Cualquier otra exportación que se añada en el futuro: no hay que tocar nada más.

Por dentro: `compartir.rs` escribe el archivo en la caché privada de la aplicación y
`CompartirPlugin.kt` lo publica a través del `FileProvider` que ya venía declarado en
el manifiesto, con un permiso de lectura temporal sobre ese archivo concreto
(`FLAG_GRANT_READ_URI_PERMISSION`). Desde Android 7 no se puede pasar una ruta a otra
aplicación —lanza `FileUriExposedException`—, y esa es la razón de todo el rodeo.

La carpeta de caché se vacía antes de cada envío: si no, cada exportación dejaría una
copia en un sitio que el usuario nunca ve.

Después de compartir, la aplicación **no dice dónde quedó el archivo**, porque Android
no lo cuenta. Dice «Enviado al menú de compartir», que es lo único cierto.

### El plugin Kotlin vive en el módulo de la aplicación

`CompartirPlugin.kt` está en `src-tauri/gen/android/app/src/main/java/…/`, no en un
proyecto Gradle aparte. Un plugin de Tauri para móvil suele ser un crate propio con su
módulo de Android, pero para cincuenta líneas eso sería tres archivos de configuración
por cada uno de código. `register_android_plugin` acepta cualquier paquete, así que se
le apunta al de la propia aplicación.

Consecuencia práctica: **ese archivo hay que conservarlo**, igual que el `intent-filter`
del manifiesto. `tauri android init` no lo borra, pero tampoco lo regenera.

---

## Qué cambia en la interfaz

- **Navegación abajo**, al alcance del pulgar: Hoy · Diario · Terapia · Leer.
- **Una pantalla cada vez.** En el diario se entra al día y de ahí a la entrada; no hay
  dos paneles simultáneos porque en vertical ninguno tendría anchura decente.
- **Barra de formato de nueve botones** en lugar de treinta, pegada al borde inferior
  para que quede justo encima del teclado. Los botones usan `onMouseDown` con
  `preventDefault` para que el editor no pierda el foco y el teclado no se cierre a
  cada pulsación.
- **Sin hoja A4.** Imitar un folio tiene sentido en un monitor; en un móvil solo roba
  espacio.
- **Botón flotante** para empezar a escribir sin buscar nada.

Todo esto se decide en `src/lib/platform.ts`, que combina el sistema operativo con el
ancho de ventana. Así la interfaz táctil se puede desarrollar y fotografiar en el
navegador del escritorio, estrechando la ventana, sin compilar para Android.

---

## Compilar en local

Requisitos: **JDK 17 o superior**, **Android Studio** (o las command line tools) con el
**SDK 34+** y el **NDK 27**, y los objetivos de Rust para Android.

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

Variables de entorno:

```bash
export ANDROID_HOME=$HOME/Android/Sdk          # donde tengas el SDK
export NDK_HOME=$ANDROID_HOME/ndk/27.3.13750724
export JAVA_HOME=/ruta/al/jdk
```

Y ya:

```bash
npm run android:dev     # en un móvil conectado por USB o en un emulador
npm run android:build   # genera el APK de release
```

El APK aparece en:

```
src-tauri/gen/android/app/build/outputs/apk/universal/release/
```

---

## Firmar

Android exige que todo APK vaya firmado, y **la firma tiene que ser siempre la misma**:
si cambias de clave, el móvil se niega a actualizar sobre la versión anterior y hay que
desinstalar, perdiendo los datos locales. Crea el keystore una vez y guárdalo como
guardarías una contraseña.

```bash
keytool -genkeypair -v -keystore writeflow.keystore -alias writeflow \
  -keyalg RSA -keysize 2048 -validity 10000
```

Para compilar en local, crea `src-tauri/gen/android/keystore.properties`:

```properties
password=tu-contraseña
keyAlias=writeflow
storeFile=/ruta/absoluta/a/writeflow.keystore
```

Ese archivo está en `.gitignore`, igual que `*.keystore`. **No lo subas nunca.**

### En GitHub Actions

En **Settings → Secrets and variables → Actions**, crea tres secretos:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 writeflow.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | la contraseña del keystore |
| `ANDROID_KEY_ALIAS` | `writeflow` |

Con ellos, `.github/workflows/android.yml` firma la release al publicar una etiqueta
`v*`. Sin ellos compila igual, pero el APK sale sin firmar.

El flujo compila **solo para arm64**, que cubre cualquier móvil de la última década y
evita compilar Rust cuatro veces. Si algún día hace falta un móvil viejo de 32 bits,
se añade `armv7` al `--target`.

---

## Instalar el APK

1. Descarga el APK desde **Releases**, o desde los artefactos de la ejecución en Actions.
2. Ábrelo en el móvil. Android pedirá permiso para instalar desde esa aplicación
   (normalmente el navegador o el gestor de archivos): concédelo.
3. La primera vez pedirá la frase de paso del cifrado —la misma del ordenador— y el
   inicio de sesión con Google.

**Cuidado con las firmas.** Si instalas un APK firmado con una clave y luego intentas
instalar otro firmado con una distinta, Android lo rechaza. Hay que desinstalar primero,
y eso borra la base de datos local: sincroniza antes.

---

## El login con Google en el móvil

Funciona igual que en el escritorio y por el mismo camino: el navegador del sistema
abre Google, Supabase redirige a `writeflow://auth-callback?code=…` y Android despierta
la aplicación.

Para que eso ocurra, el `AndroidManifest.xml` declara un `intent-filter` con el esquema
`writeflow`. Está escrito a mano y **debe conservarse**: la configuración `mobile` del
plugin de enlaces profundos sirve para App Links con `https`, no para esquemas propios.

La actividad usa `launchMode="singleTask"`, así que el enlace entra en la ventana ya
abierta en lugar de arrancar una segunda copia.

---

## Rendimiento y tamaño

- APK de release, solo arm64: **unos 9 MB**.
- La misma base SQLite, el mismo FTS5 y el mismo Argon2id. Derivar la clave con 64 MiB
  de memoria tarda algo más en un móvil que en un portátil —alrededor de un segundo—,
  y es una sola vez al desbloquear.
- `minSdk` 24: Android 7 en adelante.
