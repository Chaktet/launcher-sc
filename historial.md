# SC Launcher · historial

## Estado actual
- **1.17.13 publicada (29-10 15:05 UTC, OK de Felix): el vigilante.** Con la partida cargada el launcher se cierra
  entero y un proceso Node de ~28 MB vigila el juego; al cerrarlo reabre el launcher con el diagnóstico. Medido en el
  PC de Felix con Minecraft real: 483 MB → 28 MB, 0 CPU. Plan + 3 revisiones de Codex: `docs/PLAN-VIGILANTE.md`.
  Firmada (`comprueba-publisher` ok), release v1.17.13 con 14 ficheros (Mac/Linux del CI run 40895716817, todo en
  verde; commit 3f78978); las tres fichas `latest*.yml` dicen 1.17.13 y el sha512 = build; `master` y `main` subidas;
  los 3 exe de OVH-A renovados (por Cloudflare 93.695.824 B, sha256 `02ae23bc…` = build, firma `Valid`). Novedad:
  vista previa en «diseño-pruebas» (mensaje 1565378110356987936), **sin publicar hasta el OK de Felix**. Mirar en
  unos días: que no suban los SC-06 ni los avisos de juego duplicado; `sc-vigilante/vigilante.log` en los informes.

- **1.17.12 publicada (29-10 14:13 UTC, OK de Felix)**: aviso SC-12 con botón que abre la web del driver. Firmada (`comprueba-publisher` ok), release v1.17.12 con 14 ficheros (Mac/Linux del CI run 40887902351, todo en verde; commit dd1f784); las tres fichas `latest*.yml` dicen 1.17.12 y el sha512 = build; `master` y `main` subidas; los 3 exe de OVH-A renovados (por Cloudflare 93.685.912 B, sha256 `591c023a…` = build, firma `Valid`). Novedad `2026-10-29-launcher-1.17.12` publicada con el OK de Felix.
- **1.17.11 publicada (29-10 03:01 UTC, OK de Felix)**: SC-10 real = `_JAVA_OPTIONS` del sistema (el juego se lanza sin
  ella) + reparación automática de Java. Firmada (`comprueba-publisher` ok), release v1.17.11 con 14 ficheros
  (Mac/Linux del CI run 40808669709, todo en verde; commit 9359975); las tres fichas `latest*.yml` dicen 1.17.11 y el
  sha512 de `latest.yml` = build; `master` y `main` subidas; los 3 exe de OVH-A renovados (por Cloudflare 93.683.872 B,
  sha256 `d138efb5…` = build, firma `Valid`). Novedad: vista previa en «diseño-pruebas» (mensaje
  1565196038963339376), **sin publicar hasta el OK de Felix**. Mirar en unos días `x`/`f`/`u` de los SC-10.
  Ojo: tres worktrees con cambios en `landing.js` en sus ramas tendrán conflictos con esta versión.
- **iOS: CANCELADO (Felix, 27-10).** No se hace guía, app ni pruebas. Queda solo la investigación en
  `docs/INVESTIGACION-IOS.md` por si se retoma (la ruta gratis es Amethyst + SideStore/LiveContainer + StikDebug).
- **1.17.9 publicada (27-10, OK de Felix)**: falso SC-05, pistas nuevas de SC-03/14/90, RAM autoajustada (SC-08) y
  SC-19 «el antivirus borró archivos». Firmada (`Valid`, sello Certum, publisher ok), release v1.17.9 con 14 ficheros
  (Mac/Linux del CI run 40539470213, todo en verde); las tres fichas `latest*.yml` dicen 1.17.9; `master` y `main`
  subidas; los 3 exe de OVH-A renovados (por Cloudflare 93.673.816 B, sha256 `493a9130…` = build, firma `Valid`);
  novedad `2026-10-27-launcher-1.17.9`. Los `.dmg`/AppImage fijos de OVH-A siguen en 1.17.8 (Felix pidió solo los exe;
  se actualizan solos al abrir). `tools/sc-stats.py` instalado en OVH-A (27-10 16:34 UTC, permiso de Felix; copia
  `/usr/local/bin/sc-stats.py.bak-20261027`; `stats.json` regenerado, histórico intacto con 109 días). ⚠ El fichero del
  repo tiene CRLF: al subirlo, `sed -i 's/\r$//'` antes de instalar (el cron llama con `python3` delante y no le
  afecta, pero ejecutado a mano falla con `python3\r`). Mirar en unos días: SC-05 `ERR_IPC_DISCONNECTED` a cero, SC-19 por antivirus, `x` de los SC-14, `f`/`u` de los SC-90.
