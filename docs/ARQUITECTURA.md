# Arquitectura de WriteFlow

Documento de referencia: qué decisiones se tomaron, por qué, y qué queda por hacer.

---

## 1. El requisito que manda sobre todos los demás

> «Que funcione autónomamente en Windows con o sin conexión, según si estoy en casa o
> viajando.»

Esto descarta cualquier diseño en el que la nube sea la fuente de verdad. La regla es:

**La base de datos local es siempre la fuente de verdad mientras escribes. La red nunca
bloquea una tecla.**

De ahí se derivan casi todas las decisiones que siguen.

---

## 2. Capas

```
┌──────────────────────────────────────────────────────────────┐
│  React 18 + TypeScript + Tailwind          (src/)            │
│  ├── modules/  diario · novela · ensayos · terapia · ajustes  │
│  ├── components/  Editor (TipTap), Shell, ProjectList         │
│  └── lib/  db · repo · crypto · sync · supabase · github      │
├──────────────────────────────────────────────────────────────┤
│  Puente IPC de Tauri (invoke)                                 │
├──────────────────────────────────────────────────────────────┤
│  Rust  (src-tauri/)                                           │
│  ├── crypto.rs      Argon2id + AES-256-GCM                    │
│  ├── migrations.rs  esquema SQLite versionado                 │
│  └── plugins        sql · fs · dialog · deep-link · opener    │
├──────────────────────────────────────────────────────────────┤
│  SQLite en %APPDATA%          ← fuente de verdad              │
└──────────────────────────────────────────────────────────────┘
             │                              │
     (cuando hay red)                (cuando tú lo pides)
             ▼                              ▼
   Supabase / Postgres + RLS        GitHub (Markdown, 1 commit)
   sincronización viva              archivo histórico legible
```

### Por qué Tauri y no Electron

El instalador queda en torno a 10 MB frente a los ~150 MB de Electron, y la memoria en
reposo baja de varios cientos de MB a unas decenas. Tauri usa el WebView2 que ya trae
Windows en lugar de empaquetar un Chromium entero. Para una aplicación que quieres tener
abierta todo el día mientras escribes, esa diferencia se nota.

El coste: el backend se escribe en Rust y hay que compilar en Windows para generar el
`.exe`. Lo resuelve el flujo de GitHub Actions.

### Por qué TipTap y no un editor propio

Un editor de texto enriquecido de verdad —selecciones, deshacer con historial, tablas,
listas anidadas, pegado desde Word— es de los problemas más profundos del desarrollo de
interfaces. TipTap se apoya en ProseMirror, que lleva una década resolviéndolo, y guarda
el documento como JSON estructurado (no HTML), lo que hace trivial exportar a Markdown,
contar palabras o buscar texto plano.

---

## 3. Modelo de datos

Tres decisiones que conviene entender:

**a) Un solo árbol de documentos para novela y ensayo.**
La tabla `documents` es un árbol autorreferente (`parent_id` + `position`) que sirve tanto
para el binder de una novela (carpeta → capítulo → escena) como para las secciones de un
ensayo. Cambia el `kind` y poco más. Así, mejorar el editor mejora los dos módulos a la
vez.

**b) Diario y terapia son tablas aparte, no documentos.**
Podrían haberse metido en `documents`, pero tienen cardinalidad y metadatos propios
—fecha del día, estado de ánimo, prompt usado, respuestas de seguimiento— y, sobre todo,
un régimen de privacidad distinto: son las dos únicas tablas que se cifran.

**c) Cada fila lleva `rev` y `dirty`.**
`rev` se incrementa en cada escritura y es lo que permite resolver conflictos sin relojes
sincronizados. `dirty` marca lo pendiente de subir. Ninguna de las dos existe en Postgres
(`dirty` no tiene sentido en el servidor; `rev` sí se sincroniza).

### Borrado lógico

