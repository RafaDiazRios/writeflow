# WriteFlow

Aplicación de escritura para Windows que funciona **igual con y sin conexión**. Cuatro
espacios en una sola ventana:

- **Diario** calendarizado, con las entradas ancladas al día en que se escribieron y una
  sugerencia diaria para pensar (estoica, filosófica o psicológica).
- **Novela**, con estructura de carpetas, capítulos y escenas, fichas de personaje,
  tablero de tarjetas y líneas de trama — al estilo de Scrivener 3.
- **Ensayos**, con 13 estructuras documentadas (argumentativa, Toulmin, rogeriana,
  IMRyD, reflexiva de Gibbs, op-ed…) y una guía por sección.
- **Terapia narrativa**, con 47 ejercicios de escritura de terapia narrativa, centrada en
  soluciones, breve estratégica, ACT, escritura expresiva y terapia de la compasión,
  repartidos en tres niveles de profundidad.

Con **búsqueda global** sobre los cuatro módulos, **objetivo diario de palabras**, racha
y mapa de actividad del año, y exportación nativa a **.docx** (incluido el formato de manuscrito que piden agentes y editoriales),
**.epub**, Markdown y HTML.

Todo se guarda primero en tu ordenador (SQLite). La nube es opcional: cuando hay
conexión, sincroniza con Supabase y puede volcar un archivo en Markdown a GitHub.

---

## Cómo funciona por dentro

| Capa | Tecnología | Por qué |
|---|---|---|
| Aplicación de escritorio | **Tauri 2** (Rust) | Instalador de ~10 MB, arranque instantáneo, poca RAM |
| Interfaz | **React 18 + TypeScript + Vite + Tailwind** | Rápida de iterar, tipada de punta a punta |
| Editor | **TipTap 2** (ProseMirror) | Barra tipo Word, tablas, listas de tareas, imágenes |
| Base local | **SQLite** vía `tauri-plugin-sql` | La app es plenamente funcional sin red |
| Sincronización | **Supabase** (Postgres + Auth Google) | Multi-dispositivo con RLS por usuario |
| Cifrado | **AES-256-GCM + Argon2id** en Rust | El diario y la terapia salen del equipo ya cifrados |
| Archivo | **GitHub** vía API REST | Copia en Markdown versionada, legible sin la app |
| Exportación | **docx** + **JSZip** (carga diferida) | `.docx` y `.epub` generados en el propio equipo, sin red |
| Búsqueda | **SQLite FTS5** | Una caja para los cuatro módulos, sin tildes ni mayúsculas, instantánea |

Documento de arquitectura completo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

---

## Poner en marcha el proyecto

