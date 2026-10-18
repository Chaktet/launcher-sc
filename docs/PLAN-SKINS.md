# Plan · cambiar la skin desde el launcher (cuentas no premium)

> Aprobado por Felix el 2026-10-18. Plugin construido y probado en local (`E:/PROYECTOS-MC/SCSkinLauncher`, 27/27
> pruebas de punta a punta); falta la revisión de Codex, el despliegue y la parte del launcher (espera el diseño).

## Qué quiere el jugador

1. Ver **su skin del servidor** como cabeza de la cuenta (hoy sale siempre Steve).
2. Cambiarla desde el launcher sin aprender `/skin`: subir un PNG o copiar la skin de un jugador premium.
3. Que se aplique sola: al momento si está conectado, y si no, al entrar.

## Lo que hay hoy (comprobado el 2026-10-18)

| Pieza | Estado |
|---|---|
| SkinsRestorer en Velocity | **15.10.1**, `database.type: MYSQL` en MariaDB de OVH-A (BD `skinsrestorer`, prefijo `sr_`). Es el que manda: con proxy, Velocity guarda y aplica las skins. |
| SkinsRestorer en Kanto y Kalos | **15.12.6**, MySQL contra la misma BD, `proxyMode.api: true` |
| SkinsRestorer en Pruebas | 15.12.6 pero con `database.type: FILE` (no comparte BD) |
| Login no premium | **JPremium** en Velocity (`/register`, `/login` dentro del juego). La contraseña solo la conoce el servidor. |
| Backend propio para el launcher | No hay. `estado.json` es un JSON estático que escribe un cron y los avisos de error son peticiones a un fichero estático que se cuentan en el log de Apache. |
| Cabeza en el launcher | `scPintarCabeza()` en [landing.js](../app/assets/js/scripts/landing.js) ya pinta una textura de `textures.minecraft.net`. No premium → minotar por UUID offline (Steve). |

Las tablas de la BD `skinsrestorer` no se tocan: todo va por la API de SkinsRestorer.

## La pieza del servidor: plugin de Velocity `SCSkinLauncher`

Un plugin nuevo de Velocity (Java 21, mismo esqueleto que `SCSessionAviso`) que habla con SkinsRestorer por su
**API oficial** (nunca escribe en las tablas a mano) y abre un servidor HTTP pequeño **solo en `127.0.0.1`**.
Apache lo publica por `https://descargas.servidorcobblemon.es/launcher/skin/…` (detrás de Cloudflare).

Por qué en Velocity y no en Kanto/Kalos: SkinsRestorer de Velocity es el que guarda y aplica la skin para toda la
red, y ahí también vive el comando del juego para la verificación. Un solo sitio, sirve para las dos regiones.

### Comando en el juego

| Comando | Qué hace |
|---|---|
| `/launcher` | Da un código de 6 caracteres (válido 10 min, un solo uso) para vincular el launcher. Mensaje: «No se lo des a nadie. El staff nunca te lo pedirá». |
| `/launcher desvincular` | Corta todos los launchers vinculados a la cuenta. |

Solo lo pueden usar jugadores **ya logueados** con JPremium (el plugin espera a que JPremium dé el login por bueno;
mientras no, el comando no responde). Así el código prueba que quien lo pide sabe la contraseña de la cuenta.

### Endpoints

| Método y ruta | Auth | Qué hace |
|---|---|---|
| `POST /launcher/skin/vincular` `{nombre, codigo}` | ninguna | Canjea el código. Devuelve un **token del dispositivo** (aleatorio, 256 bits) + `uuid` + `nombre`. En el servidor solo se guarda su hash SHA-256. |
| `GET /launcher/skin/yo` | token | Nombre, uuid, textura actual y origen (`subida`, `premium` o ninguno). |
| `GET /launcher/skin/cara?nombre=X` | ninguna | URL de la textura actual de esa cuenta en el servidor (`textures.minecraft.net`) o `null`. Es lo mismo que cualquiera ve en el juego. |
| `POST /launcher/skin/subir?modelo=clasico\|fino` (cuerpo = el PNG, `image/png`) | token | Valida el PNG, lo firma vía MineSkin (lo que hace SkinsRestorer con `/skin url`) y se lo pone al jugador. |
| `POST /launcher/skin/copiar` `{nick}` | token | Igual que `/skin <nick>`: copia la skin de un jugador premium. |
| `POST /launcher/skin/quitar` | token | Vuelve a la skin por defecto (`/skin clear`). |
| `POST /launcher/skin/desvincular` | token | Borra este token. |

