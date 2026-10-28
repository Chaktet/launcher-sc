# Investigación: launcher y servidor en iPhone/iPad gratis (27-10-2026)

Encargo de Felix: «una investigación de cómo se podría subir a iOS el launcher gratis». Solo investigación; no se ha
construido, publicado ni creado ninguna cuenta. Fuentes al final. **Marcado ⚠️ = no pude confirmarlo con una fuente
oficial** (casi todo lo de iOS 26 sale de issues de GitHub y webs de la comunidad, no de Apple).

## Resumen en cinco líneas

1. **Minecraft Java sí corre en iPhone/iPad**, con **Amethyst** (hermano de PojavLauncher para iOS), incluido Fabric.
2. Necesita **JIT** (un permiso que iOS solo da a apps «en depuración»); eso exige **un ordenador la primera vez** y
   herramientas extra (StikDebug) en cada arranque.
3. **Gratis de verdad = instalar sin App Store con un Apple ID gratuito**: la app caduca cada **7 días** y hay que
   «refrescarla». Es posible, pero es un proceso de nerds, no de jugador normal.
4. **No existe ruta gratuita «limpia»**: App Store, TestFlight y la tienda alternativa de la UE (AltStore PAL) piden la
   cuenta de pago de Apple (99 USD/año) *a quien publica*. Ningún jugador paga nada en ninguna ruta.
5. **Recomendación:** no hacer app propia en iOS ahora. Hacer una **guía en la web** para el camino gratuito
   (SideStore/LiveContainer + Amethyst + nuestro modpack) y avisar de que es avanzado. Detalle en §5.

## 1. ¿Corre Java Minecraft en iOS hoy?

- **Amethyst-iOS** (repo `AngelAuraMC/Amethyst-iOS`, el mantenido) es un launcher de Minecraft Java basado en
  PojavLauncher. Soporta Fabric, Forge, Quilt y OptiFine, y «casi todas las versiones» incluida la 1.21.1 de
  nuestro servidor (el README no da lista exacta; ⚠️ no he visto una prueba concreta de 1.21.1).
- Oficialmente soporta **iOS 17.x y 18.x**; el mínimo del código es iOS 14. Dispositivos: iPhone 6s en adelante, pero
  recomiendan **iPhone XS o más nuevo** (sin XR ni SE 2.ª gen).
- **JIT obligatorio** para ir a velocidad usable. Formas de conseguirlo (tabla del README de Amethyst):
  - **TrollStore** (solo iOS viejos con fallo explotable): firma permanente, JIT automático y más RAM. No sirve para
    la mayoría de iPhones actuales.
  - **StikDebug**: activa JIT desde el propio móvil; necesita un ordenador **solo la primera vez** para el emparejado y
    una VPN local (LocalDevVPN) en cada uso. Funciona en iOS 17.4+ y hay mejoras para iOS 26 (v3.1.2, abril 2026).
    Salió de la App Store en enero 2026 (⚠️ dato de una web de terceros) y se instala por GitHub/AltStore/SideStore.
  - **SideJITServer / AltServer**: necesita el ordenador encendido y en la misma red cada vez.
  - iOS 17.0–17.3.1: SideJITServer (ordenador al lado).
- **iOS 26 y chips nuevos (TXM)**: en iPhone/iPad con chip nuevo, iOS 26 exige además que cada zona de memoria
  ejecutable se prepare por la conexión de depuración; LiveContainer 3.7 ya lo cubre con un «script de JIT» por app
  (⚠️ de docs de la comunidad). Hay reportes mixtos para Amethyst: uno que funciona con StikDebug en una beta de iOS 26
  y otros de «pide JIT aunque ya está activado» (iOS 26.7, iPad Air 2024) y de cierres al abrir en iPad con M4 (⚠️
  issues sin respuesta oficial, uno en un fork chino). **Conclusión: en iOS 26 es una lotería según el aparato.**
- **Rendimiento con Fabric + ~31 mods + Cobblemon**: ⚠️ **no encontré ninguna prueba ni benchmark** de Cobblemon en
  iPhone. Datos que sí hay: el modpack oficial de Cobblemon pide **mínimo 2,5 GB y mejor 3+ GB de RAM** para el juego;
  iOS limita la memoria por app y solo se amplía con TrollStore o con el truco «Increased Memory Limit» (app GetMoreRam)
  en apps instaladas a mano. Esperar: iPhones de 6 GB+ (13 Pro / 14 en adelante) quizá jugables con distancia de
  render baja; los de 3-4 GB, no. Esto solo se sabe probando.

## 2. Rutas de distribución gratuitas y sus límites reales

