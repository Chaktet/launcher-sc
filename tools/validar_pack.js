// Valida el paquete de recursos antes de mandarselo a 43.000 personas.
//
//   node tools/validar_pack.js <carpeta-del-pack-descomprimido>
//
// Comprueba lo que ya nos rompio un pack antes:
//  1. Texturas mas anchas que el tope de las GPU flojas (SCCosmetics 9216px)
//  2. JSON invalidos
//  3. Ficheros de fuente que apunten a texturas que no existen: si UNA falta,
//     Minecraft aborta la recarga ENTERA y el pack no se aplica
//  4. Modelos de Cobblemon con UV por cara, que su lector no sabe leer
//  5. Resolvers que piden un modelo o un poser que no existe
//
// Los dos ultimos terminan en NullPointerException dentro de Cobblemon, y ahi
// Minecraft DESACTIVA TODOS los paquetes del jugador y los borra de options.txt:
// se queda sin texturas y no vuelven solas. Paso el 2026-09-16 con la 3.2.17
// (shedinja_Mahoraga y otros dos del evento de septiembre).
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const iMod = args.indexOf('--mod')
const JAR = iMod >= 0 ? args[iMod + 1] : null
const RAIZ = args.filter((a, i) => !a.startsWith('--') && (iMod < 0 || i !== iMod + 1))[0]
if(!RAIZ){
    console.error('uso: node validar_pack.js <carpeta-del-pack> [--mod <Cobblemon-fabric-*.jar>]')
    process.exit(2)
}
const TOPE_SEGURO = 4096   // lo que aguanta cualquier GPU de las que juegan aqui
const TOPE_AVISO = 2048

const pngs = []
const jsons = []
const todos = new Set()

function recorrer(d){
    for(const e of fs.readdirSync(d, { withFileTypes: true })){
        const p = path.join(d, e.name)
        if(e.isDirectory()){ recorrer(p); continue }
        const rel = path.relative(RAIZ, p).replace(/\\/g, '/')
        todos.add(rel)
        if(/\.png$/i.test(e.name)) pngs.push({ p, rel })
        else if(/\.json$/i.test(e.name)) jsons.push({ p, rel })
    }
}
recorrer(RAIZ)

console.log(`ficheros: ${todos.size}  |  png: ${pngs.length}  |  json: ${jsons.length}`)

// --- 1. dimensiones ---
const grandes = []
for(const { p, rel } of pngs){
    let fd
    try {
        fd = fs.openSync(p, 'r')
        const b = Buffer.alloc(24)
        fs.readSync(fd, b, 0, 24, 0)
        if(b.readUInt32BE(0) !== 0x89504E47){ continue }
        const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
        if(w > TOPE_AVISO || h > TOPE_AVISO) grandes.push({ rel, w, h })
    } catch(_e){ /* nada */ }
    finally { if(fd !== undefined) fs.closeSync(fd) }
}
grandes.sort((a, b) => (b.w * b.h) - (a.w * a.h))
console.log(`\n=== texturas mayores de ${TOPE_AVISO}px (${grandes.length}) ===`)
if(!grandes.length) console.log('   ninguna')
grandes.slice(0, 15).forEach(g => {
    const riesgo = (g.w > TOPE_SEGURO || g.h > TOPE_SEGURO) ? '  <-- RIESGO' : ''
    console.log(`   ${String(g.w).padStart(5)} x ${String(g.h).padEnd(5)} ${g.rel}${riesgo}`)
})
const peligrosas = grandes.filter(g => g.w > TOPE_SEGURO || g.h > TOPE_SEGURO)

// --- 2. JSON invalidos ---
const RE_GEO = /bedrock\/pokemon\/models\/.+\.geo\.json$/
const RE_RESOLVER = /bedrock\/pokemon\/resolvers\/.+\.json$/
const RE_POSER = /bedrock\/pokemon\/posers\/.+\.json$/
// Se guarda lo que hace falta en las comprobaciones 4 y 5 para no volver a
// parsear 25.000 ficheros.
const datos = new Map()
const rotos = []
for(const { p, rel } of jsons){
    try {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'))
        if(RE_GEO.test(rel) || RE_RESOLVER.test(rel)) datos.set(rel, j)
    }
    catch(e){ rotos.push({ rel, err: e.message.slice(0, 70) }) }
}
console.log(`\n=== JSON invalidos (${rotos.length}) ===`)
rotos.slice(0, 10).forEach(r => console.log(`   ${r.rel}\n      ${r.err}`))
if(!rotos.length) console.log('   ninguno')