- **1.17.8 publicada (26-10): Windows, Mac y Linux** con el OK de Felix. Release v1.17.8 con 14 ficheros (exe firmado
  en local, `comprueba-publisher` ok; Mac/Linux del CI run 40403813368, todas las pruebas en verde); las tres fichas
  `latest*.yml` públicas dicen 1.17.8. OVH-A: `packs.conf` sirve `.dmg|.AppImage` con `no-cache` (copia en
  `/home/ubuntu/_backups/packs.conf.*`, Apache con `reload`); exe estable, 1.0.0 y versionado + `SC-Launcher-mac-arm64.dmg`,
  `-mac-x64.dmg` y `-linux.AppImage` bajados de GitHub con sha512 = fichas; por Cloudflare tamaño y sha256 = build (4/4).
  Novedad `2026-10-26-launcher-1.17.8`. Pendiente: que la sesión de la web publique las guías de Mac/Linux y el enlace
  de Discord; que un jugador con Mac y otro con Linux entren a jugar; la primera actualización real de Mac será la 1.17.9.
- **1.17.7 publicada (26-10)**: avisos de Windows con nombre «SC Launcher» (antes «electron.app.SC Launcher»).
  Firmada, release v1.17.7, `master` y `main` subidas, novedad `2026-10-26-launcher-1.17.7`. Los 3 exe
  de OVH-A renovados con el OK de Felix (por Cloudflare 93.660.392 B, sha256 `3628861d…` = local).
- **1.17.6 (25-10): fin del aviso SC-PREMIUM evitable.** Ver la entrada de abajo. Estado de la publicación al final de
  la entrada.
- **1.17.5 publicada (24-10)**: el aviso anónimo del SC-03 manda `k` y `n`. Firmada (`Valid`, sello Certum, publisher
  ok), release v1.17.5 (feed = local), `master` y `main` subidas, novedad `2026-10-24-launcher-1.17.5`. Los 3 exe de OVH-A
  renovados con el OK de Felix (sha512 = latest.yml; por Cloudflare 93.652.352 B, sha256 `44a1d090…` = local).
  Pendiente: mirar en `stats.json` los `k`/`n` de los SC-03 cuando lleguen.
- **1.17.4 publicada (23-10)**: «Abrir al encender el PC» con pregunta única. Release en GitHub, novedad y los 3 exe
  de OVH-A hechos. Sin probar: desinstalación real y arranque tras reiniciar Windows.
- Voice Chat 2.6.22 (23-10): modpack y Pruebas ya; Kanto y Kalos entran en su próximo reinicio (mirar `aplica.out`).
- **1.17.3 publicada (23-10)**: borra solos los SC-Pack viejos y afina las pistas de Voice Chat (`d` en «Could not
  initialize class») y de descargas (`k`, `n`). `sc-stats.py` nuevo instalado en OVH-A. Mirar en unos días: `d` de los
  SC-90 de Voice Chat, `k` de los SC-04 y que bajen los SC-93 `sc-viejo`.
- **Minimapa con iconos de Pokémon siempre (28-10, distribución en vivo)**: pendiente ver en el juego que salen los
  iconos sin TAB y que el launcher no vuelve a bajar el fichero en cada arranque (si Xaero lo reescribe distinto).
- **1.17.10 publicada (27-10 20:40 hora RD, OK de Felix)**: repone los paquetes oficiales cuando el juego vació la
  lista aunque ya haya entrado el SC-Pack solo. Firmada (`comprueba-publisher` ok), release v1.17.10 con 14 ficheros
  (Mac/Linux del CI run 40608709458, todo en verde), las tres fichas `latest*.yml` dicen 1.17.10; los 3 exe de OVH-A
  renovados (por Cloudflare 93.676.544 B, sha256 `3eda1a43…` = build). `.dmg`/AppImage fijos de OVH-A siguen en
  1.17.8 (como en la 1.17.9). Novedades `2026-10-27-launcher-1.17.10` y `2026-10-27-modpack-Iconos-de-Pokemon-en-el-minimapa`
  solo en vista previa en «diseño-pruebas»: pendientes del OK de Felix. Si SimplySign falla con «After Private Key
  filter, 0 certs», la sesión caducó aunque `comprueba-certificado.ps1` diga `ConClave: True`: Felix vuelve a entrar.
- **No Chat Reports 2.9.1 en el modpack (28-10)**: quita el aviso «Mensajes de chat no verificados» a quien entra con
  el launcher. Novedad `2026-10-28-modpack-Adios-al-aviso-de-chat-no-verificado` (arreglo) solo en vista previa en
  «diseño-pruebas» (mensaje 1564857375410757703). **Publicada en el launcher el 28-10 15:55 UTC** con la de las
  misiones de escanear (OK de Felix: launcher sí, Discord no). El modpack móvil SC-Movil no lo lleva.

