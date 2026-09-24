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
