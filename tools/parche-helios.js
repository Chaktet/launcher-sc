// Parches de helios-core que necesita el SC Launcher.
//
// Se aplican en postinstall (npm install / npm ci, también en GitHub Actions) y son
// idempotentes: cada fichero lleva una marca y, si ya la tiene, no se toca. Si
// helios-core cambia y no se encuentra el código a parchear, FALLA en voz alta: un
// parche que no se aplica en silencio es exactamente el fallo que queremos evitar.
//
// 1. Modo "conexión lenta" (1.6.3) · dl/DownloadEngine.js
//    helios-core descarga siempre con 15 conexiones a la vez. En routers de operadora
//    flojos, PLC o repetidores, eso satura la red hasta tumbarla: al jugador se le caen
//    el cable Y el wifi cada vez que el launcher descarga (reporte del 24-09-2026).
//    Bajarlo a todos haría la descarga lenta para quien no tiene el problema, así que
//    el número sale de variables de entorno que landing.js pone por jugador:
//      SC_DESCARGAS_PARALELAS  -> cuántas a la vez (por defecto 15, como upstream)
//      SC_MODO_LENTO=1         -> además reintenta los cortes de red con más paciencia
//
// 2. Arranque rápido (1.7.0) · caché de validación + hash en paralelo
//    Cada arranque recalculaba en serie el MD5/SHA1 de ~1,43 GB: 20 s en frío en un i9
//    y 29-72 s en los PC de los jugadores. Ahora:
//      - FileUtils.validateLocalFile consulta la caché de tools/helios/ScCacheValidacion.js
//        (tamaño + mtime + hash esperado) si el launcher pasa SC_CACHE_VALIDACION;
//      - los bucles de validación de módulos, assets y librerías van en paralelo
//        (SC_HASH_PARALELOS, 6 por defecto);
//      - FullRepairReceiver guarda la caché al terminar de validar.
//
// 3. Manifiesto de versiones de Mojang con tiempo máximo (1.7.0) · MojangIndexProcessor
//    Sin timeout, una conexión colgada (wifi de colegio, portal cautivo, antivirus con
//    inspección SSL) dejaba el arranque parado sin fin. Si no responde en 15 s, helios
//    ya sabe tirar del version.json local.
//
// 4. Descargas y API de Java con tiempo máximo (1.7.4) · DownloadEngine + JavaGuard
//    got.stream() sin timeout: con una conexión que se queda colgada (no cortada) una
//    descarga no terminaba nunca y la barra se quedaba parada para siempre. Con 10 s
//    para el DNS, 15 s para conectar y 30 s sin recibir nada se corta con TimeoutError, y ese error pasa
//    a ser reintentable para que actúe el reintento de helios (10 intentos). Lo mismo
//    para la consulta a la API de Adoptium antes de bajar Java.
//
// 5. Bytes pendientes (1.7.4) · FullRepairReceiver
//    validateComplete manda también cuántos bytes faltan por descargar, para que el
//    launcher compruebe el espacio libre con lo que de verdad va a bajar.
//
// 6. Idiomas del juego (22-10-2026) · MojangIndexProcessor
//    Solo se bajan los idiomas de Minecraft en español e inglés: −83 MB por instalación.
//
// 7. Java JRE en vez de JDK desde Adoptium (22-10-2026) · JavaGuard
//    −156 MB de descarga y −183 MB en disco cuando falla nuestro CDN de Java.
//
// 8. Fallos del disco al verificar (24-10-2026) · FullRepairReceiver.parseError
//    Solo traducía los errores de red: un EPERM del antivirus o un ENOENT llegaba al
//    launcher como `displayable: undefined` y el SC-03 salía sin pista. Ahora manda
//    «Local error (CÓDIGO): mensaje» y landing.js saca de ahí el código del aviso.
const fs = require('fs')
const path = require('path')

const DIST = path.join(__dirname, '..', 'node_modules', 'helios-core', 'dist')
if(!fs.existsSync(DIST)){
    console.log('[parche-helios] helios-core no instalado todavía; nada que hacer.')
    process.exit(0)
}

function fallar(msg){
    console.error('[parche-helios] ' + msg)
    process.exit(1)
}

/** Sustituye el texto entre `inicio` (incluido) y `hasta` (excluido). */
function reemplazarTramo(s, inicio, hasta, nuevo, debeContener, nombre){
    const a = s.indexOf(inicio)
    const b = a < 0 ? -1 : s.indexOf(hasta, a + inicio.length)
    if(a < 0 || b < 0){
        fallar('NO encuentro ' + nombre)
    }
    const viejo = s.slice(a, b)
    if(!viejo.includes(debeContener)){
        fallar(nombre + ' ha cambiado de forma: no contiene ' + debeContener)
    }
    return s.slice(0, a) + nuevo + s.slice(b)
}

