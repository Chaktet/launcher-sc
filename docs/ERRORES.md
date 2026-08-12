# Códigos de error de arranque (SC-01 … SC-15)

> Estado verificado: 2026-08-06. Definidos en [landing.js](../app/assets/js/scripts/landing.js),
> constante `SC_ERR`.

Antes, cualquier fallo enseñaba el mismo diálogo genérico y el jugador no tenía nada que aportar en
un ticket. Ahora **cada punto donde el arranque puede fallar tiene su propio código**, el jugador ve
una explicación en cristiano y un botón que copia un informe completo al portapapeles.

## Tabla de códigos

| Código | Constante | Qué ha pasado | Primera cosa que mirar |
|---|---|---|---|
| **SC-01** | `DISTRO` | No se pudo leer la lista de archivos del servidor | ¿Responde `descargas.servidorcobblemon.es`? |
| **SC-02** | `JAVA` | Fallo descargando o instalando Java | Red, o la API de Adoptium caída |
| **SC-03** | `VERIFICACION` | Fallo verificando archivos ya descargados | Disco lleno o antivirus |
| **SC-04** | `DESCARGA` | Fallo descargando mods o recursos | Red, o el servidor de descargas |
| **SC-05** | `REPARACION` | El proceso de reparación murió | Permisos sobre el directorio de datos |
| **SC-06** | `JVM` | El juego no llegó a arrancar (genérico) | El informe adjunto |
| **SC-07** | `LAUNCHWRAPPER` | Faltan librerías de arranque | Descarga incompleta; forzar reparación |
| **SC-08** | `RAM` | Memoria asignada imposible para este equipo | Bajar la RAM en Ajustes |
| **SC-09** | `CUENTA` | Problema con la cuenta seleccionada | Volver a iniciar sesión |
| **SC-10** | `JAVA_ROTO` | La instalación de Java está incompleta o dañada | **Antivirus.** Ver abajo |
| **SC-11** | `MEMORIA` | El juego se quedó sin memoria | Subir RAM, o pasar a LITE |
| **SC-12** | `GRAFICOS` | Tarjeta gráfica o drivers: no se pudo crear la ventana | Actualizar drivers |
| **SC-13** | `DRIVER_SODIUM` | Sodium rechaza el driver por incompatible | Una versión **concreta**. Ver abajo |
| **SC-14** | `JAVA_BLOQUEADO` | Java se instaló pero no puede ejecutarse | **Antivirus.** Ver abajo |
| **SC-15** | `MOD_ILEGIBLE` | El juego no pudo abrir un archivo del pack | Que **reintente**. Ver abajo |

## El informe de diagnóstico

`scInformeDiagnostico()` genera un texto plano con:

```
=== INFORME SC LAUNCHER ===
Codigo / Fecha / Launcher (versión) / Version (PRO o LITE)
SO / CPU / RAM total y libre / RAM asignada al juego
Java (ruta del ejecutable) / Directorio de datos
--- ERROR ---
<stack real>
```

Se guarda además en `<dataDir>/informes/<CODIGO>-<timestamp>.txt` y el botón del diálogo abre esa
carpeta en el explorador. **Es lo que hay que pedir en un ticket.**

Si lo que falla es el launcher y no el juego (cuelgues, login, actualizaciones), lo que hace falta es
otra cosa: `<userData>/logs/launcher.log`, accesible desde **Ajustes → Ver registro del launcher**.

## Detección automática de causa

Cuando el juego se cierra con código distinto de 0 **y no llegó a conectar**,
`scAnalizarCierreDelJuego()` intenta averiguar por qué en vez de dejarlo en SC-06. Analiza la salida
acumulada del juego (últimos 200 fragmentos) **más el informe de fallo de Minecraft** si hay uno
reciente (menos de 5 minutos) en `crash-reports/`.

Ese informe hace falta porque **muchos fallos de gráficos no aparecen por la salida**: van
directamente al crash report.

> ⚠ **Se recoge de stdout Y de stderr.** Minecraft manda su registro (log4j) por **stdout**. Hasta la
> 1.5.9 solo se escuchaba stderr, así que el texto analizado llegaba casi siempre vacío y **todo
> acababa en el SC-06 genérico** aunque el mod hubiera explicado el motivo. Si vuelves a tocar los
> listeners de [landing.js](../app/assets/js/scripts/landing.js), no quites el `scAnotarSalida()` de
> `tempListener`: es el que lee el registro del juego.

