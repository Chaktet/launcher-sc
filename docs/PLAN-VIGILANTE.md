# Plan · el launcher deja de ocupar RAM mientras se juega («vigilante»)

Estado: plan, pendiente de revisión de Codex (29-10-2026). Petición de Felix: el launcher se queda en ~520 MB
mientras se juega.

## Medido (29-10, PC de Felix, launcher 1.17.11)

- Launcher abierto: 4 procesos `SC Launcher.exe`, ~520 MB de working set (main 132, GPU 143 WS/265 privado,
  renderer 182, red 63). Hoy al cargar el juego solo se oculta en la bandeja: siguen vivos los 4.
- Prototipo (`E:\tmp\launcher-ram`, Electron 39): al destruir la ventana sin cerrar la app quedan main + GPU + red
  (~240 MB WS). Chromium no cierra su proceso de GPU. Cerrar solo la ventana ahorra la mitad.
- El mismo `electron.exe` con `ELECTRON_RUN_AS_NODE=1`: 97 MB WS, **23 MB privados**, que son los que cuentan.

## Idea

El padre del proceso de Minecraft deja de ser el renderer. Pasa a serlo un proceso Node pequeño (el vigilante):
`SC Launcher.exe` en modo Node, separado, sin ventana. Hoy el juego se lanza con `spawn` desde el renderer con stdout y
stderr por tubería (`processbuilder.js:118`). Si el launcher se cierra, esas tuberías se rompen y nadie conoce el
código de salida. Solo el padre lo sabe. Por eso hay que mover el padre, no basta con cerrar la ventana.

Cuando el juego ha cargado (`onLoadComplete`, el mismo momento en que hoy se oculta), el launcher se cierra entero. El
vigilante sigue leyendo la salida del juego (si no la lee, la tubería se llena y Minecraft se bloquea) y guarda las
últimas líneas. También lleva Discord. Al cerrarse el juego escribe el resultado en disco y vuelve a abrir el
launcher, que hace con ese resultado lo mismo que hace hoy en `proc.on('close')`.

## Piezas

1. **`app/assets/js/scvigilante.js`** (nuevo, solo Node, sin Electron ni jQuery). Lo arranca el renderer con
   `child_process.fork(script, [], { execPath: process.execPath, env: {...env, ELECTRON_RUN_AS_NODE: '1'},
   detached: true, stdio: ['ignore','ignore','ignore','ipc'], windowsHide: true })` y `unref()`.
   - Por IPC recibe: ejecutable de Java, args, cwd y env (los que hoy calcula `ProcessBuilder.build`), la ruta del
     launcher (`process.execPath`), la carpeta de instancias, el id del servidor, el perfil, `inicioPartida`, y los
     datos y textos de Discord.
   - Lanza Java con `spawn(..., { detached: true, windowsHide: false })` y tuberías. Reenvía al launcher, mientras
     esté conectado, `spawn` (pid), `stdout`, `stderr`, `error`, `exit` y `close`.
   - Mantiene las últimas 200 líneas, igual que `scSalidaError`, y marca `juegoArranco` cuando ve
     `SC_HITO_CONECTANDO` (regex pasada por IPC: una sola fuente).
   - `disconnect` del IPC no lo mata: sigue vigilando.
   - Discord RPC: lo lleva el vigilante entero (`discord-rpc-patch` es Node puro). Así no hay dos clientes y sigue
     funcionando con el launcher cerrado. Reutiliza `gameStateChange` (regex SERVER_JOINED/GAME_JOINED).
   - Al cerrarse el juego: borra `sc-juego.pid` (como hoy `ScJuegoAbierto.borrar`), escribe
     `<instancias>/sc-juego-cierre.json` `{ pid, code, signal, servidorId, perfil, inicioPartida, juegoArranco,
     fin, salida }` (escritura atómica: tmp + rename). Si el launcher sigue conectado, solo manda `close` y el
     launcher lo procesa y borra el fichero. Si no, lo abre con `spawn(launcher, ['--tras-juego'], { detached })` y
     termina.
   - Su propio log en `<instancias>/logs/sc-vigilante.log` (rotado, máx. ~1 MB) para soporte.
