# SC Launcher · historial

## Estado actual
- **1.17.4 publicada (23-10)**: «Abrir al encender el PC» con pregunta única. Release en GitHub, novedad y los 3 exe
  de OVH-A hechos. Sin probar: desinstalación real y arranque tras reiniciar Windows.
- Voice Chat 2.6.22 (23-10): modpack y Pruebas ya; Kanto y Kalos entran en su próximo reinicio (mirar `aplica.out`).
- **1.17.3 publicada (23-10)**: borra solos los SC-Pack viejos y afina las pistas de Voice Chat (`d` en «Could not
  initialize class») y de descargas (`k`, `n`). `sc-stats.py` nuevo instalado en OVH-A. Mirar en unos días: `d` de los
  SC-90 de Voice Chat, `k` de los SC-04 y que bajen los SC-93 `sc-viejo`.

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
