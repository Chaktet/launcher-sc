# Códigos de error de arranque (SC-01 … SC-18) y del juego (SC-90 … SC-93)

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
| **SC-04** | `DESCARGA` | Fallo descargando mods o recursos | La línea `TLS:` del informe. Ver abajo |
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
| **SC-16** | `DISCO` | No cabe en el disco lo que falta por descargar (más 512 MB de margen) | Liberar espacio; el mensaje dice cuánto queda y la carpeta |
| **SC-17** | `NATIVAS` | Falta `lwjgl.dll` (u otra nativa) al arrancar: Sodium muere en preLaunch con `UnsatisfiedLinkError: Failed to locate library` | Reintentar; si se repite, excluir la carpeta del launcher y `%TEMP%` del antivirus y cerrar limpiadores |
| **SC-18** | `MODS_PROPIOS` | Algo no casa (`NoSuchMethodError`, clase que falta, mixin, mod repetido) y el jugador tiene mods añadidos por su cuenta en `mods/` (Ajustes → Mods). Sale al arrancar y a media partida | El diálogo le lista sus mods: que los desactive y los active de uno en uno |

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

### SC-17 · Falta lwjgl.dll al arrancar (1.16.13)

Informe de un jugador del 18-10-2026: `UnsatisfiedLinkError: Failed to locate library: lwjgl.dll` dentro de
`SodiumPreLaunch` → `GraphicsAdapterProbe`. El launcher extrae las librerías nativas en
`%TEMP%WCNatives<aleatorio>` en cada arranque, y Helios lo hacía con `fs.writeFile` sin esperar:
con disco lento o antivirus revisando cada DLL, Java arrancaba antes de que existiera `lwjgl.dll`.

- **Arreglo (1.16.13):** `sc$escribirNativa()` en `processbuilder.js` escribe cada nativa de forma síncrona y,
  en Windows, se registra en el log si `lwjgl.dll` no está tras extraer.
- **Lo que queda:** antivirus o limpiador que borra/bloquea la DLL en `%TEMP%`. `scAnalizarCierreDelJuego`
  lo reconoce (antes caía al genérico SC-06) y enseña `errNativas`, reintentable.

### SC-16 · No cabe lo que falta por descargar (1.7.4)

`scHayEspacioPara()` mide con `fs.statfsSync` el disco de la carpeta de datos (o de la primera carpeta que exista hacia arriba, en una instalación nueva) y solo bloquea si **lo pendiente no cabe**: los bytes que faltan por bajar (los manda el receptor de helios parcheado, `scBytesPendientes`) más 512 MB de margen (`SC_DISCO_MARGEN`); para Java, tres veces el tamaño del `.zip` (descarga + extraído). Con todo descargado no se comprueba nada. Antes la descarga moría a medias con un `ENOSPC` o con ficheros truncados que luego no pasaban el hash.

### Cosas que paran JUGAR sin código SC (1.7.4)

- **Juego abierto de otra sesión.** Al lanzar se anota el PID en `<instancias>/sc-juego.pid`; si el launcher se reabre con ese Minecraft aún abierto (se comprueba la identidad del proceso: java, misma hora de creación y `--gameDir` dentro de nuestras instancias, para no confundirlo con otro java que haya heredado el PID), JUGAR avisa en vez de lanzar otro, y no se tocan `options.txt` ni se repara nada. Ver `app/assets/js/scjuegoabierto.js`.
- **Fallo inesperado preparando el arranque.** `dlAsync()` es un envoltorio con `try/catch`: cualquier excepción no prevista sale como **SC-06** con Reintentar, en vez de dejar la barra de progreso puesta para siempre.

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

### Al jugador se le desactivan los paquetes de recursos

No lleva código SC: no es un fallo del launcher, y por eso conviene reconocerlo. En su `latest.log`:

```
Caught error loading resourcepacks, removing all selected resourcepacks
```

Minecraft, ante un error cargando CUALQUIER paquete, los desactiva **todos** y los borra de
`options.txt`. Quién lo provocó está en las líneas de justo encima. El 2026-09-16 era Cobblemon:

