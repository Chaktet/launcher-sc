# Emotes del modpack (Emotecraft 2.4.12)

Lo que reparte la distribución en `files/emotes/sc/` (303 emotes `.emotecraft` + icono `.png`, 9,5 MB) y la
rueda de `files/config/emotecraft.json`, más los 9 que trae el propio mod. Fuentes originales en
`E:/RESOURCE-MC/emotes-fuentes/` (no es git).

## Fuentes y criterio
- **SPEmotes** (Milyan, zip público de spemotes.com): 184, los más descargados en RedlanceEmotes
  (`spe_rank.tsv`), elegidos a mano en `spe_seleccion.tsv` con su nombre en español. Sus condiciones: uso
  público y gratuito, **prohibido venderlos** o meterlos tras un rango de pago.
- **Mine Emotes**: 110 (`mine_seleccion.txt`; Felix tiene permiso de sus autores). Nombres en `nombres_es.tsv`
  (la traducción oficial es automática y sale rara).
- **KosmX/Emotecraft-emotes** (CC0): los que quedan de `shortlist/`; los iconos que no traían se renderizaron
  con Steve en el juego (`lanzar_cliente.js` + datapack + `captura.ps1` + `icono.ps1`).
- Fuera: +18, autolesiones, drogas, armas de fuego, twerk, emotes de andar (2.4.12 corta el emote al moverse),
  variantes repetidas y todo lo que ya cubre otra fuente. Sin nombres repetidos (lo comprueba `monta_set.js`).
- **Límite de red: 32.000 bytes por emote** (`Medir.java`). Más grande y el servidor no lo manda
  ("packet's size is bigger than max allowed").

## Rehacer el set
1. Montar en una carpeta de trabajo `packs/mine`, `packs/extra/spemotes/x/SPEmotes ALL`, `final/sc` (los KosmX
   preparados) y los ficheros de selección de esta carpeta, con las rutas que esperan los scripts.
2. `node monta_set.js set_prueba` → JSON con UUID fijo (`servidorcobblemon:emote:<fichero>`), nombre en
   español e icono. Falla si hay nombres o UUID repetidos.
3. `powershell -File reduce_iconos.ps1 -Dir set_prueba` → iconos a 128 px (la cuarta parte de memoria gráfica).
4. `java Medir set_prueba` → ninguno por encima de 32.000.
5. `java Binario set_prueba set_bin` → convierte a `.emotecraft` con el código del mod y comprueba que cada uno
   vuelve a leerse con la animación idéntica byte a byte (20 MB de JSON → 3,5 MB).
6. `node rueda.js set_prueba emotecraft.json` → las 10 páginas de la rueda.
7. Copiar `.emotecraft` + `.png` a `files/emotes/sc/` y la config a `files/config/` en los dos perfiles,
   Nebula, `node tools/reponer_v.js`, subir y comprobar cada URL desde fuera.

Classpath de los `.java`: el jar de Emotecraft, el `player-animation-lib` que lleva dentro, gson y slf4j.