## 2026-10-29 · Vigilante: el launcher deja de ocupar ~500 MB mientras se juega
- Pedido: Felix vio que el launcher se queda en ~500 MB con el juego abierto.
- Causa: al cargar el juego solo se ocultaba en la bandeja; Electron (main + GPU + renderer + red) seguía vivo porque
  el renderer era el padre de Java (tuberías y código de salida). Cerrar solo la ventana deja ~240 MB (la GPU no muere).
- Arreglo: `scvigilanteproceso.js` (el exe con `ELECTRON_RUN_AS_NODE`) es el padre del juego, drena la salida, lleva
  Discord, guarda `sc-vigilante/resultado-<runId>.json` y reabre el launcher; `scvigilante.js` lo lanza y reclama
  resultados (marca `hecho-<runId>`). Respaldo directo solo con prueba de que no quedó Java. Interruptor
  `settings.launcher.vigilante`. Solo Windows.
- Verificado: exe empaquetado (`--dir`) con Minecraft real: 4 procesos/483 MB privados → 1/28 MB, 0 CPU; cierre →
  relanzado y resultado recogido; arnés con juego falso (cierre por juego, en vivo, Java roto). La 1.ª prueba real
  sacó un fallo (`loggerLaunchSuite` fuera de ámbito → SC-06 falso y 2.º Minecraft), corregido antes de la 2.ª.
- Sin probar: instalador NSIS real, crash a media partida con el diálogo al reabrir, Mac/Linux (siguen como antes).

## 2026-10-29 · SC-12: botón para descargar el driver

- Pedido: un jugador con AMD no sabía copiar la web del driver del aviso SC-12.
- Cambio: con marca detectada, texto corto + un botón grande `a.sc-btn-driver` (https, lo abre `uicore.js`) y pasos sencillos; sin marca, un botón por fabricante. CSS en `scpokenav.css`; doc en ERRORES.md.
- Verificado en `npm start` por CDP: AMD sale con 1 botón y sin scroll en ventana de 700 px; genérico 3 botones (solo el consejo LITE queda bajo scroll); el clic llama a `shell.openExternal` con la web de AMD. Las 3 webs abren (Intel da 403 a curl, en navegador bien).
- Publicado como 1.17.12 el mismo día (ver Estado actual). La primera firma falló por SimplySign sin sesión («After Private Key filter, 0 certs»): `comprueba-certificado.ps1` dice ConClave True igual; hay que pedir a Felix que inicie sesión.

## 2026-10-28 · 1.17.11 (publicada 29-10 03:01 UTC): SC-10 «Reparar Java» que no reparaba
- Felix: un jugador con SC-10 pulsa Reparar Java y sigue igual (antivirus quitado). Quiere que se arregle solo.
- **Causa de este jugador, confirmada con su ZIP de soporte:** variable de Windows `_JAVA_OPTIONS=-Xmx512M` (gana a
  nuestro -Xmx; con -Xms8G la JVM no nace). Arreglo: el juego se lanza sin `_JAVA_OPTIONS`/`JAVA_TOOL_OPTIONS`/
  `JDK_JAVA_OPTIONS` (`processbuilder.js`); probado con el Java real (con la variable falla igual, sin ella arranca).
- Además, tres fallos del código, corregidos: la reparación borraba solo nuestro runtime y el siguiente JUGAR elegía un Java 21 del sistema
  (roto) sin volver a bajar el nuestro; un fallo de memoria al arrancar salía como SC-10 (ahora SC-11 con consejo de
  bajar la RAM); y los mods con RuntimeException también. Lo dirán su ZIP o las pistas nuevas x/f/u.
- Arreglo: `app/assets/js/scjava.js` (nuestro Java primero, vetos, ficheros esenciales, clasificador) y `scJavaRoto()`:
  reparación automática con relanzado, comprobación antes de lanzar, aviso del antivirus si se repite. Detalle en
  `docs/ERRORES.md` (SC-10).
- Verificado: `node tools/prueba-java-roto.js` 29/29; Java real sin tzdb.dat → `tzdb`; launcher real (datos en
  E:/tmp/sc10) con nuestro Java roto: JUGAR lo quita, baja el nuestro entero y sigue; SC-10 simulado: 1.ª vez repara y
  relanza, 2.ª vez aviso del antivirus. Sin probar: el botón «Arreglarlo por mí» (cambia Defender) y Mac/Linux.
