# Plan · App de Android propia («SC Launcher Móvil»)

> Estado: **aprobado por Felix (26-10-2026), en construcción.** Revisado por Codex el 26-10 (sección «Revisión de
> Codex»). Repo: `Chaktet/sc-launcher-movil` (fork público de FCL), clon en `E:/PROYECTOS-MC/sc-launcher-movil`; su
> `historial.md` lleva el día a día. Fase en curso: **6** (27-10-2026: fases 0-5 hechas y comprobadas en el emulador
> del CI; versión 0.1.0 publicada en `descargas.servidorcobblemon.es/movil/app/` y en GitHub Releases `v0.1.0`).

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

## Revisión de Codex (26-10-2026) y cómo cambia el plan

Codex revisó el plan contra el código real de FCL (10 puntos). Lo que se sostiene, y queda decidido:

1. **Firma:** FCL trae sus propias claves dentro de git (`key-store.jks`, `debug-key.jks`, `private_key.pepk`). Se
   quitan; solo se firma con NUESTRA clave, y solo en `main` y en etiquetas de versión (nunca en PR). Cada compilación
   comprueba el certificado y el `applicationId` del APK final.
2. **Actualizar el modpack:** FCL ya sabe ACTUALIZAR un `.mrpack` instalado (`ModpackUpdateTask`, con copia y vuelta
   atrás si falla). Se usa sobre una instancia fija nuestra, sin reimportar encima. Se protegen a mano `options.txt`,
   controles, `servers.dat`, capturas y partidas (el pack no puede pisarlos); una sola actualización a la vez y
   recuperación si la app se cierra a medias.
3. **Actualizar la app:** el actualizador de FCL mira GitHub/Gitee, no comprueba el archivo y tiene la autoridad
   `com.tungsten.fcl.provider` escrita a mano. Se sustituye por un manifiesto nuestro por HTTPS (`versionCode`, URL y
   SHA-256 por arquitectura); antes de instalar se comprueban hash, paquete y certificado. Android pide el permiso
   «instalar apps desconocidas» PARA NUESTRA APP la primera vez que se actualiza (el que se dio al navegador no vale):
   la app guía al jugador y sigue sola al volver.
4. **Licencias:** junto a cada APK publicado, enlace al código exacto de esa versión (etiqueta en GitHub) y las
   licencias de cada pieza; créditos a FCL, HMCL, Amethyst/Pojav y demás en «Acerca de». **Se quita Terracotta**
   (juego en LAN por VPN, AGPL, no lo necesitamos) con su servicio VPN; LWJGLX (licencia sin aclarar, solo para
   versiones antiguas de Minecraft) se retira si 1.21.1 no lo usa. Repaso de licencias antes de la primera publicación.
5. **Microsoft (comprobado por Claude el 26-10):** FCL entra con «código de dispositivo», y el client ID de Helios lo
   **rechaza** (`AADSTS70002: The client application must be marked as 'mobile'`). Para usar el ID de Helios ya, la app
   hará lo mismo que el launcher de PC: ventana de login de Microsoft dentro de la app con redirección
   `https://login.microsoftonline.com/common/oauth2/nativeclient` (flujo «authorization code», cliente público, sin
   secreto). Prueba completa en la fase 4: login, Xbox, perfil de Minecraft y renovación al día siguiente. Nuestra
   app de Entra se registra para cuentas personales con flujos públicos; al cambiar de ID, el jugador vuelve a iniciar
   sesión una vez.
6. **Datos separados de FCL:** FCL guarda todo en `/FCL/` del almacenamiento compartido (juego, controles, logs).
   Nuestra app usa sus propias carpetas, para no pisarse si el jugador tiene las dos. Si se usa el almacenamiento
   privado de la app, se adapta la comprobación de permisos del arranque y se quita `MANAGE_EXTERNAL_STORAGE`.
7. **Caché e integridad del pack:** el nombre fijo `SC-Movil.mrpack` está cacheado un año. El manifiesto apunta al
   archivo VERSIONADO (`SC-Movil-2.4.1.mrpack`) con su SHA-256 y se sirve sin caché larga; además la app comprueba los
   hashes de los 28 archivos remotos (Cobblemon, fabric-api…), también los que ya tenía, porque FCL hoy no lo hace.
8. **Fuera lo ajeno:** promoción Quark, anuncios remotos de FCL, textos legales de FCL-Team (se hacen los nuestros en
   español) y CurseForge (no hace falta para un `.mrpack` de Modrinth). Se comprueba qué conexiones hace la app al
   abrir y al pulsar JUGAR.