function reemplazarLiteral(s, antes, despues, nombre){
    if(!s.includes(antes)){
        fallar('NO encuentro en ' + nombre + ': ' + antes)
    }
    return s.replace(antes, despues)
}

/** Aplica `transformar` a un fichero de dist/ salvo que ya lleve `marca`. */
function parchear(relativo, marca, transformar, descripcion){
    const F = path.join(DIST, relativo)
    if(!fs.existsSync(F)){
        fallar('no existe ' + relativo)
    }
    const s = fs.readFileSync(F, 'utf8')
    if(s.includes(marca)){
        console.log('[parche-helios] ya aplicado: ' + descripcion)
        return
    }
    const nuevo = transformar(s)
    if(!nuevo.includes(marca)){
        fallar('el parche de ' + relativo + ' no dejó la marca ' + marca)
    }
    fs.writeFileSync(F, nuevo)
    console.log('[parche-helios] aplicado: ' + descripcion)
}

// --- 1. Modo conexión lenta --------------------------------------------------------

const MARCA_LENTO = '/* sc-modo-lento */'
parchear(path.join('dl', 'DownloadEngine.js'), MARCA_LENTO, s => {
    s = reemplazarLiteral(s,
        'const q = fastq.promise(wrap, 15);',
        MARCA_LENTO + ' const q = fastq.promise(wrap, Math.max(1, parseInt(process.env.SC_DESCARGAS_PARALELAS, 10) || 15));',
        'DownloadEngine.js')
    s = reemplazarLiteral(s,
        'function retryableError(error) {',
        'function retryableError(error) {\n'
        + '    ' + MARCA_LENTO + '\n'
        + '    if (process.env.SC_MODO_LENTO === \'1\' && error\n'
        + '        && /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ECONNABORTED|EPIPE|socket hang up/i\n'
        + '            .test(String(error.code || \'\') + \' \' + String(error.message || \'\'))) {\n'
        + '        return true;\n'
        + '    }',
        'DownloadEngine.js')
    s = reemplazarLiteral(s,
        'await (0, NodeUtil_1.sleep)(1000);',
        MARCA_LENTO + ' await (0, NodeUtil_1.sleep)(process.env.SC_MODO_LENTO === \'1\' ? 4000 : 1000);',
        'DownloadEngine.js')
    return s
}, 'descargas paralelas por SC_DESCARGAS_PARALELAS y reintentos del modo lento')

// --- 2. Caché de validación y hash en paralelo ---------------------------------------

const MARCA_CACHE = '/* sc-cache-validacion */'
const CACHE_REQ = 'require(\'../../common/util/ScCacheValidacion\')'

// El módulo de caché se copia SIEMPRE que haya cambiado, para que una versión nueva de
// tools/helios/ScCacheValidacion.js llegue aunque los demás parches ya estén puestos.
{
    const origen = path.join(__dirname, 'helios', 'ScCacheValidacion.js')
    const destino = path.join(DIST, 'common', 'util', 'ScCacheValidacion.js')
    const src = fs.readFileSync(origen, 'utf8')
    if(!fs.existsSync(destino) || fs.readFileSync(destino, 'utf8') !== src){
        fs.writeFileSync(destino, src)
        console.log('[parche-helios] copiado ScCacheValidacion.js')
    }
}

parchear(path.join('common', 'util', 'FileUtils.js'), MARCA_CACHE, s => reemplazarLiteral(s,
    'async function validateLocalFile(path, algo, hash) {',
    MARCA_CACHE + '\n'
    + 'async function validateLocalFile(path, algo, hash) {\n'
    + '    return require(\'./ScCacheValidacion\').validar(path, algo, hash, validateLocalFileOriginal);\n'
    + '}\n'
    + 'async function validateLocalFileOriginal(path, algo, hash) {',
    'FileUtils.js'), 'validateLocalFile con caché (SC_CACHE_VALIDACION)')

