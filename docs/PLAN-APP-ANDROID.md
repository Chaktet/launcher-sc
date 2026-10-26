# Plan · App de Android propia («SC Launcher Móvil»)

> Estado: **plan, sin aprobar** (Felix, 26-10-2026: «primero solo el plan»; descarga solo desde nuestra web).
> Nada de esto está construido. Antes de construir: OK de Felix + revisión del plan por Codex (regla de planes grandes).

## Objetivo

Sustituir FoldCraftLauncher (FCL) por una app nuestra: nuestro nombre, icono y diseño, en español, y **un botón JUGAR**
que instala y mantiene al día el modpack del móvil y entra al servidor, sin importar archivos a mano.

## Base: un fork de FoldCraftLauncher

Hacer un launcher de Minecraft Java para Android desde cero no tiene sentido: lo difícil (Java en Android, los gráficos
OpenGL/Vulkan, los controles táctiles) ya está resuelto y probado en FCL.

| | |
|---|---|
| Repo | `FCL-Team/FoldCraftLauncher`: ~1.100 ficheros Java/Kotlin, Gradle, activo (release 1.3.4.2 del 25-10-2026) |
| Licencia | **GPL-3.0**: podemos cambiarlo todo, pero nuestro código también tiene que ser público y hay que mantener el crédito y la licencia. Como el launcher de PC, que ya es público |
| Piezas | `FCL/` (app y pantallas), `fclcore` (núcleo, portado de HMCL: descargas, versiones, cuentas, modpacks), backend Amethyst-Android (JVM y render), `LWJGL/` |
| Ya trae | Fabric, Java 21, Microsoft y cuentas offline, importar `.mrpack` (`ModpackHelper`), controles táctiles, renderers |
| No trae | Español (13 idiomas, ninguno es español), nuestro modpack automático |

**Repo nuevo:** `Chaktet/sc-launcher-movil` (fork público). Seguir trayendo las mejoras de FCL con merges, igual que
hacemos con Helios: todo lo nuestro con prefijo `Sc`, y lo heredado tocado lo mínimo.

## Qué cambia

1. **Identidad:** `applicationId` propio (`es.servidorcobblemon.movil`), nombre «SC Launcher», icono y pantalla de
   carga. Al tener otro id, se instala junto a FCL sin pisarlo.
2. **Pantalla principal nueva** (la diseña Codex, como siempre): portada con el fondo validado, cuenta, botón JUGAR,
   estado del servidor y novedades. Lo avanzado de FCL (versiones, mods, renderers, controles) queda en «Ajustes».
3. **Modpack automático:** al abrir y al pulsar JUGAR se lee un manifiesto nuestro en
   `descargas.servidorcobblemon.es/movil/` (versión + sha256 del `SC-Movil.mrpack` que ya genera `movil_auto.js`). Si
   cambió, se instala encima con `ModpackHelper`, conservando ajustes, controles y partidas. Sin pasos del jugador.
4. **Entrar directo al servidor:** JUGAR lanza la instancia con `mc.servidorcobblemon.es` (quickPlay), como en PC.
5. **Cuentas:** Microsoft (premium) y No Premium, con los mismos textos y avisos que el launcher de PC.
6. **Español** como idioma principal (traducir `strings.xml`: lo que vea el jugador).
7. **Actualizar la propia app:** busca una versión nueva en nuestro servidor, descarga el `.apk` y abre el instalador
   de Android. Android obliga a que el jugador confirme con un toque cada actualización de la app (sin Google Play no se
   puede evitar). El modpack, en cambio, sí se actualiza solo.
8. **Ajustes por defecto para nuestro pack:** renderer, RAM y controles pensados para Cobblemon en móvil.

## Fases (cada una con la comprobación que la cierra)

| Fase | Qué | Cómo se comprueba |
|---|---|---|
| 0 | Fork, compilación en GitHub Actions (gratis, repo público), firma con una clave nuestra | Un `.apk` firmado sale del CI y se instala en un emulador Android del runner |
| 1 | Identidad + español | El APK abre con nuestro nombre/icono y en español (capturas del emulador) |
| 2 | Diseño de Codex aprobado por Felix → pantallas nuevas | Comparadas lado a lado con el diseño aprobado |
| 3 | Modpack automático + JUGAR directo | En el emulador: instala el pack, y un pack nuevo publicado se aplica solo |
| 4 | Cuentas (Microsoft necesita lo de «Microsoft» de abajo) | Login real en un móvil |
| 5 | Actualización de la app, web y novedad | APK n → n+1 desde nuestro servidor |
| 6 | **Prueba en móviles reales** (Felix y staff) | Instalar, entrar al servidor y jugar 15 min en 2-3 móviles distintos |

## Lo que hay que decidir o conseguir antes

- **Microsoft (bloqueante para premium):** el launcher de PC usa el identificador de app de Helios, no uno nuestro. La
  app de Android necesita **registrar nuestra propia app en Microsoft Entra** (gratis) y **pedir a Microsoft acceso a la
  API de Minecraft** (formulario gratuito; lo revisan ellos, pueden tardar días o semanas). Hasta entonces, solo No
  Premium. Es una «clave nueva»: necesita el OK de Felix.
- **Clave de firma del APK:** la generamos nosotros (gratis). Va como secreto de GitHub y con copia de seguridad fuera
  de git: **si se pierde, ningún jugador podrá actualizar la app** y habría que reinstalarla.
- **Diseño:** pantallas de Codex (Felix aprueba el concepto antes de construir).
- **Quién prueba:** al menos 2-3 Android reales (gama media y baja), porque el emulador no sirve para medir si va fluido.

## Riesgos

- **Rendimiento:** la app no hace que el juego vaya más rápido que en FCL (usa el mismo motor). Lo que mejora es la
  facilidad: instalar, actualizar y entrar.
- **Mantener el fork:** cada versión de FCL trae arreglos de compatibilidad; hay que traerlos de vez en cuando (merge).
- **Tamaño (medido 26-10):** el APK de FCL «all» pesa 315 MB; por arquitectura, `arm64-v8a` 164 MB (casi todos los
  móviles) y `armeabi-v7a` 157 MB (móviles viejos). Publicaríamos esos dos, y la web elige el bueno.
- **«Fuentes desconocidas»:** el jugador tiene que permitirlo una vez al instalar (la guía nueva del móvil ya lo explica).

## Tamaño aproximado del trabajo

Varios días de trabajo repartidos en las fases, más la espera de Microsoft. Las fases 0-1 dan pronto una primera app
nuestra (con nuestro nombre, en español) y las siguientes la van completando.
