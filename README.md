<p align="center"><img src="./app/assets/images/SealCircle.png" width="140px" height="140px" alt="SC Launcher"></p>

<h1 align="center">SC Launcher</h1>

<p align="center">Launcher oficial de <a href="https://servidorcobblemon.es">servidorcobblemon.es</a>, un servidor de Minecraft Java con <a href="https://cobblemon.com/">Cobblemon</a>.</p>

<p align="center">Instálalo, ábrelo y pulsa <em>Jugar</em>. Sin configurar nada.</p>

---

Basado en [Helios Launcher](https://github.com/dscalzi/HeliosLauncher) (MIT).

## Qué hace

- **Instala y actualiza el modpack automáticamente.** Descarga Java, Minecraft 1.21.1, Fabric, los
  mods y el paquete de recursos del servidor, y los mantiene al día en cada arranque.
- **Dos perfiles:** *PRO* (todos los efectos visuales) y *LITE* (optimizado para equipos de pocos
  recursos).
- **Conexión directa** al servidor, sin pasar por el menú de Minecraft ni añadir la IP a mano.
- **Mods opcionales:** cada jugador activa o desactiva los que quiera desde Ajustes.
- **Gestión de paquetes de recursos y shaders** desde la propia interfaz, incluida la importación
  de los suyos propios.
- **Cuentas de Microsoft y cuentas sin licencia** (el servidor funciona en `online-mode=false`).
- **Actualizaciones automáticas** del propio launcher: se descargan e instalan solas, sin
  reinstalar nada a mano.
- Interfaz completa en español.

> Este launcher **no incluye ni distribuye archivos del juego Minecraft**. Descarga los componentes
> oficiales desde los servidores de Mojang y requiere que el usuario tenga su propia cuenta.

## Descarga

Instaladores publicados en la [sección de versiones](https://github.com/Chaktet/launcher-sc/releases)
y en <https://descargas.servidorcobblemon.es/SC-Launcher-setup.exe>.

## Compilar desde el código

```bash
npm install
npm start          # ejecutar en modo desarrollo
npm run dist:win   # generar el instalador de Windows
```

Requiere Node.js 20 o superior. Los instaladores publicados se generan en GitHub Actions a partir de
este repositorio: [`.github/workflows/build.yml`](.github/workflows/build.yml).

## Política de firma de código

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

**Roles del proyecto**

| Rol                    | Miembros                                  |
| ---------------------- | ----------------------------------------- |
| Committers y Reviewers | [Chaktet](https://github.com/Chaktet)     |
| Approvers              | [Chaktet](https://github.com/Chaktet)     |

**Privacidad**

El programa no transmite información a terceros más allá de lo estrictamente necesario para
funcionar: descarga de los componentes del juego desde los servidores de Mojang, descarga del
modpack desde `descargas.servidorcobblemon.es`, autenticación contra los servidores de Microsoft
cuando se usa una cuenta de pago, y comprobación de actualizaciones en GitHub. No recopila datos
personales ni realiza seguimiento de los usuarios.

## Licencia

[MIT](LICENSE.txt) · Fork de Helios Launcher, © 2017-2026 Daniel D. Scalzi.

Minecraft es una marca registrada de Mojang Studios / Microsoft. Proyecto no afiliado a Mojang
Studios, Microsoft, Nintendo, The Pokémon Company ni al equipo de Cobblemon.
