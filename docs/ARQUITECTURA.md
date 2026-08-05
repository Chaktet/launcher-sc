# Arquitectura del SC Launcher

> Estado verificado: 2026-08-03 · rama `master`, versión `1.5.8` en `package.json`.
> Actualiza este documento cuando cambie el flujo de arranque o se añada un módulo propio.

## Qué es

Fork de [Helios Launcher](https://github.com/dscalzi/HeliosLauncher) (MIT) adaptado a
`servidorcobblemon.es`. Electron + `helios-core`, sin framework de UI: HTML plano en plantillas
`.ejs`, jQuery para los fundidos y JS suelto por pantalla.

La lógica original de Helios se mantiene intacta siempre que se puede. **Todo lo que es nuestro
lleva el prefijo `sc$` (funciones auxiliares) o `sc` (variables y funciones de nivel superior)**, y va
comentado en español explicando *por qué* existe, no qué hace. Esa convención es lo que permite
distinguir de un vistazo el código heredado del propio y hacer merges del upstream sin dolor.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| [index.js](../index.js) | Proceso principal de Electron. Ventana, auto-updater, ventanas OAuth de Microsoft. |
| [app/assets/js/preloader.js](../app/assets/js/preloader.js) | Se ejecuta antes que la UI: engancha el registro, carga la distribución con límite de tiempo, limpia el directorio de datos. |
| [app/assets/js/registro.js](../app/assets/js/registro.js) | **Propio.** Registro a disco + captura de errores globales. |
| [app/assets/js/distromanager.js](../app/assets/js/distromanager.js) | URL de la distribución remota. |
| [app/assets/js/configmanager.js](../app/assets/js/configmanager.js) | Configuración del jugador en disco (RAM, cuentas, servidor elegido, `perfilElegido`). |
| [app/assets/js/scripts/uibinder.js](../app/assets/js/scripts/uibinder.js) | `switchView()` — transiciones entre pantallas. Arranque de la UI. |
| [app/assets/js/scripts/uicore.js](../app/assets/js/scripts/uicore.js) | Auto-actualización del launcher + insignia de versión. |
| [app/assets/js/scripts/landing.js](../app/assets/js/scripts/landing.js) | Pantalla principal, botón JUGAR, **diagnóstico de errores de arranque**, parches a `options.txt`. |
| [app/assets/js/scripts/settings.js](../app/assets/js/scripts/settings.js) | Ajustes: mods, **shaders**, **paquetes de recursos**, cuentas, Java, acerca de. |
| [app/assets/js/scripts/overlay.js](../app/assets/js/scripts/overlay.js) | Diálogos superpuestos y selector de versión PRO/LITE. |
| [app/assets/lang/_custom.toml](../app/assets/lang/_custom.toml) | Todos los textos. **Nada de cadenas literales en el JS de UI.** |

## Los dos perfiles: PRO y LITE

No son dos servidores, son **dos instancias del mismo servidor** (`servidorcobblemon.es:25565`) con
listas de mods distintas. El launcher los trata como "servidores" porque es el modelo de Helios.

| Id | Nombre | Mods | RAM recomendada |
|---|---|---|---|
| `ServidorCobblemon-1.21.1` | Servidor Cobblemon · PRO | 103 | 6144 MB (mín. 4096) |
| `ServidorCobblemonLite-1.21.1` | Servidor Cobblemon · LITE (Gama Baja) | 61 | 4096 MB (mín. 2560) |

Ambos: Minecraft 1.21.1 · Fabric `0.19.3` · Java `>=21 <22`.

**La detección de perfil se hace por el nombre del id**, buscando la subcadena `Lite`. Si algún día
se renombran los ids hay que tocar estos puntos:

- `landing.js` — el aviso de perfil (`sel.includes('Lite')`)
- `settings.js:1734` — el aviso de la pestaña de shaders (`.toLowerCase().includes('lite')`)

### Elección en el primer arranque

Antes se asignaba PRO en silencio. Ahora, si `ConfigManager.getPerfilElegido()` es `false`,
[uibinder.js](../app/assets/js/scripts/uibinder.js) abre el selector 700 ms después de mostrar la
pantalla principal, con textos distintos (`overlay.serverSelectHeaderPrimera` y una pista visible).

La marca se pone **tanto si confirma como si cancela** (`scMarcarPerfilElegido()` en
[overlay.js](../app/assets/js/scripts/overlay.js)): ya se le ha preguntado, no se insiste.

## Flujo de arranque

```
index.js  →  crea ventana (backgroundThrottling:false)
   │
   └─ preloader.js
        ├─ Registro.engancharLoggers()      ← PRIMERO DE TODO, ver más abajo
        ├─ Registro.capturarErroresGlobales()
        ├─ ConfigManager.load()
        └─ DistroAPI.getDistribution()  ── con límite de 30 s ──┐
                                                                │
             éxito ──────────────────────────────────────────┐  │
             timeout → getDistributionLocalLoadOnly()  ──────┤  │
             fallo   → onDistroLoad(null) → error fatal      │  │
                                                             ▼  ▼
                                          uibinder.js · showMainUI()
                                                     │
                                    ¿perfilElegido? ─ no → selector PRO/LITE
                                                     │
                                              landing.js (JUGAR)
```

### Por qué el registro va el primero

Cada módulo de `helios-core` crea su logger **en el momento de ser importado**. Si
`registro.js` no se carga antes que todos, esos loggers ya existen sin transporte a fichero y se
pierde justo lo del arranque, que es lo que se necesita para diagnosticar. Por eso está en las
primeras líneas de `preloader.js`, antes incluso de `configmanager`.

El registro escribe en `<userData>/logs/launcher.log` (2 MB × 3 ficheros rotados, sin códigos de
color para que se pueda abrir con el bloc de notas). Además captura:

- `window.onerror`
- `unhandledrejection` — la causa de la mitad de los bloqueos que hemos encontrado
- `console.error` y `console.warn` del propio launcher

Se abre desde **Ajustes → Ver registro del launcher**.

## Decisiones de diseño que no son obvias

Cada una arregla un fallo real. No las revientes sin entender el porqué.

### `backgroundThrottling: false` ([index.js](../index.js))

Chromium frena los temporizadores cuando la ventana queda tapada (hasta una vez por minuto). Como
las transiciones entre pantallas dependen del final de una animación, el launcher se quedaba a
medias y sin responder en cuanto el jugador se iba a otra aplicación.

### `switchView()` es idempotente ([uibinder.js](../app/assets/js/scripts/uibinder.js))

Los seis contenedores son hermanos con `height:100%`. Si dos quedan visibles a la vez **se apilan** y
el segundo cae un viewport por debajo, fuera de la vista: pantalla en blanco sin un solo botón.
Pasaba al pulsar dos botones seguidos, porque el de salida sigue siendo clicable mientras se
desvanece.

La solución no confía en que `current` sea lo que de verdad se ve: corta todos los fundidos a medias
(`.stop(true,false)`) y oculta **todos** los contenedores menos el destino. Los callbacks van en
`try/catch` porque un fallo dentro dejaba el launcher con todo oculto.

### Límites de tiempo en todo lo que va por red

Una conexión **cortada** devuelve error enseguida; una **colgada** (wifi de colegio, portal cautivo,
antivirus con inspección SSL) no devuelve nunca. Sin límite explícito, la promesa se queda pendiente
y la pantalla de carga es definitiva. Hay tres:

| Dónde | Límite | Qué hace al agotarse |
|---|---|---|
| `preloader.js` · distribución | 30 s | Intenta la copia local; si no hay, error de arranque |
| `settings.js` · `scConTiempoLimite()` en el login de Microsoft | 60 s | Error y vuelta a la pantalla anterior |
| `settings.js` · botón cancelar de la pantalla de espera | 1,5 s | Red de seguridad si la ventana OAuth ya no existía |

La copia local hay que pedirla **a mano** en el timeout: `helios-core` solo la intenta cuando la
descarga *falla*, y aquí la hemos cortado nosotros, así que ese camino no llega a ejecutarse.

### La pantalla de espera tiene salida

Antes solo había un spinner: la única forma de salir era que el proceso principal respondiera al
cerrarse la ventana de Microsoft. Si esa ventana se abría detrás del launcher o en otro monitor, el
jugador se quedaba encerrado. Ahora hay un botón de cancelar que manda `MSFT_OPCODE.CANCEL`
([ipcconstants.js](../app/assets/js/ipcconstants.js)) y `scVistaVueltaEspera` recuerda a dónde volver.

### Error fatal de arranque ofrece reintentar

La causa más habitual es un corte pasajero de conexión. Antes la única salida era cerrar y volver a
abrir a mano; ahora el botón principal hace `reload()` y el secundario cierra.

## Desarrollo

```bash
npm install
npm start          # modo desarrollo
npm run dist:win   # instalador de Windows en dist/
```

Node.js 20+ (CI usa 22). Los instaladores publicados se generan en GitHub Actions —
ver [DISTRIBUCION.md](DISTRIBUCION.md).

## Documentos hermanos

- [PAQUETES-Y-SHADERS.md](PAQUETES-Y-SHADERS.md) — paquetes de recursos, shaders y parches a `options.txt`
- [DISTRIBUCION.md](DISTRIBUCION.md) — cómo se genera y publica el modpack y el instalador
- [ERRORES.md](ERRORES.md) — códigos SC-01 … SC-12 para soporte
- [distro.md](distro.md) y [MicrosoftAuth.md](MicrosoftAuth.md) — documentación heredada de Helios (upstream)