```
java.lang.IllegalStateException: Unable to load model cobblemon:shedinja_Mahoraga.geo for cobblemon:shedinja
```

precedido de avisos `Expected BEGIN_ARRAY but was BEGIN_OBJECT ... .uv`: modelos con **UV por cara**,
que el lector de Cobblemon no admite. Se corrigió sacando la SC-3.2.18, y `tools/validar_pack.js` ya
no deja publicar un pack así.

Dos cosas más que mirar cuando se repita:

- **¿La región le fuerza un pack?** `resource-pack=` en su `server.properties` gana al del launcher, y
  si apunta a una versión vieja el jugador carga esa. Ver [DISTRIBUCION.md](DISTRIBUCION.md).
- **El launcher lo repone solo** al abrir, salvo que el jugador lo apagara a propósito desde Ajustes
  (ver [PAQUETES-Y-SHADERS.md](PAQUETES-Y-SHADERS.md)). Con versiones anteriores hay que decirle:
  **Ajustes → Paquetes** y activar SC-Pack.

### SC-04 · Fallo de descarga, y el bloqueo de los operadores

El texto de SC-04 depende de la causa que resume helios-core (`displayable` en el informe):

| Causa | Qué es | Qué hace el launcher |
|---|---|---|
| `ETIMEDOUT` y familia | No llegan los paquetes. Movistar y O2 durante los partidos | Cambia solo a la ruta directa, si responde con certificado válido |
| `ERR_SSL_WRONG_VERSION_NUMBER`, `EPROTO` | Contesta HTTP normal en el 443: portal cautivo (wifi de hotel o tren) o página de bloqueo sin TLS | Igual que `ETIMEDOUT` |
| Error de certificado | Alguien contesta con un certificado que no es el nuestro | Diagnostica los dos caminos (abajo) |
| `ENOSPC` | Disco lleno | Mensaje propio |

El cambio a la ruta directa es **automático**: si se arregla solo, el jugador no llega a ver el error, y si has recibido un informe SC-04 es que no se pudo. Una vez cambiada, la ruta directa **se mantiene mientras funcione**; si es ella la que falla **y la normal ya responde**, el launcher vuelve a la normal para el siguiente intento (ver [DISTRIBUCION.md](DISTRIBUCION.md)). Si fallan las dos a la vez, lo más probable es que el jugador se haya quedado sin conexión, y no se toca nada. La línea `Ruta:` del informe dice por cuál fue el intento que falló, por cuál va ahora y cuántos cambios automáticos lleva la sesión. Hasta la 1.6.0 había que pulsar Reintentar y **solo** se probaba con timeouts, así que a los clientes de Digi no les saltaba nunca.

> Mientras falla la descarga, el proceso hijo sale con código 1. Ese cierre **ya no pinta SC-05**: el fallo lo gestiona SC-04. Si ves un SC-05 con `exited with code 1` justo después de un fallo de descarga en un informe de la 1.6.0, era eso.

#### Diagnóstico de certificado

