// Esquiva la cache de Cloudflare para el resourcepack.
//
// El vhost manda "Cache-Control: public, max-age=31536000, immutable" para los
// .zip. Eso esta bien para los jar, que llevan la version en el nombre, pero NO
// para SC-Pack.zip, que mantiene el nombre a proposito y cambia de contenido:
// Cloudflare se queda la copia vieja un ano entero y no revalida.
//
// Como la ruta EN DISCO la decide artifact.path y la descarga la decide
// artifact.url, se le puede anadir a la url un parametro de version: Cloudflare
// lo mete en la clave de cache (fallo de cache -> pide al origen) y Apache lo
// ignora al servir un fichero estatico. El fichero sigue llamandose SC-Pack.zip
// en la instancia, que es lo que necesita la linea resourcePacks de options.txt.
//
// HAY QUE VOLVER A EJECUTARLO despues de cada "generate distro", subiendo la
// version, mientras el vhost siga marcando los .zip como immutable.
const fs = require('fs')

const VERSION = process.argv[2]
if(!VERSION){
    console.error('uso: node romper_cache_pack.js <version>   (p.ej. 2.1.0)')
    process.exit(1)
}

const RUTA = 'E:/PROYECTOS-MC/sc-distribution/distribution.json'
const d = JSON.parse(fs.readFileSync(RUTA, 'utf8'))

let tocados = 0
const recorrer = (m) => {
    if(m.artifact && typeof m.artifact.url === 'string'
        && /\/SC-Pack\.zip(\?|$)/.test(m.artifact.url)){
        m.artifact.url = m.artifact.url.split('?')[0] + '?v=' + encodeURIComponent(VERSION)
        console.log('  ' + m.artifact.url)
        tocados++
    }
    ;(m.subModules || []).forEach(recorrer)
}
for(const s of d.servers){
    (s.modules || []).forEach(recorrer)
}

if(tocados === 0){
    console.error('no se encontro ningun modulo SC-Pack.zip — nada que hacer')
    process.exit(1)
}

fs.writeFileSync(RUTA, JSON.stringify(d, null, 2) + '\n')
console.log(`\n${tocados} url(s) marcadas con ?v=${VERSION}`)
