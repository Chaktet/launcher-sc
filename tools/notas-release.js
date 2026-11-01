// Los launchers 1.16.16-1.16.18 rechazan toda actualización (publisherName roto, ver docs/DISTRIBUCION.md) y su botón
// «Descargar el launcher desde la web» abre SIEMPRE la release más reciente de GitHub. Esa página es lo único que se
// puede cambiar para ellos, así que cada release lleva arriba el aviso de tools/aviso-launcher-viejo.md.
//
// Uso: node tools/notas-release.js [vX.Y.Z] [--aplica]
//   Sin versión: la release más reciente. Sin --aplica solo comprueba y sale con 1 si falta o está anticuado.
//   Se puede repetir: con --aplica deja un solo aviso, el actual, y no toca el resto de las notas.
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const REPO = 'Chaktet/launcher-sc'
const INICIO = '<!-- sc-aviso-launcher-viejo -->'
const FIN = '<!-- /sc-aviso-launcher-viejo -->'

const aplica = process.argv.includes('--aplica')
const tag = process.argv.slice(2).find(a => !a.startsWith('--'))
const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input })

const aviso = fs.readFileSync(path.join(__dirname, 'aviso-launcher-viejo.md'), 'utf8').replace(/\r\n/g, '\n').trim()
const bloque = `${INICIO}\n${aviso}\n${FIN}`
const release = JSON.parse(gh(['release', 'view', ...(tag ? [tag] : []), '-R', REPO, '--json', 'tagName,body']))
// GitHub puede devolver las notas con CRLF.
const notas = release.body.replace(/\r\n/g, '\n')

if (notas.startsWith(bloque)) {
    console.log(`✓ ${release.tagName}: aviso presente y al día`)
    process.exit(0)
}
if (!aplica) {
    console.error(`✗ ${release.tagName}: falta el aviso o está anticuado (node tools/notas-release.js ${release.tagName} --aplica)`)
    process.exit(1)
}
const i = notas.indexOf(INICIO)
const j = notas.indexOf(FIN)
const resto = (i >= 0 && j > i ? notas.slice(0, i) + notas.slice(j + FIN.length) : notas).trim()
gh(['release', 'edit', release.tagName, '-R', REPO, '--notes-file', '-'], `${bloque}\n\n${resto}\n`)
console.log(`✓ ${release.tagName}: aviso puesto`)