parchear(path.join('dl', 'distribution', 'DistributionIndexProcessor.js'), MARCA_CACHE, s => reemplazarTramo(s,
    'async validateModules(modules, accumulator) {',
    '    async loadModLoaderVersionJson() {',
    'async validateModules(modules, accumulator) {\n'
    + '        ' + MARCA_CACHE + '\n'
    + '        // SC: se aplana el árbol (mismo orden que el recorrido original) y se valida en paralelo.\n'
    + '        const todos = [];\n'
    + '        const aplanar = (lista) => {\n'
    + '            for (const module of lista) {\n'
    + '                todos.push(module);\n'
    + '                if (module.hasSubModules()) {\n'
    + '                    aplanar(module.subModules);\n'
    + '                }\n'
    + '            }\n'
    + '        };\n'
    + '        aplanar(modules);\n'
    + '        const malos = await ' + CACHE_REQ + '.mapaConcurrente(todos, async (module) => {\n'
    + '            const hash = module.rawModule.artifact.MD5;\n'
    + '            if (await (0, FileUtils_1.validateLocalFile)(module.getPath(), Asset_1.HashAlgo.MD5, hash)) {\n'
    + '                return null;\n'
    + '            }\n'
    + '            return {\n'
    + '                id: module.rawModule.id,\n'
    + '                hash: hash,\n'
    + '                algo: Asset_1.HashAlgo.MD5,\n'
    + '                size: module.rawModule.artifact.size,\n'
    + '                url: module.rawModule.artifact.url,\n'
    + '                path: module.getPath()\n'
    + '            };\n'
    + '        });\n'
    + '        for (const m of malos) {\n'
    + '            if (m != null) {\n'
    + '                accumulator.push(m);\n'
    + '            }\n'
    + '        }\n'
    + '    }\n',
    'validateLocalFile', 'DistributionIndexProcessor.validateModules'), 'validación de módulos en paralelo')

parchear(path.join('dl', 'mojang', 'MojangIndexProcessor.js'), MARCA_CACHE, s => {
    s = reemplazarTramo(s,
        'async validateAssets(assetIndex) {',
        '    async validateLibraries(versionJson) {',
        'async validateAssets(assetIndex) {\n'
        + '        ' + MARCA_CACHE + '\n'
        + '        const objectDir = (0, path_1.join)(this.assetPath, \'objects\');\n'
        + '        const res = await ' + CACHE_REQ + '.mapaConcurrente(Object.entries(assetIndex.objects), async (assetEntry) => {\n'
        + '            const hash = assetEntry[1].hash;\n'
        + '            const path = (0, path_1.join)(objectDir, hash.substring(0, 2), hash);\n'
        + '            const url = `${MojangIndexProcessor.ASSET_RESOURCE_ENDPOINT}/${hash.substring(0, 2)}/${hash}`;\n'
        + '            if (await (0, FileUtils_1.validateLocalFile)(path, Asset_1.HashAlgo.SHA1, hash)) {\n'
        + '                return null;\n'
        + '            }\n'
        + '            return { id: assetEntry[0], hash, algo: Asset_1.HashAlgo.SHA1, size: assetEntry[1].size, url, path };\n'
        + '        });\n'
        + '        return res.filter(a => a != null);\n'
        + '    }\n',
        'validateLocalFile', 'MojangIndexProcessor.validateAssets')
    s = reemplazarTramo(s,
        'async validateLibraries(versionJson) {',
        '    async validateClient(versionJson) {',
        'async validateLibraries(versionJson) {\n'
        + '        const libDir = (0, FileUtils_1.getLibraryDir)(this.commonDir);\n'
        + '        const candidatas = [];\n'
        + '        for (const libEntry of versionJson.libraries) {\n'
        + '            if ((0, MojangUtils_1.isLibraryCompatible)(libEntry.rules, libEntry.natives)) {\n'
        + '                let artifact;\n'
        + '                if (libEntry.natives == null) {\n'
        + '                    artifact = libEntry.downloads.artifact;\n'
        + '                }\n'
        + '                else {\n'
        + '                    const classifier = libEntry.natives[(0, MojangUtils_1.getMojangOS)()].replace(\'${arch}\', process.arch.replace(\'x\', \'\'));\n'
        + '                    artifact = libEntry.downloads.classifiers[classifier];\n'
        + '                }\n'
        + '                candidatas.push({ libEntry, artifact });\n'
        + '            }\n'
        + '        }\n'
        + '        const res = await ' + CACHE_REQ + '.mapaConcurrente(candidatas, async ({ libEntry, artifact }) => {\n'
        + '            const path = (0, path_1.join)(libDir, artifact.path);\n'
        + '            const hash = artifact.sha1;\n'
        + '            if (await (0, FileUtils_1.validateLocalFile)(path, Asset_1.HashAlgo.SHA1, hash)) {\n'
        + '                return null;\n'
        + '            }\n'
        + '            return { id: libEntry.name, hash, algo: Asset_1.HashAlgo.SHA1, size: artifact.size, url: artifact.url, path };\n'
        + '        });\n'
        + '        return res.filter(a => a != null);\n'
        + '    }\n',
        'validateLocalFile', 'MojangIndexProcessor.validateLibraries')
    // 3. Tiempos máximos: 15 s para el manifiesto (hay copia local de reserva) y 60 s
    // para el resto de JSON de Mojang (índice de assets, version.json).
    s = reemplazarLiteral(s,
        'const res = await this.client.get(MojangIndexProcessor.VERSION_MANIFEST_ENDPOINT);',
        'const res = await this.client.get(MojangIndexProcessor.VERSION_MANIFEST_ENDPOINT, { timeout: { request: 15000 }, retry: { limit: 1 } });',
        'MojangIndexProcessor.js')
    s = reemplazarLiteral(s,
        'client = got_1.default.extend({\n        responseType: \'json\'\n    });',
        'client = got_1.default.extend({\n        responseType: \'json\',\n        timeout: { request: 60000 }\n    });',
        'MojangIndexProcessor.js')
    return s
}, 'validación de assets y librerías en paralelo + timeouts de Mojang')

