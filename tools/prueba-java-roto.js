/**
 * Pruebas de scjava.js (SC-10, 1.17.11): clasificador de la salida del juego, ficheros
 * esenciales de Java, vetos y elección (el nuestro primero). Sin Electron ni red.
 *
 *   node tools/prueba-java-roto.js [carpeta-temporal]
 *
 * La carpeta temporal por defecto es E:/tmp/prueba-java-roto (nunca en C:).
 */
const fs = require('fs')
const path = require('path')
const ScJava = require('../app/assets/js/scjava')

const base = process.argv[2] || 'E:/tmp/prueba-java-roto'
let fallos = 0
const ok = (cond, nombre) => {
    console.log(`${cond ? 'OK   ' : 'FALLA'} ${nombre}`)
    if(!cond) fallos++
}

// --- Clasificador -------------------------------------------------------------------
const casos = [
    ['Exception in thread "main" java.lang.InternalError: java.io.FileNotFoundException: C:\\Users\\x\\AppData\\Roaming\\.sclauncher\\runtime\\x64\\jdk-21.0.5+11-jre\\lib\\tzdb.dat (El sistema no puede encontrar el archivo especificado)', 'tzdb'],
    ['Error occurred during initialization of VM\njava/lang/NoClassDefFoundError: java/lang/Object', 'clasebase'],
    ['Error: could not open `C:\\x\\runtime\\x64\\jdk-21\\lib\\jvm.cfg\'', 'jvmcfg'],
    ['Error: missing `server\' JVM at `C:\\x\\bin\\server\\jvm.dll\'.', 'jvm'],
    ['java.io.FileNotFoundException: C:\\data\\runtime\\x64\\jdk-21\\lib\\security\\cacerts', 'fichero'],
    ['Error occurred during initialization of VM\nUnable to load native library', 'iniciovm'],
    // Falsos positivos de antes (deben dar null):
    ['Error occurred during initialization of VM\nCould not reserve enough space for 8388608KB object heap', null],
    ['Error occurred during initialization of VM\nToo small maximum heap', null],
    ['java.lang.ExceptionInInitializerError\n\tat com.mod.Foo.<clinit>\nCaused by: java.lang.RuntimeException: bad config', null],
    ['java.io.FileNotFoundException: config/somemod-runtime.json (No such file)', null],
    ['#  Problematic frame:\n# V  [jvm.dll+0x3e1c2a]\n# An error report file with more information is saved', null]
]
for(const [txt, esperado] of casos){
    ok(ScJava.motivoJavaRoto(txt) === esperado, `motivoJavaRoto → ${esperado} : ${txt.split('\n')[0].slice(0, 70)}`)
}
ok(ScJava.esFalloDeMemoriaAlArrancar('Error occurred during initialization of VM\nCould not reserve enough space for 4194304KB object heap'), 'reserva de heap = memoria')
ok(!ScJava.esFalloDeMemoriaAlArrancar('tzdb.dat'), 'tzdb no es memoria')

// --- Ficheros esenciales, vetos y elección -------------------------------------------
fs.rmSync(base, { recursive: true, force: true })
const dataDir = path.join(base, 'datos')
const dirLauncher = path.join(base, 'launcher')
fs.mkdirSync(dirLauncher, { recursive: true })

const esenciales = ['bin/java.exe', 'bin/javaw.exe', 'bin/java.dll', 'bin/server/jvm.dll', 'lib/modules', 'lib/tzdb.dat', 'lib/jvm.cfg',
    'bin/java', 'lib/server/libjvm.so', 'lib/server/libjvm.dylib']
