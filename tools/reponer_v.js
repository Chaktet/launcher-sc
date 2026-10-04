// Restores the "?v=" cache-busting queries that Nebula drops on every "generate distro".
//
// Some artifacts keep a fixed name and change content (SC-Pack.zip) or were re-uploaded under the same
// name (Cobblemon); their url carries "?v=<version>" so Cloudflare does not serve a stale copy (see
// docs/DISTRIBUCION.md). This copies the query from the published distribution.json onto every module of
// the new one whose url (without query) AND MD5 are the same. If the MD5 changed, the old query would be
// wrong, so the module is listed instead and nothing is written for it.
//
// Usage: node tools/reponer_v.js <published.json> <new.json> [--aplicar]
const fs = require('fs')

const [publicado, nuevo, aplicar] = process.argv.slice(2)
if(!publicado || !nuevo){
    console.error('uso: node tools/reponer_v.js <publicado.json> <nuevo.json> [--aplicar]')
    process.exit(1)
}

const antes = new Map()
const leer = (m) => {
    if(m.artifact && typeof m.artifact.url === 'string' && m.artifact.url.includes('?')){
        antes.set(m.artifact.url.split('?')[0], { url: m.artifact.url, md5: m.artifact.MD5 })
    }
    ;(m.subModules || []).forEach(leer)
}
for(const s of JSON.parse(fs.readFileSync(publicado, 'utf8')).servers){
    (s.modules || []).forEach(leer)
}

const d = JSON.parse(fs.readFileSync(nuevo, 'utf8'))
let repuestos = 0, conflictos = 0
const poner = (m) => {
    if(m.artifact && typeof m.artifact.url === 'string'){
        const previo = antes.get(m.artifact.url.split('?')[0])
        if(previo && m.artifact.url !== previo.url){
            if(previo.md5 === m.artifact.MD5){
                m.artifact.url = previo.url
                repuestos++
                console.log('  repuesto ' + previo.url)
            } else {
                conflictos++
                console.log('  ⚠ MD5 distinto, poner una versión nueva a mano: ' + m.artifact.url)
            }
        }
    }
    ;(m.subModules || []).forEach(poner)
}
for(const s of d.servers){
    (s.modules || []).forEach(poner)
}

console.log(`${repuestos} repuestos, ${conflictos} con MD5 distinto`)
if(aplicar === '--aplicar'){
    fs.writeFileSync(nuevo, JSON.stringify(d, null, 2))
    console.log('escrito ' + nuevo)
}
