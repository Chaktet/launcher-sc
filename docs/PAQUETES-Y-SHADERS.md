# Paquetes de recursos, shaders y parches a `options.txt`

> Estado verificado: 2026-08-03. Código en [settings.js](../app/assets/js/scripts/settings.js) y
> [landing.js](../app/assets/js/scripts/landing.js).

Todo lo de este documento comparte un mismo problema de fondo: **el launcher y Minecraft escriben en
los mismos ficheros**. Las reglas de convivencia están abajo y no son negociables.

---

## Dónde vive cada cosa

Todas las rutas cuelgan de la instancia del perfil seleccionado:

```
<instanceDir>/<idServidor>/
  ├─ options.txt                 ← paquetes activos, pantalla completa, teclas
  ├─ resourcepacks/*.zip         ← paquetes (oficiales + los del jugador)
  ├─ shaderpacks/*.zip           ← shaders (solo los del jugador)
  ├─ config/iris.properties      ← shader activo
  ├─ crash-reports/*.txt         ← informes de fallo de Minecraft
  ├─ .sc-packs-auto.json         ← marcador: paquetes oficiales ya auto-activados
  └─ .sc-teclas-auto.json        ← marcador: teclas ya reasignadas
```

`<idServidor>` es `ServidorCobblemon-1.21.1` (PRO) o `ServidorCobblemonLite-1.21.1` (LITE), así que
**cada perfil tiene sus propios paquetes y su propia configuración**. Cambiar de perfil no arrastra
nada.

---

## Paquetes de recursos

### El modelo

El estado vive en la línea `resourcePacks:` de `options.txt`, que es un array JSON:

```
resourcePacks:["vanilla","fabric","file/Cobblemon Interface v1.6.0.zip","file/SC-Pack.zip"]
```

- Las entradas **sin** prefijo `file/` son las base de Minecraft (`vanilla`, `fabric`) y se conservan
  tal cual.
- Las entradas **con** `file/` son los `.zip` de `resourcepacks/`.
- **El último de la lista manda.** Por eso `SC-Pack.zip` va siempre el último: es el pack oficial del
  servidor y tiene que pisar a cualquier otro.

