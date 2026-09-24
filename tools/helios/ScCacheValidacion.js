// Caché de validación de ficheros para helios-core (SC Launcher 1.7.0).
//
// Por qué: en cada arranque helios-core recalculaba el MD5/SHA1 de ~1,43 GB (mods,
// librerías, assets de Mojang) uno detrás de otro. Medido el 24-09-2026: 20 s en frío
// en un i9 y entre 29 y 72 s en los PC de los jugadores, aunque no hubiera cambiado
// nada desde la partida anterior.
//
// Qué hace: tras un hash completo correcto se guarda, por fichero, {tamaño, mtime,
// algoritmo, hash esperado}. En el siguiente arranque, si el fichero tiene el mismo
// tamaño y la misma fecha de modificación Y la distribución sigue esperando el mismo
// hash, se da por bueno sin leerlo. Cualquier otra cosa (sin entrada, tamaño o fecha
// distintos, hash esperado nuevo porque cambió la distribución) = hash completo.
//
// Cuándo NO se usa:
//   - si el launcher no pasa SC_CACHE_VALIDACION (ruta del JSON): comportamiento upstream;
//   - si pasa SC_VALIDACION_COMPLETA=1: se hashea todo, y el resultado se guarda.
// El launcher borra el JSON tras un fallo del juego o una reparación (landing.js), así
// que el siguiente arranque vuelve a comprobarlo todo de verdad.
//
// Este fichero lo copia tools/parche-helios.js a node_modules/helios-core/dist/common/util
// en cada npm install. La fuente es esta; no editar la copia.
'use strict'
const fs = require('fs')
const crypto = require('crypto')
const pathMod = require('path')

const VERSION_FORMATO = 1
// Entradas que no se tocan en este tiempo se tiran al guardar (versiones viejas de
// mods, un perfil que el jugador ya no usa). Sin esto el JSON solo crecería.
const CADUCIDAD_MS = 30 * 24 * 3600 * 1000

let entradas = null
let sucio = false
const stats = { aciertos: 0, hasheados: 0, fallidos: 0 }

function rutaCache(){
    const r = process.env.SC_CACHE_VALIDACION
    return r && r.length > 0 ? r : null
}

function completa(){
    return process.env.SC_VALIDACION_COMPLETA === '1'
}

function cargar(){
    if(entradas != null){
        return entradas
    }
    entradas = new Map()
    const r = rutaCache()
    if(r == null){
        return entradas
    }
    try {
        const d = JSON.parse(fs.readFileSync(r, 'utf8'))
        if(d && d.v === VERSION_FORMATO && d.f && typeof d.f === 'object'){
            for(const [k, e] of Object.entries(d.f)){
                entradas.set(k, e)
            }
        }
    } catch(_e){
        // Sin caché o ilegible: se valida todo, que es lo seguro.
    }
    return entradas
}

function clave(ruta){
    // Windows no distingue mayúsculas en rutas; normalizar evita fallos tontos de caché.
    const abs = pathMod.resolve(ruta)
    return process.platform === 'win32' ? abs.toLowerCase() : abs
}

function hashFichero(ruta, algo){
    return new Promise((resolve, reject) => {
        const h = crypto.createHash(algo)
        const s = fs.createReadStream(ruta)
        s.on('error', reject)
        s.on('data', c => h.update(c))
        s.on('end', () => resolve(h.digest('hex')))
    })
}

/**
 * Sustituto de FileUtils.validateLocalFile con caché.
 * Misma semántica que el original: false si no existe o no cuadra, true si cuadra,
 * true si existe y no hay hash esperado (ficheros "sin seguimiento").
 */
async function validar(ruta, algo, hash, original){
    const r = rutaCache()
    if(r == null || hash == null){
        return original(ruta, algo, hash)
    }
    let st
    try {
        st = await fs.promises.stat(ruta)
    } catch(_e){
        return false
    }
    if(!st.isFile()){
        return false
    }
    const mapa = cargar()
    const k = clave(ruta)
    const e = mapa.get(k)
    if(!completa() && e != null
        && e.s === st.size && e.m === st.mtimeMs && e.a === algo && e.h === hash){
        stats.aciertos++
        // Se refresca el "último uso" como mucho una vez al día para no reescribir
        // el JSON en cada arranque por nada.
        const hoy = Math.floor(Date.now() / 86400000)
        if(e.t !== hoy){
            e.t = hoy
            sucio = true
        }
        return true
    }
    let calculado
    try {
        calculado = await hashFichero(ruta, algo)
    } catch(_e){
        return false
    }
    stats.hasheados++
    if(calculado === hash){
        // Si el fichero cambió mientras se leía, no se guarda: la próxima vez se repite.
        try {
            const st2 = await fs.promises.stat(ruta)
            if(st2.size === st.size && st2.mtimeMs === st.mtimeMs){
                mapa.set(k, { s: st.size, m: st.mtimeMs, a: algo, h: hash, t: Math.floor(Date.now() / 86400000) })
                sucio = true
            }
        } catch(_e){ /* se validará la próxima vez */ }
        return true
    }
    stats.fallidos++
    if(mapa.delete(k)){
        sucio = true
    }
    return false
}

/** Escribe el JSON (atómico: temporal + rename). Nunca lanza. */
async function guardar(){
    const r = rutaCache()
    if(r == null || !sucio || entradas == null){
        return
    }
    const limite = Math.floor((Date.now() - CADUCIDAD_MS) / 86400000)
    const f = {}
    for(const [k, e] of entradas){
        if((e.t || 0) >= limite){
            f[k] = e
        }
    }
    const tmp = r + '.tmp'
    try {
        await fs.promises.mkdir(pathMod.dirname(r), { recursive: true })
        await fs.promises.writeFile(tmp, JSON.stringify({ v: VERSION_FORMATO, f }))
        await fs.promises.rename(tmp, r)
        sucio = false
    } catch(_e){
        try { await fs.promises.unlink(tmp) } catch(_e2){ /* nada */ }
    }
}

/**
 * Como Promise.all(items.map(fn)) pero con N a la vez (SC_HASH_PARALELOS, 6 por
 * defecto). Hashear en serie dejaba el disco y la CPU a medias; todos a la vez
 * ahogaría un disco mecánico. Conserva el orden de los resultados.
 */
async function mapaConcurrente(items, fn){
    const n = Math.max(1, Math.min(32, parseInt(process.env.SC_HASH_PARALELOS, 10) || 6))
    const res = new Array(items.length)
    let i = 0
    const trabajador = async () => {
        while(i < items.length){
            const j = i++
            res[j] = await fn(items[j], j)
        }
    }
    const hilos = []
    for(let t = 0; t < Math.min(n, items.length); t++){
        hilos.push(trabajador())
    }
    await Promise.all(hilos)
    return res
}

function resumen(){
    return `caché de validación: ${stats.aciertos} sin releer, ${stats.hasheados} hasheados, ${stats.fallidos} no válidos`
}

module.exports = { validar, guardar, mapaConcurrente, resumen, _stats: stats }