| Ruta | ¿Cuenta de pago de Apple (99 USD/año)? | Límites reales |
|---|---|---|
| **Instalar con Apple ID gratis** (AltStore clásico, **SideStore**, iLoader) | No | Caduca a los **7 días** (refrescar cada semana), **3 apps activas** y 10 App IDs por Apple ID, ordenador para la instalación inicial. Se rodea el límite de 3 con **LiveContainer** (una app que ejecuta otras dentro). SideStore refresca solo por VPN local, sin ordenador, la mayor parte del tiempo |
| **AltStore PAL** (tienda alternativa, solo UE, Japón, Brasil) | **Sí, para quien publica** (la web de desarrolladores de AltStore lo pide, más notarización de Apple). Para el jugador es gratis | Solo jugadores con Apple ID de esos países; Felix pagaría la cuenta. Comisión de Apple: el 5 % del «Core Technology» desde el 1-10-2026 (⚠️ las fuentes no se ponen de acuerdo sobre si aplica a apps gratis) |
| **TestFlight** | **Sí** (hace falta cuenta de pago para subir builds) | Las builds duran 90 días (⚠️), 10 000 testers. No es gratis |
| **App Store** | Sí | Ver §3; revisión de Apple |
| **Certificado de empresa (enterprise)** | Sí, más empresa registrada | **No permitido** para distribuir al público (Apple lo revoca). Descartado |
| **Web / PWA** | No | **No puede ejecutar Java.** Solo vale como página con la guía |
| **Jailbreak / TrollStore** | No | Solo iOS viejos concretos; no es una ruta para jugadores en general |

Nota: los certificados «gratis» de internet (firmadores tipo Esign, tiendas piratas) existen pero violan términos de
Apple, se revocan sin aviso y no pueden asociarse a nuestra marca. **No los recomiendo.**

## 3. ¿App propia de marca, como la de Android?

- **Licencia de Amethyst: GPL-3.0** (confirmado en su `LICENSE`; componentes como Boardwalk tienen la suya). Igual que
  el fork de FCL: podemos modificarlo todo, con el código público y los créditos. **Legalmente es viable.**
- **Precedente real**: el proyecto *Geode* hizo un launcher propio para Geometry Dash en iOS que se instala justo así
  (LiveContainer + SideStore + StikDebug, IPA o «AltSource»), gratis, con ordenador solo para el primer paso y
  refresco semanal. Es el modelo que podríamos copiar.
- **Microsoft login**: nuestro client ID de Entra (`b02d1916…`, pendiente de la aprobación de Mojang) vale igual; la app
  usaría el flujo de ventana de login con `nativeclient` como en el launcher de PC. ⚠️ No he revisado qué ID usa
  Amethyst por defecto ni si en iOS existe el mismo problema `AADSTS70002` que vimos en FCL. Se probaría en la fase 1.
- **App Store**: **probablemente rechazada**. La regla 2.5.2 prohíbe descargar o ejecutar código que cambie las
  funciones de la app (descargamos Minecraft, mods y Java), y la 4.7 (emuladores, desde 2024) permite emuladores de
  consolas/PC que descargan *juegos*, pero no un lanzador de Java con mods ni JIT por depuración (⚠️ no hay precedente
  de Amethyst en la App Store ni lo he confirmado con Apple). Además Minecraft está bajo licencia de Mojang/Microsoft.
  Y de todos modos exige la cuenta de pago. **No es una ruta.**
- **Esfuerzo de la app propia**: parecido a Android pero peor: compilar iOS exige **un Mac** (o CI de GitHub Actions con
  runners macOS, gratis en repos públicos) y firmar con tu Apple ID; sin dispositivo para probar iOS 26 es a ciegas.
  Calculo semanas de trabajo, y el jugador seguiría teniendo el mismo proceso de instalación/JIT. **No compensa** frente
  a recomendar Amethyst tal cual con nuestra guía.

## 4. Opciones comparadas

| Opción | Coste Felix | Coste jugador | Esfuerzo del jugador | ¿Viable? |
|---|---|---|---|---|
| A. Guía web: Amethyst vía SideStore/LiveContainer + StikDebug (Apple ID gratis) | 0 € (solo escribir la guía + modpack para iOS) | 0 € | **Alto**: ordenador al inicio, 3-4 apps, VPN local, refresco semanal, JIT en cada partida | **Sí**, para avanzados; dependiente de que iOS 26 + su chip lo permita |
| B. App propia (fork de Amethyst) por la misma ruta | 0 € dinero, semanas de trabajo | 0 € | Igual de alto que A | Posible, **no compensa** |
| C. AltStore PAL (UE/JP/BR) | 99 USD/año + notarización (+ posible comisión) | 0 € | Medio (sin refrescar cada semana, pero igual hace falta JIT) | Sí, pero **no es gratis** y solo para tres zonas; la audiencia es LATAM, no entra |
| D. TestFlight | 99 USD/año | 0 € | Bajo para instalar, JIT sigue igual | No es gratis; ⚠️ Apple puede rechazar la build por JIT |
| E. App Store | 99 USD/año | 0 € | Bajo | **No** (probable rechazo) |
| F. Enterprise / certificados piratas | — | — | — | **No** (prohibido / se revoca) |
| G. Web / PWA | — | — | — | **No** (no corre Java) |

