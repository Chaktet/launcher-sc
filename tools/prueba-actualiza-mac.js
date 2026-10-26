/**
 * Prueba de la actualización de Mac (scactualizamac.js) en el runner macOS de CI.
 *
 * Simula una actualización completa con el .zip recién compilado: «descarga» (fetch
 * falso que sirve el .zip local), sha512 contra latest-mac.yml, ditto, y el script que
 * cambia /Applications/SC Launcher.app por el nuevo y lo abre. El .app «viejo» lleva
 * un fichero marca; si sigue ahí, no se cambió.
 *
 * Uso (desde la raíz, tras `electron-builder --mac`): node tools/prueba-actualiza-mac.js
 */
const fs = require('fs')
const path = require('path')
const Module = require('module')
const yaml = require('js-yaml')

const dist = path.join(__dirname, '..', 'dist')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const zip = path.join(dist, `SC-Launcher-mac-${arch}.zip`)
const destino = '/Applications/SC Launcher.app'
const marca = path.join(destino, 'Contents', 'Resources', 'sc-prueba-viejo.txt')

const info = yaml.load(fs.readFileSync(path.join(dist, 'latest-mac.yml'), 'utf8'))
let pedida = null
let cerrado = false

const cargar = Module._load
Module._load = function(peticion, ...resto){
    if(peticion === 'electron'){
        return {
            app: {
                getPath: q => q === 'exe' ? path.join(destino, 'Contents', 'MacOS', 'SC Launcher') : require('os').tmpdir(),
                quit: () => { cerrado = true }
            },
            net: {
                fetch: async url => {
                    pedida = url
                    return new Response(fs.readFileSync(zip), { headers: { 'content-length': String(fs.statSync(zip).size) } })
                }
            }
        }
    }
    return cargar.call(this, peticion, ...resto)
}
const mac = require('../app/assets/js/scactualizamac')

async function main(){
    // El «viejo»: el .app compilado, copiado a Aplicaciones con la marca.
    fs.rmSync(destino, { recursive: true, force: true })
    require('child_process').execFileSync('/usr/bin/ditto', [path.join(dist, arch === 'arm64' ? 'mac-arm64' : 'mac', 'SC Launcher.app'), destino])
    fs.writeFileSync(marca, 'viejo')

    if(!mac.sePuedeInstalar()){
        throw new Error('sePuedeInstalar() = false en /Applications')
    }
    let ultimo = -1
    await mac.descargar(info, p => { ultimo = p.percent })
    const esperada = `https://github.com/Chaktet/launcher-sc/releases/download/v${info.version}/SC-Launcher-mac-${arch}.zip`
    if(pedida !== esperada){
        throw new Error('URL pedida ' + pedida + ', esperada ' + esperada)
    }
    if(ultimo !== 100){
        throw new Error('El progreso acabó en ' + ultimo + ' %')
    }
    if(!mac.instalar() || !cerrado){
        throw new Error('instalar() no cerró el launcher')
    }
    console.log('✓ descarga, sha512 y ditto; script de cambio lanzado')
}

main().catch(err => { console.error('✗', err.message); process.exit(1) })