Esa regla está codificada en `sc$togglePack()` ([settings.js:1859](../app/assets/js/scripts/settings.js#L1859)):
al activar un pack que no es el oficial, se inserta **antes** de `SC-Pack.zip`, no al final.

La constante está en un solo sitio:

```js
const SC_PACK_OFICIAL = 'SC-Pack.zip'
```

### Cuáles son oficiales

No hay lista escrita a mano. `sc$officialPackNames()` lee la distribución y considera oficial todo
módulo cuyo `path` contenga `/resourcepacks/` y acabe en `.zip`. A día de hoy:

| Paquete | PRO | LITE |
|---|:--:|:--:|
| `SC-Pack.zip` | ✅ | ✅ |
| `Cobblemon Interface v1.6.0.zip` | ✅ | ✅ |
| `Cobblemon Interface Modded v1.9.4.zip` | ✅ | ✅ |
| `E19 Cobblemon Minimap Icons.zip` | ✅ | ✅ |
| `Cobblemon 3D Poke Rods 1.0.zip` | ✅ | ✅ |
| `Fresh-Moves-v3.1.zip` | ✅ | — |
| `FreshAnimations_v1.10.4.zip` | ✅ | — |

Los oficiales se marcan con una insignia en la interfaz y **no se pueden borrar** desde el launcher
(no se les dibuja el botón). Los del jugador sí, y van a la papelera del sistema
(`SHELL_OPCODE.TRASH_ITEM`), no se destruyen — mismo criterio que Helios usa con los mods.

### Auto-activación de paquetes oficiales nuevos

Este es el punto delicado. `options.txt` se distribuye **sin hash** (ver `untrackedFiles` en los
`servermeta.json`), así que solo se instala la primera vez y **nunca se sobrescribe**. Sin más, un
paquete oficial nuevo que llegue en una actualización se descargaría pero el jugador no lo vería
activado nunca.

`sc$activarPacksOficialesNuevos()` ([settings.js:1881](../app/assets/js/scripts/settings.js#L1881))
lo resuelve activando **una sola vez** cada paquete oficial nuevo, y apuntándolo en
`.sc-packs-auto.json`. Ese marcador es lo que impide reactivar lo que el jugador haya desactivado a
propósito.

> **Al añadir un paquete oficial nuevo a la distribución no hay que hacer nada más en el launcher.**
> Se activa solo en el siguiente arranque. Si necesitas que NO se active solo, no lo pongas en
> `resourcepacks/` de la distribución.

---

## Shaders

Más simple, porque el estado es de un solo valor. Vive en `config/iris.properties`:

```properties
enableShaders=true
shaderPack=BSL_v8.2.zip
```

- `sc$readActiveShader()` devuelve el nombre solo si `enableShaders=true` **y** `shaderPack` no está
  vacío. Cualquier otra combinación cuenta como "ninguno".
- `sc$writeActiveShader(null)` desactiva: escribe `enableShaders=false` y `shaderPack=` vacío.
- Al reescribir se **filtran** las dos líneas anteriores y se vuelven a añadir, conservando el resto
  del fichero.

**No distribuimos shaders.** La carpeta `shaderpacks/` empieza vacía y solo se llena con lo que el
jugador importe desde Ajustes. La lista es siempre "Ninguno" + lo que haya en la carpeta.

En LITE se muestra un aviso (`settingsShadersNotice`): el perfil está pensado para PCs de pocos
recursos y activar shaders va contra eso. Es un aviso, no un bloqueo.

---

## La regla de oro: `options.txt` y el juego abierto

**Minecraft reescribe `options.txt` entero al cerrarse.** Cualquier cambio que haga el launcher con
el juego abierto se pierde sin avisar.

Por eso `sc$juegoAbierto()` comprueba la variable global `proc` (el proceso del juego, que
`landing.js` pone a `null` al cerrarse) y, cuando hay partida en marcha:

- Se desactivan los interruptores y los botones de borrar de la pestaña de paquetes
- Se muestra el aviso `settingsRpGameNotice`
- `sc$activarPacksOficialesNuevos()` no hace nada

**Si añades cualquier escritura nueva a `options.txt`, comprueba `sc$juegoAbierto()` primero.**

### Patrón de escritura

Todas las funciones que tocan `options.txt` siguen el mismo patrón, y hay motivo para cada paso:

```js
const raw = fs.readFileSync(ruta, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'   // respetar CRLF de Windows
const lineas = raw.split(/\r?\n/)
while(lineas.length > 0 && lineas[lineas.length-1].trim() === ''){
    lineas.pop()                                    // sin esto se acumula una línea en blanco por cambio
}
// ... buscar por prefijo, reemplazar o añadir ...
fs.writeFileSync(ruta, lineas.join(eol) + eol)      // salto final, como lo deja el juego
```

---

## Parches automáticos a `options.txt`

Se aplican en `dlAsync()` justo antes de construir el proceso del juego, cuando está garantizado que
Minecraft está cerrado.

### 1. Pantalla completa · `scAplicarPantallaCompleta()`

El launcher solo pasaba `--fullscreen` cuando la opción estaba **activada**; al desactivarla no
forzaba nada. Si el jugador había pulsado F11 alguna vez, Minecraft guardaba `fullscreen:true` y
seguía abriendo a pantalla completa ignorando el ajuste del launcher.

Ahora se escribe el valor correcto siempre. Si el fichero no existe (primera partida) no se hace
nada: lo creará el juego con los argumentos de lanzamiento.

### 2. Teclas en conflicto · `scCorregirTeclasEnConflicto()`

Algunos mods registran teclas sin comprobar si están libres. Las que chocan en nuestro pack:

| Opción | De fábrica | Nueva | Por qué |
|---|---|---|---|
| `key_key.cobblemonextendedbattleui.toggle_panel` | `v` | `semicolon` (Ñ en teclado español) | La `V` es hablar en Simple Voice Chat: abrir el panel cortaba la voz |
| `key_key.cobblemonextendedbattleui.increase_font` | `right.bracket` | `period` | La `]` la usan los ajustes de Xaero |
| `key_key.cobblemonextendedbattleui.decrease_font` | `left.bracket` | `comma` | No chocaba; se mueve para dejar la pareja en `,` `.` |
| `key_key.craftingtweaks.compress_stack` | `k` | `grave.accent` | La `K` la usa Iris para encender los shaders |
| `key_key.craftingtweaks.refill_last_stack` | `tab` | `insert` | El TAB es la lista de jugadores de vanilla |

Las teclas nuevas se comprobaron contra los 145 *keybinds* que Minecraft escribe en `options.txt`
con todos los mods cargados, en PRO y en LITE.

Mismo problema que con los paquetes: cambiar lo que enviamos en la distribución arregla a los
jugadores nuevos, pero quien ya arrancó una vez tiene la `V` guardada para siempre. La corrección se
aplica **una sola vez y solo si la tecla sigue siendo la de fábrica**; si el jugador la había
cambiado él, se respeta y se anota en `.sc-teclas-auto.json` para no volver a mirarla.

> **Para añadir una tecla nueva al parche**: añade la entrada a `SC_TECLAS_EN_CONFLICTO`
> ([landing.js](../app/assets/js/scripts/landing.js)) con `opcion`, `porDefecto` y `nueva`.
> Verifica antes que la tecla nueva está libre en **los dos perfiles**.

---

## Añadir una pestaña o una opción nueva

1. HTML en [app/settings.ejs](../app/settings.ejs), estilos en [launcher.css](../app/assets/css/launcher.css).
2. Textos en [_custom.toml](../app/assets/lang/_custom.toml) — nunca literales en el JS.
3. Escapa siempre con `sc$escapeHtml()` antes de meter nada en `innerHTML`. Aplica a nombres de
   fichero (los elige el jugador) y a cualquier dato remoto.
4. Si escribes en `options.txt`, comprueba `sc$juegoAbierto()` y usa el patrón de escritura de arriba.
5. Engancha la función de poblado en `prepareSettings()`, al final de `settings.js`.
