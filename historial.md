# SC Launcher · historial

## Estado actual
- Rama `fix/packs-viejos-pistas` (23-10): borrado automático de SC-Pack viejos + pistas de Voice Chat y de descargas.
  Probada, sin publicar. **Felix (23-10): sale en la MISMA versión que las ramas de rediseño y de peso**: quien junte
  esas dos, que junte también esta. `sc-stats.py` nuevo aún sin instalar en OVH-A.
- Rama `claude/rework-tienda-a39596`: rediseño PokéNav (aspecto de la tienda) terminado y comprobado en la app.
  Sin publicar: la sesión principal lo junta con la rama de peso `claude/peso-launcher-d11b48` y saca una sola versión.

## 2026-10-23 · Errores de jugadores revisados: packs SC viejos fuera y mejores pistas

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