Con un fallo de certificado, `scDiagnosticarTls()` lee el certificado que presenta cada una de nuestras dos rutas y prueba la directa con validación completa. Las dos rutas están en proveedores distintos con autoridades distintas (Google Trust Services en Cloudflare, Let's Encrypt en la directa), así que comparar dice dónde está el problema:

| `TLS:` en el informe | Significa | Qué ve el jugador |
|---|---|---|
| `bloqueo` | La directa valida y la normal no (certificado ajeno o sin conexión): depende de la IP, es el operador. **Digi** durante los partidos contesta por la IP bloqueada con su propio certificado para enseñar un aviso | Nada: cambia de ruta y sigue. Si llega un informe con `bloqueo`, es que ya iba por la directa y falló también, o se agotó el tope: el mensaje del operador |
| `local` | Hay pruebas de un programa: su nombre en el emisor de un certificado que no valida, o las dos rutas re-firmadas (error de **cadena**) por el **mismo** emisor | Qué programa es, por el emisor (Avast, Kaspersky, ESET, Bitdefender...), y qué opción desactivar |
| `reloj` | Los dos fallan por fecha, con emisores distintos | Que corrija la hora de Windows |
| `intermitente` | Ahora funcionan los dos | El mensaje del operador, con Reintentar |
| `desconocido` | Cualquier otra combinación. Incluye a Digi interceptando **también** la ruta directa (el mismo autofirmado en las dos) y un fallo de certificado de **nuestra** ruta directa (renovación caducada, vhost mal puesto), o un wifi con portal que da en las dos un certificado real de otro nombre | El mensaje del operador |
| `(sin comprobar)` | El fallo de este intento no fue de certificado | Lo que diga su causa |

> ⚠ Un fallo **solo** en la ruta directa no se da nunca por "antivirus". Si nuestro certificado de `directo` falla, a un cliente de Digi se le mandaría a tocar el antivirus: el mismo error de la 1.6.0. Si ves `desconocido` con `directo=` y un error de fecha o de nombre, **mira primero nuestro certificado** (`certbot certificates` en OVH-A).

> ⚠ Añadir el launcher a la **lista blanca** del antivirus no desactiva su análisis de HTTPS. Un jugador del 2026-09-12 lo hizo, siguió igual y el mensaje antiguo le había mandado ahí. Su caso era un bloqueo de operador, en casa, en sábado de partido.

> 🔒 `scLeerCertificado()` usa `rejectUnauthorized: false` **solo para leer el emisor**: hace el apretón de manos TLS y cierra, sin enviar ninguna petición ni usar datos de esa conexión. La decisión de cambiar de ruta la toma `scSondearRutaDirecta()`, que valida de forma normal: si alguien intercepta también la ruta directa, no se cambia nada. **No relajes nunca esa sonda.** Y el nombre del emisor lo controla quien intercepta: se escapa, se recorta y se sustituye con función antes de pintarlo.

Máximo dos cambios automáticos de ruta por sesión (`SC_MAX_CAMBIOS_RUTA`), para que un fallo que no se arregla así no se convierta en un bucle. Volver a la normal cuando falla la directa no cuenta como cambio, y con el tope agotado se sigue diagnosticando, para que el mensaje sea del fallo actual.

## Avisos anónimos de error (desde 1.16.12)

Cada fallo de arranque (`scFalloArranque`) envía, además de guardar el informe, una petición
`GET /launcher/informe.txt?c=SC-04&v=1.16.12&p=pro&r=normal&t=red` a un fichero vacío: primero por
`directo.servidorcobblemon.es` (funciona con el bloqueo de LaLiga) y, si falla, por la ruta normal. Un
mismo código cuenta una vez por minuto. Se apaga en Ajustes → Launcher (`enviarErrores`).

- **Recuento:** `tools/sc-stats.py` (OVH-A, cada 5 min) cuenta jugadores DISTINTOS por código y día en
  `packs_cf.log*` y `packs_directo.log*`, sin guardar las IP, y lo publica en `stats.json` → `informes`
  (`hoy`, `ayer`, `versiones_hoy`, `directa_hoy`, `ultima_hora`). `SC-99` es el código de pruebas y no cuenta.
- **Alerta:** `/opt/mc-monitor/monitor.py` (Hetzner, cada 2 min) manda un privado a Felix cuando 5 o más
  jugadores distintos tienen el mismo código en la última hora; no repite hasta que ese código baja de 2.
- **SC-90 (interno, no se enseña al jugador):** el juego se cerró con error DESPUÉS de entrar. Lleva además
  `m` (paquete del primer marco de la traza que no es de Java, Minecraft ni Fabric, p. ej. `com.cobblemon.mod`),
  `x` (tipo de excepción) y `e` (código de salida), sacados por `scPistaCrash()` del crash report más reciente.
  En `stats.json`: `crash_mods_hoy` y `crash_excepciones_hoy`. Nunca el mensaje ni el informe: llevan rutas y usuario.
- **Pistas (desde 1.16.18).** Con solo el código no se podía arreglar casi nada (revisión del 20-10: 2 `NoSuchMethodError`
  en LITE sin saber qué método, SC-04 «otro», SC-05 y SC-06 sin más dato). Ahora SC-90 y todos los fallos de arranque
  llevan, cuando los hay y siempre como identificadores limpios (`[A-Za-z0-9._-]`, 60 caracteres):

  | Campo | Qué es | De dónde sale |
  |---|---|---|
  | `d` | Lo que falta en un `NoSuchMethodError`, `NoClassDefFoundError`… (`…battle.BattleGUI.renderTypeIcon`) | `scPistaCrash()` |
  | `y` | Mod del mixin que mete código en la clase que falla (`cobblemonextendedbattleui`) | «Mixins in Stacktrace» o `handler$zxx000$modid$` |
  | `l` | DLL donde murió Java (`nvoglv64.dll` = driver NVIDIA) | `Problematic frame` de `hs_err_pid*.log` (`scHsErrDe()`) |
  | `x` | En arranque, el error del sistema (`ECONNRESET`, `EPERM`…) o la excepción Java | `scPistaError()` |
  | `e` / `h` | Código de salida / estado HTTP | `scPistaError()` |
  | `z` | Cuántos mods propios activos tiene en `mods/` (solo el número, máx. 99) | `scModsPropios()` |

  `sc-stats.py` los guarda como `inf_p_<código>_<campo>_<valor>` (tope de 50 valores por código, campo y día) y publica
  `informes.pistas_hoy` / `pistas_ayer` (`{código: {campo: {valor: jugadores}}}`) e `informes.serie` (30 días de jugadores
  por código, para ver si un arreglo hace bajar un fallo).
- **Cierres nativos (desde 1.16.18).** Los códigos de salida `3221226505` (0xC0000409), `3221225477` (0xC0000005) y
  `3221225725` (0xC00000FD), y sus formas negativas, son un cierre de golpe sin crash report: driver gráfico o una
  superposición (Discord, RivaTuner, barra de juego). Antes del 20-10 el jugador no veía nada a media partida y SC-06
  genérico al arrancar; ahora sale el aviso de gráficos (SC-12, texto `errCierreNativo`) con el enlace de su marca si la
  DLL la delata. A media partida no se manda un segundo aviso: ya cuenta como SC-90.
- **SC-09 (desde 1.16.18):** sin cuenta seleccionada, JUGAR abre directamente la pantalla de iniciar sesión (y vuelve a la
  principal al terminar) en vez del error que mandaba a Ajustes → Cuenta. Se sigue contando con `x=sincuenta`.
- **Privacidad:** viaja solo lo de arriba. Está en `PRIVACY.md`.

## Recursos rotos dentro del juego: SC-91, SC-92 y SC-93 (desde 1.16.13)

El launcher no ve nada de lo que pasa dentro del juego. El mod **SC Avisos Cliente**
(`E:/PROYECTOS-MC/sc-avisos-cliente`, en los tres perfiles) mira desde dentro y avisa por el mismo canal
anónimo, con códigos que **no se enseñan al jugador**:

| Código | Qué ha pasado | Campos | Primera cosa que mirar |
|---|---|---|---|
| **SC-91** | Tras cargar recursos, el SC-Pack no está activo | `x`: `error` (el juego los quitó todos tras un fallo), `apagado` (está pero no activado), `falta` (no hay `SC-Pack.zip`) | `error`: el SC-93 del mismo rato dice qué modelo lo tumbó. `apagado`/`falta`: la reposición de `sc$repararPacksBorradosPorElJuego()` |
| **SC-92** | Texturas que faltan en los packs cargados, aparte de las conocidas | `n` (cuántas; `5000-mas` si pasa del tope), `m` (namespace de la primera), `t` (la primera, con `:` y `/` como `.`) | Que la textura `t` exista en el pack publicado |
| **SC-93** | Un modelo de Cobblemon falla o tumba el juego | `x`: `parte` (`Can't find part`, el crash de Wartortle del 15-09), `modelo` (`Unable to load model … for …`), `pose` (`Failed to deserialize pose`), `geo` (un `.geo.json` que no se lee); `m`: hueso, modelo, grupo de animación o fichero | `herramientas/crash_item_clase.js` y `validar_pack.js` sobre el pack publicado |

- **Cuándo mira:** al terminar cada carga de recursos (al arrancar, F3+T o al cambiar packs: cuando se quita la
  pantalla de carga), al vaciar el juego los packs por un error (`clearResourcePacksOnError`) y justo antes de
  cerrarse por un crash (`Minecraft.crash`, el envío espera hasta 6 s). Cada código sale **una vez por partida**.
- **Ruido conocido, que NO cuenta** (calibrado en 149 registros reales de julio a octubre y en los clientes de prueba
  PRO/LITE/SUPER LITE con la SC-3.2.75): las 7 texturas que faltan en todos los PRO al arrancar
  (`minecraft:item/shield`, `crossbow`, `butterfree_bonnet`, `guis/pixel`, y los namespaces `_iainternal` y `myitems`
  de objetos de plugins) y los `Unable to load model: 'zcrystals:item/tera_orb' referenced from …` de modelos de
  objetos. Si se arregla o aparece ruido nuevo de ese tipo, se cambia `Detector.BASE` / `NS_IGNORADOS`.
- **Si el jugador apagó el SC-Pack a propósito** (Ajustes → Paquetes, `.sc-packs-apagados.json`) no hay SC-91.
- **SC-94 (mod 1.2.0):** `x=arreglado` cuando el mod corrige el `app-update.yml` roto de un launcher 1.16.16–1.16.18 (ver
  `DISTRIBUCION.md`, incidente del 21/10). Debe subir unos días y luego quedarse a cero. Solo se manda con los avisos
  anónimos activos (`-Dsc.avisos=1`): hasta el 21/10 06:00 no había llegado ninguno. Desde el mod **1.2.1**, si el
  launcher que lanzó el juego aún tiene el nombre roto en memoria, se reinicia solo al cerrar el juego (mismo apartado).
- **Origen del recurso (`o`, mod 1.1.0).** SC-92 y SC-93 (`geo` y `modelo`) dicen qué clase de pack sirve el fichero:
  `sc` (nuestro `SC-Pack.zip`), `sc-viejo` (otro zip `SC-…` en la carpeta del jugador: una copia vieja nuestra),
  `otro` (un pack que añadió el jugador), `mod`, `juego` o `nada` (nadie lo trae). Nunca el nombre del pack. Motivo: los
  primeros avisos (18-20/10: `shedinja_anime2026` ×3, una pose de Greninja, Sudowoodo) no estaban en NINGÚN SC-Pack
  publicado (3.2.73–3.2.77 comprobados) ni fallaban en el cliente de Felix; sin `o` parecían fallos nuestros.
- **SC-91 `apagado` (mod 1.1.0):** además del aviso, el jugador ve una notificación en pantalla, una vez por partida, que
  le dice que sin el SC-Pack no verá skins ni menús y dónde activarlo. El launcher ya lo reactiva antes de cada partida
  desde la 1.16.15, así que esto cubre al que lo apaga a media partida desde la pantalla de paquetes del juego.
- **Interruptor:** el launcher pasa `-Dsc.avisos=1` solo con «Enviar avisos de error anónimos» activado
  (`sc$argsAvisos()` en `processbuilder.js`, junto a `-Dsc.launcher` y `-Dsc.perfil`). Sin esa propiedad (otro
  launcher, la 1.16.12 o anteriores) el mod no envía nada. Además, `config/sc_avisos_cliente.properties` →
  `enviar=false` lo apaga en ese PC. Lo que detecta siempre queda en `latest.log` con `[SC Avisos]`.
- **Recuento y alerta:** `sc-stats.py` los cuenta como los demás y además publica `informes.recursos_hoy`
  (`{código: {x|m|t|o: {valor: jugadores}}}`); `mc-monitor` manda el privado con los tres valores más repetidos.