- Pendiente: OK de Felix para firmar y publicar la 1.17.11; luego mirar `x`/`f`/`u` de los SC-10 en `stats.json`.
  Sin hacer: con poco disco, si no cabe nuestro Java no se prueba el del sistema (sale SC-16); el orden memoria→Java
  dentro de scAnalizarCierreDelJuego solo está probado por partes (clasificador), no con un arranque real.

## 2026-10-28 · Modpack: No Chat Reports para quitar «Mensajes de chat no verificados»
- Felix: que el aviso de chat no verificado no salga a nadie en Lobby y regiones. Sale porque la red no exige chat
  firmado (cuentas no premium); exigirlo echaría a esos jugadores, así que se quita en el cliente.
- `NoChatReports-FABRIC-1.21.1-v2.9.1.jar` (Modrinth, sha512 comprobado, md5 `2dce5b67…`) en `required/` de PRO y
  LITE (SUPER LITE usa la URL de LITE). Su `hideWarningToast` ya viene a `true`: sin config. Método del 23-10: solo 3
  entradas añadidas al `distribution.json` publicado, sin regenerar; copia `distribution.json.bak-nochatreports-20261028`
  en OVH-A y en local. Por Cloudflare: JSON md5 `0227242d…` y los 3 jars = tamaño y MD5. Los .mrpack 1.1.59 y Móvil
  PRO se regeneraron solos (APTO). El filtro de mods de SCSinLauncher solo mira los requeridos: no le afecta.
- Probado con el cliente de pruebas en el servidor local: sin el mod sale el aviso, con el mod no.

## 2026-10-28 · 1.17.10: reponer los paquetes que vacía el juego (E19 apagado)
- Felix: arreglar que el pack E19 (iconos del minimapa) se quede apagado cuando el juego vacía la lista.
- Causa: `sc$repararPacksBorradosPorElJuego` solo actuaba con la lista vacía y corría en segundo plano;
  `sc$asegurarPackOficial` (antes de `pb.build`) metía el SC-Pack primero y la reposición ya no saltaba nunca.
- Cambio: núcleo síncrono `sc$reponerPacksVaciados` (vacía o solo SC-Pack = borrado del juego; respeta lo apagado en
  Ajustes; repone `vanilla`/`fabric` si faltan; SC-Pack el último), llamado también desde `sc$asegurarPackOficial`;
  `dlAsync` hace `await sc$officialPackNames()` antes de lanzar para tener la lista de oficiales al día.
- Verificado: simulación con el código real de settings.js sobre ficheros en `E:/tmp/minimapa/test/sim.js`, 7/7 OK
  (con el código anterior fallan 5); eslint y `node --check` limpios. Sin probar en el launcher compilado.

## 2026-10-28 · Minimapa: iconos de Pokémon siempre visibles
- Felix: en el minimapa del launcher de PC no salen los iconos de los Pokémon.
- Causa: Xaero 25.3.12 trae en su categoría raíz del radar `"icons": 1.0`, que es «Lista de jugadores» (0 = sin
  iconos, 1 = solo con TAB pulsado, 2 = siempre; orden de `EntityRadarCategorySettings`). Sin TAB se ven puntos.
- Cambio: `config/xaero/minimap/profiles/entity_radar_categories/default.cfg.json` (el que escribe Xaero, solo
  `icons` raíz a 2.0) en `files/` de PRO y LITE de sc-distribution, y a mano en el `distribution.json` de los tres
  perfiles (SUPER LITE usa la URL de LITE), `?v=1`. Va CON hash: se impone en cada arranque (el ajuste del radar del
  jugador se reinicia), es lo que hace que llegue también a los ya instalados.
- Verificado: fichero por Cloudflare y por directo 200, 5531 B, MD5 `2e7e0503…` = manifiesto; `distribution.json` en
  vivo `d4db2c1d…` = local (copia del anterior en `distribution.json.bak-20261028-radar` en OVH-A).
- Visto de paso: en la instancia de Felix el pack E19 está apagado (el juego vació la lista por un modelo de prueba y
  `sc$asegurarPackOficial` metió solo el SC-Pack, así que `sc$repararPacksBorradosPorElJuego` ya no ve la lista vacía).

## 2026-10-27 · Norma: novedades y Discord, primero vista previa con @chaktet y OK de Felix
- Pedido: antes de publicar novedades del launcher o posts de Discord, enseñárselo y dejarlo en «diseño-pruebas»
  hasta su OK, mencionándole (@chaktet, id `154597670688653312`).
