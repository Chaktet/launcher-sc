# Teclas de los mods del launcher (revisión del 02-11-2026)

Qué teclas añaden, cambian o necesitan los mods que reparte el launcher, y cuáles chocan para un jugador que entra
**por primera vez** (instalación nueva: tecla de fábrica del mod + lo que impone nuestro `options.txt` + el parche
`SC_TECLAS_EN_CONFLICTO` del launcher, que pone los mismos valores).

Base: manifiesto `distribution.json` md5 `bfd6443a…` (el de OVH-A). Los `options.txt` que sirve
`descargas.servidorcobblemon.es` son idénticos a los locales (PRO `b41f3aee`, LITE `52fd1a62`, SUPER LITE `8dff1c16`).

## Cómo se ha revisado

- **Todos los jars, no una muestra**: 89 jars distintos (PRO 87, LITE 57, SUPER LITE 57; LITE y SUPER LITE llevan
  exactamente los mismos), incluidos los jars metidos dentro de otros. Un solo script lee el bytecode de cada clase y
  saca cada `KeyMapping` (`class_304`) con su nombre y su código de tecla, los atajos propios de MaLiLib, Litematica e
  Inventory Profiles Next (con su contexto: mundo, pantallas o ambos) y las lecturas directas del teclado
  (`InputConstants.isKeyDown`, `glfwGetKey`). Ninguna clase dio error al leerla.
- **Contraste con el juego real**: el `options.txt` de las instancias del launcher de Felix (PRO 169 teclas, LITE 134; 6 de las de su PRO son de mods o ajustes que un jugador nuevo no tiene)
  dice qué acciones registra de verdad el juego. Todas las de los mods aparecen en el escaneo, salvo lo explicado abajo.
- **Qué acción gana una tecla repetida**: Minecraft guarda una sola acción por tecla. Al cargar `options.txt` recorre
  todas las acciones (un `HashMap` por nombre) y la última que encuentra con esa tecla se queda con ella; la otra no
  responde **en el mundo**. Se ha calculado con ese mismo orden. El método acierta el fallo que ya vivimos: con las
  teclas de fábrica predice que la V se la queda Shulker Preview y el menú del chat de voz no abre, que es lo que pasó
  (ver `PAQUETES-Y-SHADERS.md`). Aun así, el ganador de cada choque nuevo está **calculado, no probado en el juego**.
- Una acción que solo actúa **dentro de pantallas** (inventario, cofres, crafteo) y compara la tecla ella misma sigue
  funcionando aunque comparta tecla con algo del mundo. Así funcionan JEI (guarda su tecla aparte y no se la quita a
  nadie: por eso su «A» no rompe andar a la izquierda), Item Zoomer y Crafting Tweaks.

## Recuento

| Perfil | Jars revisados | Mods que registran o leen teclas | Teclas registradas (instalación nueva) |
|---|---|---|---|
| PRO | 87 | 23 (20 con teclas de Minecraft + MaLiLib, Inventory Profiles Next y Litematica) | 163 |
| LITE | 57 | 15 (13 + MaLiLib y Litematica) | 136 |
| SUPER LITE | 57 | 15 (los mismos que LITE) | 136 |

Litematica viene **desactivado** de serie (opcional apagado) en los tres perfiles. Las lecturas directas del teclado
que hay (ChatShot, Cobblemon Extended Battle UI, Crafting Tweaks, Mouse Tweaks, Iris, YACL, EntityCulling…) son todas
Mayús/Ctrl/Alt o letras dentro de su propia pantalla; Language Reload solo mira F3+J. Ninguna actúa en el mundo.

## Tabla completa

«Perfiles»: PRO, LITE, SL = SUPER LITE. «Nuestra distribución»: si el `options.txt` que repartimos (y el parche del
launcher) la cambia. Las teclas son las de la posición en un teclado español (p. ej. `semicolon` es la Ñ).

### Teclas de Minecraft (`options.txt`)