// --- 4. Tiempos máximos en descargas y en la API de Adoptium --------------------------

// v2 añade `lookup`: `connect` empieza a contar DESPUÉS de resolver el DNS, así que un
// DNS colgado (router, DNS del operador) seguía sin límite.
const MARCA_TIMEOUT = '/* sc-timeouts-2 */'
const SC_GOT_TIMEOUT = '{ lookup: 10000, connect: 15000, socket: 30000 }'
// Instalaciones con la primera versión de este parche ya aplicada (node_modules sin
// reinstalar): se actualiza en sitio en vez de fallar por no encontrar el original.
const MARCA_TIMEOUT_V1 = '/* sc-timeouts */'
const SC_GOT_TIMEOUT_V1 = '{ connect: 15000, socket: 30000 }'
function migrarTimeoutsV1(s){
    return s.split(MARCA_TIMEOUT_V1).join(MARCA_TIMEOUT).split(SC_GOT_TIMEOUT_V1).join(SC_GOT_TIMEOUT)
}

parchear(path.join('dl', 'DownloadEngine.js'), MARCA_TIMEOUT, s => {
    if(s.includes(MARCA_TIMEOUT_V1)){
        return migrarTimeoutsV1(s)
    }
    s = reemplazarLiteral(s,
        'const downloadStream = got_1.default.stream(url);',
        MARCA_TIMEOUT + ' const downloadStream = got_1.default.stream(url, { timeout: ' + SC_GOT_TIMEOUT + ' });',
        'DownloadEngine.js')
    // retryableError solo reintentaba error.name === 'RequestError'; el TimeoutError de
    // got se llama distinto y sin esto el timeout cortaba la descarga sin reintentar.
    s = reemplazarLiteral(s,
        '    if (error instanceof got_1.RequestError) {\n',
        '    ' + MARCA_TIMEOUT + '\n'
        + '    if (error instanceof got_1.TimeoutError) {\n'
        + '        return true;\n'
        + '    }\n'
        + '    if (error instanceof got_1.RequestError) {\n',
        'DownloadEngine.js')
    return s
}, 'timeout de conexión y de inactividad en las descargas (reintentable)')

parchear(path.join('java', 'JavaGuard.js'), MARCA_TIMEOUT, s => s.includes(MARCA_TIMEOUT_V1) ? migrarTimeoutsV1(s) : reemplazarLiteral(s,
    'const res = await got_1.default.get(url, { responseType: \'json\' });',
    MARCA_TIMEOUT + ' const res = await got_1.default.get(url, { responseType: \'json\', timeout: ' + SC_GOT_TIMEOUT + ' });',
    'JavaGuard.js'), 'timeout en la consulta a la API de Adoptium')

parchear(path.join('dl', 'receivers', 'FullRepairReceiver.js'), MARCA_CACHE, s => reemplazarLiteral(s,
    '        this.assets = assets;\n        process.send({ response: \'validateComplete\', invalidCount: this.assets.length });',
    '        this.assets = assets;\n'
    + '        ' + MARCA_CACHE + '\n'
    + '        {\n'
    + '            const ScCache = ' + CACHE_REQ + ';\n'
    + '            await ScCache.guardar();\n'
    + '            log.info(ScCache.resumen());\n'
    + '        }\n'
    + '        process.send({ response: \'validateComplete\', invalidCount: this.assets.length });',
    'FullRepairReceiver.js'), 'guardar la caché de validación al terminar')