- Cambios: `anade_novedad.js --muestra` (valida y manda el borrador a «diseño-pruebas», no publica);
  `publica_novedades.py` en Hetzner menciona a @chaktet en el modo `pruebas` (copia `.bak-2026-10-27`);
  `publica_anuncio_ruleta.py` (plantilla de anuncios) igual en `prueba`. Normas en `PROYECTOS-MC/CLAUDE.md`,
  `RESOURCE-MC/CLAUDE.md`, `NOVEDADES-GUIA.md`, skill `desplegar` y CLAUDE.md global.
- Verificado: vista previa de Discord (mensaje 1564746089922568363, Discord confirma la mención a chaktet) y del
  launcher (llegó a «diseño-pruebas», `novedades.json` publicado sin la entrada de prueba; mensaje de prueba borrado).
- Pendiente: 4 novedades esperan el OK de Felix para #actualizaciones (vista previa ya en «diseño-pruebas»).

## 2026-10-27 · Revisión de avisos anónimos: SC-05 falso, pistas nuevas y SC-19 (antivirus)

- Felix: revisar los avisos anónimos del launcher de PC, arreglar los puntos 1-4 de la revisión, dejar el 5 (SC-90)
  preparado para detectarlo, y «mucha gente tiene el antivirus borrándole archivos: que lo recupere mejor».
- Datos (registros de OVH-A, 19-27/10): SC-92 de Charizard y SC-93 de Shedinja `sc-viejo` ya a cero; SC-90 sigue
  siendo lo más común (mitad 0xC0000409 sin DLL).
- **SC-05 `ERR_IPC_DISCONNECTED` (11 avisos 24-25/10) era falso**: el receptor hace `process.exit(1)` justo tras mandar
  su error, helios llama `disconnect()` con el canal cerrado y el `'error'` pintaba SC-05 ENCIMA del SC-03 real.
  Reproducido 20/20; ahora se ignora ese código. SC-03: `k=json` y `n` = nombre del error o `sindetalle`.
- SC-08: RAM manual > 92 % del equipo → RAM automática + aviso, sin bloquear. SC-14: `scSondaJava()` (`x`) y antivirus
  (`q`). Todas: `a` procesador real, `s` build de Windows; `g` gráfica en SC-06/12/13/90; SC-90: `f`, `u`, y los cierres
  de Windows (0x40010004, 0xC000013A) ya no cuentan. Detalle: `docs/ERRORES.md`.
- **SC-19 nuevo** (`app/assets/js/scborrados.js`): huella de los .jar y Java al cargar la partida; si al JUGAR falta algo,
  aviso «Tu antivirus ha borrado archivos» con «Que no vuelva a pasar» (exclusión) o «Jugar ya». De paso,
  `scOfrecerArreglarAntivirus` abre el overlay (el botón «Revisar el antivirus» del SC-15 lo rellenaba detrás).
- Codex (high): 3 fallos de SC-19 falso o repetido, arreglados (reparar Java borraba el runtime de todos los perfiles;
  huella que no se puede guardar; reparación de módulo a medias). Ahora `olvidarBajo()` va antes del borrado y hay
  memoria de sesión.
- Comprobado: eslint; 14 casos de `scborrados.js` (los 3 de Codex incluidos); 14 de clasificación/pistas/sonda; el diálogo SC-19 en el launcher real
  por CDP (singular/plural, un solo aviso por borrado); el launcher arranca sin errores de script. NO probado: una
  partida real, la exclusión con UAC desde el SC-19, ni avisos reales en `stats.json` (falta publicar e instalar sc-stats).

## 2026-10-26 · 1.17.8: launcher para Mac y Linux (publicada)

- Felix: que el launcher funcione en Mac (.dmg) y Linux sin pagar nada, y que se actualice solo en los dos.
- Builds gratis en GitHub Actions (`build-mac`, `build-linux`). Mac: firma ad hoc, sin notarizar (primera vez «Abrir
  igualmente»); actualización propia `scactualizamac.js` (Squirrel.Mac exige firma de Apple): .zip + sha512 de
  latest-mac.yml, ditto, script que cambia el .app al cerrar. Linux: AppImage con electron-updater;
  `build/afterpack.js` quita el sandbox SOLO si el kernel lo bloquea (Ubuntu 24.04+ moría al abrir; decisión de Felix).
- Arreglos de paso: LWJGL usaba `C:\ProgramData` también en Mac/Linux; el enlace .dmg apuntaba a Helios.
- Codex (high): 6 fallos de la actualización de Mac arreglados (doble instalación, cambio a medias, descarga colgada,
  errores de disco, versión preparada borrada, instalar al cerrar).