| Mod | Versión | Perfiles | Acción | Tecla de fábrica | Nuestra distribución |
|---|---|---|---|---|---|
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Atacar/romper `key.attack` | clic izq. | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Usar/colocar `key.use` | clic der. | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Avanzar `key.forward` | W | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Izquierda `key.left` | A | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Retroceder `key.back` | S | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Derecha `key.right` | D | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Saltar `key.jump` | Espacio | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Agacharse `key.sneak` | Mayús izq. | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Correr `key.sprint` | Ctrl izq. | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Soltar objeto `key.drop` | Q | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Inventario `key.inventory` | E | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Chat `key.chat` | T | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Lista de jugadores `key.playerlist` | Tab | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Coger bloque `key.pickItem` | clic central | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Abrir comando `key.command` | / (tecla -) | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Interacciones sociales `key.socialInteractions` | P | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Captura `key.screenshot` | F2 | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Cambiar cámara `key.togglePerspective` | F5 | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Pantalla completa `key.fullscreen` | F11 | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Cambiar a la otra mano `key.swapOffhand` | F | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Guardar barra (creativo) `key.saveToolbarActivator` | C | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Cargar barra (creativo) `key.loadToolbarActivator` | X | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Progresos `key.advancements` | L | no |
| Minecraft (vanilla) | 1.21.1 | PRO, LITE, SL | Barra rápida 1–9 `key.hotbar.1` | 1 | no |
| CinematicZoom | 1.1 | PRO | Zoom cinemático `key.cinematiczoom.zoom` | C | no |
| Cobblemon | 1.8.3+1.21.1 | PRO, LITE, SL | Ocultar el equipo `key.cobblemon.hideparty` | O | no |
| Cobblemon | 1.8.3+1.21.1 | PRO, LITE, SL | Resumen del equipo `key.cobblemon.summary` | M | la fija igual |
| Cobblemon | 1.8.3+1.21.1 | PRO, LITE, SL | Siguiente Pokémon `key.cobblemon.downshiftparty` | Flecha abajo | no |
| Cobblemon | 1.8.3+1.21.1 | PRO, LITE, SL | Pokémon anterior `key.cobblemon.upshiftparty` | Flecha arriba | no |
| Cobblemon | 1.8.3+1.21.1 | PRO, LITE, SL | Lanzar Pokémon `key.cobblemon.throwpartypokemon` | R | la fija igual |
| Cobblemon | 1.8.3+1.21.1 | PRO, LITE, SL | Mirar libre al montar `key.cobblemon.ridingfreelook` | Alt izq. | no |
| Cobblemon Extended Battle UI | 0.10.0+sc.1 | PRO, LITE, SL | Panel de info de combate `key.cobblemonextendedbattleui.toggle_panel` | V | **sí → Ñ** |
| Cobblemon Extended Battle UI | 0.10.0+sc.1 | PRO, LITE, SL | Letra del panel más grande `key.cobblemonextendedbattleui.increase_font` | + (tecla ]) | **sí → .** |
| Cobblemon Extended Battle UI | 0.10.0+sc.1 | PRO, LITE, SL | Letra del panel más pequeña `key.cobblemonextendedbattleui.decrease_font` | ` (tecla [) | **sí → ,** |
| Crafting Tweaks | 21.1.10 | PRO | Compactar montón (pantalla de crafteo) `key.craftingtweaks.compress_stack` | K | **sí → º** |
| Crafting Tweaks | 21.1.10 | PRO | Rellenar último montón (pantalla de crafteo) `key.craftingtweaks.refill_last_stack` | Tab | **sí → Insert** |
| Emotecraft | 2.4.12 | PRO, LITE, SL | Rueda de emotes `key.emotecraft.fastchoose` | B | la fija igual |
| Iris | 1.8.8+mc1.21.1 | PRO, LITE, SL | Recargar shaders `iris.keybind.reload` | R | **sí → Fin** |
| Iris | 1.8.8+mc1.21.1 | PRO, LITE, SL | Encender/apagar shaders `iris.keybind.toggleShaders` | K | no |
| Iris | 1.8.8+mc1.21.1 | PRO, LITE, SL | Menú de shaders `iris.keybind.shaderPackSelection` | O | **sí → sin tecla** |
| Item Zoomer | 2.2.2-1.21.1 | PRO | Ampliar objeto (en inventarios) `key.itemzoomer.toggle_zoom` | Z | no |
| Jade | 15.10.5+fabric | PRO | Ajustes de Jade `key.jade.config` | 0 teclado num. | no |
| Jade | 15.10.5+fabric | PRO | Mostrar/ocultar Jade `key.jade.show_overlay` | 1 teclado num. | no |
| Jade | 15.10.5+fabric | PRO | Detectar líquidos `key.jade.toggle_liquid` | 2 teclado num. | no |
| Jade | 15.10.5+fabric | PRO | Ver recetas del bloque `key.jade.show_recipes` | 3 teclado num. | no |
| Jade | 15.10.5+fabric | PRO | Ver usos del bloque `key.jade.show_uses` | 4 teclado num. | no |
| Jade | 15.10.5+fabric | PRO | Narrar `key.jade.narrate` | 5 teclado num. | no |
| Presence Footsteps | 1.11.2+1.21 | PRO | Ajustes de pisadas `key.presencefootsteps.settings` | F10 | no |
| Punchy | 2.8e | PRO, LITE, SL | Menú de Punchy `key.punchy.open_main_menu` | F8 | no |
| Punchy | 2.8e | PRO, LITE, SL | Inspeccionar objeto en mano `key.punchy.inspect` | I | no |
| Shulker Preview | 1.2.0+1.21 | PRO | Vista previa de shulker `open_shulker` | V | **sí → F4** |
| Simple Voice Chat | 1.21.1-2.6.22 | PRO, LITE, SL | Pulsar para hablar `key.push_to_talk` | sin tecla | **sí → Bloq Mayús** |
| Simple Voice Chat | 1.21.1-2.6.22 | PRO, LITE, SL | Silenciar micro `key.mute_microphone` | M | **sí → F6** |
| Simple Voice Chat | 1.21.1-2.6.22 | PRO, LITE, SL | Desconectar chat de voz `key.disable_voice_chat` | N | **sí → F7** |
| Simple Voice Chat | 1.21.1-2.6.22 | PRO, LITE, SL | Ocultar iconos de voz `key.hide_icons` | H | no |
| Simple Voice Chat | 1.21.1-2.6.22 | PRO, LITE, SL | Menú del chat de voz `key.voice_chat` | V | no |
| Simple Voice Chat | 1.21.1-2.6.22 | PRO, LITE, SL | Grupos de voz `key.voice_chat_group` | G | no |
| Too Many Entities | 1.2.0 | PRO, LITE, SL | Activar/desactivar Too Many Entities `key.too_many_entities.toggle_mod` | O | **sí → F12** |
| Too Many Players | 1.21-1.1.5 | PRO, LITE, SL | Activar/desactivar Too Many Players (oculta jugadores) `key.toomanyplayers.toggleMod` | J | no |
| Xaero's Minimap | 25.3.12 | PRO, LITE, SL | Ajustes del minimapa `gui.xaero_minimap_settings` | Y | no |
| Xaero's Minimap | 25.3.12 | PRO, LITE, SL | Nuevo punto de ruta `gui.xaero_new_waypoint` | B | **sí → Inicio** |
| Xaero's Minimap | 25.3.12 | PRO, LITE, SL | Lista de puntos de ruta `gui.xaero_waypoints_key` | U | no |
| Xaero's Minimap | 25.3.12 | PRO, LITE, SL | Ampliar minimapa (mantener) `gui.xaero_enlarge_map` | Z | no |
| Xaero's Minimap | 25.3.12 | PRO, LITE, SL | Punto de ruta instantáneo `gui.xaero_instant_waypoint` | + teclado num. | no |
| Xaero's World Map | 1.40.16 | PRO, LITE, SL | Abrir mapa del mundo `gui.xaero_open_map` | M | **sí → N** |
| Xaero's World Map | 1.40.16 | PRO, LITE, SL | Ajustes del mapa del mundo `gui.xaero_open_settings` | + (tecla ]) | no |
| Xaero's World Map | 1.40.16 | PRO, LITE, SL | Confirmar rápido (en el mapa) `gui.xaero_quick_confirm` | Mayús der. | no |

**Acciones registradas sin tecla de fábrica** (no pueden chocar):

- Minecraft (vanilla) (2): Cámara cinemática, Resaltar jugadores (espectador)
- Crafting Tweaks (12): Rotate Grid, Rotate Grid (CCW), Balance Grid, Spread Grid, Clear Grid, Force Clear Grid, Compress Item, Compress All, Decompress Item, Decompress Stack, Decompress All, Transfer to Crafting Grid
- Emotecraft (1): Stop Playing Emote
- EntityCulling (1): Debug toggle culling
- Iris (1): Wireframe (SP only)
- Jade (1): Show Details (Alternative)
- LambDynamicLights (1): Toggle First-Person Lighting
- Mod Menu (1): Open Mod Menu
- Presence Footsteps (1): Toggle Mod
- Simple Voice Chat (4): Whisper, Voice Chat Settings, Toggle Recording, Adjust Volumes
- Too Many Players (10): Hide players, Display only heads, Hide armor, Hide held items, Hide item glint, Hide players' second layer, Toggle Hiding Areas, Toggle online whitelist, Open player interaction menu., Open config menu
- Xaero's Minimap (18): gui.xaero_minimap_server_profiles, gui.xaero_zoom_in, gui.xaero_zoom_out, gui.xaero_toggle_map, gui.xaero_toggle_waypoints, gui.xaero_toggle_map_waypoints, gui.xaero_toggle_slime, gui.xaero_toggle_grid, gui.xaero_switch_waypoint_set, gui.xaero_display_all_sets, gui.xaero_toggle_light_overlay, gui.xaero_toggle_entity_radar, gui.xaero_reverse_entity_radar, gui.xaero_toggle_manual_cave_mode, gui.xaero_alternative_list_players, gui.xaero_toggle_tracked_players_on_map, gui.xaero_toggle_tracked_players_in_world, gui.xaero_toggle_pac_chunk_claims
- Xaero's World Map (4): gui.xaero_world_map_server_settings, gui.xaero_map_zoom_in, gui.xaero_map_zoom_out, gui.xaero_toggle_dimension

### Atajos propios (no van en `options.txt`, cada mod los guarda en su config)

| Mod | Versión | Perfiles | Atajo (contexto) | De fábrica | Nuestra distribución |
|---|---|---|---|---|---|
| MaLiLib | 0.21.10 | PRO, LITE, SL | Abrir ajustes de MaLiLib (mundo) | A y luego C | no |
| Inventory Profiles Next | 2.2.6 | PRO | Abrir sus ajustes (mundo) | R y luego C | no |
| Inventory Profiles Next | 2.2.6 | PRO | Recargar configuración (mundo y pantallas) | R+Y | no |
| Inventory Profiles Next | 2.2.6 | PRO | Ordenar inventario (pantallas) | R | no |
| Inventory Profiles Next | 2.2.6 | PRO | Mover todo / tirar todo (pantallas) | R+T / R+M | no |
| Inventory Profiles Next | 2.2.6 | PRO | Saltar al cofre / al inventario (pantallas) | rueda arriba / abajo | no |
| Inventory Profiles Next | 2.2.6 | PRO | Editor de botones (pantallas) | R+G | no |
| Inventory Profiles Next | 2.2.6 | PRO | Auto-relleno: marcar ranura (ambos) / en juego (mundo) | Ctrl+clic / Ctrl+R | apagamos el auto-relleno |
| Inventory Profiles Next | 2.2.6 | PRO | Comercio con aldeanos (pantalla del aldeano) | B, L, T, Mayús+T | no |
| Inventory Profiles Next | 2.2.6 | PRO | Perfiles: aplicar, siguiente, anterior, 1–10 (mundo) | R+H, R+Z, R+X, R+1…R+0 | apagamos los perfiles |
| Inventory Profiles Next | 2.2.6 | PRO | Guardar perfil (pantallas) / copiar componentes / copiar id | R+P / Ctrl+C / Ctrl+Mayús+C | no |
| Crafting Tweaks | 21.1.10 | PRO | Compactar uno / compactar todo (pantalla de crafteo, con modificador) | K con Mayús/Ctrl | no |
| Jade | 15.10.5 | PRO | Ver más detalles (mantener) | Mayús izq. | no |
| JEI | 19.25.1.332 | PRO, LITE, SL | 35 acciones, todas solo en pantallas: ocultar JEI (Ctrl+O), buscar (Ctrl+F), receta (R), usos (U), favorito (A), páginas (Re Pág/Av Pág), historial (↑ ↓), atrás (Retroceso)… | — | ocultar JEI → **F9** |
| Litematica (desactivado) | 0.19.61 | PRO, LITE, SL | Menú principal | M | no |
| Litematica (desactivado) | 0.19.61 | PRO, LITE, SL | Más de 20 combinaciones con M (M+A, M+R, M+T, M+C, M+L…), info en pantalla (I), ajustes de colocación (− teclado num.), área (* teclado num.), capas (Re Pág/Av Pág), clics con la herramienta | — | no |

No hay atajos de Emotecraft por emote en la config que repartimos. FancyMenu tiene la superposición de edición apagada
(`show_customization_overlay = false`), así que su Ctrl+Alt+C no hace nada para los jugadores.

## Choques para un jugador nuevo

Los arreglos ya hechos (V del panel de combate, M del micro, N del chat de voz, O de JEI y Too Many Entities, B de
Xaero, K y TAB de Crafting Tweaks, V de Shulker Preview, R y O de Iris, M del mapa de Xaero) funcionan: con ellos no
queda ningún choque grave entre teclas de Minecraft en LITE ni en SUPER LITE. Queda esto:

| # | Perfil | Tecla | Quién | Qué pasa en el juego | Gravedad | Propuesta |
|---|---|---|---|---|---|---|
| 1 | PRO, LITE, SL | A y luego C | MaLiLib «abrir ajustes» contra andar a la izquierda (A) + Zoom cinemático (C, solo PRO) | Ir a la izquierda y pulsar C abre la pantalla de ajustes de MaLiLib y se come la C (en PRO, no hace zoom). MaLiLib es obligatorio en los tres perfiles. Calculado, sin probar. | Media | Dejarla **sin atajo** (sus ajustes siguen en Mod Menu). Mejor como parche de una vez en el launcher sobre `config/malilib.json`, como `SC_TECLAS_EN_CONFLICTO`, para no pisar el resto de su config. |
| 2 | PRO | C | Zoom cinemático contra «Guardar barra» de Minecraft | Gana el zoom (calculado): en creativo, C+número ya no guarda la barra. En supervivencia no pasa nada. | Baja (solo creativo: Builders/staff) | Dejarlo así. Si los builders lo echan en falta: zoom al **botón lateral del ratón 4** (libre en todo). |
| 3 | PRO | R (en inventarios) | Inventory Profiles «ordenar» (R) contra JEI «ver receta» (R) | Con el ratón encima de un objeto en un cofre o el inventario, R puede ordenar y abrir la receta a la vez, o solo una. Sin probar. | Baja-media | Probarlo en el juego antes de tocar nada. Si choca: ordenar con **clic central** o sin atajo (hay botón en pantalla). |
| 4 | PRO | R y luego otra tecla | Inventory Profiles (R+C ajustes, R+Y recargar, Ctrl+R, R+H/Z/X, R+1…R+0) contra «Lanzar Pokémon» (R) | Lanzar con R funciona. Solo si mantienes R y pulsas otra: R+C abre los ajustes de IPN y R+1…0 podrían no cambiar de ranura (los perfiles y el auto-relleno están apagados, así que esas no hacen nada más). Sin probar. | Baja | Dejarlo; si molesta, dejar sin atajo R+C y R+Y. |
| 5 | PRO | Z | Item Zoomer contra «Ampliar minimapa» de Xaero | Nada: Item Zoomer solo actúa dentro de inventarios y Xaero en el mundo. Solo sale en rojo en Controles. | Ninguna | Nada. |
| 6 | PRO, LITE, SL (si el jugador activa Litematica) | M, I | Litematica «menú principal» (M) contra «Resumen del equipo» de Cobblemon (M); «info» (I) contra «Inspeccionar» de Punchy (I) | Sin probar. Litematica lee el teclado antes que Minecraft y suele cortar la tecla. | Baja (viene apagado) | Nada mientras siga apagado de serie. Si se enciende algún día: menú de Litematica a **M+Ñ** o sin atajo. |

**Teclas libres de verdad** (ninguna acción de Minecraft ni atajo propio de ningún mod en los tres perfiles, comprobado con el mismo script): 6, 7, 8 y 9, «.» y «/» del teclado numérico, Supr, Pausa y los botones laterales 4 y 5 del ratón. Intro del teclado numérico también está libre en el mundo (Iris ya no la usa; JEI solo la mira dentro de su buscador). F4 solo está libre en LITE y SUPER LITE (en PRO es Shulker Preview). Todas las letras y los números de arriba ya los usa algo.

## Diferencias con las instancias de Felix (no afectan a jugadores nuevos)

- Felix ha cambiado muchas teclas a mano (Jade, Iris, panel de combate, mapa de Xaero en Re Pág, etc.). En su PRO:
  «Recargar shaders» e «Info de combate» comparten Intro del teclado numérico (gana el panel de combate) y tiene dos
  animaciones de Punchy propias en J y G (`config/punchy/triggerable-keybindings.json`) que pierden contra Too Many
  Players (J) y Grupos de voz (G). Esas dos no vienen en Punchy ni en ningún pack que repartimos.
- Su PRO tiene además mods que no reparte el launcher (Flashback, `sc-herramientas`, otro jar de Extended Battle UI).
- Su LITE no tiene teclas de Punchy (inspeccionar I, menú F8): Punchy viene encendido de serie en LITE/SL, así que un
  jugador nuevo sí las tiene (ni I ni F8 chocan en LITE/SL).
- Cobblemon 1.8.3 trae en el código la tecla del PokéNav (N) y la del Pokédex, pero no las registra: no salen en
  Controles y la N es del mapa de Xaero.

## Para rehacer esta revisión

Scripts en `E:/tmp/teclas-mods/script/` (fuera del repo): `scan.py` (todas las teclas de todos los jars),
`efectivo.js` (tecla final por perfil y quién gana cada choque), `raw.py` (lecturas directas del teclado),
`ipnctx2.py` (contextos de Inventory Profiles). Lanzarlos con un Python 3 cualquiera (`-I`) y Node.