// --- 3. fuentes con texturas que faltan ---
//
// OJO con los falsos positivos: el pack SOLO tiene que traer lo que sobrescribe.
// Todo lo del namespace `minecraft` que no venga en el zip lo pone el juego desde
// su propio jar — `font/ascii.png` es el caso tipico, referenciado 39 veces por
// nuestro default.json y presente en 1.21.1.jar, no en el pack. Marcarlo como
// "falta" hacia que el validador diera NO APTO siempre y dejara de servir de nada.
// Por eso aqui solo se reclama lo de namespaces propios/de mods.
function resolver(id, tipo){
    const [ns, ruta] = id.includes(':') ? id.split(':') : ['minecraft', id]
    const ext = tipo === 'tex' ? '.png' : ''
    return { ns, rel: `assets/${ns}/textures/${ruta}${ruta.endsWith('.png') ? '' : ext}` }
}
const faltan = []
const deVanilla = []
for(const { p, rel } of jsons){
    if(!/\/font\/[^/]+\.json$/.test(rel)) continue
    let j
    try { j = JSON.parse(fs.readFileSync(p, 'utf8')) } catch(_e){ continue }
    for(const prov of (j.providers || [])){
        if(!prov.file) continue
        const { ns, rel: destino } = resolver(prov.file, 'tex')
        if(todos.has(destino)) continue
        if(ns === 'minecraft') deVanilla.push({ fuente: rel, falta: destino })
        else faltan.push({ fuente: rel, falta: destino })
    }
}
console.log(`\n=== texturas de fuente que faltan (${faltan.length}) ===`)
if(!faltan.length) console.log('   ninguna  (si faltara alguna, el pack no cargaria)')
faltan.slice(0, 15).forEach(f => console.log(`   ${f.fuente}\n      -> falta ${f.falta}`))
if(deVanilla.length){
    console.log(`   (${deVanilla.length} referencias a texturas 'minecraft:' que las pone el juego, no el pack — ignoradas)`)
}

// --- 4. modelos de Cobblemon con UV por cara ---
//
// cubes[].uv tiene que ser un array [u, v]. Si es un objeto (UV por cara, lo que
// sale de Blockbench cuando el artista estira cada cara a mano), gson corta con
// "Expected BEGIN_ARRAY but was BEGIN_OBJECT", el modelo NO entra en el
// repositorio de Cobblemon y cualquier resolver que lo pida tumba la recarga.
// No es cosa de la version del formato: de los 1284 modelos que trae el propio
// mod, NINGUNO usa UV por cara.
const uvPorCara = []
for(const [rel, j] of datos){
    if(!RE_GEO.test(rel)) continue
    let cubos = 0
    for(const g of (j['minecraft:geometry'] || [])){
        for(const b of (g.bones || [])){
            for(const c of (b.cubes || [])){
                if(c.uv !== undefined && !Array.isArray(c.uv)) cubos++
            }
        }
    }
    if(cubos) uvPorCara.push({ rel, cubos })
}
console.log(`\n=== modelos con UV por cara, Cobblemon no los lee (${uvPorCara.length}) ===`)
if(!uvPorCara.length) console.log('   ninguno')
uvPorCara.slice(0, 15).forEach(m => console.log(`   ${m.rel}  (${m.cubos} cubo(s))`))

// --- 5. resolvers que piden modelos o posers que no existen ---
//
// El resolver pide el modelo por el NOMBRE DEL FICHERO, no por el identifier de
// dentro. Lo que el pack no trae puede venir del jar de Cobblemon (todas las
// especies base), asi que sin su lista de ficheros esto cantaria cientos de
// falsos positivos: el jar se pasa con --mod y, sin el, la comprobacion se salta
// en vez de mentir.
function nombresDelJar(jar){
    // Lee SOLO los nombres del directorio central del zip: no descomprime nada.
    let fd
    try {
        fd = fs.openSync(jar, 'r')
        const tam = fs.fstatSync(fd).size
        const cola = Buffer.alloc(Math.min(66560, tam))
        fs.readSync(fd, cola, 0, cola.length, tam - cola.length)
        let fin = -1
        for(let i = cola.length - 22; i >= 0; i--){
            if(cola.readUInt32LE(i) === 0x06054b50){ fin = i; break }
        }
        if(fin < 0) return null
        let total = cola.readUInt16LE(fin + 10)
        let tamCD = cola.readUInt32LE(fin + 12)
        let offCD = cola.readUInt32LE(fin + 16)
        if(total === 0xffff || offCD === 0xffffffff){
            for(let i = fin - 20; i >= 0; i--){
                if(cola.readUInt32LE(i) === 0x07064b50){
                    const cab = Buffer.alloc(56)
                    fs.readSync(fd, cab, 0, 56, Number(cola.readBigUInt64LE(i + 8)))
                    total = Number(cab.readBigUInt64LE(32))
                    tamCD = Number(cab.readBigUInt64LE(40))
                    offCD = Number(cab.readBigUInt64LE(48))
                    break
                }
            }
        }
        const cd = Buffer.alloc(tamCD)
        fs.readSync(fd, cd, 0, tamCD, offCD)
        const out = new Set()
        let o = 0
        for(let n = 0; n < total && o + 46 <= cd.length; n++){
            if(cd.readUInt32LE(o) !== 0x02014b50) break
            const ln = cd.readUInt16LE(o + 28), le = cd.readUInt16LE(o + 30), lc = cd.readUInt16LE(o + 32)
            out.add(cd.toString('utf8', o + 46, o + 46 + ln))
            o += 46 + ln + le + lc
        }
        return out
    } catch(e){
        console.log(`   (no se pudo leer el jar: ${e.message})`)
        return null
    } finally { if(fd !== undefined) fs.closeSync(fd) }
}