- Comprobado en CI (run 40402020902): firma ad hoc válida; actualización de punta a punta en macOS arm64 (la app
  nueva queda abierta); AppImage vivo a los 40 s con y sin el bloqueo (sin él, sin `--no-sandbox`). Windows arranca en
  local. Sin probar: Mac/Linux reales con partida, y una actualización de Mac descargada de GitHub (será la 1.17.9).

## 2026-10-26 · Avisos de Windows con nombre «SC Launcher»

- Felix: las notificaciones del launcher salen en Windows como «electron.app.SC Launcher».
- Causa: nunca se llamaba a `app.setAppUserModelId`; Electron usa entonces `electron.app.<productName>`, que no
  coincide con ningún acceso directo, y Windows enseña el ID en crudo sin icono.
- Arreglo: `index.js` fija el ID `es.servidorcobblemon.sclauncher` (= `appId` de electron-builder.yml, el que el NSIS
  graba en el acceso directo del menú Inicio) antes del bloqueo de instancia única.
- Comprobado: el acceso directo instalado tiene ese AUMID; un Electron de prueba con ese ID muestra el aviso, Windows lo
  registra con ese ID y `shell:AppsFolder` lo resuelve como «SC Launcher». eslint limpio.
- Publicada como **1.17.7** (Felix: «publica»): `dist:win:firmado` (exe y `SC Launcher.exe` `Valid`, sello Certum
  Timestamp 2026, `comprueba-publisher` ok, el `app.asar` lleva el ID y la versión 1.17.7), release v1.17.7 con exe +
  blockmap + latest.yml (el `latest.yml` público ya dice 1.17.7), `master` y `main` subidas, novedad
  `2026-10-26-launcher-1.17.7`. Los 3 exe de OVH-A renovados con el OK de Felix (sha512 = latest.yml; por
  Cloudflare 93.660.392 B, sha256 `3628861d…` = local). Felix confirma que el aviso real ya sale como «SC Launcher».

## 2026-10-25 · 1.17.6: sesión premium renovada al JUGAR y aviso de nombre premium

- Felix: el aviso SC-PREMIUM («Error al iniciar sesión… aviso SC-PREMIUM») le sale a mucha gente, también a él.
  El texto es del SC-Pack (`disconnect.loginFailedInfo.invalidSession`); el juego lo muestra cuando el servidor pide la
  verificación premium y Mojang no la acepta.
- Causas: (1) premium: la sesión de Minecraft dura 24 h y el launcher solo la renovaba al abrirse; con él abierto un día
  se jugaba con ella muerta. (2) No Premium con un nombre que es premium en Mojang: SCLogin fuerza la verificación,
  que nunca pasa; el texto prometía «pulsa JUGAR otra vez», cierto con JPremium, falso con SCLogin.
- Cambios: `scSesionLista()` (landing.js) renueva antes de lanzar si caduca en < 1 h; si Microsoft la rechaza pide
  volver a entrar, si no hay red y ya caducó no lanza (aviso «No se ha podido renovar tu sesión»). `validateSelected`
  con una sola renovación a la vez y 20 s máximo. Al añadir cuenta No Premium se consulta Mojang: si es premium, aviso
  con 3 nombres libres; «Ya jugaba con este nombre» deja seguir (cuentas antiguas). Escape = elegir otro nombre.
- Codex (xhigh): 4 fallos del launcher arreglados (sin tiempo límite, caducada sin red, doble renovación, Escape).
- Comprobado con `electron .` + CDP y carpeta de datos aparte: aviso con nombres libres, Escape no crea cuenta, «Ya
  jugaba» la crea, nombre libre pasa directo; renovación: lejos de caducar no toca la red, rechazo de Microsoft → pedir
  entrar, sin red caducada → no lanza, colgada → se libera a los 20 s (2 seguidas, 40 s). La prueba pilló un
  `loggerLaunchSuite` fuera de su ámbito (arreglado). Sin probar con una sesión real caducada.

## 2026-10-24 · 1.17.5: el SC-03 dice por qué falla

- Felix: un jugador da SC-03 «por el antivirus»; que el aviso anónimo traiga el tipo de error, como el SC-04. Hasta
  ahora 6 avisos SC-03 (~3 jugadores, 1.16.20 y 1.17.4), todos sin pista.
