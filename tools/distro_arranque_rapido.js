// Ajustes de "arranque rápido" (1.7.0) sobre un distribution.json, sin regenerar con Nebula.
//
// Uso:
//   node tools/distro_arranque_rapido.js <distribution.json>            -> solo enseña qué cambiaría
//   node tools/distro_arranque_rapido.js <distribution.json> --aplicar  -> copia .bak-<fecha> y escribe
//
// Qué hace (idempotente; en los dos perfiles, PRO y LITE):
//   1. Quita el MD5 de servers.dat. Minecraft lo reescribe en cada partida, así que el
//      hash no cuadraba NUNCA y el launcher lo volvía a descargar en cada arranque. Sin
//      MD5 helios-core solo comprueba que exista: se instala la primera vez y ya.
//   2. Quita el MD5 de config/sodium-options.json (solo LITE lo lleva) por lo mismo: Sodium
//      lo reescribe al cerrar. Consecuencia asumida: si un jugador de LITE cambia esos
//      ajustes, ya no se le reimponen en cada arranque.
//   3. Quita el módulo del pack del servidor pre-sembrado en downloads/ce0f53b6-.../
//      (132,6 MB): el servidor ya no manda pack y sc-lockserver lo rechaza, así que solo
//      servía para que una instalación nueva descargara 132 MB de más.
//
// Es lo mismo que produce Nebula con los servermeta.json nuevos (servers.dat y
// config/sodium-options.json en untrackedFiles, y files/downloads/ retirado), pero sin
// regenerar: la distro publicada lleva retoques a mano (el ?v= del pack) que Nebula borra.
// Sirve para la copia local de sc-distribution y para el distribution.json del VPS.
'use strict'
const fs = require('fs')

const SIN_HASH = ['servers.dat', 'config/sodium-options.json']
const PRESEMBRADO = 'downloads/ce0f53b6-1e61-3bde-976e-6a11df44e5f5/'

const ruta = process.argv[2]
const aplicar = process.argv.includes('--aplicar')
if(!ruta){
    console.error('Uso: node tools/distro_arranque_rapido.js <distribution.json> [--aplicar]')
    process.exit(2)
}
const original = fs.readFileSync(ruta, 'utf8')
const d = JSON.parse(original)
const cambios = []

function rutaModulo(m){
    return (m.artifact && m.artifact.path ? m.artifact.path : '').replace(/\\/g, '/')
}

function recorrer(servidor, modulos){
    const quedan = []
    for(const m of modulos){
        const p = rutaModulo(m)
        if(m.type === 'File' && p.startsWith(PRESEMBRADO)){
            cambios.push(`${servidor}: fuera el módulo ${p} (${m.artifact.size} bytes)`)
            continue
        }
        if(m.type === 'File' && SIN_HASH.includes(p) && m.artifact.MD5 != null){
            cambios.push(`${servidor}: sin MD5 ${p} (era ${m.artifact.MD5})`)
            delete m.artifact.MD5
        }
        if(Array.isArray(m.subModules)){
            m.subModules = recorrer(servidor, m.subModules)
        }
        quedan.push(m)
    }
    return quedan
}

for(const s of d.servers){
    s.modules = recorrer(s.id, s.modules)
}

if(cambios.length === 0){
    console.log('Nada que cambiar: ya estaba aplicado.')
    process.exit(0)
}
cambios.forEach(c => console.log(' - ' + c))
if(!aplicar){
    console.log('\n(simulación; añade --aplicar para escribir)')
    process.exit(0)
}
const marca = new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '')
fs.writeFileSync(`${ruta}.bak-${marca}`, original)
// Mismo formato que el original (Nebula escribe con 2 espacios).
const sangria = /^\{\r?\n( +)/.exec(original)
fs.writeFileSync(ruta, JSON.stringify(d, null, sangria ? sangria[1].length : 2) + (original.endsWith('\n') ? '\n' : ''))
console.log(`\nEscrito ${ruta} (copia en ${ruta}.bak-${marca})`)