Aplicación: el plugin llama a `setSkinIdOfPlayer()` y, si el jugador está conectado, a `applySkin()`: **se ve al
momento**, igual que `/skin` hoy. Si no está, la verá al entrar.

### Cómo se firma una skin subida

Minecraft solo acepta texturas alojadas en `textures.minecraft.net` y firmadas por Mojang. SkinsRestorer lo resuelve
mandando la imagen a **MineSkin** (servicio gratuito que la sube a una cuenta de Mojang y devuelve la textura
firmada). El plugin:

1. recibe el PNG, lo valida y lo **vuelve a codificar** (se quitan metadatos y cualquier cosa rara del fichero);
2. se lo pasa a SkinsRestorer (`getMineSkinAPI().genSkin(bytes, variante)`), que lo sube directamente a MineSkin,
   sin ficheros temporales públicos;
3. guarda la textura firmada como skin propia `scl_<hash del PNG>` y se la asigna al jugador. Dos jugadores con el
   mismo PNG comparten la misma entrada.

Como mucho 2 firmas a la vez; el resto recibe «ocupado». En la prueba local tardó 2,5 s.

Esto usa la clave de MineSkin que ya trae SkinsRestorer: **no hace falta clave nueva ni servicio de pago**. Si
MineSkin va saturado, el launcher dice «inténtalo en un minuto».

No se aceptan URLs puestas por el jugador: así no hay que defenderse de URLs a IPs privadas (SSRF).

### Validación y límites

- PNG real (firma de bytes), **64×64 o 64×32**, máximo **24 KB** (una skin pesa 1–5 KB), decodificado con `ImageIO`
  antes de usarlo; cualquier otra cosa se rechaza con un error claro.
- Nick premium: `^[A-Za-z0-9_]{3,16}$`.
- Canjear código: solo cuentan los fallos, 10 por IP y 8 por nombre cada 10 min; el código muere al tercer fallo.
- Pedir código en el juego: 3 cada 10 min por jugador.
- Cambiar skin: 1 por minuto y 20 al día por cuenta (en el juego hay 30 s de espera; aquí más, porque cada subida
  gasta MineSkin).
- `cara`: 60 por minuto por IP.
- IP real: `CF-Connecting-IP` solo si la petición entra por Apache; el plugin no escucha fuera de `127.0.0.1`.
- Los contadores viven en memoria. En disco solo: hash del token, uuid, nombre, fecha de creación y de último uso.
  Un token sin usar en 180 días caduca solo; como mucho 5 launchers por cuenta (el sexto expulsa al más antiguo).
- Cuerpos grandes: el servidor lee como mucho 24 KB y corta la conexión si mandan más.

Nunca se puede cambiar la skin de otro: el uuid sale **del token**, nunca de la petición.

### Almacenamiento propio

Un fichero `plugins/scskinlauncher/tokens.tsv` en el Velocity (una línea por token: hash, uuid, nombre, creado,
usado), escrito de forma atómica. Sin MariaDB: solo hay un Velocity y así el plugin no necesita la contraseña de la
base de datos. Los códigos de 6 caracteres solo viven en memoria (10 min).

## El flujo del jugador

1. Clic en su cabeza o en la píldora de cuenta de la portada (ahora dice «Cambiar skin», con un lápiz). El botón
   en Ajustes → Cuenta del diseño queda pendiente: `settings.js`/`settings.ejs` los estaba editando otra sesión.
2. La primera vez: «Entra al servidor y escribe `/launcher`. Pega aquí el código». Una sola vez por PC.
3. Ya vinculado: ve su skin actual en 3D/plana, elige **Subir PNG** (arrastrar o buscar, elige brazos clásicos o
   finos) o **Copiar de un jugador premium** (escribe el nick, ve la vista previa), pulsa **Aplicar**.