9. **Permisos:** se quitan juntos permiso, servicio y pantalla de lo que no usamos (VPN de Terracotta, desinstalar
   complementos, micrófono si no hay mod de voz). Se mantienen los servicios en primer plano de descargas y de juego
   (Android 14-15 los exige).
10. **Pruebas:** el emulador del CI necesita un APK `x86_64`; probarlo no valida los APK ARM que publicamos, así que
    la fase 6 prueba cada arquitectura publicada en móviles reales, incluida la actualización n → n+1 sin perder datos.
    JUGAR ya convierte la dirección de la instancia en `--quickPlayMultiplayer mc.servidorcobblemon.es:25565`; la
    fase 3 comprueba que de verdad entra. Los paquetes Java internos de FCL (`com.tungsten.fclauncher…`) no se
    renombran: el código nativo los busca por nombre.

## Fases (cada una con la comprobación que la cierra)

| Fase | Qué | Cómo se comprueba |
|---|---|---|
| 0 | Fork, compilación en GitHub Actions (gratis, repo público), firma con una clave nuestra, claves de FCL fuera | Un `.apk` firmado con NUESTRO certificado (comprobado con `apksigner`) sale del CI y arranca en un emulador Android del runner (`x86_64`) |
| 1 | Identidad + español | El APK abre con nuestro nombre/icono y en español (capturas del emulador) |
| 2 | Diseño de Codex aprobado por Felix → pantallas nuevas | Comparadas lado a lado con el diseño aprobado |
| 3 | Modpack automático + JUGAR directo | En el emulador: instala el pack, y un pack nuevo publicado se aplica solo |
| 4 | Cuentas (Microsoft necesita lo de «Microsoft» de abajo) | Login real en un móvil · *27-10: ventana propia con código + PKCE + state y redirección `nativeclient` (ID de Helios); en CI comprobados la petición, la cancelación y el canje del código con Microsoft; falta el login real en un móvil (fase 6)* |
| 5 | Actualización de la app, web y novedad | APK n → n+1 desde nuestro servidor · *27-10: `movil/app/sc-app.json` (versionCode, url/sha256/size por ABI); el APK se comprueba (paquete, firma igual a la instalada, versión anunciada) antes del instalador; en CI llega al instalador de Android. Web y novedad: los hace la sesión web* |
| 6 | **Prueba en móviles reales** (Felix y staff) | Instalar, entrar al servidor y jugar 15 min en 2-3 móviles distintos |

## Lo que hay que decidir o conseguir antes

- **Microsoft (decidido por Felix, 26-10):** salir con el client ID de Helios (el del launcher de PC,
  `1ce6e35a-126f-48fd-97fb-54d143ac6d45`, secreto `OAUTH_API_KEY` del repo) con el flujo de ventana de login (punto 5 de
  la revisión) y, EN PARALELO, registrar nuestra app en Microsoft Entra (gratis) y pedir a Microsoft acceso a la API de
  Minecraft; cuando lo aprueben, pasar el móvil y el launcher de PC al ID nuevo.
  **App propia (26-10):** «SC Launcher» en Azure (cuenta darksens96@hotmail.com, cuenta gratuita de Azure,
  «Directorio predeterminado»). Client ID `b02d1916-762f-4732-ad9e-f10fc0a71fe9`, tenant
  `d92b5a1c-15ea-42d7-8516-ae9ed59b7440`, solo cuentas personales, cliente público con redirección `nativeclient` y
  flujos públicos activados (comprobado: el endpoint de código de dispositivo lo acepta). Formulario de acceso a la API
  de Minecraft (aka.ms/mce-reviewappid) **enviado el 26-10**; Mojang revisa cada semana y responde a ese correo.
  Riesgo: puede salir rechazado porque la app tiene modo No Premium. Hasta la aprobación, el ID de Helios.
- **Clave de firma del APK (hecha 26-10):** `sc-release.jks` (alias `sc-launcher`, válida hasta 2126) en los secretos
  de GitHub `SC_KEYSTORE_BASE64` / `SC_KEYSTORE_PASSWORD`, con copia fuera de git en `E:\SECRETOS\sc-launcher-movil\`
  que Felix debe copiar además a un USB o a su nube personal: **si se pierde, ningún jugador podrá actualizar la app**
  y habría que reinstalarla.
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