### SC-12 · Gráficos

Minecraft 1.21 necesita OpenGL 3.2 y Sodium 4.3. Con drivers viejos, ausentes o los genéricos de
Windows, el juego ni siquiera crea la ventana.

`PATRONES_GRAFICOS` cubre: fallos de GLFW y de contexto OpenGL, el renderizador por software de
Windows (`GDI Generic`, `llvmpipe`, `swiftshader`), y los ICD de los tres fabricantes por generación
— NVIDIA (`nvoglv32/64`, `nvd3dum`, `nvapi`…), AMD (`atioglxx`, `amdvlk`, `aticfx`…) e Intel
(`ig4icd`/`ig7icd`/`ig9icd`/`igxelpicd`, Arc/Xe). También caídas con
`EXCEPTION_ACCESS_VIOLATION` dentro de una biblioteca gráfica, y avisos del propio Sodium o Iris.

Si se identifica el fabricante, el diálogo enseña **su enlace de drivers concreto** en vez de los
tres (`landing.launch.errGraficosNvidia` / `errGraficosAmd` / `errGraficosIntel`).

### SC-13 · Sodium rechaza el driver

Va **antes** que SC-12 a propósito. Sodium comprueba el driver antes de arrancar y se niega a seguir
con los que sabe que cuelgan el juego; muestra un diálogo nativo, lo registra y **se cierra con
código 1 sin generar crash report**. Aquí "actualiza los drivers" no vale: hace falta **una versión
concreta**, y en el caso de Intel **Windows Update entrega una más antigua**, así que hay que bajarla
a mano. Mandar al jugador a Windows Update es meterlo en un callejón sin salida.

El mensaje se detecta literal y se extraen las dos versiones para enseñárselas:

| Fabricante | Versión que exige Sodium | Dónde se baja |
|---|---|---|
| Intel Gen7 (HD 2500/4000, Ivy Bridge) | `10.18.10.5161` — paquete **15.33.53.5161** | `intel.com/content/www/us/en/download/18606` |
| NVIDIA | `536.23` | `nvidia.com/es-es/drivers` |

Si el instalador de Intel dice que no está validado para ese equipo (típico en portátiles de marca):
Administrador de dispositivos → Adaptadores de pantalla → Actualizar controlador → Buscar en mi PC →
Elegir de una lista → Usar disco.

