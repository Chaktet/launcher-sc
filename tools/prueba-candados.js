/**
 * Prueba con procesos REALES de los candados que sustituyen a PowerShell/tasklist/taskkill (1.17.24).
 *
 *   node tools/prueba-candados.js            (con el Node del sistema)
 *   ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe tools/prueba-candados.js
 *
 * Lanza el vigilante de verdad (scvigilanteproceso.js) con un «juego» de mentira (un Node que
 * espera) y comprueba lo que el launcher decide en cada caso. Solo Windows. Sale con 1 si falla algo.
 */
const child_process = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

// SC_PRUEBA_JS: probar el código YA empaquetado (…/resources/app.asar/app/assets/js) con el exe firmado.
const JS = process.env.SC_PRUEBA_JS || path.join(__dirname, '..', 'app', 'assets', 'js')
const ScCandado = require(path.join(JS, 'sccandado.js'))
const ScVigilante = require(path.join(JS, 'scvigilante.js'))

if(process.platform !== 'win32'){
    console.log('Solo Windows: nada que probar.')
    process.exit(0)
}

// La carpeta de esta pasada no se puede borrar al acabar (este proceso tiene abierto su candado):
// se borran aquí las de pasadas anteriores.
const RAIZ_TMP = process.env.SC_PRUEBA_TMP || os.tmpdir()
for(const f of fs.readdirSync(RAIZ_TMP)){
    // Solo las de hace más de 10 min: nunca la de otra pasada que esté corriendo ahora.
    if(/^sc-candados-/.test(f)){
        try {
            if(Date.now() - fs.statSync(path.join(RAIZ_TMP, f)).mtimeMs < 600000){
                continue
            } fs.rmSync(path.join(RAIZ_TMP, f), { recursive: true, force: true }) } catch(_e){ /* de otra pasada en curso */ }
    }
}
const instancias = fs.mkdtempSync(path.join(process.env.SC_PRUEBA_TMP || os.tmpdir(), 'sc-candados-'))
const carpeta = ScVigilante.carpetaDe(instancias)
// scjuegoabierto.js necesita el logger y la configuración del launcher (Electron): aquí, dobles.
const Module = require('module')
const cargar = Module._load
Module._load = function(peticion, ...resto){
    if(peticion === 'helios-core'){
        return { LoggerUtil: { getLogger: () => ({ warn(){}, info(){} }) } }
    }
    if(/configmanager$/.test(peticion)){
        return { getInstanceDirectory: () => instancias }
    }
    return cargar.call(this, peticion, ...resto)
}
const ScJuegoAbierto = require(path.join(JS, 'scjuegoabierto.js'))
const envNode = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' })
let fallos = 0
let casos = 0

function caso(nombre, ok, detalle){
    casos++
    if(!ok){
        fallos++
    }
    console.log((ok ? 'ok   ' : 'FALLO') + ' ' + nombre + (detalle != null ? '  [' + detalle + ']' : ''))
}
const espera = ms => new Promise(r => setTimeout(r, ms))
function vive(pid){
    try { process.kill(pid, 0); return true } catch(e){ return e.code === 'EPERM' }
}
async function hasta(fn, ms = 8000){
    const fin = Date.now() + ms
    while(Date.now() < fin){
        if(fn()){ return true }
        await espera(100)
    }
    return fn()
}

/** Arranca un vigilante real con un juego de mentira. Devuelve { vigilante, pid, candado, runId }. */
function lanzarVigilante(runId){
    return new Promise((resolve, reject) => {
        const v = child_process.fork(path.join(JS, 'scvigilanteproceso.js'), [], {
            execPath: process.execPath, cwd: instancias, env: envNode, detached: true,
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true
        })
        const t = setTimeout(() => reject(new Error('el vigilante no contestó')), 10000)
        v.on('message', m => {
            if(m && m.tipo === 'lanzado'){
                clearTimeout(t)
                resolve({ vigilante: v, pid: m.pid, candado: m.candado, runId })
            } else if(m && m.tipo === 'error'){
                clearTimeout(t)
                reject(new Error(m.error && m.error.message))
            }
        })
        v.send({ tipo: 'lanzar', opciones: {
            runId, exe: process.execPath, args: ['-e', 'setTimeout(()=>{}, 120000)'], cwd: instancias, env: envNode,
            instancias, servidorId: 'prueba', perfil: 'pro', inicioPartida: Date.now(),
            exeLauncher: process.execPath, pidLauncher: process.pid, argsLauncher: [], raizApp: path.join(__dirname, '..'), discord: null
        } })
    })
}