2. **Proxy en el renderer** (`scvigilante.js` exporta `lanzar(opciones)`): devuelve un objeto con la misma forma que el
   `ChildProcess` que usa `landing.js` (`pid`, `stdout`/`stderr` EventEmitter con `setEncoding`, `on('exit'|'close'|
   'error')`, `removeListener`). Así los listeners de `landing.js` (hitos, errores, `close`) apenas cambian.
   `ProcessBuilder.build()` se parte en `preparar()` (todo lo de hoy salvo el `spawn`) y el `spawn`, para poder dárselo
   al vigilante.
3. **Cerrar el launcher al cargar el juego** (`index.js`, `sc-ventana-juego`): nueva acción `'cerrar-por-juego'` que
   - pone `autoUpdater.autoInstallOnAppQuit = false` antes de salir, porque el instalador NSIS mata los
     `SC Launcher.exe` y eso incluye al vigilante. La actualización se aplica en el siguiente cierre normal;
   - libera el bloqueo de instancia única y llama `app.quit()`.
   Solo si `minimizarAlJugar` (el ajuste de hoy) está activo, en Windows y con el vigilante conectado. Si no, hace lo
   de hoy (ocultar en la bandeja).
4. **Al abrir con `--tras-juego`, o en cualquier arranque**: `landing.js` mira `sc-juego-cierre.json`. Si existe y es de
   las últimas 24 h, ejecuta la lógica de cierre de hoy, extraída a una función `scTrasCerrarJuego(resultado)`:
   `scInvalidarCacheValidacion` si `code !== 0`, `scAnalizarCierreDelJuego` (si no arrancó) o `scAvisoCrashPartida`,
   `scOfrecerPerfilMasLigero`, `scDialogoCierreNativo`, `scDialogoModsPropios`. Luego borra el fichero. El mismo código
   sirve para el `close` en vivo, así que hay una sola ruta.
   - `second-instance` (el jugador ya había reabierto el launcher a mano): reenvía `--tras-juego` al renderer para
     que mire el fichero.
5. **Lo que queda igual**: `sc-juego.pid` / `ScJuegoAbierto` (el pid sigue siendo el de Java, el creado por el
   vigilante), bloqueo de JUGAR con el juego abierto, la barra de hitos (el launcher sigue vivo hasta
   `onLoadComplete`), los fallos de arranque antes de conectar (el launcher sigue vivo y los ve en directo).
6. **Red de seguridad**: si el vigilante no arranca o no confirma `spawn` en 10 s, `landing.js` lanza el juego como hoy
   (spawn directo) y se oculta en la bandeja. Interruptor en la configuración (`settings.launcher.vigilante`, true
   por defecto) para apagarlo si sale algo raro.

## Lo que se pierde a sabiendas (decírselo a Felix)

- Mientras se juega no hay icono en la bandeja. Abrir el launcher desde el escritorio sigue funcionando y detecta el
  juego abierto.
- Los recordatorios de eventos de escritorio (`eventos.js`), la comprobación del modpack remoto y la búsqueda de
  actualización no corren durante la partida. Vuelven al cerrar el juego.
- Al cerrar el juego, el launcher tarda lo que tarda en abrir (unos segundos) en reaparecer.

## Comprobaciones (cada una falla si está roto)

1. Medida antes/después con el juego cargado: suma del privado de todos los `SC Launcher.exe` (≥ 85 % menos) y CPU
   en 10 s.
2. El juego sigue vivo 10 min después de cerrarse el launcher y la salida no se bloquea (el log del juego avanza).
3. Cierre normal del juego → el launcher reaparece solo y sin avisos.
4. Juego matado con código ≠ 0 a media partida (`taskkill /F` no vale, sale como «cerrado por Windows»; usar un
   crash provocado) → al reaparecer sale el aviso SC-90 / el diálogo correspondiente, igual que hoy.
5. Fallo antes de conectar (Java roto, falta una librería) → igual que hoy, con el launcher abierto.
6. Launcher reabierto a mano durante la partida → JUGAR bloqueado. Al cerrar el juego ese launcher procesa el
   resultado (no se abre un segundo).