4. Mensaje: «Hecho. Si estás jugando, ya la llevas puesta».
5. La cabeza de la cuenta se actualiza.

**Cabeza para no premium (independiente de vincular):** el launcher pide `cara?nombre=` y pinta la textura con
`scPintarCabeza()`, solo si el host es `textures.minecraft.net`. Caché de 10 min (corta, para que tras cambiarla se
vea pronto). Si falla, minotar como hoy.

El token del dispositivo se guarda en el `localStorage` del launcher (`scSkinToken:<uuid>`), igual de protegido que
las sesiones de Microsoft que Helios guarda en `config.json`. `safeStorage` solo existe en el proceso principal y
habría obligado a tocar `index.js` (otra sesión). El token solo sirve para cambiar la skin de esa cuenta. Al quitar
la cuenta del launcher se llama a `desvincular` (enganche en `ConfigManager.removeAuthAccount`, en `scskin.js`).

Implementado en `app/assets/js/scripts/scskin.js` + `app/assets/css/scskin.css`. Para probar contra un Velocity
local: `SC_SKIN_PUERTO_LOCAL=8791` (solo habla con 127.0.0.1).

### Alternativas descartadas

- **Pedir la contraseña de JPremium en el launcher:** sin paso en el juego, pero obliga a mandar contraseñas a
  nuestro servidor y depender de la API de un JPremium «CLEARED». No.
- **Código generado en el launcher y escrito en el juego:** igual de seguro, pero el launcher tendría que quedarse
  preguntando al servidor hasta que lo escribas. El código en el juego es el patrón que el jugador ya conoce (como
  vincular Discord).

## Despliegue (sin reiniciar nada de producción)

1. Prueba completa en local: un Velocity en mi PC en offline-mode con SkinsRestorer 15.10.1 y el plugin, y un
   cliente apuntando a él (JPremium no hace falta para probar el plugin).
2. No hay Velocity de pruebas: el plugin se carga en el Velocity real **en caliente con ServerUtils**
   (`serverutils load`), sin reiniciar. Es aditivo: si falla, se descarga y no afecta a nada más. Antes de abrir la
   ruta pública, se prueba desde OVH-A con `curl 127.0.0.1`.
3. **Apache**: añadir `ProxyPass /launcher/skin/ http://127.0.0.1:<puerto>/` al vhost de descargas (`packs.conf`) y
   `apachectl -t && systemctl reload apache2`. Un `reload` no corta descargas en curso, pero es un servicio de
   producción: **necesito tu OK explícito para ese reload**.
4. Launcher nuevo (1.17.0) con su release en GitHub, entrada en Novedades y actualización de `PRIVACY.md`.
5. Verificación: vincular una cuenta de prueba, subir PNG, copiar nick, comprobar en el juego (Pruebas pasa por el
   mismo Velocity) y la cabeza; pruebas de abuso: código erróneo ×6, PNG de 128×128, PNG de 2 MB, fichero que no es
   PNG, token de otra cuenta.

Codex revisa el plugin y el cambio del launcher antes del commit (toca auth y seguridad: la revisión bloquea).

## Privacidad

Aplicado en [PRIVACY.md](../PRIVACY.md) (sección «Cambiar la skin desde el launcher», filas nuevas de conexiones y
MineSkin en servicios de terceros). Se publica con la versión del launcher que incluya «Cambiar skin».

## Decisiones de Felix (2026-10-18)

- Plan y flujo con código en el juego: aprobados.
- `reload` de Apache en OVH-A: autorizado y hecho (rutas `/launcher/skin/` en `packs.conf`, solo IPs de Cloudflare, y
  en `directo.conf`; copias en `/etc/apache2/backup-scskin-20261018/`).
- Diseño v7 de Codex: aprobado.

## Brief de diseño para Codex

Ver [PLAN-SKINS-BRIEF-CODEX.md](PLAN-SKINS-BRIEF-CODEX.md).