const crearJava = (home, sin = []) => {
    for(const rel of esenciales){
        if(sin.includes(rel)) continue
        const p = path.join(home, ...rel.split('/'))
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, 'x')
    }
    return home
}
const exeDe = home => path.join(home, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java')

const propio = crearJava(path.join(dataDir, 'runtime', process.arch, 'jdk-21.0.5+11-jre'))
const sistemaRoto = crearJava(path.join(base, 'ProgramFiles', 'Java', 'jre-21.0.8'), ['lib/tzdb.dat'])
const sistemaBueno = crearJava(path.join(base, 'ProgramFiles', 'Java', 'jre-21.0.9'))

ok(ScJava.faltanEsenciales(exeDe(propio)).length === 0, 'Java completo: no falta nada')
ok(ScJava.faltanEsenciales(exeDe(sistemaRoto)).includes('lib/tzdb.dat'), 'Java sin tzdb.dat: lo detecta')
ok(ScJava.esPropio(exeDe(propio), dataDir) && !ScJava.esPropio(exeDe(sistemaBueno), dataDir), 'esPropio distingue el nuestro')

// Falso JavaGuard: mismo orden y ranking que Helios (versión más alta y JRE primero).
const version = home => parseInt(/21\.0\.(\d+)/.exec(home)[1])
const guard = rutas => ({
    getValidatableJavaPaths: async () => rutas(),
    resolveJvmSettings: async ps => Object.fromEntries(ps.map(p => [p, {}])),
    filterApplicableJavaPaths: aj => Object.keys(aj).map(p => ({ path: p, semver: { major: 21, minor: 0, patch: version(p) } })),
    rankApplicableJvms: d => d.sort((a, b) => b.semver.patch - a.semver.patch),
    javaExecFromRoot: exeDe
})

;(async () => {
    let e = await ScJava.elegir(dataDir, dirLauncher, '>=21 <22', guard(() => [sistemaRoto, sistemaBueno, propio]))
    ok(e && e.path === propio, 'con el nuestro presente se elige el nuestro aunque el del sistema sea más nuevo')

    fs.rmSync(path.join(dataDir, 'runtime'), { recursive: true, force: true })
    e = await ScJava.elegir(dataDir, dirLauncher, '>=21 <22', guard(() => [sistemaRoto, sistemaBueno]))
    ok(e === null, 'sin el nuestro: null (= descargar el nuestro), aunque haya uno del sistema')

    e = await ScJava.elegir(dataDir, dirLauncher, '>=21 <22', guard(() => [sistemaRoto, sistemaBueno]), true)
    ok(e && e.path === sistemaBueno, 'descarga fallida: el del sistema completo, nunca el que no tiene tzdb.dat')

    ScJava.marcarPropioBloqueado(dirLauncher)
    e = await ScJava.elegir(dataDir, dirLauncher, '>=21 <22', guard(() => [sistemaRoto, sistemaBueno]))
    ok(e && e.path === sistemaBueno, 'tras un SC-14 (nuestro bloqueado): vale el del sistema (el .msi)')
    ok(!ScJava.propioBloqueadoReciente(dirLauncher, Date.now() + 25 * 3600 * 1000), 'el bloqueo caduca al día')

    ScJava.vetar(dirLauncher, exeDe(sistemaBueno))
    e = await ScJava.elegir(dataDir, dirLauncher, '>=21 <22', guard(() => [sistemaRoto, sistemaBueno]), true)
    ok(e === null, 'vetado el bueno y roto el otro: null (= descargar el nuestro)')
    ok(fs.existsSync(sistemaBueno), 'vetar no borra el Java del sistema')

    // Reparación: anotar y repetida
    ok(ScJava.reparacionReciente(dirLauncher) === false, 'sin reparaciones: no es repetida')
    ok(ScJava.anotarReparacion(dirLauncher) === false, 'primera reparación: no repetida')
    ok(ScJava.reparacionReciente(dirLauncher) === true, 'tras reparar: la siguiente es repetida')
    ok(ScJava.reparacionReciente(dirLauncher, Date.now() + 3 * 3600 * 1000) === false, 'pasadas 3 h ya no cuenta como repetida')

    // quitarRuntime
    crearJava(path.join(dataDir, 'runtime', process.arch, 'jdk-21'))
    ok(ScJava.quitarRuntime(dataDir) === true && !fs.existsSync(path.join(dataDir, 'runtime')), 'quitarRuntime borra runtime')
    fs.mkdirSync(path.join(dataDir, 'runtime-roto-123'), { recursive: true })
    ScJava.limpiarApartados(dataDir)
    ok(!fs.existsSync(path.join(dataDir, 'runtime-roto-123')), 'limpiarApartados borra runtime-roto-*')

    console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`)
    process.exit(fallos === 0 ? 0 : 1)
})()
