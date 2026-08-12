# Subir este repositorio a GitHub

El repositorio ya está inicializado, con dos commits y el remoto `origin` apuntando a
`https://github.com/RafaDiazRios/writeflow.git`. Solo falta el push, que hay que hacer
desde tu ordenador: el entorno donde se construyó tiene un proxy de git que solo deja
escribir en los repositorios autorizados de la sesión.

## En Windows (PowerShell o Git Bash), dentro de la carpeta `writeflow`

```bash
git push -u origin main
```

Se abrirá el gestor de credenciales de Windows para que inicies sesión en GitHub. Si
prefieres usar el token:

```bash
git push -u https://TU_TOKEN@github.com/RafaDiazRios/writeflow.git main
```

## Después, para lanzar la compilación del instalador

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions compilará el `.exe` y el `.msi` y creará una release en borrador.

## Comprobación rápida antes de subir

```bash
git log --oneline     # deberías ver 2 commits
git status            # debería estar limpio
```

`.env` está en `.gitignore`, así que las credenciales de Supabase no se suben.