Requisitos: [Node 20+](https://nodejs.org), [Rust estable](https://rustup.rs) y, en
Windows, **Microsoft Visual Studio C++ Build Tools** y **WebView2** (ya viene con
Windows 11 y con Windows 10 actualizado).

```bash
npm install
npm run app:dev      # abre la app en modo desarrollo con recarga en caliente
npm run app:build    # genera el instalador en src-tauri/target/release/bundle
```

La base de datos se crea sola la primera vez en
`%APPDATA%\com.rafaeldiazrios.writeflow\writeflow.db`.

### Compilar el instalador desde GitHub

El flujo de `.github/workflows/build.yml` compila en cada `push` a `main` y, al publicar
una etiqueta `v*`, crea una release en borrador con el `.exe` y el `.msi`.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

---

## Conectar la nube (opcional)

### 1. Supabase

**Ya está hecho:** el proyecto `writeflow` existe en tu organización
(`https://rlnetaknsjzmsplbjmow.supabase.co`, región eu-west-3), la migración está
aplicada, RLS activo en las diez tablas y el linter de seguridad sin avisos. Las
credenciales están en el archivo `.env`.

Solo te queda activar Google, que requiere pasar por la consola:

1. ~~Crear el proyecto~~ *(hecho)*
2. ~~Ejecutar `supabase/migrations/0001_init.sql`~~ *(hecho)*
3. En **Authentication → Providers → Google**, activa Google y pega el *Client ID* y el
   *Client Secret* de tu proyecto de Google Cloud.
4. En **Authentication → URL Configuration → Redirect URLs**, añade:

   ```
   writeflow://auth-callback
   ```

5. En la aplicación, ve a **Ajustes → Sincronización** (las credenciales ya vienen
   cargadas desde `.env`) y pulsa **Iniciar sesión con Google**. Se abrirá tu navegador y, al
   terminar, Windows devolverá el control a WriteFlow.

En Google Cloud Console, el *Authorized redirect URI* del cliente OAuth debe ser el de
Supabase, no el de la app:

```
https://<tu-proyecto>.supabase.co/auth/v1/callback
```

### 2. GitHub (archivo histórico)

En **Ajustes → Respaldo en GitHub**, indica propietario, repositorio y un *fine-grained
token* con permiso `Contents: read and write` sobre ese repositorio. Cada respaldo sube
todo tu trabajo como Markdown en un único commit dentro de `archivo/`.

Marca «Incluir también el diario y la terapia» solo si el repositorio es **privado**: ese
volcado va en texto plano, a diferencia de la sincronización con Supabase.

---

## Exportar

Desde el botón **Exportar** de cualquier novela o ensayo:

| Formato | Para qué |
|---|---|
| **.docx** | Word con estilos, títulos navegables, tablas y numeración de páginas |
| **.docx — manuscrito** | Times 12, doble espacio, sangría de primera línea, un capítulo por página y encabezado «Apellido / TÍTULO / página». El formato estándar de envío a agentes y editoriales |
| **.epub** | EPUB 3 con índice, portada y hoja de estilo; se abre en Kindle, Apple Books o Calibre |
| **.md** | Texto plano para archivar |
| **.html** | Para imprimir o publicar |

El diario tiene su propio botón: **Exportar \<mes\>** guarda todas las entradas del mes
en un solo documento, una por día con su fecha como encabezado.

Todo se genera dentro de la aplicación, sin enviar tu texto a ningún servicio. Las
librerías pesadas (`docx`, `jszip`) se cargan solo al pulsar exportar, así que no
ralentizan el arranque.

---

## Búsqueda global

`Ctrl` + `K` desde cualquier pantalla. Busca a la vez en el diario, los capítulos y
escenas, las secciones de ensayo, las fichas de personaje y la escritura terapéutica.

- **Sin tildes ni mayúsculas**: `cafe` encuentra `café`, `LLOVÍA` encuentra `llovía`.
- **Por palabras, no por subcadena**: es FTS5, no un `LIKE`. Buscar en cien mil palabras
  cuesta lo mismo que buscar en cien.
- **Prefijo mientras escribes**: `vac` ya encuentra `vacía`.
- **Varias palabras exigen que estén todas**, y el fragmento resaltado te enseña dónde.
- Los resultados se recorren con las flechas y se abren con `Enter`, directamente en el
  documento y el día correctos.

El índice se mantiene solo al guardar. Si alguna vez sospechas que le falta algo, en
**Ajustes → Búsqueda global** puedes reconstruirlo entero.

---

## Objetivo diario y racha

En **Inicio** hay un objetivo de palabras al día (500 por defecto, editable con el lápiz)
y un mapa de actividad del último año.

Se cuenta el **incremento neto** de cada guardado, no el total del documento: reescribir
un párrafo no infla la cifra y borrar no la deja en negativo. Suma lo que escribas en
cualquiera de los cuatro módulos.

El mapa usa una escala de un solo tono —claro a oscuro según las palabras del día,
anclada a tu objetivo— y marca con un anillo los días cumplidos, para que la
información no dependa solo del color.

---

## El cifrado, en corto

1. Eliges una frase de paso. **No se guarda en ningún sitio.**
2. Argon2id (64 MiB, 3 pasadas) la convierte en una clave de 256 bits usando una sal
   aleatoria. La sal sí se sincroniza: es pública y hace falta para reconstruir la clave
   en otro ordenador.
3. Antes de subir una entrada de diario o de terapia, su contenido se cifra con
   AES-256-GCM. Supabase almacena cadenas que empiezan por `wf1.` y no puede leerlas.
4. Fechas, ánimo, número de palabras y revisiones viajan en claro: son lo que permite
   pintar el calendario y ordenar sin descifrar nada en el servidor.

Consecuencia inevitable: **si olvidas la frase de paso, ese contenido no se recupera.**
La copia local sigue en claro en tu SQLite, así que no pierdes nada mientras conserves el
ordenador; lo que se pierde es la copia de la nube.

La novela y los ensayos viajan sin cifrar, para poder buscarlos en el servidor y
compartirlos algún día. Se puede cambiar en `src/lib/sync.ts`: cada tabla declara qué
columnas son sensibles.

---

## Sincronización sin conflictos molestos

Cada fila lleva `rev` (contador de revisión) y `updated_at`. Al sincronizar:

- lo que tiene `dirty = 1` se sube y se marca como limpio;
- lo que llega con `rev` mayor sobrescribe la copia local;
- si ambos lados cambiaron desde el último cruce, **no se pisa nada**: el conflicto se
  guarda en `sync_conflicts` y en Ajustes eliges qué versión conservar.

Escribir en un avión sin red y en el móvil de otra persona el mismo día no destruye
ninguna de las dos versiones.

---

## Atajos

| Atajo | Qué hace |
|---|---|
| `Ctrl` + `K` | Buscar en todo |
| `Ctrl` + `J` | Ir al diario |
| `Ctrl` + `Shift` + `F` | Modo concentración |
| `Ctrl` + `B` / `I` / `U` | Negrita, cursiva, subrayado |
| `Ctrl` + `Z` / `Y` | Deshacer, rehacer |

---

## Estructura del repositorio

```
src/
  lib/          base de datos, cifrado, sincronización, exportación, GitHub
  components/   editor, barra de herramientas, armazón de la ventana
  modules/      diario, novela, ensayos, terapia, ajustes
  data/         107 prompts, 47 ejercicios y 13 plantillas de ensayo (JSON)
scripts/        pruebas de integración (esquema, repositorios y exportación)
src-tauri/      backend en Rust: migraciones SQLite y cifrado
supabase/       migración de Postgres con RLS
docs/           arquitectura y decisiones de diseño
```

## Pruebas

```bash
npm test          # esquema SQLite, repositorios y exportación
npm run build     # comprobación de tipos + compilación del frontend
cargo test --manifest-path src-tauri/Cargo.toml   # cifrado
```

`npm run test:db` ejecuta los repositorios contra un SQLite real (vía `node:sqlite`), así
que valida el SQL de verdad. `npm run test:export` genera un `.docx` y un `.epub` a partir
de un documento con negritas, listas, tablas, enlaces y caracteres que rompen XML, y
comprueba que salen bien formados.

## Licencia

Uso personal de Rafael Díaz Ríos.
