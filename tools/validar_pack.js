// Valida el paquete de recursos antes de mandarselo a 43.000 personas.
//
//   node tools/validar_pack.js <carpeta-del-pack-descomprimido>
//
// Comprueba lo que ya nos rompio un pack antes:
//  1. Texturas mas anchas que el tope de las GPU flojas (SCCosmetics 9216px)
//  2. JSON invalidos
//  3. Ficheros de fuente que apunten a texturas que no existen: si UNA falta,
//     Minecraft aborta la recarga ENTERA y el pack no se aplica
const fs = require('fs')
const path = require('path')

const RAIZ = process.argv[2]
if(!RAIZ){
    console.error('uso: node validar_pack.js <carpeta-del-pack>')
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
const rotos = []
for(const { p, rel } of jsons){
    try { JSON.parse(fs.readFileSync(p, 'utf8')) }
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

console.log('\n================ VEREDICTO ================')
const problemas = []
if(peligrosas.length) problemas.push(`${peligrosas.length} textura(s) por encima de ${TOPE_SEGURO}px`)
if(rotos.length) problemas.push(`${rotos.length} JSON invalido(s)`)
if(faltan.length) problemas.push(`${faltan.length} textura(s) de fuente ausente(s)`)
console.log(problemas.length ? 'NO APTO: ' + problemas.join(' | ') : 'APTO para publicar')
process.exit(problemas.length ? 1 : 0)