7. Discord muestra la actividad durante la partida y se limpia al cerrar.
8. Con una actualización descargada: no se instala al cerrarse por el juego; sí en el siguiente cierre normal.
9. Vigilante desactivado en la configuración → comportamiento de hoy.

Mac y Linux se quedan como hoy en esta versión (sin bandeja en Mac; la identidad de `ScJuegoAbierto` es de Windows).

## Cambios tras la revisión de Codex (29-10, 5 bloqueos + 4 bugs, todos aceptados)

Prototipo previo (`E:\tmp\launcher-ram`, Electron 39 sin empaquetar): renderer → `fork` separado con IPC → Java falso
que escribe sin parar; el launcher hace `app.quit()`, el vigilante sigue vivo, drena 90.608 líneas y recoge el código
de salida exacto (3). Falta repetirlo con el exe empaquetado y firmado (asar, instalador real).

1. **Relanzar sin modo Node**: el `spawn` del launcher lleva un entorno sin `ELECTRON_RUN_AS_NODE`, `detached`,
   `stdio: 'ignore'` y `unref()`.
2. **Actualizaciones**: el vigilante deja una marca `<instancias>/sc-vigilante/vivo-<runId>.json` (su pid) mientras
   vive. `index.js` decide en `before-quit` (no al iniciar) si `autoInstallOnAppQuit` vale, y `installUpdateNow` no
   instala si hay un vigilante vivo. Así cubre también el launcher reabierto a mano durante la partida.
3. **Respaldo sin doble Minecraft**: si el vigilante no confirma el pid de Java en 15 s, se mata su árbol entero
   (`taskkill /T /F /PID <vigilante>`, que se lleva un Java que haya llegado a crear), se espera a que muera y solo
   entonces se lanza directo. Un fallo de Java (`error` de spawn) no es motivo de respaldo: va al `error` de hoy.
4. **Pid antes de seguir**: `lanzar()` es asíncrono y no termina hasta tener el pid de Java. `ScJuegoAbierto.anotar`
   se llama con ese pid. El borrado de la marca al cerrar lo hace el vigilante (el renderer ya no estará).
5. **Lectura aislada del IPC**: el vigilante drena siempre stdout/stderr y guarda las últimas 200 líneas. Solo
   reenvía si `process.connected`, con `try/catch` y callback de error y una cola máxima (lo que sobra se descarta;
   es solo para la barra de hitos). Un fallo de envío nunca lo termina.
6. **Resultado con acuse**: el resultado se escribe SIEMPRE en disco antes de avisar. El vigilante manda `cierre` y
   espera `consumido` (5 s). Si no llega, o el IPC se cae, deja el fichero y, si el launcher se cerró por el juego,
   lo relanza.
7. **Un resultado por partida**: `<instancias>/sc-vigilante/resultado-<runId>.json` (runId aleatorio). Se reclama
   renombrándolo a `.procesando-<pid>` (atómico: solo una instancia gana) y se borra al terminar. Se ignoran los de
   más de 7 días.
8. **Una sola decisión de carga**: el renderer es quien decide `onLoadComplete` (hito o temporizador, como hoy) y se
   lo dice al vigilante (`cargado`). El launcher solo se cierra cuando el vigilante confirma `cargado`.
9. **IPC en JSON**: regex como `{source, flags}` y errores como `{message, code, errno, syscall, path, stack}`,
   reconstruidos al otro lado.
10. **Contrato explícito**: `ScVigilante.lanzar()` → `{ runId, pid, juego }`, donde `juego` es un EventEmitter con
    `stdout`/`stderr` (EventEmitter), `exit`/`close`/`error`, `marcarCargado()`, `saliendoPorJuego()` y
    `consumido()`. Lleva solo lo que `landing.js` usa. La limpieza de `tempNativePath` pasa al vigilante.

**Relanzar o no**: el vigilante solo vuelve a abrir el launcher si este se cerró POR el juego (`saliendoPorJuego`).
Si el jugador lo cerró a mano, el resultado espera al siguiente arranque, como hoy (hoy se perdía).