## 5. Recomendación

**Opción A, sin construir app propia:** publicar una guía en la web («Jugar desde iPhone, modo avanzado») y, si Felix
quiere, un perfil de Amethyst con nuestro modpack. Coste: **0 €** para Felix y para el jugador. Razones: la audiencia es
LATAM (la UE queda fuera de C), la cuenta de pago de 99 USD/año no se justifica sin saber cuántos jugadores usan iPhone,
y la app propia no quita ni el JIT ni el refresco semanal, que son lo que más molesta.

Pasos que haría el jugador (iPhone con iOS 17.4+, de preferencia 6 GB de RAM o más; adaptado del flujo del launcher de
Geode, que es el que mejor documentado he visto):
1. Un ordenador (Windows/Mac/Linux) y un cable; instalar **iLoader** (y iTunes en Windows). Un Apple ID gratis,
   mejor secundario.
2. En el iPhone, instalar **LocalDevVPN**; con iLoader instalar **LiveContainer + SideStore** (versión estable bajo
   iOS 26.4, nightly en 26.4 o más) y confiar en el perfil en Ajustes. Activar el **Modo desarrollador** y reiniciar.
3. Instalar **StikDebug** y colocar el archivo de emparejado con iLoader (último uso del ordenador).
4. Añadir la fuente de Amethyst (IPA de GitHub) en LiveContainer y activar JIT con StikDebug (en iOS 26, con el script
   de JIT de la app).
5. En Amethyst: iniciar sesión Microsoft, importar nuestro `.mrpack` (o el perfil «SC-Movil»), ajustar RAM y entrar a
   `mc.servidorcobblemon.es`.
6. **Cada semana**: abrir SideStore con LocalDevVPN y pulsar «Refrescar todo». **Cada partida**: conectar LocalDevVPN y
   activar JIT en StikDebug antes de abrir Amethyst.

## 6. Lo que falta por saber (antes de prometer nada a jugadores)

- Si **Cobblemon + 31 mods** arranca y juega bien en un iPhone concreto. Hace falta un iPhone real de 6 GB+ (¿alguien
  del staff tiene uno?). Sin esa prueba, no publicar la guía.
- Qué ID de Microsoft usa Amethyst y si inicia sesión sin cambios.
- Estado real en iOS 26.x con chips nuevos (TXM): hay reportes de fallos.
- Que Apple no endurezca más el sideloading con una versión nueva de iOS.
- Comisión de Apple exacta si algún día se pasa a AltStore PAL.

**Siguiente paso barato (si Felix quiere):** probar Amethyst + el `.mrpack` actual en un iPhone del staff. Es una
tarde de pruebas, 0 €, y decide si merece la pena la guía.

## Fuentes (consultadas el 27-10-2026)

- Amethyst-iOS (README, JIT, mods): <https://github.com/AngelAuraMC/Amethyst-iOS>
- Licencia (GPL-3.0): <https://raw.githubusercontent.com/AngelAuraMC/Amethyst-iOS/main/LICENSE>
- Issue iOS 26 en Amethyst: <https://github.com/AngelAuraMC/Amethyst-iOS/issues/16> · reporte TXM en fork:
  <https://github.com/herbrine8403/Amethyst-iOS-MyRemastered/issues/133> · JIT que no se detecta:
  <https://github.com/AngelAuraMC/Amethyst-iOS/issues/324>
- StikDebug: <https://stikdebug.org/>
- LiveContainer, JIT: <https://livecontainer.github.io/docs/guides/jit-support>
- PR de JIT en iOS 26 con TXM: <https://github.com/jpd002/Play--CodeGen/pull/34>
- Guía Geode (modelo de launcher propio vía LiveContainer): <https://github.com/geode-sdk/ios-launcher/blob/main/LIVECONTAINER-INSTALL-GUIDE.md>
- AltStore PAL para desarrolladores: <https://developer.altstore.io/> · <https://builds.io/blog/technologies/ios-technologies/official-sideloading-eu-japan-brazil-limits/>
- Límites SideStore / Apple ID gratis: <https://fr0stb1rd.is-a.dev/posts/ios-26-unlimited-sideload-sidestore-livecontainer/> ·
  <https://developer.apple.com/forums/thread/746470>
- Reglas de App Store (2.5.2, 4.7): <https://developer.apple.com/app-store/review/guidelines/> ·
  <https://www.howtogeek.com/apple-clarifies-app-store-rules-for-pc-emulators/>
- RAM de Cobblemon: <https://modrinth.com/modpack/cobblemon-fabric>
