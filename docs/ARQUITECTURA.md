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

**Pendiente, por orden de utilidad**

1. Adjuntar imágenes desde el disco con copia a la carpeta de datos (hoy solo por URL,
   y por eso tampoco se incrustan en el `.docx`).
2. Reordenar escenas arrastrando en el tablero de tarjetas.
3. Instantáneas de versión por documento, al estilo de los *snapshots* de Scrivener.
4. Sincronizar `daily_stats` para que la racha sea la misma en todos los equipos.
5. Descarga de plantillas de ensayo adicionales desde un repositorio en línea.
6. Que «en este día» contemple el 29 de febrero (hoy, un año bisiesto no encuentra
   recuerdos del 29 en años normales).

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
