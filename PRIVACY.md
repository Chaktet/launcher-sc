# Política de privacidad · SC Launcher

_Última actualización: 18 de octubre de 2026_

SC Launcher es el launcher del servidor de Minecraft [servidorcobblemon.es](https://servidorcobblemon.es).
Esta política explica qué datos maneja el programa. En resumen: **no recopilamos datos personales ni
hay seguimiento de usuarios.** Lo único que el launcher envía por su cuenta es un aviso anónimo
cuando el juego no arranca (ver abajo), y se puede desactivar.

## Datos que el programa guarda en tu ordenador

Todo se queda en tu equipo, en la carpeta de datos del launcher:

- **Nombre de usuario y perfil de la cuenta** que utilizas para jugar.
- **Tokens de sesión de Microsoft**, si entras con una cuenta de pago. Se guardan para no tener que
  iniciar sesión cada vez y se pueden borrar cerrando la sesión desde el propio launcher.
- **Preferencias**: memoria asignada, versión elegida, mods opcionales activados, paquetes de recursos
  y shaders.
- **Registros de ejecución** del launcher y del juego, útiles para resolver incidencias. No se envían
  a ningún sitio: se quedan en tu disco y solo se comparten si tú decides adjuntarlos en un ticket de
  soporte.
- **Identificador de este PC para «Cambiar skin»**, solo si vinculas el launcher (ver más abajo).

**No se transmite ninguno de estos datos a nuestros servidores**, salvo el identificador de «Cambiar skin»
cuando tú cambias tu skin desde el launcher.

## Conexiones que realiza el programa

| Destino | Para qué | Qué se envía |
| --- | --- | --- |
| Servidores de Mojang / Microsoft | Descargar Minecraft y sus recursos; iniciar sesión con cuentas de pago | Lo que exige su propio proceso de autenticación. Las credenciales van directas a Microsoft: **nunca pasan por nosotros ni las almacenamos** |
| `descargas.servidorcobblemon.es` | Descargar y actualizar los mods y los paquetes de recursos | Peticiones web normales |
| `github.com` | Comprobar si hay una versión nueva del launcher y descargarla | Peticiones web normales |
| `directo.servidorcobblemon.es` | Ruta alternativa a las descargas cuando tu operador bloquea la normal (por ejemplo, durante los partidos de fútbol) | Peticiones web normales |
| `sessionserver.mojang.com` | Mostrar la cara de tu skin si tu cuenta es premium | El identificador público (UUID) de tu cuenta |
| `minotar.net` | Mostrar la cabeza y el cuerpo de las cuentas cuando no hay skin de Mojang | El identificador público (UUID) de la cuenta |
| `descargas.servidorcobblemon.es/launcher/skin` (o `directo.…`) | Mostrar la skin que llevas en el servidor y cambiarla desde el launcher | Tu nombre de jugador; si vinculas el launcher, el código de un solo uso y después el identificador de este PC; la imagen de la skin que subas |
| `api.mojang.com` y `sessionserver.mojang.com` | Enseñar la vista previa al copiar la skin de un jugador premium | El nombre de ese jugador premium |
| `servidorcobblemon.es` | Mostrar el número de jugadores conectados y jugar | Lo propio del protocolo de Minecraft |

## Avisos anónimos de error

Desde la versión 1.16.12, cuando el juego no consigue arrancar o se cierra con un error a media partida,
el launcher envía un aviso con:

- el **código del error** (por ejemplo, `SC-04`);
- la **versión del launcher** y el **perfil** (PRO, LITE o SUPER LITE);
- si estaba usando la **ruta alternativa** de descarga y, en un fallo de descarga, de qué tipo es
  (sin conexión, certificado, disco u otro).
- si el juego se cerró a media partida: el **tipo de error** de Java (por ejemplo, `OutOfMemoryError`) y el
  **nombre del paquete del mod** que aparece como causa en el informe de fallo (por ejemplo, `com.cobblemon.mod`).

Desde la versión 1.16.13, el juego también puede enviar un aviso igual de anónimo cuando, dentro de la partida,
algo del paquete de recursos no carga: si el **paquete del servidor (SC-Pack) no está activo**, si **faltan texturas**
(cuántas y el nombre interno de la primera, por ejemplo `cobblemon:item/poke_ball`) o si **un modelo de Pokémon falla**
(el nombre interno del modelo o de la pieza, por ejemplo `wartortle`). Lo envía un pequeño mod incluido en el modpack,
como mucho una vez por partida y por tipo de aviso, con la versión del launcher, el perfil y la versión del propio mod.
Solo lo hace si el launcher lo abrió con esta opción activada; también se puede apagar en ese ordenador poniendo
`enviar=false` en `config/sc_avisos_cliente.properties`.

No se envía tu nombre, tu cuenta, el contenido del informe de soporte o del informe de fallo del juego ni ninguna ruta o archivo de tu
ordenador. Se cuenta únicamente cuántos jugadores distintos tienen cada error al día, para enterarnos de
los fallos sin esperar a que nos los reportéis. Puedes desactivarlo en **Ajustes → Launcher → Enviar
avisos de error anónimos**.

## Cambiar la skin desde el launcher

Para cambiar tu skin desde el launcher (cuentas no premium) hay que vincularlo una vez con un código que da el
servidor al escribir `/launcher` dentro del juego. El launcher guarda en tu equipo un identificador de este PC; en
el servidor solo guardamos una huella de ese identificador (no el identificador en sí), tu nombre de jugador y
cuándo se usó por última vez. Se borra con `/launcher desvincular` en el juego, con «Desvincular este PC» o al
quitar la cuenta del launcher, y caduca solo tras 180 días sin usarlo.

**Las skins son públicas.** Para que Minecraft acepte una skin subida, el servidor la envía al servicio
[MineSkin](https://mineskin.org), que la publica en los servidores de texturas de Mojang. Cualquiera que juegue
contigo la ve, igual que con `/skin`. No subas imágenes con datos personales.

Para limitar abusos, el servidor cuenta las peticiones por dirección IP durante unos minutos, solo en memoria:
no se guardan.

## Registros del servidor de descargas

Como cualquier servidor web, `descargas.servidorcobblemon.es` guarda un **registro de accesos**
estándar: dirección IP, fecha, archivo solicitado y navegador o programa que lo pide. Se usa
únicamente para dos cosas: detectar fallos de descarga y contar cuántas instalaciones activas hay
(una cifra agregada, sin identificar a nadie).

Estos registros **no se cruzan con cuentas de juego, no se venden ni se ceden a terceros**, y se
rotan y eliminan automáticamente siguiendo la configuración estándar del sistema.

## Menores de edad

El launcher no solicita datos personales, por lo que puede usarse sin aportar información de
identificación más allá de la cuenta de Minecraft que el propio jugador decida utilizar.

## Servicios de terceros

Al usar el launcher también te aplican las políticas de:

- [Microsoft / Mojang](https://www.minecraft.net/es-es/privacy) — cuenta y descarga del juego.
- [GitHub](https://docs.github.com/es/site-policy/privacy-policies/github-general-privacy-statement) —
  alojamiento de las actualizaciones del launcher.
- [MineSkin](https://mineskin.org) — firma de las skins que subes desde «Cambiar skin».

## Contacto

Cualquier duda sobre privacidad: a través del [Discord del servidor](https://discord.gg/servidorcobblemon).
