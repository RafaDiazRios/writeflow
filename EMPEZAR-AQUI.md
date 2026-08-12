# Qué tienes que hacer, paso a paso

Tres bloques. El primero es el único con algo de tela; los otros dos son copiar y pegar.

- **Bloque A** — Login con Google (15 min, una sola vez)
- **Bloque B** — Subir el código a GitHub (2 min)
- **Bloque C** — Arrancar la aplicación (10 min la primera vez)

Puedes hacerlos en cualquier orden. Si tienes prisa por ver la app funcionando, empieza
por el **C**: la aplicación funciona entera sin conexión y sin login. Google solo hace
falta para sincronizar entre ordenadores.

---

# BLOQUE A — Login con Google

Son dos webs. En Google creas una «llave»; en Supabase la pegas.

## A1. Crea el proyecto en Google

1. Abre 👉 **https://console.cloud.google.com/auth/overview**
2. Si te pide elegir o crear un proyecto, arriba a la izquierda hay un selector.
   Pulsa **Proyecto nuevo**, ponle de nombre `WriteFlow` y dale a **Crear**.
   Espera unos segundos a que se seleccione solo.
3. Verás una pantalla que dice **Google Auth Platform**. Pulsa **Comenzar**
   (*Get started*).

## A2. Rellena el formulario inicial

Te hará cuatro preguntas seguidas:

| Campo | Qué pones |
|---|---|
| Nombre de la aplicación | `WriteFlow` |
| Correo de asistencia | tu correo de Gmail |
| Público (*Audience*) | **Externo** (*External*) |
| Datos de contacto | tu correo de Gmail |

Acepta las condiciones y pulsa **Crear**.

> **Por qué «Externo»:** «Interno» solo existe si tienes Google Workspace de empresa.
> Con una cuenta normal de Gmail, la única opción válida es Externo.

## A3. Añádete como usuario de prueba

Esto es lo que más gente olvida y luego el login falla.

1. En el menú de la izquierda entra en **Público** (*Audience*)
   👉 https://console.cloud.google.com/auth/audience
2. Abajo verás **Usuarios de prueba** (*Test users*). Pulsa **+ Add users**.
3. Escribe tu correo: `rafael.diazrios@gmail.com`
4. **Guardar**.

> Mientras la app esté «En pruebas», solo los correos de esa lista pueden entrar.
> Con uno basta: eres el único usuario.

## A4. Crea el cliente OAuth

1. En el menú de la izquierda entra en **Clientes** (*Clients*)
   👉 https://console.cloud.google.com/auth/clients
2. Pulsa **+ Crear cliente** (*Create client*).
3. **Tipo de aplicación**: elige **Aplicación web** (*Web application*).

   ⚠️ **Aplicación web**, no «Aplicación de escritorio». Aunque WriteFlow sea un
   programa de escritorio, quien habla con Google es el servidor de Supabase.

4. **Nombre**: `WriteFlow escritorio` (da igual, es solo para ti).
5. **Orígenes autorizados de JavaScript**: déjalo **vacío**.
6. En **URIs de redirección autorizados** pulsa **+ Añadir URI** y pega EXACTAMENTE
   esta línea:

   ```
   https://rlnetaknsjzmsplbjmow.supabase.co/auth/v1/callback
   ```

   Sin espacios al final, sin barra `/` al final, con `https`.

7. Pulsa **Crear**.

## A5. Copia las dos credenciales

Aparecerá una ventana con dos valores. **No la cierres todavía.**

- **ID de cliente** → algo como `123456789012-a1b2c3d4e5f6.apps.googleusercontent.com`
- **Secreto de cliente** → algo como `GOCSPX-aBcDeFgH1234`

⚠️ El secreto **solo se muestra ahora**. Cópialos a un bloc de notas o pulsa el botón
de descargar el JSON.

> **Cómo saber que lo has copiado bien:** el ID de cliente SIEMPRE termina en
> `.apps.googleusercontent.com`. Si lo que tienes no termina así, no es el ID de
> cliente. (El error de antes fue justo ese: había un nombre de usuario en ese campo.)

## A6. Pégalas en Supabase

1. Abre 👉 **https://supabase.com/dashboard/project/rlnetaknsjzmsplbjmow/auth/providers**
2. Busca **Google** en la lista y despliégalo.
3. **Client IDs** → pega el ID de cliente (el largo que termina en
   `.apps.googleusercontent.com`).