Nada se borra de verdad: se pone `deleted_at`. Si no, borrar en un portátil sin conexión
no podría propagarse nunca al móvil, y la fila reaparecería en la siguiente bajada.

---

## 4. Cifrado de extremo a extremo

### Qué se cifra

| Tabla | Columnas cifradas |
|---|---|
| `journal_entries` | `title`, `content_json`, `content_text`, `prompt_text`, `place`, `weather` |
| `therapy_entries` | `exercise_name`, `prompt_text`, `content_json`, `content_text`, `followups` |

Quedan en claro `entry_date`, `mood`, `energy`, `word_count`, `rev`, `updated_at`: son los
campos que permiten pintar el calendario, ordenar y paginar en el servidor sin descifrar.
Es una fuga de metadatos consciente y acotada: alguien con acceso a la base sabría *cuándo*
y *cuánto* escribiste, nunca *qué*.

### Cómo

1. `crypto_new_salt()` genera 16 bytes aleatorios. Se guarda en `meta` y se sincroniza en
   `profiles.e2e_salt`.
2. `crypto_derive_key(frase, sal)` → Argon2id con 64 MiB de memoria, 3 pasadas, salida de
   32 bytes. Los parámetros de memoria son el verdadero coste para un atacante.
3. `crypto_key_fingerprint(clave)` → SHA-256 con dominio propio. Se guarda en el servidor
   para poder decir «frase incorrecta» sin que el servidor sepa la clave.
4. `crypto_encrypt` → AES-256-GCM con nonce aleatorio de 12 bytes por mensaje. Formato del
   payload: `wf1.<nonce_b64>.<ciphertext_b64>`. El prefijo permite migrar de esquema en el
   futuro sin romper lo ya guardado.

La clave derivada vive **solo en memoria del proceso** (`sessionKey` en
`src/lib/crypto.ts`). Cerrar la app la borra.

### Lo que este diseño NO protege

- No cifra la base local. Quien tenga acceso físico y desbloqueado a tu Windows puede
  abrir el `.db`. Si eso importa, la respuesta correcta es BitLocker, no cifrar dos veces.
- No protege contra un cliente comprometido. Si alguien controla la app en tu equipo, ve
  el texto en claro por definición.

---

## 5. Sincronización

Algoritmo por tabla, en `src/lib/sync.ts`:

```
SUBIR   filas con dirty = 1  →  upsert en Postgres  →  dirty = 0
BAJAR   filas con updated_at > cursor
        ├─ no existe local           → insertar
        ├─ local limpio y rev remoto mayor → actualizar
        └─ local sucio Y rev remoto ≥ local → CONFLICTO
                                              (se guarda, no se pisa nada)
```

El cursor por tabla se guarda en `sync_cursors`, así que bajar es incremental: volver de
un viaje de dos semanas sin red no descarga toda la base.

**Por qué `rev` y no solo `updated_at`.** Los relojes de dos ordenadores no coinciden. Un
portátil con la hora atrasada podría hacer que sus escrituras «perdieran» siempre. `rev` es
un contador monotónico por fila que no depende del reloj; `updated_at` solo desempata.

### Elección deliberada: resolución manual

Muchas apps hacen *last write wins* en silencio. Para un diario, perder un párrafo escrito
en el avión porque el móvil sincronizó después es inaceptable. Aquí el conflicto se
registra y lo resuelves tú en Ajustes. Es más fricción, y es la fricción correcta.

---

## 6. Autenticación con Google en el escritorio

El navegador incrustado no puede hacer OAuth con Google (lo bloquean desde 2021 por
seguridad). La solución estándar en escritorio es:

1. La app pide a Supabase la URL de autorización con **PKCE** (`skipBrowserRedirect`).
2. Se abre en el **navegador del sistema** con el plugin `opener`.
3. Google → Supabase → redirección a `writeflow://auth-callback?code=…`.
4. Windows despierta la app por el esquema registrado (`tauri-plugin-deep-link`).
5. `exchangeCodeForSession(code)` canjea el código y guarda la sesión.