> Existe `-Dsodium.checks.issue899=false` para saltarse la comprobación, confirmado en el `BugChecks`
> del jar. **No lo ofrezcas**: el [wiki de Sodium](https://github.com/CaffeineMC/sodium/wiki/Driver-Compatibility)
> dice que con esos drivers el juego se congela o peta al arrancar, así que solo cambia un mensaje
> claro por un cuelgue.

### SC-14 · Java instalado pero bloqueado

`discoverBestJvmInstallation()` de helios-core **no mira los ficheros: ejecuta** cada candidato
(`java -XshowSettings:properties -version`). Si no responde, lo descarta en silencio con un
`Skipping invalid JVM candidate` y devuelve `null` — exactamente el mismo resultado que si no
hubiera Java.

Hasta la 1.5.9 eso producía un **bucle**: el launcher ofrecía "Instalar Java", el jugador aceptaba,
se descargaba y extraía bien, se volvía a escanear, seguía sin validar, y **reaparecía el mismo
cuadro sin mensaje ni código**. Se podía repetir indefinidamente.

Ahora `downloadJava()` valida con `validateSelectedJvm()` **antes** de volver a escanear. Si el Java
recién instalado no arranca, corta y muestra SC-14 con la ruta.

La causa es casi siempre el **antivirus**, que bloquea lo recién descargado en `AppData`.

### El diálogo lo resuelve solo (desde 1.5.11)

Pedirle a un jugador que "añada una excepción en su antivirus" es pedirle demasiado. El diálogo
ahora se adapta al equipo:

1. `scDetectarAntivirus()` pregunta a Windows qué antivirus hay (WMI, `root\SecurityCenter2`). Es
   solo lectura y devuelve además **la ruta del ejecutable** del antivirus.
2. Según lo que encuentre, el botón principal cambia:

| Antivirus detectado | Botón | Qué hace |
|---|---|---|
| **Windows Defender** | *Arreglarlo por mí* | Añade la exclusión y reinstala Java. Un clic |
| Uno de terceros conocido | *Abrir mi antivirus* | Le abre su app y le enseña la ruta de clics de **ese** producto |
| Nada identificable | *Copiar la ruta* | Copia y abre la carpeta en el explorador |

Hay pasos concretos escritos para Avast, AVG, Kaspersky, Bitdefender, Norton, McAfee, ESET,
Malwarebytes y Panda (`landing.launch.av*` en `_custom.toml`).

> **Sobre la exclusión automática.** Solo ocurre si el jugador pulsa el botón, y **el aviso de
> administrador de Windows (UAC) es la confirmación**: si lo cancela, no se toca nada. Se excluye
> únicamente `<dataDir>/runtime`, la carpeta de Java del propio launcher — nunca una unidad entera.
> Se hace con `Add-MpPreference -ExclusionPath` lanzado con `-Verb RunAs`.
>
> ⚠ **Tras excluir hay que reinstalar Java, y por eso el botón hace las dos cosas.** La exclusión
> evita bloqueos futuros pero **no devuelve lo que ya esté en cuarentena**: si solo se excluyera, el
> jugador seguiría sin poder jugar y creería que no ha servido de nada.

Alternativa que siempre funciona: instalar Java 21 x64 a mano desde `adoptium.net` con el **`.msi`**
— al quedar en Archivos de programa, los antivirus no suelen molestarlo.

No confundir con **SC-10** (`JAVA_ROTO`): ahí Java arranca pero le faltan ficheros; aquí no llega ni
a ejecutarse.

### SC-10 · Java roto — y su reparación

Se detecta por `tzdb.dat`, `Error occurred during initialization of VM`,
`NoClassDefFoundError: java/…` o un `FileNotFoundException` apuntando a `runtime/` o `jdk-`.

Causa casi siempre: **el antivirus ha puesto ficheros del JDK en cuarentena**, o una extracción
interrumpida.

Este código es el único con acción de reparación en el propio diálogo. `scRepararJava()`:

1. Borra `<dataDir>/runtime/` entero
2. Pone el ejecutable de Java a `null` en la configuración
3. Guarda

En el siguiente intento el launcher se descarga Java de cero.

También se dispara desde `proc.on('error')`: si el proceso **ni siquiera llega a nacer** (ejecutable
borrado por el antivirus, permisos, ruta rota), Node emite `error` y **nunca** emite `close`. Sin ese
listener el botón JUGAR no volvía nunca y la guarda anti doble clic bloqueaba todos los intentos
siguientes — el launcher quedaba inservible hasta reiniciarlo.

### SC-08 · RAM imposible (comprobación previa)

`scComprobacionesPrevias()` corre **antes** de lanzar. Si la RAM máxima configurada supera el 92% de
la memoria física, la JVM no va a arrancar: se avisa con las dos cifras en el mensaje en vez de
dejar que falle con un error incomprensible.

### SC-11 · Sin memoria

`OutOfMemoryError`, `Could not reserve enough space`, `Failed to allocate`.

## Añadir un código nuevo

1. Añade la constante a `SC_ERR` con un comentario de una línea.
2. Añade el texto explicativo a `[landing.launch]` en [_custom.toml](../app/assets/lang/_custom.toml).
3. Llama a `scFalloArranque(SC_ERR.X, Lang.queryJS('landing.launch.errX'), err)`.
4. **Añádelo a la tabla de arriba** — es la que usa soporte.

`scFalloArranque()` ya se encarga de generar el informe, guardarlo, escribir en el registro, montar
el diálogo con el botón de copiar y devolver el botón JUGAR (`toggleLaunchArea(false)`).

### SC-15 · El juego no pudo abrir un archivo del pack

Fabric muere en el descubrimiento de mods porque **un `.jar` está pero no se deja leer**:

```
ModResolutionException: Mod discovery failed!
Error analyzing [...\common\mods\fabric\generated\fabricmod\fullscreenfix\2.4.1\fullscreenfix-2.4.1.jar]
java.io.FileNotFoundException: ... (Access is denied)
```

Antes esto salía como **SC-06**, y ese mensaje es *activamente dañino*: le dice al jugador que baje
la RAM cuando la JVM había arrancado perfectamente. Volvería a fallar igual.

> ⛔ **La detección NO se ancla en `Access is denied`.** Ese texto lo escribe Windows en el **idioma
> del sistema**: en español es `Acceso denegado`. Un patrón sobre él fallaría en silencio para la
> mayor parte de nuestra base de jugadores. Se ancla en `ModResolutionException` / `Mod discovery
> failed` más la clase de excepción de Java, que son invariantes de idioma. **No lo cambies.**

Va **antes** del bloque de gráficos: `scUltimoCrashReport()` pega cualquier informe de los últimos
5 minutos, y un cierre gráfico anterior desviaría este caso a SC-12. Y si la ruta ilegible cae dentro
de `runtime/` o contiene `jdk-`, se cede a **SC-10** con una marca explícita, no confiando en el orden.

#### La escalera de acciones

Lo más probable es que el antivirus estuviera **escaneando** el archivo justo cuando el juego lo
abrió — un bloqueo momentáneo, típico del primer arranque tras instalar. Eso se arregla reintentando.
Por eso **no se pide administrador de entrada**: mandar a alguien a bajar defensas para un problema
que se resolvía solo es el peor desenlace posible.

| Intento | Botón | Qué hace | ¿Permisos? |
|---|---|---|---|
| 1º | *Reintentar* | Relanza sin más | No |
| 2º | *Descargarlo de nuevo* | Borra la carpeta de versión y redescarga | No |
| 3º | *Revisar el antivirus* | Detecta el antivirus y ofrece la exclusión | UAC |

`scIntentosPorFichero` (un `Map` por ruta) lleva la cuenta. **Máximo un reintento y una reparación
por archivo y sesión**: sin ese tope la escalera es un bucle — borrar, redescargar, el antivirus
vuelve a escanear el archivo recién escrito, mismo fallo.

Las sondas (`lstatSync`) sirven **solo para descartar, nunca para confirmar**: bajo la hipótesis
principal el launcher abre el archivo sin problema mientras `javaw.exe` no puede, así que un "todo
correcto" no significa nada y no condiciona el diálogo. Detectan tres casos que el launcher sí
arregla solo y sin permisos: que sea una carpeta, que esté vacío, o que haya desaparecido.

> No copies el archivo a `%TEMP%` para "comprobar si se puede leer". Es el patrón de dropper de
> manual y puedes provocar la detección que intentabas descartar.

El mensaje es **factual, no causal**: el mismo error de Windows lo producen el antivirus, un borrado
a medias y unos permisos rotos. Solo se nombra al antivirus si `scDetectarAntivirus()` devolvió algo
**y** ya fallaron los pasos anteriores. Enseñar a añadir exclusiones para problemas que no son del
antivirus es a la vez un arreglo incorrecto y una rebaja de seguridad.

#### Alcance de la exclusión

Cuando se llega al tercer escalón se excluye `<commonDir>\mods`, **no** el directorio de datos
entero. Ahí es donde aterrizan los `.jar` que sirve nuestro CDN, así que cuanto más estrecha sea la
exclusión, menos superficie se abre si algún día la distribución se compromete.

Y si la carpeta **ya estaba excluida**, `scExclusionYaPuesta()` lo detecta (lectura, sin elevación) y
el diálogo lo dice en vez de volver a pedir UAC: si ya está excluida y sigue fallando, el antivirus
no es el culpable.

#### Lo que el launcher no puede hacer

- **Sacar un archivo de cuarentena.** Excluir no devuelve lo ya secuestrado; por eso toda exclusión
  va seguida de redescarga, y aun así puede hacer falta restaurarlo desde el propio antivirus.
- **Leer el historial de detecciones de Defender.** `Get-MpThreat` exige elevación, y devuelve vacío
  sin distinguirse de "no hay detecciones". Eso lo tiene que mirar el jugador.
- **Poner exclusiones en antivirus de terceros.** Solo Defender es automatizable.

#### Atajo para soporte

Si el archivo que falla es un mod **opcional**, el jugador puede desactivarlo en **Ajustes → Mods** y
jugar de inmediato: `resolveModConfiguration()` lo saca de la lista `--fabric.addMods` y Fabric ni lo
abre. No es reparación —el launcher lo sigue descargando— pero desbloquea al momento.
