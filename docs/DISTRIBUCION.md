# Distribución: modpack e instalador

> Estado verificado: 2026-08-03, inspeccionando el servidor en vivo (solo lectura).

Hay dos cosas que se publican y siguen caminos distintos:

| Qué | Se genera con | Acaba en |
|---|---|---|
| **El modpack** (`distribution.json` + mods + packs) | Nebula → `sc-distribution` | `descargas.servidorcobblemon.es/launcher/` |
| **El instalador** (`SC-Launcher-setup.exe`) | GitHub Actions → SignPath | Releases de GitHub + `descargas.servidorcobblemon.es/` |

Actualizar el modpack **no** requiere publicar un launcher nuevo, y al revés. Son ciclos
independientes, y conviene tener claro por qué, porque es una confusión fácil:

| Canal | Qué transporta | ¿Versión nueva del launcher? |
|---|---|---|
| `distribution.json` → `descargas.servidorcobblemon.es` | Mods, paquetes de recursos, configs, `options.txt` | **No** |
| electron-updater → releases de GitHub | El launcher en sí: código, imágenes, `.ejs`, CSS | **Sí** |

El contenido llega **sin publicar nada**: en cada arranque
[preloader.js](../app/assets/js/preloader.js) descarga el `distribution.json` de la URL fija de
[distromanager.js](../app/assets/js/distromanager.js), **sin mirar qué versión de launcher es**. Al
pulsar Jugar, `verifyFiles()` compara el MD5 de cada fichero contra esa lista y `download()` se trae
lo que no cuadre ([landing.js](../app/assets/js/scripts/landing.js)). Así que un jugador con la 1.5.2
instalada recibe el pack nuevo igual que uno con la última.

Lo que **sí** exige versión nueva es tocar el propio launcher — y eso incluye el fondo
`app/assets/images/backgrounds/0.jpg`, que por convención es la portada del pack vigente.

---

## 1. El modpack

### Piezas