El plugin `single-instance` garantiza que el enlace llegue a la ventana ya abierta en vez
de arrancar una segunda copia.

---

## 7. Contenido semilla

Los tres archivos de `src/data/` no son adorno: son la diferencia entre una app vacía y
una que sirve el primer día. Se investigaron de fuentes reales y se empaquetan con el
binario, así que funcionan en un avión.

| Archivo | Contenido | Fuentes |
|---|---|---|
| `prompts.json` | 107 prompts diarios en tres corrientes | Marco Aurelio, Séneca, Epicteto; Montaigne, Nietzsche, Kierkegaard, Weil; Neff, ACT, IFS, Pennebaker |
| `therapyExercises.json` | 47 ejercicios en 3 niveles | White & Epston, De Shazer & Berg, Nardone, ACT, Pennebaker, Gilbert |
| `essayTemplates.json` | 13 plantillas con guía por sección | Toulmin, Rogers, Gibbs, IMRyD, análisis literario, op-ed |

El prompt del día es **determinista**: un hash de la fecha más las corrientes activas
elige el índice. Abrir la app tres veces el mismo día muestra el mismo texto, sin estado
guardado y sin red.

---

## 8. Estado actual y siguiente tramo

**Terminado**

- Armazón completo, navegación de los cuatro módulos, tema claro/oscuro
- Editor tipo procesador de textos: barra completa, tablas, listas de tareas, tipografías,
  colores, modo concentración y máquina de escribir
- Diario completo: calendario con densidad por día, entradas múltiples por día, ánimo,
  energía, lugar, etiquetas, favoritos, búsqueda global, racha y estadísticas
- Prompt diario con tres corrientes configurables y botón de «otro»
- Novela: binder con arrastrar y soltar, inspector con ficha y metadatos, fichas de
  personaje de 14 campos, tablero de tarjetas y líneas de trama con beats
- Ensayos: 13 plantillas, creación de secciones desde plantilla, guía por sección y
  progreso de palabras por sección
- Terapia: catálogo por nivel y escuela, sesión con consigna y preguntas de seguimiento,
  historial, sugerencia de ejercicio no visitado
- Cifrado E2E funcionando, con pruebas en Rust
- Motor de sincronización con detección y resolución de conflictos
- Respaldo a GitHub en un commit
- Exportación nativa a `.docx` (dos presentaciones: libro y manuscrito estándar) y a
  `.epub` 3, más Markdown y HTML. Generadas en el cliente con carga diferida
- Exportación del diario por meses a un único documento
- Objetivo diario de palabras contando el incremento neto por guardado, con racha,
  récord y mapa de actividad anual de escala secuencial
- Búsqueda global con FTS5 sobre los cinco tipos de contenido, con navegación por
  teclado y salto directo al documento
- «En este día»: entradas del mismo día y mes de años anteriores, en el diario y en
  Inicio
- Flujo de GitHub Actions que produce `.exe` y `.msi`
- Salida de archivos en Android por el menú de compartir del sistema
- Imágenes desde el disco, incrustadas y reescaladas, con soporte real en `.docx` y
  `.epub`
- Reordenar arrastrando en el binder, el tablero de tarjetas y las líneas de trama

**Pendiente, por orden de utilidad**

1. Instantáneas de versión por documento, al estilo de los *snapshots* de Scrivener.
3. Sincronizar `daily_stats` para que la racha sea la misma en todos los equipos.
4. Descarga de plantillas de ensayo adicionales desde un repositorio en línea.
5. Que «en este día» contemple el 29 de febrero (hoy, un año bisiesto no encuentra
   recuerdos del 29 en años normales).
6. Versión para iOS: el mismo camino que Android, pero exige un Mac para compilar.

### La clave de cifrado tiene que ser la misma en todos los equipos