- Causa: `FullRepairReceiver.parseError` de helios solo traduce errores de red; un EPERM/ENOENT del disco llegaba como
  `displayable: undefined`. Parche 8 en `tools/parche-helios.js`: manda «Local error (CÓDIGO): mensaje». En
  `scEnviarAvisoError` el SC-03 lleva `k` (`scTipoFalloDescarga`) y `n` = código de Node (`scCodigoErrorNode`); el
  mensaje (rutas) no viaja. De paso, un SC-04 por error local ahora trae texto (antes también salía vacío).
- Comprobado: parche idempotente (2.ª pasada «ya aplicado»); prueba con el receptor parcheado y las funciones reales de
  landing.js: EPERM/EBUSY → `bloqueado`, ENOENT → `nofichero`, ENOSPC → `disco`, TypeError → `codigo` sin `n`; lint ok.
  `sc-stats.py` ya guardaba `k`/`n` de cualquier código: solo cambia su comentario. Sin probar con un SC-03 real.

## 2026-10-23 · 1.17.4: «Abrir al encender el PC» con permiso del jugador

- Felix: que el launcher se abra con Windows. Elegido: preguntar UNA vez (nunca activarlo sin un sí, tampoco a los
  que ya lo tenían) y abrir con la ventana normal. Ajuste `abrirConWindows` (apagado) + `abrirConWindowsPreguntado`;
  interruptor en Ajustes → Launcher; IPC `sc-abrir-con-windows` en index.js (`setLoginItemSettings`, nombre fijo
  «SC Launcher», solo instalado); `build/installer.nsh` lo borra al desinstalar pero no al actualizar (`isUpdated`).
  PRIVACY.md: sección nueva (no recoge datos nuevos). Las páginas legales de la web no hablan del launcher: sin cambios.
- Verificado: entrada del registro creada y borrada por Electron con ese nombre; en una copia de datos
  (`--user-data-dir`) la pregunta sale en la portada, «Sí» guarda y no vuelve a salir, Ajustes apaga y guarda. Firmada
  (publisher ok), release v1.17.4 (feed = local), `master` y `main` subidas, novedad `2026-10-23-launcher-1.17.4`.
- Sin probar: la desinstalación real (que quite la entrada) y el arranque real tras reiniciar Windows.
- Exe de OVH-A (con el OK de Felix tras el bloqueo del modo automático): `SC-Launcher-setup{,-1.0.0,-1.17.4}.exe` en
  `/var/www/packs` renovados (sha512 = latest.yml, `.nuevo` + `mv -f`); por Cloudflare los 3 dan 93.649.976 B y sha256
  `7f653bf5…` = compilación local.

## 2026-10-23 · Voice Chat 2.6.22 en servidores y modpack, configuración sin IP fija

- Felix: sincronizar Voice Chat con el servidor y dejar la configuración bien (se le «desconfiguraba»). Antes: servidores
  2.6.12, modpack 2.6.17 (protocolo 20 los dos). Elegida la 2.6.22 (última estable; 2.6.23-25 son beta), arregla audio
  roto y fugas de OpenAL. Jar de Modrinth con sha512 comprobado (md5 dccfc2a4…).
- Modpack: solo las 3 entradas de Voice Chat del distribution.json publicado (PRO, LITE, SUPER LITE), sin regenerar;
  copia `distribution.json.bak-voicechat-20261023` en OVH-A; por Cloudflare JSON y jars = tamaño y MD5. Copia local de
  sc-distribution igual (2.6.17 en `_retirados/voicechat-2026-10-23`). Novedad `2026-10-23-modpack-Chat-de-voz-mas-estable`.
- Servidores: Pruebas reiniciado con 2.6.22 + config nueva (arranca, «Compatibility version 20», voz en 24455, sin
  errores). Kanto y Kalos ARMADOS con aplica_al_reiniciar (jar + config) para su reinicio diario
  (`_pendiente-reinicio/mods-20261023-voicechat-<región>/`, config vieja en `.bak-20261023`).
- Config: `bind_address=*`, `voice_host=mc.servidorcobblemon.es` (antes la IP a mano: la mudanza del 21-09 la rompió;
  vacío no vale por el SRV de servidorcobblemon.es). Regla en `_infra-context-servidorcobblemon.md` §6.
- Pendiente: tras el reinicio, `aplica.out` OK y «Voice chat server started» en Kanto (24454) y Kalos (25565). Sin probar
  hablando en el juego.

## 2026-10-23 · Errores de jugadores revisados: packs SC viejos fuera y mejores pistas

