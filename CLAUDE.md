# SC Launcher · guía para agentes

> Router slim. El detalle está en `docs/`. No cargues todo: lee solo lo que pida la tarea.

Launcher oficial de `servidorcobblemon.es`. Fork de [Helios Launcher](https://github.com/dscalzi/HeliosLauncher)
(MIT) en Electron. Versión actual: `1.5.8` ([package.json](package.json)).

## Orden de verdad

1. Estado del repo · `git status` · `git log`
2. `docs/*.md` de este repo
3. Este `CLAUDE.md`
4. `E:\cobblemon-web\infra\INFRA-MAP.md` — infra del ecosistema (⚠️ del 22/05/2026, verifica antes de fiarte)

## Al empezar

```bash
git status && git log --oneline -10
```

Después, según la tarea:

| Tarea | Lee |
|---|---|
| Cualquier cosa del launcher | [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) |
| Paquetes de recursos, shaders, `options.txt`, teclas | [docs/PAQUETES-Y-SHADERS.md](docs/PAQUETES-Y-SHADERS.md) |
| Un jugador reporta un fallo con código SC-XX | [docs/ERRORES.md](docs/ERRORES.md) |
| Publicar modpack o instalador | [docs/DISTRIBUCION.md](docs/DISTRIBUCION.md) |

`docs/distro.md` y `docs/MicrosoftAuth.md` son heredados de Helios (upstream), no nuestros.

## Repos hermanos

| Ruta | Qué es |
|---|---|
| `E:\PROYECTOS-MC\sc-distribution` | Los ficheros reales del modpack (root de Nebula) |
| `E:\PROYECTOS-MC\sc-nebula` | Generador de `distribution.json` |
| `E:\PROYECTOS-MC\rpacks` | Paquetes de recursos sueltos, antes de entrar en la distribución |
| `E:\cobblemon-web` | Portal web + doc de infra. ⚠️ Es un worktree huérfano: `git` no funciona ahí |

## Convenciones

- **Prefijo `sc$` / `sc`** en todo lo que es nuestro. Sin prefijo = código heredado de Helios; tócalo
  lo mínimo para que los merges del upstream sigan siendo posibles.
- **Comentarios en español explicando el *porqué***, no el qué. Cada parche raro arregla un fallo
  real; si quitas el comentario, el siguiente lo revierte por "limpieza".
- **Cero cadenas literales de UI en el JS.** Todo a [_custom.toml](app/assets/lang/_custom.toml) vía
  `Lang.queryJS()`.
- **`sc$escapeHtml()` siempre** antes de meter algo en `innerHTML`: nombres de fichero elegidos por el
  jugador y datos remotos incluidos.
- Commits en conventional commits, en español.

## Reglas duras

- ⛔ **`options.txt` no se toca con el juego abierto.** Minecraft lo reescribe entero al cerrarse y se
  pierde el cambio. Comprueba `sc$juegoAbierto()` antes de cualquier escritura. Ver
  [docs/PAQUETES-Y-SHADERS.md](docs/PAQUETES-Y-SHADERS.md).
- ⛔ **Nada de reiniciar ni tocar servidores de Minecraft de producción** sin un "sí, reinicia" textual
  del usuario. OVH-A aloja además el proxy Velocity, el Lobby y Hoenn.
- ⛔ **Nunca reemplaces un `.zip` del pack conservando el nombre.** Apache los sirve `immutable` con
  un año de caché: jugadores y Cloudflare seguirían dando el viejo. Versiona el nombre del fichero.
  Ver [docs/DISTRIBUCION.md](docs/DISTRIBUCION.md).
- Al añadir un código de error nuevo, actualiza la tabla de [docs/ERRORES.md](docs/ERRORES.md): es la
  que usa soporte.

## Trampas conocidas

- **PRO y LITE tienen listas de mods distintas** (103 vs 61). Un cambio en el pack casi siempre hay
  que hacerlo dos veces.
- **El perfil se detecta por la subcadena `Lite` en el id del servidor.** Renombrar los ids rompe dos
  sitios; están listados en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
- **`options.txt` va sin hash en la distribución**: cambiarlo solo afecta a instalaciones nuevas. A
  los jugadores existentes hay que llegar con un parche desde el launcher.
- **Prueba siempre con dos clientes**, uno limpio y uno ya existente. Los fallos de actualización solo
  aparecen en el segundo.
- **El vhost de descargas es el *default server* de Apache en OVH-A**, no tiene el `ServerName` real.
  Añadir otro vhost antes que `packs.conf` rompe las descargas sin tocar nada del launcher.

## Compilar

```bash
npm install
npm start          # desarrollo
npm run dist:win   # instalador en dist/
```