La clave se deriva de la frase de paso **y de una sal aleatoria** (Argon2id). Esa sal es
pública y se guarda en `profiles.e2e_salt` justamente para que un ordenador nuevo llegue
a la misma clave con la misma frase.

Durante un tiempo el código solo la **subía**. Un segundo equipo se generaba la suya en
`setupPassphrase`, derivaba otra clave, y a partir de ahí cada uno escribía en Supabase
algo que el otro no podía leer. Lo que convirtió un despiste en un fallo difícil de ver
fue que `decodeRow` se tragaba el error de descifrado y dejaba el campo vacío: la
sincronización decía «2 bajadas» y las entradas aparecían en blanco. Un fallo silencioso
que produce datos vacíos es peor que un error.

Ahora:

- `ensureProfile` **compara las huellas antes de subir nada** y aborta con
  `ClaveDistintaError` si no coinciden. Subir con la clave equivocada es lo que
  transforma un error de configuración en datos ilegibles.
- `adoptRemoteKeyMaterial` pide la frase de paso, la deriva **contra la sal del
  servidor** y solo acepta si la huella cuadra. No se toca nada si no.
- `decodeRow` cuenta los fallos y `syncNow` los reporta.
- `ClaveCompartida.tsx` (Ajustes → Sincronización) solo aparece cuando hay algo que
  arreglar, y ofrece `volverASubirTodo` / `volverABajarTodo` para reparar lo ya subido:
  el equipo con el texto bueno lo vuelve a cifrar y sube con `rev` mayor; el otro
  reinicia los cursores y lo vuelve a bajar.

Dos cosas más salieron de tirar de este hilo:

- **Lo que se bajaba no entraba en el índice de búsqueda.** `reindex` solo se llamaba
  desde los guardados de la interfaz, así que una entrada sincronizada aparecía en el
  calendario pero no en `Ctrl` + `K`.
- **Las fechas se comparaban como texto mezclando formatos.** Postgres devuelve
  `…+00:00` y la aplicación escribe `…Z`; el mismo instante ordenaba distinto y el
  desempate por fecha salía al revés. `aIso` normaliza al bajar.

Y una de interfaz: lo que se bajaba entraba en SQLite pero las pantallas abiertas seguían
enseñando lo que leyeron al montarse. `syncNow` emite `writeflow:sincronizado` y
`useRefrescoTrasSync` hace que las vistas recarguen.

### Una fila que no se entiende no se escribe

Esta regla costó datos reales, así que conviene no tocarla.

El motor descifraba lo que bajaba y, si fallaba, dejaba el campo **vacío** y
seguía adelante. Con dos equipos cifrando con claves distintas, la cadena era:

1. Llega una entrada que este equipo no puede descifrar.
2. Se guarda en local con el contenido en blanco.
3. El usuario pulsa «volver a subir todo» para reparar.
4. Esa fila vacía sube con `rev` mayor y **pisa la copia buena del servidor**.
5. El otro equipo se la baja y pisa **su** copia buena.

Un texto que existía en dos ordenadores desaparece de los dos, y sin un solo
error por el camino. Ahora hay dos cinturones:

- `decodeRow` devuelve `null` si algo no se descifra, y `pullTable` **se salta
  la fila entera**: ni inserta ni actualiza. El cursor **sí** avanza, a propósito:
  pararlo en la fila ilegible dejaría el resto de la tabla sin sincronizar para
  siempre si la clave no aparece nunca. Para recuperarlas cuando ya haya clave
  está «Volver a bajarlo todo», que reinicia los cursores.
- `volverASubirTodo` **no reenvía filas vacías** en las tablas cuyo texto viaja
  cifrado. Si no hay contenido no hay nada que reparar, y quedarse quieto no
  pierde nada mientras que subir sí puede destruir lo ajeno.

La lección general: ante un dato ilegible, **no escribir** es siempre más seguro
que escribir un valor por defecto. Un vacío se propaga; una fila que falta, no.

### El teclado y WebView2