const disponibles = { modelos: new Set(), posers: new Set(), clases: new Set() }
const apuntar = nombre => {
    if(RE_GEO.test(nombre)) disponibles.modelos.add(path.basename(nombre, '.geo.json'))
    else if(RE_POSER.test(nombre)) disponibles.posers.add(path.basename(nombre, '.json'))
    else if(nombre.endsWith('.class')) disponibles.clases.add(path.basename(nombre, '.class').toLowerCase())
}
todos.forEach(apuntar)
const jarNombres = JAR ? nombresDelJar(JAR) : null
if(jarNombres) jarNombres.forEach(apuntar)

const nombreBase = id => String(id).split(':').pop().split('/').pop().replace(/\.geo$/, '')
// Cobblemon tambien trae modelos y poses ESCRITOS EN CODIGO, sin JSON: el nombre
// zoroark_hisuian es la clase ZoroarkHisuianModel. Sin esto, 113 nombres
// legitimos saldrian como ausentes y el validador volveria a no servir de nada.
const hayClase = n => disponibles.clases.has(n.replace(/_/g, '') + 'model')
const sinModelo = []
const sinPoser = []
if(jarNombres){
    for(const [rel, j] of datos){
        if(!RE_RESOLVER.test(rel)) continue
        for(const v of (j.variations || [])){
            const m = v.model ? nombreBase(v.model) : null
            const p = v.poser ? nombreBase(v.poser) : null
            if(m && !disponibles.modelos.has(m) && !hayClase(m)) sinModelo.push(`${rel} -> ${v.model}`)
            if(p && !disponibles.posers.has(p) && !hayClase(p)) sinPoser.push(`${rel} -> ${v.poser}`)
        }
    }
}
console.log('\n=== resolvers que piden algo que no existe ===')
if(!JAR){
    console.log('   (hace falta --mod <jar de Cobblemon>: sin el no se comprueba)')
} else if(!jarNombres){
    console.log('   (no se pudo leer el jar: sin comprobar)')
} else if(!sinModelo.length && !sinPoser.length){
    console.log('   nada: todo lo que piden existe, en el pack o en el mod')
} else {
    console.log(`   modelos que faltan: ${sinModelo.length}  |  posers que faltan: ${sinPoser.length}`)
    sinModelo.slice(0, 10).forEach(x => console.log(`   modelo  ${x}`))
    sinPoser.slice(0, 10).forEach(x => console.log(`   poser   ${x}`))
    if(sinPoser.length){
        console.log('   (los posers solo se avisan: cobblemon:substitute lleva semanas')
        console.log('    referenciado por el pack sin romper nada, asi que no bloquea)')
    }
}

console.log('\n================ VEREDICTO ================')
const problemas = []
if(peligrosas.length) problemas.push(`${peligrosas.length} textura(s) por encima de ${TOPE_SEGURO}px`)
if(rotos.length) problemas.push(`${rotos.length} JSON invalido(s)`)
if(faltan.length) problemas.push(`${faltan.length} textura(s) de fuente ausente(s)`)
if(uvPorCara.length) problemas.push(`${uvPorCara.length} modelo(s) con UV por cara`)
if(sinModelo.length) problemas.push(`${sinModelo.length} resolver(s) que piden un modelo que no existe`)
if(!JAR) console.log('AVISO: sin --mod no se han comprobado las referencias de los resolvers')
console.log(problemas.length ? 'NO APTO: ' + problemas.join(' | ') : 'APTO para publicar')
process.exit(problemas.length ? 1 : 0)