(async () => {
    console.log('Node ' + process.versions.node + (process.versions.electron ? ' (Electron ' + process.versions.electron + ')' : '') + ' · ' + instancias)

    // 1. Vigilante y juego vivos.
    const a = await lanzarVigilante('aaaa000000000001')
    caso('el vigilante manda la ruta del candado del juego', typeof a.candado === 'string' && fs.existsSync(a.candado), a.candado)
    caso('candado del juego ocupado con el juego vivo', ScCandado.ocupado(a.candado) === true)
    caso('hayVigilanteVivo = true con el vigilante vivo', ScVigilante.hayVigilanteVivo(instancias) === true)
    const marcaA = JSON.parse(fs.readFileSync(path.join(carpeta, 'vivo-' + a.runId + '.json'), 'utf8'))
    caso('la marca vivo lleva candado:true y el pid de Java', marcaA.candado === true && marcaA.javaPid === a.pid && marcaA.fase === 'lanzado')
    ScVigilante.reclamarResultados(instancias)
    caso('la limpieza NO borra candados con dueño ni la marca viva',
        fs.existsSync(a.candado) && fs.existsSync(path.join(carpeta, 'vivo-' + a.runId + '.lock')) && fs.existsSync(path.join(carpeta, 'vivo-' + a.runId + '.json')))

    // 2. El vigilante muere de golpe (como taskkill /F): el juego sigue.
    process.kill(a.vigilante.pid)
    // Windows suelta los ficheros de un proceso muerto unos milisegundos después de que deje de existir.
    await hasta(() => !vive(a.vigilante.pid) && ScCandado.ocupado(path.join(carpeta, 'vivo-' + a.runId + '.lock')) === false)
    caso('vigilante matado: su candado queda libre aunque su marca siga', fs.existsSync(path.join(carpeta, 'vivo-' + a.runId + '.json')) && ScVigilante.esNuestro(a.vigilante.pid, Date.now(), path.join(carpeta, 'vivo-' + a.runId + '.lock')) === false)
    caso('el juego sobrevive a su vigilante y su candado sigue ocupado', vive(a.pid) && ScCandado.ocupado(a.candado) === true)
    caso('juego vivo sin vigilante: sigue sin poderse instalar la actualización', ScVigilante.hayVigilanteVivo(instancias) === true)
    // El launcher mata a un vigilante que no contesta: sinJavaVivo mata a su Java por el candado.
    caso('sinJavaVivo mata al Java vivo de la marca y lo confirma por el candado',
        await ScVigilante._sinJavaVivo(path.join(carpeta, 'vivo-' + a.runId + '.json')) === true && !vive(a.pid) && ScCandado.ocupado(a.candado) === false)
    caso('sin vigilante ni juego: se puede instalar', ScVigilante.hayVigilanteVivo(instancias) === false)

    // 2b. Java nacido sin que se anotara su pid (el vigilante murió entre el spawn y la marca).
    const huerfano = ScCandado.paraJuego(carpeta, 'ffff000000000006')
    const javaHuerfano = child_process.spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { detached: true, env: envNode, stdio: ScCandado.stdio(huerfano) })
    ScCandado.soltar(huerfano)
    const marcaHuerfana = path.join(carpeta, 'vivo-ffff000000000006.json')
    fs.writeFileSync(marcaHuerfana, JSON.stringify({ pid: 999999, runId: 'ffff000000000006', desde: Date.now(), candado: true, candadoJuego: huerfano.ruta, fase: 'lanzando' }))
    caso('«lanzando» con el candado del juego ocupado: NO es seguro lanzar otro', await ScVigilante._sinJavaVivo(marcaHuerfana) === false && vive(javaHuerfano.pid))
    caso('juego abierto que nunca se anotó: JUGAR lo ve (pid desconocido = 0)',
        !fs.existsSync(path.join(instancias, 'sc-juego.pid')) && await ScJuegoAbierto.juegoPrevioAbiertoAsync() === 0)
    // Anotado con su candado y un PID que no existe: manda el candado, no el PID.
    ScJuegoAbierto.anotar(999999, 'prueba', huerfano.ruta)
    caso('juego anotado con candado ocupado: abierto aunque el PID no exista', await ScJuegoAbierto.juegoPrevioAbiertoAsync() === 999999)
    process.kill(javaHuerfano.pid)
    await hasta(() => ScCandado.ocupado(huerfano.ruta) === false)
    caso('juego cerrado: JUGAR libre y la marca se borra',
        await ScJuegoAbierto.juegoPrevioAbiertoAsync() === null && !fs.existsSync(path.join(instancias, 'sc-juego.pid')))
    // Marca sin candado (1.17.23) con un PID vivo de otro programa, anterior al último arranque del PC.
    fs.writeFileSync(path.join(instancias, 'sc-juego.pid'), JSON.stringify({ pid: process.pid, servidor: 'prueba', desde: Date.now() - os.uptime() * 1000 - 60000, instancias }))
    caso('marca vieja sin candado anterior al arranque del PC: no bloquea JUGAR', await ScJuegoAbierto.juegoPrevioAbiertoAsync() === null)
    caso('vigilante sin candado anterior al arranque del PC: no bloquea la actualización',
        ScVigilante.esNuestro(process.pid, Date.now() - os.uptime() * 1000 - 60000, null) === false)
    caso('«lanzando» con el candado libre: seguro (no nació o ya murió)', await ScVigilante._sinJavaVivo(marcaHuerfana) === true)
    // 2c. El pid anotado ya es de otro programa: no se le mata.
    const libre = path.join(carpeta, 'juego-9999000000000007.lock')
    fs.writeFileSync(libre, '')
    const marcaReciclada = path.join(carpeta, 'vivo-9999000000000007.json')
    fs.writeFileSync(marcaReciclada, JSON.stringify({ pid: 999999, runId: '9999000000000007', desde: Date.now(), candado: true, candadoJuego: libre, fase: 'lanzado', javaPid: process.pid }))
    caso('pid de Java reciclado por otro programa: seguro y sin matarlo', await ScVigilante._sinJavaVivo(marcaReciclada) === true && vive(process.pid))
    // 2d. Marca sin candado de juego y con un pid vivo que nadie puede identificar: ni se mata ni hay respaldo.
    const marcaCiega = path.join(carpeta, 'vivo-8888000000000008.json')
    fs.writeFileSync(marcaCiega, JSON.stringify({ pid: 999999, runId: '8888000000000008', desde: Date.now(), candado: false, candadoJuego: null, fase: 'lanzado', javaPid: process.pid }))
    caso('sin candado y con el pid vivo: no se mata a ciegas y no hay respaldo', await ScVigilante._sinJavaVivo(marcaCiega) === false && vive(process.pid))
    fs.rmSync(marcaCiega, { force: true })
    // 2e. La marca desapareció pero el Java de ese intento sigue con su candado.
    const sinMarca = ScCandado.paraJuego(carpeta, '7777000000000009')
    const javaSinMarca = child_process.spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 120000)'], { detached: true, env: envNode, stdio: ScCandado.stdio(sinMarca) })
    ScCandado.soltar(sinMarca)
    caso('marca borrada con el Java vivo: NO es seguro lanzar otro', await ScVigilante._sinJavaVivo(path.join(carpeta, 'vivo-7777000000000009.json')) === false)
    process.kill(javaSinMarca.pid)
    await hasta(() => ScCandado.ocupado(sinMarca.ruta) === false)
    caso('marca borrada y sin Java: seguro', await ScVigilante._sinJavaVivo(path.join(carpeta, 'vivo-7777000000000009.json')) === true)

    // 3. PID reciclado: la marca de un vigilante muerto con el PID de un proceso vivo ajeno (el nuestro).
    fs.writeFileSync(path.join(carpeta, 'vivo-bbbb000000000002.json'),
        JSON.stringify({ pid: process.pid, runId: 'bbbb000000000002', desde: Date.now(), candado: true, fase: 'lanzado', javaPid: 4 }))
    caso('marca con candado sin dueño y PID vivo de otro: no es un vigilante', ScVigilante.hayVigilanteVivo(instancias) === false)
    // Marca de una versión vieja (sin candado) con PID vivo: se cree solo si es reciente.
    fs.writeFileSync(path.join(carpeta, 'vivo-cccc000000000003.json'),
        JSON.stringify({ pid: process.pid, runId: 'cccc000000000003', desde: Date.now() - 13 * 3600 * 1000, fase: 'lanzado', javaPid: 4 }))
    caso('marca vieja sin candado, de hace 13 h: no bloquea', ScVigilante.hayVigilanteVivo(instancias) === false)
    caso('esNuestro sin candado: PID inexistente = false', ScVigilante.esNuestro(999999, Date.now(), null) === false)
    caso('esNuestro sin candado: PID vivo y reciente = true (respaldo)', ScVigilante.esNuestro(process.pid, Date.now(), null) === true)

    // 4. La limpieza se lleva todo lo huérfano, y solo nuestros candados.
    fs.writeFileSync(path.join(carpeta, 'ajeno.lock'), '')
    ScVigilante.reclamarResultados(instancias)
    const quedan = fs.readdirSync(carpeta).filter(f => /^vivo-|\.lock$/.test(f)).sort()
    caso('la limpieza borra marcas y candados huérfanos (quedan el del launcher y el .lock ajeno)',
        quedan.length === 2 && quedan[0] === 'ajeno.lock' && /^launcher-[0-9a-f]{16}\.lock$/.test(quedan[1]), quedan.join(','))

    // 5. Cierre normal: el juego termina solo y el vigilante recoge.
    const b = await lanzarVigilante('dddd000000000004')
    process.kill(b.pid)
    await hasta(() => !vive(b.vigilante.pid), 15000)
    await espera(300)
    caso('cierre del juego: el vigilante termina y deja el resultado', !vive(b.vigilante.pid) && fs.existsSync(path.join(carpeta, 'resultado-' + b.runId + '.json')))
    caso('cierre del juego: sin marca ni candados suyos',
        !fs.existsSync(path.join(carpeta, 'vivo-' + b.runId + '.json')) && !fs.existsSync(path.join(carpeta, 'vivo-' + b.runId + '.lock')) && !fs.existsSync(b.candado))

    // 6. Reclamaciones: la de un launcher vivo (con candado) se respeta; la de uno muerto se recupera.
    const otro = child_process.spawn(process.execPath, ['-e',
        'const C=require(' + JSON.stringify(path.join(JS, 'sccandado.js')) + ');'
        + 'C.abrir(' + JSON.stringify(path.join(carpeta, 'launcher-eeee000000000005.lock')) + ');console.log("listo");setTimeout(()=>{},120000)'],
    { env: envNode, stdio: ['ignore', 'pipe', 'ignore'] })
    await new Promise((r, falla) => {
        otro.stdout.once('data', r)
        otro.once('error', falla)
        otro.once('exit', () => falla(new Error('el otro launcher de prueba terminó antes de tiempo')))
        setTimeout(() => falla(new Error('el otro launcher de prueba no contestó')), 10000).unref()
    })
    const resultado = path.join(carpeta, 'resultado-' + b.runId + '.json')
    const copia = fs.readFileSync(resultado)
    const ajena = resultado + '.procesando-' + otro.pid + '-eeee000000000005'
    fs.renameSync(resultado, ajena)
    caso('reclamación de otro launcher vivo: no se toca', ScVigilante.reclamarResultados(instancias).length === 0 && fs.existsSync(ajena))
    process.kill(otro.pid)
    await hasta(() => ScCandado.ocupado(path.join(carpeta, 'launcher-eeee000000000005.lock')) === false)
    const recuperados = ScVigilante.reclamarResultados(instancias)
    caso('reclamación de un launcher muerto: se recupera', recuperados.length === 1 && recuperados[0].runId === b.runId)
    ScVigilante.terminarResultado(instancias, b.runId)
    caso('terminar el resultado borra la reclamación propia', !fs.readdirSync(carpeta).some(f => /procesando/.test(f)))
    // Un launcher muerto cuyo PID es ahora el NUESTRO: su reclamación no es nuestra, se recupera.
    fs.rmSync(path.join(carpeta, 'hecho-' + b.runId), { force: true })
    fs.writeFileSync(resultado + '.procesando-' + process.pid + '-abab00000000000a', copia)
    const reciclada = ScVigilante.reclamarResultados(instancias)
    caso('reclamación de un muerto con nuestro mismo PID: se recupera', reciclada.length === 1 && reciclada[0].runId === b.runId)

    // 7. Ningún programa externo de Windows en el código que se empaqueta.
    const prohibido = /powershell|tasklist|taskkill|wmic|Win32_Process|Get-CimInstance/i
    const sucios = []
    const mirar = (dir) => {
        for(const f of fs.readdirSync(dir, { withFileTypes: true })){
            const r = path.join(dir, f.name)
            if(f.isDirectory()){
                mirar(r)
            } else if(/\.js$/.test(f.name)){
                // Los comentarios que cuentan por qué se quitó no cuentan.
                const codigo = fs.readFileSync(r, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
                if(prohibido.test(codigo)){
                    sucios.push(path.relative(path.join(__dirname, '..'), r))
                }
            }
        }
    }
    mirar(JS)
    // index.js de la misma raíz que los módulos probados (el repo, o el app.asar con SC_PRUEBA_JS).
    const index = fs.readFileSync(path.join(JS, '..', '..', '..', 'index.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if(prohibido.test(index)){
        sucios.push('index.js')
    }
    caso('ni PowerShell, ni tasklist, ni taskkill, ni WMI en el código', sucios.length === 0, sucios.join(', '))

    console.log(fallos === 0 ? 'CANDADOS OK (' + casos + ' casos)' : fallos + ' FALLO(S) de ' + casos)
    process.exit(fallos === 0 ? 0 : 1)
})().catch(e => {
    console.error('La prueba se rompió: ' + (e && e.stack || e))
    process.exit(1)
})