- **Publicado como 1.17.3** (mismo día): rama juntada en master (el rediseño y el peso ya habían salido en la
  1.17.1/1.17.2); firmada (exe y programa `Valid` con sello, publisher ok); release v1.17.3 con exe, blockmap y
  latest.yml (feed público = local); `master` y `main` subidas; los 3 exe de OVH-A con sha512 del latest.yml y la
  descarga por Cloudflare = 93.647.208 B y mismo sha256; novedad `2026-10-23-launcher-1.17.3`; `sc-stats.py` instalado
  (copia `.bak-20261023`, stats.json regenerado bien). Lo de «Pendiente» de abajo ya está hecho.

- Pedido de Felix: cuánta gente tiene errores y cómo se corrigen. Datos de `stats.json`/`historico.json` (avisos
  anónimos): ~250-300 jugadores/día; 6-10 con un fallo de arranque visible, 6-10 cierres a media partida (SC-90, la
  mitad `0xC0000409` = driver/superposición). Pico SC-92 21-22/10 (129 y 187 jugadores): textura
  `sc_armor3d:armor3d/charizard/boots_left_leg` del SC-Pack; el 23-10 con la 3.2.90 ya sale 0 veces.
- Rama `fix/packs-viejos-pistas` (sobre master 1.17.2, SIN publicar: falta la firma con SimplySign de Felix):
  `sc$quitarPacksScViejos()` borra antes de cada partida los `SC-*.zip` viejos y deja solo `SC-Pack.zip`
  (los SC-93 de `shedinja_anime2026` venían de copias 3.1.6/3.1.8/3.2.71); `scPistaCrash` saca la clase en
  «Could not initialize class X» (Voice Chat 2/día sin clase); SC-04 lleva `k` (tipo fijo) y `n` (nombre del error).
  `tools/sc-stats.py` cuenta `k` y `n`.
- Comprobado: lint; prueba con carpeta falsa (borra los 3 SC viejos, respeta SC-Pack.zip, carpetas, packs ajenos y
  oficiales, `options.txt` con CRLF intacto, no borra nada sin SC-Pack.zip); clasificación y pistas con 10 casos; el
  launcher arranca sin errores de script. NO probado: una partida real lanzada con el cambio.
- Pendiente: instalar `sc-stats.py` en OVH-A (`/usr/local/bin`, el modo automático no me dejó escribir allí);
  publicar la versión (junto con las ramas de rediseño y de peso si salen a la vez). Sudowoodo «modelo» (SC-93
  `o=nada`): no lo pide ningún pack nuestro (3.2.90, SUPERLITE, extras, ni copias viejas) ni Cobblemon 1.8.2: viene
  de un pack del jugador; nada que arreglar en el nuestro.

## 2026-10-22 · Rediseño del launcher con el estilo de la tienda (PokéNav)

- Pedido de Felix (22-10): que el launcher se vea como store.servidorcobblemon.es. Mismas funciones y textos.
- Diseño: Codex hizo 31 maquetas HTML (`E:/codex-work/launcher-rework/`, `FICHA.md`, láminas en `laminas/`). Felix
  eligió la **variante A** («PokéNav completo»: la ventana es el aparato, pantalla crema, el fondo elegido dentro de un
  marco arriba). Base: el sistema de diseño `E:/RESOURCE-MC/marca-pokenav/` (los mismos colores y recetas que la tienda).
- Hecho: `app/assets/css/scpokenav.css` (nueva, la última en `app.ejs`) pisa launcher.css, rediseno.css, scpantallas.css
  y scskin.css; no cambia IDs ni JS de pantallas. Letras Silkscreen y Source Sans 3 en woff2 recortado al alfabeto latino
  (60 KB en total, licencia OFL en `fonts/PokeNav-fonts-LICENSE.txt`). `scfondos.js` pone además la variable `--sc-fondo`
  para que el fondo elegido salga en el marco de la portada y de la entrada.
- Comprobado con la app arrancada (carpeta de datos aparte en `E:/tmp/launcher-rework/ud`, capturas en
  `E:/tmp/launcher-rework/v/`): portada (normal, descargando, con cuenta), Eventos, Novedades (3 pestañas), Galería, las
  9 pestañas de Ajustes, selector de perfil, de cuenta, avisos (info y error), puerta de actualización (descargando y
  error), bienvenida, tipo de cuenta, login, espera de Microsoft, «Cambiar skin», pantalla de carga; a 900×540, 1100×700
  y 1600×1000.
- Pendiente / ideas: los PNG del diseño anterior (`images/ui`, 2,1 MB) y `Inter.woff2` (343 KB) ya casi no se ven;
  quitarlos (y sus referencias en las hojas viejas) bajaría el peso. No hecho aquí para no pisar la rama de peso.
  Los textos «Termina a las 07:45» y «Horas de España» del calendario siguen enseñando horas fijas (regla del 21-10).