Si se cambia la distribución de teclado de Windows con la aplicación abierta,
WebView2 se queda con la anterior: se escribe con el mapa inglés aunque Windows
diga español, sin tildes ni ñ. Es un fallo del componente de Microsoft
([WebView2Feedback#4333](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4333)),
está abierto desde hace más de un año y afecta también a Teams y Outlook. No se
puede arreglar desde el código de la aplicación.

Lo único que lo resuelve es reiniciar, así que hay un botón en **Ajustes →
Teclado** que llama a `app.restart()`. No es un arreglo; es ahorrarle al usuario
cerrar y abrir a mano cada vez.

### Reordenar arrastrando

Estructurar una novela es casi solo mover cosas de sitio, así que el arrastre del binder
tiene tres cuidados que no son adorno:

- **Se ve dónde va a caer antes de soltar**: una línea entre dos filas si va al lado, un
  recuadro si va dentro de una carpeta. Sin eso hay que soltar para averiguar qué pasa.
- **Las carpetas tienen tres zonas**, no dos: arriba «antes», abajo «después» y el tercio
  central «dentro». Con solo dos mitades no habría forma de meter una escena en un
  capítulo que ya tiene hijos.
- **Una carpeta no puede caer dentro de sí misma.** Sería una rama colgando de su propio
  nieto: desaparece de la pantalla y no hay manera de sacarla arrastrando.

Y se reordena **sin ratón** con `Alt` + flechas. Arrastrar con precisión es incómodo para
mucha gente, y en un árbol largo lo es para todo el mundo.

La lógica vive en `src/lib/reordenar.ts`, en funciones puras sobre listas de
identificadores: la interfaz decide *dónde* se ha soltado, y ese módulo decide *qué orden*
queda. Es lo que se puede probar de verdad, y son 20 comprobaciones.

Dos detalles con motivo:

- **Se renumera la lista entera** (0, 100, 200…) en vez de buscar un hueco entre dos
  vecinos. Buscar hueco es más rápido pero se degrada: tras unas cuantas inserciones
  entre las mismas dos tarjetas los números se juntan hasta chocar, y el orden pasa a
  decidirlo cómo ordene SQLite los empates.
- **`reordenarLote` no toca las filas que no cambian.** Si reescribiera la lista entera,
  cada arrastre marcaría diez documentos como pendientes de subir y la sincronización
  acabaría moviendo texto que nadie ha editado.

### El banco de pruebas del escritorio

`scripts/preview-escritorio.mjs` (`npm run test:ui`) levanta la interfaz real en Chromium
con un puente de Tauri que va contra un **SQLite de verdad** con las migraciones de
verdad. Lo único simulado es el transporte. Sirve para lo que no se puede comprobar
leyendo el código: que arrastrar una escena la deja donde se ve que va a caer.

Un aviso para quien lo amplíe: **los eventos de arrastre hay que separarlos en el
tiempo**. Los manejadores guardan qué se arrastra en el estado de React, y lanzar
`dragstart`, `dragover` y `drop` en el mismo tic hace que los dos últimos lean el estado
anterior —todavía vacío— y no pase nada. En un arrastre real median fotogramas; en la
prueba hay que reproducir esa pausa o se está probando otra cosa.

### Sobre las imágenes

Se guardan **dentro del documento**, como data URL, y no como archivos en una carpeta
con una ruta en el JSON. La razón no es la comodidad: WriteFlow sincroniza documentos,
no carpetas. Una ruta local no significa nada en el móvil, así que el capítulo con la
foto se vería roto justo en el dispositivo donde se prometió poder leerlo. Incrustada,
la imagen se cifra, se sincroniza y se exporta con el resto del documento, sin un
segundo canal que mantener.

El precio es el tamaño, y se paga en la puerta: toda imagen se reescala al entrar a
1600 px de lado mayor y se recodifica en JPEG de calidad 0,82 (`src/lib/imagenes.ts`).
Los PNG con transparencia se quedan en PNG —convertirlos les pondría fondo negro— y los
GIF no se tocan, porque pasarlos por un lienzo perdería la animación. Una foto de móvil
de cuatro megas termina en unos 250 KB.

1600 px sale de lo que cabe en el ancho útil de un A4 a 300 ppp; por encima de eso solo
se engorda el archivo. La comprobación de transparencia muestrea el canal alfa en vez de
recorrerlo entero: basta un píxel para decidir el formato.

En el `.docx` la imagen conserva su proporción real y se limita al ancho de la caja de
texto. Antes iba fija a 460×300, que deformaba cualquier cosa que no fuera casi
cuadrada. Las dimensiones se leen de las cabeceras de los bytes (`medirImagen`), no con
un lienzo, porque el exportador también corre en Node durante las pruebas.

En el `.epub` hay que **sacarlas a archivos**: un `data:` en un EPUB es inválido, tiene
que figurar en el manifiesto, y los lectores o descartan la imagen o rechazan el libro.
`extraerImagenes` las vuelca en `OEBPS/imagenes/`, reescribe el `src` y las declara,
guardando una sola copia de las repetidas.

### Sobre Android

La decisión de Tauri, tomada el primer día por el tamaño del instalador, resultó
además ser la que permitió el móvil sin reescribir nada: el núcleo en Rust y todo el
código de datos compilan para ARM sin un cambio.

Lo que sí se bifurca es la presentación, y se decide en un solo sitio
(`src/lib/platform.ts`) combinando sistema operativo y ancho de ventana. Que el ancho
cuente permite desarrollar y fotografiar la interfaz táctil en el navegador del
escritorio: sin eso, cada ajuste de un margen exigiría compilar un APK.

En el móvil la novela y los ensayos se leen pero no se editan. No es una limitación
técnica: es que un binder con arrastrar y soltar, un inspector y un tablero de tramas
no caben en vertical, y forzarlos produce dos herramientas peores en lugar de una buena.

Detalle que cuesta descubrir: los esquemas propios (`writeflow://`) hay que declararlos
a mano en el `AndroidManifest.xml`. La configuración `mobile` del plugin de enlaces
profundos es para App Links con `https`, no para esto.

### Sobre la búsqueda

El índice vive en dos tablas: `search_fts` (FTS5, solo texto) y `search_docs` (identidad
de la fila). Meter los metadatos como columnas `UNINDEXED` dentro de la tabla FTS habría
sido más corto, pero actualizar una entrada obligaría a recorrerla entera, porque una
columna no indexada no tiene índice por el que buscarla. Con el `rowid` compartido, editar
una escena cuesta dos sentencias con clave primaria.

La consulta del usuario nunca llega cruda a `MATCH`: FTS5 tiene operadores propios y una
consulta mal formada **lanza una excepción**, no devuelve cero filas. `toMatchQuery`
entrecomilla cada palabra —lo que la neutraliza— y añade `*` solo a la última, que es lo
que hace que aparezcan resultados mientras se teclea.

`remove_diacritics 2` es lo que permite que «cafe» encuentre «café». Sin eso, escribir en
español con prisa no encuentra nada, y nadie pone las tildes en un buscador.

### Sobre la exportación

`docx.ts` y `epub.ts` no comparten código a propósito: uno emite OOXML mediante la
librería `docx` y el otro construye el zip del EPUB a mano con JSZip. Intentar un árbol
intermedio común habría hecho ambos peores, porque las dos especificaciones difieren
justo en lo que importa (sangrías y saltos de página frente a semántica de documento).
Lo que sí comparten es la entrada: el JSON de TipTap, que ya es un árbol estructurado.

El formato de manuscrito no es decoración. Un lector profesional calcula la extensión
por páginas a 250 palabras: cuerpo 12, doble espacio y márgenes de una pulgada no son
gusto tipográfico sino una unidad de medida compartida.
