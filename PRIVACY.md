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

**No se transmite ninguno de estos datos a nuestros servidores.**

## Conexiones que realiza el programa

| Destino | Para qué | Qué se envía |
| --- | --- | --- |
| Servidores de Mojang / Microsoft | Descargar Minecraft y sus recursos; iniciar sesión con cuentas de pago | Lo que exige su propio proceso de autenticación. Las credenciales van directas a Microsoft: **nunca pasan por nosotros ni las almacenamos** |
| `descargas.servidorcobblemon.es` | Descargar y actualizar los mods y los paquetes de recursos | Peticiones web normales |
| `github.com` | Comprobar si hay una versión nueva del launcher y descargarla | Peticiones web normales |
| `directo.servidorcobblemon.es` | Ruta alternativa a las descargas cuando tu operador bloquea la normal (por ejemplo, durante los partidos de fútbol) | Peticiones web normales |
| `sessionserver.mojang.com` | Mostrar la cara de tu skin si tu cuenta es premium | El identificador público (UUID) de tu cuenta |
| `minotar.net` | Mostrar la cabeza y el cuerpo de las cuentas cuando no hay skin de Mojang | El identificador público (UUID) de la cuenta |
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

No se envía tu nombre, tu cuenta, el contenido del informe de soporte o del informe de fallo del juego ni ninguna ruta o archivo de tu
ordenador. Se cuenta únicamente cuántos jugadores distintos tienen cada error al día, para enterarnos de
los fallos sin esperar a que nos los reportéis. Puedes desactivarlo en **Ajustes → Launcher → Enviar
avisos de error anónimos**.

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

## Contacto

Cualquier duda sobre privacidad: a través del [Discord del servidor](https://discord.gg/servidorcobblemon).