// --- 5. Bytes pendientes de descargar (1.7.4) -------------------------------------------
// El launcher comprueba el espacio libre con lo que de verdad falta por bajar, no con
// una cifra fija: el receptor lo dice junto con el número de ficheros a descargar.
const MARCA_ESPACIO = '/* sc-bytes-pendientes */'
parchear(path.join('dl', 'receivers', 'FullRepairReceiver.js'), MARCA_ESPACIO, s => reemplazarLiteral(s,
    'process.send({ response: \'validateComplete\', invalidCount: this.assets.length });',
    MARCA_ESPACIO + ' process.send({ response: \'validateComplete\', invalidCount: this.assets.length, scBytesPendientes: (0, DownloadEngine_1.getExpectedDownloadSize)(this.assets) });',
    'FullRepairReceiver.js'), 'bytes pendientes de descarga en validateComplete')

// --- 6. Idiomas del juego: solo español e inglés (peso de la primera instalación) ------
// El índice de assets de la 1.21.1 trae 130 idiomas en minecraft/lang/ (83 MB) y helios
// los bajaba todos. Decisión de Felix (22-10-2026): solo las variantes de español y de
// inglés. Si alguien elige otro idioma en el juego, Minecraft lo muestra en inglés (en_us
// va dentro del client.jar, no en assets), sin errores. Lo ya descargado no se borra.
// El juego lee el índice entero pero no comprueba que estén todos los objetos, así que
// basta con no validarlos (y por tanto no bajarlos) aquí.
const MARCA_IDIOMAS = '/* sc-idiomas */'
parchear(path.join('dl', 'mojang', 'MojangIndexProcessor.js'), MARCA_IDIOMAS, s => reemplazarLiteral(s,
    'mapaConcurrente(Object.entries(assetIndex.objects), async (assetEntry) => {',
    'mapaConcurrente(Object.entries(assetIndex.objects).filter(([id]) => ' + MARCA_IDIOMAS
        + ' !id.startsWith(\'minecraft/lang/\') || id.startsWith(\'minecraft/lang/es_\') || id.startsWith(\'minecraft/lang/en_\')), async (assetEntry) => {',
    'MojangIndexProcessor.js'), 'idiomas del juego: solo español e inglés')

// --- 7. Java: JRE en vez de JDK cuando se baja de Adoptium (22-10-2026) ---------------
// El JDK (205 MB, 329 MB instalado) trae compilador, jmods y herramientas que el juego no
// usa; el JRE (49 MB, 146 MB) es lo mismo que necesita Minecraft, como el Java que monta el
// launcher oficial de Mojang. Esto es la reserva: lo normal es el JRE de nuestro CDN
// (scJavaDesdeCdn en landing.js). Si Adoptium no publicara JRE para esa versión, se
// queda con el JDK en vez de quedarse sin Java.
const MARCA_JRE = '/* sc-jre */'
parchear(path.join('java', 'JavaGuard.js'), MARCA_JRE, s => reemplazarTramo(s,
    'const targetBinary = res.body.find(entry => {',
    '            if (targetBinary != null) {',
    MARCA_JRE + ' const sirve = (entry, tipo) => entry.version.major === major\n'
    + '                && entry.binary.os === sanitizedOS\n'
    + '                && entry.binary.image_type === tipo\n'
    + '                && entry.binary.architecture === arch;\n'
    + '            const targetBinary = res.body.find(entry => sirve(entry, \'jre\')) ?? res.body.find(entry => sirve(entry, \'jdk\'));\n',
    'image_type === \'jdk\'', 'JavaGuard.latestAdoptium'), 'Java de Adoptium: JRE antes que JDK')

// --- 8. Fallos del disco al verificar (24-10-2026) -----------------------------------
// Solo los errores con código de Node o Error de verdad; lo demás sigue sin texto,
// como upstream. El mensaje se corta para que una ruta larga no llene el informe.
const MARCA_LOCAL = '/* sc-error-local */'
parchear(path.join('dl', 'receivers', 'FullRepairReceiver.js'), MARCA_LOCAL, s => reemplazarLiteral(s,
    '        else {\n            return undefined;\n        }\n    }\n    async validate(message) {',
    '        else if (error != null && (typeof error.code === \'string\' || error instanceof Error)) {\n'
    + '            ' + MARCA_LOCAL + '\n'
    + '            return `Local error (${typeof error.code === \'string\' ? error.code : error.name}): ${String(error.message || \'\').slice(0, 300)}`;\n'
    + '        }\n'
    + '        else {\n            return undefined;\n        }\n    }\n    async validate(message) {',
    'FullRepairReceiver.js'), 'texto de los fallos locales (disco, antivirus) en parseError')