4. **Client Secret** → pega el secreto (`GOCSPX-...`).
5. Asegúrate de que el interruptor **Enable Sign in with Google** está encendido.
6. Pulsa **Save**.

## A7. Comprueba la URL de retorno

1. Abre 👉 **https://supabase.com/dashboard/project/rlnetaknsjzmsplbjmow/auth/url-configuration**
2. En **Redirect URLs** tiene que aparecer esta línea exacta:

   ```
   writeflow://auth-callback
   ```

3. Si hubiera alguna entrada con asteriscos (`**` o `*`), **bórrala**: dejaría que
   cualquier dirección de internet recibiera tus credenciales.

**Y ya está el bloque A.** Dime que has terminado y lo verifico desde aquí: sabré
decirte si Google acepta las credenciales antes de que tengas que probar nada.

---

# BLOQUE B — Subir el código a GitHub

Necesitas **Git** instalado. Si no lo tienes: https://git-scm.com/download/win
(instalador siguiente-siguiente-siguiente, todo por defecto).

1. Descomprime el ZIP donde quieras tenerlo, por ejemplo en `C:\Proyectos\writeflow`.
2. Abre esa carpeta en el Explorador de Windows.
3. Haz **clic derecho dentro de la carpeta** → **Abrir en Terminal**
   (o **Git Bash Here**).
4. Escribe esto y pulsa Enter:

   ```bash
   git push -u origin main
   ```

5. Se abrirá una ventana para iniciar sesión en GitHub. Elige **Sign in with your
   browser** y autoriza.

Cuando termine, recarga https://github.com/RafaDiazRios/writeflow y verás el código.

### Opcional: que GitHub te compile el instalador

En la misma terminal:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Ve a la pestaña **Actions** del repositorio. En unos 10 minutos tendrás el `.exe` y el
`.msi` de Windows listos para descargar en **Releases** (estará como borrador: pulsa
*Publish*).

---

# BLOQUE C — Arrancar la aplicación en tu Windows

## C1. Instala lo necesario (una sola vez)

1. **Node.js** → https://nodejs.org — descarga la versión **LTS**, instalador por
   defecto.
2. **Rust** → https://rustup.rs — descarga `rustup-init.exe`, ejecútalo y pulsa
   **1** y Enter cuando pregunte.
3. **Herramientas de C++ de Visual Studio** → si el paso 2 se queja de que faltan,
   te dará el enlace. También vale este:
   https://visualstudio.microsoft.com/visual-cpp-build-tools/
   Al instalar, marca la casilla **«Desarrollo para el escritorio con C++»**.

Cierra y vuelve a abrir la terminal después de instalar, para que Windows se entere.

## C2. Arranca

En la carpeta del proyecto, en la terminal:

```bash
npm install
npm run app:dev
```

La primera vez tarda varios minutos (Rust está compilando). Se abrirá la ventana de
WriteFlow. A partir de ahí, arranca en segundos.

## C3. Primeros pasos dentro de la app

1. Te recibe la pantalla de **Inicio** con el prompt del día.
2. Pulsa **Diario** en la izquierda y escribe algo. Se guarda solo, no hay botón de
   guardar.
3. Ve a **Ajustes → Cifrado de extremo a extremo → Configurar frase de paso**.
   Elige una frase larga que recuerdes y **apúntala en tu gestor de contraseñas**.
   Sin ella no se puede recuperar lo que suba a la nube.
4. Cuando termines el bloque A, en **Ajustes → Sincronización** pulsa
   **Iniciar sesión con Google**.

## C4. Cuando quieras el instalador de verdad

```bash
npm run app:build
```

Te deja el `.exe` en `src-tauri\target\release\bundle\nsis\`. Lo instalas y ya tienes
WriteFlow en el menú de inicio como cualquier otro programa.

---

# Si algo falla

| Lo que ves | Qué pasa | Solución |
|---|---|---|
| `Error 401: invalid_client` | El ID de cliente está mal | Repite A4-A6. Tiene que terminar en `.apps.googleusercontent.com` |
| `Acceso bloqueado: no se ha completado el proceso de verificación` | No estás en la lista de prueba | Paso A3 |
| `redirect_uri_mismatch` | El URI de Google no coincide | Paso A6: exacto, sin barra final |
| La app abre el navegador pero no vuelve | Falta la Redirect URL en Supabase | Paso A7 |
| `error: linker link.exe not found` | Faltan las herramientas de C++ | Paso C1.3 |
| `npm no se reconoce` | Node no está en el PATH | Cierra y reabre la terminal |
