// Busca PNG que superen el tope de las GPU flojas.
// Lee solo la cabecera IHDR (24 bytes), no descomprime nada.
const fs = require('fs')
const path = require('path')

const RAIZ = process.argv[2]
const TOPE = parseInt(process.argv[3] || '4096', 10)

const malas = []
let n = 0

function rec(d){
    for(const e of fs.readdirSync(d, { withFileTypes: true })){
        const p = path.join(d, e.name)
        if(e.isDirectory()){ rec(p); continue }
        if(!/\.png$/i.test(e.name)) continue
        n++
        let fd
        try {
            fd = fs.openSync(p, 'r')
            const b = Buffer.alloc(24)
            fs.readSync(fd, b, 0, 24, 0)
            if(b.readUInt32BE(0) !== 0x89504E47) continue
            const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
            if(w > TOPE || h > TOPE){
                const rel = path.relative(RAIZ, p).split(path.sep).join('/')
                const mcmeta = fs.existsSync(p + '.mcmeta')
                malas.push({ rel, w, h, mcmeta, frames: (h % w === 0) ? h / w : null })
            }
        } catch(_err){ /* nada */ }
        finally { if(fd !== undefined) fs.closeSync(fd) }
    }
}
rec(RAIZ)

console.log(`  PNG analizados: ${n}`)
console.log(`  por encima de ${TOPE}px: ${malas.length}`)
malas.forEach(m => {
    const extra = m.frames ? `  ${m.frames} fotogramas de ${m.w}px` : '  (no divisible en fotogramas)'
    console.log(`    ${m.w} x ${m.h}${m.mcmeta ? ' [animada]' : ''}${extra}`)
    console.log(`      ${m.rel}`)
})
