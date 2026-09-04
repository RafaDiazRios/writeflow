# subir-version.ps1 — sube la version de WriteFlow en los cinco sitios donde se declara.
#
# Se ejecuta desde la raiz del repositorio:
#
#     .\subir-version.ps1 0.4.0
#
# Por que un guion y no editarlo a mano: son cinco ficheros, uno de ellos
# (Cargo.lock) tiene tres lineas «version = "0.3.0"» y solo una es nuestra —las
# otras dos son las cajas «dtor» y «urlpattern», que casualmente van por la misma
# version—, y en la v0.2.5 la etiqueta llego a empujarse sobre un commit que aun
# declaraba la version anterior porque un paso manual se salto sin que se notara.
#
# El guion no toca nada si algo no cuadra: cuenta las coincidencias que espera en
# cada fichero y aborta entero si alguna no aparece. Escribe sin BOM y respeta los
# finales de linea del fichero, asi que el diff sale limpio.

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version invalida: '$Version'. Se espera algo como 0.4.0"
}

# Nota: [IO.File]::ReadAllText con ruta relativa ignora el «cd» de PowerShell y
# lee desde otro sitio. Todas las rutas van absolutas.
$raiz = (Get-Location).Path
if (-not (Test-Path (Join-Path $raiz 'package.json'))) {
    throw "No encuentro package.json en $raiz. Ejecuta esto desde la raiz del repositorio."
}

$sinBom = New-Object System.Text.UTF8Encoding($false)
$cambios = @()

function Subir {
    param(
        [string]$Relativa,
        [string]$Patron,
        [int]$Esperadas,
        [string]$Que
    )

    $ruta = Join-Path $raiz $Relativa
    if (-not (Test-Path $ruta)) { throw "No existe: $Relativa" }

    $texto = [IO.File]::ReadAllText($ruta)
    $re = [regex]$Patron
    $encontradas = $re.Matches($texto).Count

    if ($encontradas -ne $Esperadas) {
        throw "$Relativa : esperaba $Esperadas coincidencia(s) de $Que y he encontrado $encontradas. No se ha tocado ningun fichero."
    }

    $anterior = $re.Match($texto).Groups[2].Value
    $nuevo = $re.Replace($texto, ('${1}' + $script:Version + '${3}'))

    if ($nuevo -eq $texto) {
        Write-Host ("  = {0,-28} ya estaba en {1}" -f $Relativa, $script:Version)
        return
    }

    [IO.File]::WriteAllText($ruta, $nuevo, $script:sinBom)
    Write-Host ("  + {0,-28} {1} -> {2}   ({3} linea(s))" -f $Relativa, $anterior, $script:Version, $encontradas)
    $script:cambios += $Relativa
}

# Los patrones NO se anclan en el fin de linea: los ficheros van en CRLF, y en
# .NET el «$» de un patron multilinea casa antes del \n pero despues del \r, asi
# que un patron que acabe en «$» no encuentra nada. Con el ancla de principio de
# linea y las comillas de cierre basta para que cada uno case donde debe.
$semver = '\d+\.\d+\.\d+'

Write-Host ""
Write-Host "Subiendo WriteFlow a $Version"
Write-Host ""

# 1. package.json — la unica clave "version" del fichero.
Subir 'package.json' ('(?m)^(  "version": ")(' + $semver + ')(")') 1 'la version del paquete'

# 2. package-lock.json — dos: la de arriba y la de packages."". Se ancla en el
#    "name": "writeflow" que las precede a las dos; sin eso, el patron pillaria
#    la clave "version" de cada una de las 273 dependencias.
Subir 'package-lock.json' ('(?m)^(\s*"name": "writeflow",\r?\n\s*"version": ")(' + $semver + ')(")') 2 'la version del proyecto'

# 3. tauri.conf.json — es la que acaba en el nombre del instalador.
Subir 'src-tauri/tauri.conf.json' ('(?m)^(  "version": ")(' + $semver + ')(")') 1 'la version de la aplicacion'

# 4. Cargo.toml — al principio de linea, bajo [package]. Las «version» de las
#    dependencias van dentro de llaves y nunca empiezan la linea.
Subir 'src-tauri/Cargo.toml' ('(?m)^(version = ")(' + $semver + ')(")') 1 'la version de la caja'

# 5. Cargo.lock — la trampa. Se ancla en el nombre para no tocar las otras cajas
#    que comparten numero de version.
Subir 'src-tauri/Cargo.lock' ('(?m)^(name = "writeflow"\r?\nversion = ")(' + $semver + ')(")') 1 'la version de writeflow'

Write-Host ""
if ($cambios.Count -eq 0) {
    Write-Host "Nada que hacer: los cinco ficheros ya declaraban $Version."
} else {
    Write-Host ("Listo: {0} fichero(s) actualizado(s)." -f $cambios.Count)
}
Write-Host ""
Write-Host "Comprueba el resultado antes de confirmar:"
Write-Host "  git diff --stat"
Write-Host "  git diff -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json"
Write-Host ""