| Ruta | Qué es |
|---|---|
| `E:\PROYECTOS-MC\sc-nebula` | [Nebula](https://github.com/dscalzi/Nebula), el generador de `distribution.json` |
| `E:\PROYECTOS-MC\sc-distribution` | El *root*: los ficheros reales del modpack |
| `E:\PROYECTOS-MC\rpacks` | Paquetes de recursos sueltos, antes de entrar en la distribución |

Configuración de Nebula (`sc-nebula/.env`):

```properties
ROOT=E:\PROYECTOS-MC\sc-distribution
BASE_URL=https://descargas.servidorcobblemon.es/launcher/
```

`BASE_URL` es lo que se escribe dentro de `distribution.json` como prefijo de descarga de cada
módulo. **Si cambia el dominio de descargas, se cambia aquí y se regenera** — no vale editar el JSON
a mano.

### Estructura del root

```
sc-distribution/
├─ distribution.json                     ← lo que consume el launcher (generado)
├─ news.xml                              ← RSS de novedades
├─ servericon.png
├─ meta/distrometa.json                  ← rss (editable a mano)
├─ schemas/                              ← generados por Nebula
├─ repo/                                 ← Fabric loader, intermediary, ASM… (generado)
└─ servers/
   ├─ ServidorCobblemon-1.21.1/          ← PRO
   │  ├─ servermeta.json                 ← nombre, RAM, dirección, versión de Fabric
   │  ├─ fabricmods/
   │  │  ├─ required/                    ← obligatorios
   │  │  ├─ optionalon/                  ← opcionales, activados de fábrica
   │  │  └─ optionaloff/                 ← opcionales, desactivados de fábrica
   │  ├─ libraries/
   │  └─ files/                          ← se vuelca tal cual en la raíz de la instancia
   │     ├─ options.txt
   │     ├─ servers.dat
   │     ├─ config/
   │     ├─ downloads/
   │     ├─ shaderpacks/                 ← se distribuye vacía
   │     └─ resourcepacks/               ← paquetes oficiales
   ├─ ServidorCobblemonLite-1.21.1/      ← LITE, misma estructura
   └─ _retirados/                        ← lo que se ha sacado del pack (no lo lee Nebula)
```

⚠️ Los paquetes de recursos cuelgan de **`files/resourcepacks/`**, no de `resourcepacks/` a la altura
del perfil. Todo lo que hay en `files/` se copia a la raíz de la instancia del jugador.

Las tres carpetas de `fabricmods/` son **la única forma** de marcar un mod como opcional. Un mod en
`required/` no se puede desactivar desde Ajustes.

### Regenerar

```bash
cd E:\PROYECTOS-MC\sc-nebula
npm run start -- generate distro
```

Para probar en local antes de publicar, se instala una copia en la carpeta de datos del launcher:

```bash
npm run start -- generate distro distribution_dev --installLocal
```

Nebula calcula los MD5 de cada fichero. **Ese hash es lo que hace que el launcher actualice.**

### La excepción: `options.txt`

`options.txt` está en `untrackedFiles` en los dos `servermeta.json`:

```json
"untrackedFiles": [
  { "appliesTo": ["files"], "patterns": ["options.txt", "downloads/**"] }
]
```

Sin hash → **se instala la primera vez y nunca se sobrescribe**. Es intencionado: si no, cada
actualización le borraría al jugador sus ajustes de vídeo, sus teclas y sus paquetes activos.

La consecuencia es que **cambiar `options.txt` en la distribución solo afecta a instalaciones
nuevas**. Para arreglar a los jugadores que ya existen hay que parchear desde el launcher — es
exactamente lo que hacen `scCorregirTeclasEnConflicto()` y `sc$activarPacksOficialesNuevos()`,
explicados en [PAQUETES-Y-SHADERS.md](PAQUETES-Y-SHADERS.md).

### Checklist para tocar el modpack

1. Meter/quitar el `.jar` o el `.zip` en la carpeta que toca, en **cada perfil** que corresponda.
   Recuerda que PRO y LITE tienen listas distintas (103 vs 61 mods).
2. ¿Es un mod opcional? Decide `optionalon` u `optionaloff`.
3. ¿Es un paquete de recursos oficial nuevo? No hay que tocar el launcher: se auto-activa solo.
4. ¿Choca alguna tecla del mod nuevo? Revisa `SC_TECLAS_EN_CONFLICTO`.
5. **Validar el pack**: `node tools/validar_pack.js <pack-descomprimido>`. Si sale NO APTO, comprueba
   antes si el fallo ya venía en la versión publicada — un defecto heredado no bloquea, uno nuevo sí.
6. Regenerar con Nebula.
7. **Reponer el `?v=`**: `node tools/romper_cache_pack.js <versión>`. Nebula lo borra siempre.
8. Subir (⚠️ ver más abajo).
7. Probar con un cliente limpio **y** con uno ya existente — los fallos de actualización solo salen
   en el segundo caso.

---

## 2. El instalador

Flujo en [.github/workflows/build.yml](../.github/workflows/build.yml), sobre `windows-latest`:

1. Dispara en push a `master`/`main`, en tags `v*`, o a mano (`workflow_dispatch`).
2. `npm ci` + `npx electron-builder --win --x64 --publish never`.
3. Sube `dist/*.exe`, `*.blockmap` y `latest.yml` como artefacto **sin firmar**.
4. Si existe el secreto `SIGNPATH_API_TOKEN`, manda el artefacto a SignPath
   (proyecto `sc-launcher`, política `release-signing`) y publica el firmado.

**A día de hoy los pasos de firma se saltan**: SignPath Foundation aún no ha aprobado el proyecto,
el secreto no existe y `SIGNPATH_CONFIGURADO` evalúa a `false`. El flujo sigue siendo válido; el
`.exe` sale sin firmar y Windows SmartScreen avisará.

**La release se publica a mano** (`--publish never` es deliberado): el `.exe` firmado se sube después.

### `latest.yml` y la auto-actualización

El launcher se auto-actualiza con `electron-updater`, que lee `latest.yml` del feed de releases de
GitHub. Al publicar hay que subir **los tres** ficheros — `.exe`, `.blockmap` y `latest.yml`. Si
falta `latest.yml`, nadie recibe la actualización; si falta el `.blockmap`, la descarga diferencial
se cae y baja el instalador entero.

Subir la versión en [package.json](../package.json) es lo que dispara todo.

### Publicar una versión, paso a paso

Verificado publicando la 1.5.9 el 2026-08-05.

```bash
# 1. subir version en package.json
# 2. compilar
npm run dist:win

# 3. release de GitHub con los TRES ficheros (es lo que alimenta el auto-update)
gh release create vX.Y.Z --repo Chaktet/launcher-sc \
  --title "SC Launcher X.Y.Z" --notes-file notas.md \
  dist/SC-Launcher-setup-X.Y.Z.exe \
  dist/SC-Launcher-setup-X.Y.Z.exe.blockmap \
  dist/latest.yml

# 4. el .exe versionado al VPS — NUNCA el estable, que va congelado
```

Comprobación de que el auto-update lo ve:

```bash
curl -sL https://github.com/Chaktet/launcher-sc/releases/latest/download/latest.yml
```

Las notas van **en español y orientadas al jugador**, no al desarrollador: qué le cambia, no qué
función se tocó. Mira las de la 1.5.7, 1.5.8 y 1.5.9 como referencia.

> Antes de publicar, confirma que lo que has cambiado ha entrado en el empaquetado. Los recursos van
> dentro de `dist/win-unpacked/resources/app.asar`; se puede leer su cabecera y comparar el tamaño de
> la entrada con el del fichero fuente.

---

## 3. El servidor de descargas

### Cómo llega una petición

```
descargas.servidorcobblemon.es
        │  DNS → Cloudflare (104.21.81.136 / 172.67.189.156)
        ▼
   Cloudflare  ── termina el TLS ──┐
                                   │  HTTP plano al origen, puerto 80
                                   ▼
   OVH-A · 51.79.83.226 · ns5000440 · Apache 2
        │
        └─ vhost /etc/apache2/sites-enabled/packs.conf
              ServerName packs.vertix.lat   ← ¡no es "descargas"!
              DocumentRoot /var/www/packs
```

El vhost se llama `packs.vertix.lat` por motivos históricos, pero es el **default server** de `*:80`
en esa máquina, así que cualquier host que no coincida con otro vhost —`descargas.servidorcobblemon.es`
incluido— acaba sirviéndose desde `/var/www/packs`. Funciona, pero es frágil: **si algún día se añade
otro vhost antes que `packs.conf`, las descargas se rompen sin que nadie toque nada del launcher.**

El otro vhost de la máquina (`redireccion_tienda.conf`) solo redirige `servidorcobblemon.es` a
`store.servidorcobblemon.es` con un 301.

> Cloudflare **sí** está en uso, al contrario de lo que dice `DNS-RECORDS.md` en `E:\cobblemon-web`
> (ese documento es de mayo de 2026 y se quedó viejo).

### Contenido de `/var/www/packs/`

```
/var/www/packs/
├─ launcher/                        ← lo que consume el launcher
│  ├─ distribution.json             ← generado por Nebula
│  ├─ news.xml
│  ├─ servericon.png
│  ├─ repo/  ·  servers/            ← mods, packs, librerías
│  ├─ stats.json  ·  historico.json ← generados en el servidor, NO se suben
│  └─ stats.html
├─ movil/                           ← versión móvil
├─ pruebas/  ·  .congelado/         ← pruebas y material congelado
├─ SC-Launcher-setup.exe            ← CONGELADO en 1.5.2 · no se toca (ver abajo)
├─ SC-Launcher-setup-<version>.exe  ← histórico, uno por versión
└─ SC-<version>.zip                 ← paquetes sueltos
```

> ⛔ **`SC-Launcher-setup.exe` está CONGELADO en la 1.5.2 a propósito. No lo sobrescribas.**
> (`sha256 f8b4fd56f99236f8c9a9aebc03d34f0d062cb9c2fe6b40522a179a3d071ffb22`)
>
> La reputación de SmartScreen se acumula **por hash de binario**. Al reemplazar el `.exe` del enlace
> estable en cada versión (se llegaron a publicar 20 en un día), cada descarga empezaba de cero y el
> aviso *"Windows protegió su PC"* no desaparecía nunca. Congelado, sus descargas se acumulan sobre el
> mismo hash y la reputación sí crece.
>
> **No perjudica al jugador**: el aviso lo dispara la marca de la web (MOTW), que solo ponen los
> navegadores. electron-updater descarga por su propio cliente HTTP, sin MOTW, así que las
> auto-actualizaciones no pasan por SmartScreen. El usuario nuevo instala la 1.5.2 y en el primer
> arranque se pone al día solo.
>
> Descongelar solo si (a) la 1.5.2 no puede auto-actualizarse por un cambio incompatible del updater,
> o (b) ya hay certificado de firma. Si se descongela, la reputación vuelve a cero.

Por eso, al publicar se sube **solo el versionado** `SC-Launcher-setup-X.Y.Z.exe`.

### ⚠️ La caché: la trampa importante

`packs.conf` fija estas cabeceras:

| Patrón | `Cache-Control` |
|---|---|
| `*.zip` | `public, max-age=31536000, immutable` — **un año** |
| `*.exe`, `*.mrpack` | `no-cache` |
| todo lo demás (incluido `distribution.json`) | por defecto · Cloudflare lo trata como `DYNAMIC` (no cachea en el borde) |

> ⛔ **Un `.zip` reemplazado conservando el nombre NO llega al jugador por sí solo.** Está marcado
> `immutable` durante un año: Cloudflare y los jugadores que ya lo tengan seguirán sirviendo el viejo,
> y ni siquiera un cambio de MD5 en `distribution.json` lo arregla. Peor aún: el launcher entraría en
> **bucle de descarga** (valida contra el MD5 nuevo, recibe el zip viejo, falla, redescarga).

Hay dos formas de esquivarlo, y para `SC-Pack.zip` **solo vale la segunda**:

| | Cuándo | Cómo |
|---|---|---|
| Versionar el nombre | Mods y librerías: ya llevan la versión en el nombre | Renombrar en `sc-distribution` y regenerar |
| **Versionar la URL** | **`SC-Pack.zip`**, que conserva el nombre a propósito | `?v=<versión>` en `artifact.url` |

`SC-Pack.zip` **no se puede renombrar**. El nombre está acoplado a tres sitios: la constante
`SC_PACK_OFICIAL` de [settings.js](../app/assets/js/scripts/settings.js), y la línea `resourcePacks:`
de los `options.txt` de los dos perfiles. Como `options.txt` va sin hash y no se sobrescribe nunca,
renombrar el zip **desactivaría el pack a todos los jugadores ya instalados**.

La solución es tocar solo la `url` y dejar el `path` quieto:

```json
"artifact": {
  "url":  ".../resourcepacks/SC-Pack.zip?v=2.1.1",   ← Cloudflare lo mete en la clave de caché → MISS
  "path": "resourcepacks/SC-Pack.zip"                ← en disco NO cambia: options.txt sigue válido
}
```

Cloudflare incluye la query en la clave de caché, así que fuerza ir al origen; Apache la ignora al
servir un estático.

> ⛔ **Nebula borra el `?v=` en cada `generate distro`.** Hay que volver a ponerlo *después* de
> generar, siempre. Es el paso que más fácil se olvida y el que hace que la actualización no llegue.
> Script: `romper_cache_pack.js <versión>` (ver abajo).

Arreglo de fondo pendiente: excluir `files/**` de la regla `immutable` en `packs.conf`. Mientras siga
así, cada actualización del pack necesita subir el `?v=`.

Los `.exe` van con `no-cache`, así que ahí sí se puede reemplazar en sitio.

### Subida

> Verificado ejecutándolo el 2026-08-05 publicando el pack 2.1.1.

El acceso es encadenado, pero **no por el bastión Hetzner**: se salta por otro OVH y se entra por la
IP de Tailscale. La clave está en local.

```bash
K=/c/Users/Chaktet/.ssh/servers-mc/id_ed25519
PROXY="ssh -i $K -o BatchMode=yes -o StrictHostKeyChecking=no -W %h:%p ubuntu@15.235.13.90"
ssh -i "$K" -o ProxyCommand="$PROXY" ubuntu@100.101.9.93
```

El zip es **idéntico en PRO y LITE**, así que se sube una sola vez y se copia dentro del servidor.
Subirlo dos veces es tirar 143 MB para nada:

```bash
DEST=/var/www/packs/launcher
PRO=$DEST/servers/ServidorCobblemon-1.21.1/files/resourcepacks/SC-Pack.zip
LITE=$DEST/servers/ServidorCobblemonLite-1.21.1/files/resourcepacks/SC-Pack.zip

# 1. el zip, una vez, y se comprueba el MD5 en destino
cat SC-Pack.zip | conectar "cat > /home/ubuntu/SC-Pack-nuevo.zip && md5sum /home/ubuntu/SC-Pack-nuevo.zip"

# 2. a los dos perfiles
conectar "sudo cp /home/ubuntu/SC-Pack-nuevo.zip $PRO && sudo cp /home/ubuntu/SC-Pack-nuevo.zip $LITE && rm /home/ubuntu/SC-Pack-nuevo.zip"

# 3. el distribution.json (con el ?v= ya repuesto)
tar czf - distribution.json | conectar "cat > /home/ubuntu/d.tgz && sudo tar xzf /home/ubuntu/d.tgz -C $DEST && rm /home/ubuntu/d.tgz"
```

Es solo copiar ficheros estáticos: **no reinicia Apache ni nada más**, y no desconecta a ningún jugador.

### Herramientas · [tools/](../tools)

| Script | Para qué |
|---|---|
| `validar_pack.js <carpeta>` | **Puerta obligatoria antes de publicar.** Texturas por encima del tope de GPU, JSON rotos, fuentes sin textura. Sale con código 1 si no es apto |
| `escanear_texturas.js <carpeta> [tope]` | Barrido de PNG por dimensiones. Por defecto 4096 |
| `redimensionar_frames.ps1` | Reduce una textura **animada** sin perder fotogramas (escala cada uno por separado para que no se mezclen) |
| `romper_cache_pack.js <versión>` | Repone el `?v=` tras cada `generate distro` |
| `subir_pack.sh` | Sube zip + `distribution.json` a los dos perfiles |

**Sigue pendiente de confirmar con Felix:**

- [ ] Qué genera `stats.json` / `historico.json` y con qué frecuencia. Se sabe que sale del log de
      accesos: `packs.conf` escribe `packs_cf.log` con formato propio `sccf`
      (`%{CF-Connecting-IP}i` — la IP real del jugador, porque Apache solo ve la de Cloudflare). Los
      dos ficheros se regeneran solos cada pocos minutos.
- [ ] Qué es el servicio `rp-server.service` ("Resource Pack HTTP Server"), que corre en la misma
      máquina en paralelo a Apache

### Al publicar, comprobar

```bash
# distribution.json actualizado (mira Last-Modified)
curl -sI https://descargas.servidorcobblemon.es/launcher/distribution.json

# el instalador responde y NO viene cacheado
curl -sI https://descargas.servidorcobblemon.es/SC-Launcher-setup.exe
```

> ⛔ OVH-A no es solo el servidor de descargas: aloja también el proxy Velocity, el Lobby y la región
> Hoenn. No reinicies nada ahí, ni Apache, sin un "sí, reinicia" explícito de Felix.
