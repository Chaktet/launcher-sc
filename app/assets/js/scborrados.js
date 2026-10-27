/**
 * Archivos del juego que desaparecen entre una partida y la siguiente (1.17.9, Felix 27-10).
 *
 * Mucha gente tiene un antivirus que pone en cuarentena mods (.jar) o el propio Java. El
 * launcher ya los vuelve a bajar al pulsar JUGAR, pero el jugador no sabe por qué tarda ni
 * por qué le vuelve a pasar, y nosotros no sabíamos cuántos eran: solo veíamos los fallos
 * que provocaba después (SC-03, SC-10, SC-14, SC-15).
 *
 * Cómo se detecta: cuando una partida carga bien, se anota la «huella» del perfil (cada .jar
 * de la distribución, opcionales incluidos, y el ejecutable de Java, con su tamaño). Al pulsar JUGAR
 * la siguiente vez, lo que estaba en la huella, la distribución sigue pidiendo y ya no está
 * (o pesa 0) lo ha quitado algo de fuera: el launcher nunca borra un fichero que la
 * distribución sigue listando. Solo .jar y Java: son lo que ponen en cuarentena, y así
 * options.txt, packs apagados o capturas no cuentan nunca.
 *
 * La huella vive en <launcher>/sc-huella.json, un objeto por perfil. Solo rutas locales:
 * no sale del equipo.
 */
const fs = require('fs')
const path = require('path')

const { LoggerUtil } = require('helios-core')
const ConfigManager = require('./configmanager')

const logger = LoggerUtil.getLogger('ScBorrados')

const FICHERO = 'sc-huella.json'

// Rutas ya avisadas o borradas por el propio launcher en esta sesión: no cuentan aunque
// no se haya podido reescribir la huella en disco.
const olvidados = new Set()

function rutaHuella(){
    return path.join(ConfigManager.getLauncherDirectory(), FICHERO)
}

function leerTodo(){
    try {
        const d = JSON.parse(fs.readFileSync(rutaHuella(), 'utf8'))
        return d != null && typeof d === 'object' && !Array.isArray(d) ? d : {}
    } catch(_e){
        return {}
    }
}

/**
 * Rutas de los .jar del perfil, con sus submódulos. También los opcionales (36 en PRO): al
 * desactivar uno en Ajustes el launcher no borra el fichero, solo deja de cargarlo, y la
 * huella solo guarda los que estaban en disco.
 */
function jarsDe(serv){
    const rutas = []
    const recorrer = mods => {
        for(const m of mods || []){
            try {
                const p = m.getPath()
                if(typeof p === 'string' && /\.jar$/i.test(p)){
                    rutas.push(p)
                }
            } catch(_e){
                // Un módulo raro no debe tumbar la comprobación entera.
            }
            if(m.subModules != null){
                recorrer(m.subModules)
            }
        }
    }
    recorrer(serv && serv.modules)
    return rutas
}

function tamano(ruta){
    try {
        return fs.statSync(ruta).size
    } catch(_e){
        return -1
    }
}

/**
 * Anota la huella del perfil. Se llama cuando la partida ha cargado: en ese momento todo
 * lo que hay en disco es lo que funcionó.
 *
 * @param {Object} serv Servidor (perfil) de helios-core.
 * @param {string|null} javaExe Ejecutable de Java con el que se lanzó.
 */
exports.guardar = function(serv, javaExe){
    try {
        const id = serv.rawServer.id
        const ficheros = {}
        for(const r of jarsDe(serv)){
            const t = tamano(r)
            if(t > 0){
                ficheros[r] = t
            }
        }
        const java = typeof javaExe === 'string' && tamano(javaExe) > 0 ? javaExe : null
        // Lo que vuelve a estar en disco se vigila otra vez desde esta partida.
        for(const r of Object.keys(ficheros).concat(java ? [java] : [])){
            olvidados.delete(r)
        }
        const todo = leerTodo()
        todo[id] = { t: Date.now(), java, ficheros }
        // Escritura atómica: un apagón a mitad no deja un JSON roto que tape la detección.
        const tmp = rutaHuella() + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify(todo))
        fs.renameSync(tmp, rutaHuella())
    } catch(e){
        logger.warn('No se pudo guardar la huella de archivos', e)
    }
}

/**
 * Qué ha desaparecido desde la última partida buena de este perfil.
 *
 * @param {Object} serv Servidor (perfil) de helios-core.
 * @param {string|null} javaExe Ejecutable de Java configurado ahora.
 * @returns {{mods: string[], java: boolean}} Vacío si no hay huella o no falta nada.
 */
exports.comprobar = function(serv, javaExe){
    const vacio = { mods: [], java: false }
    try {
        const huella = leerTodo()[serv.rawServer.id]
        if(huella == null || typeof huella.ficheros !== 'object'){
            return vacio
        }
        const pedidos = new Set(jarsDe(serv))
        const mods = Object.keys(huella.ficheros).filter(r => pedidos.has(r) && !olvidados.has(r) && tamano(r) <= 0)
        // Java solo cuenta si sigue siendo el configurado: cambiarlo en Ajustes no es un borrado.
        const java = typeof huella.java === 'string' && huella.java === javaExe && !olvidados.has(huella.java)
            && tamano(huella.java) <= 0
        return { mods, java }
    } catch(e){
        logger.warn('No se pudo comprobar la huella de archivos', e)
        return vacio
    }
}

/**
 * Quita de todas las huellas lo que hay bajo `dir`: lo borra el propio launcher
 * (reparar un módulo ilegible SC-15, reparar Java) y no debe contar como borrado de fuera.
 * En TODOS los perfiles: el runtime de Java es compartido y reparar desde uno lo borra
 * también para los demás (revisión de Codex). Se llama ANTES de borrar, para que un
 * borrado a medias tampoco cuente.
 */
exports.olvidarBajo = function(dir){
    const base = path.resolve(dir).toLowerCase() + path.sep
    const dentro = r => typeof r === 'string' && path.resolve(r).toLowerCase().startsWith(base)
    try {
        const todo = leerTodo()
        for(const h of Object.values(todo)){
            if(h == null){
                continue
            }
            for(const r of Object.keys(h.ficheros || {})){
                if(dentro(r)){
                    olvidados.add(r)
                    delete h.ficheros[r]
                }
            }
            if(dentro(h.java)){
                olvidados.add(h.java)
                h.java = null
            }
        }
        fs.writeFileSync(rutaHuella(), JSON.stringify(todo))
    } catch(e){
        logger.warn('No se pudo actualizar la huella de archivos', e)
    }
}

/**
 * Olvida lo que falta de la huella, para no volver a avisar del mismo borrado si el
 * jugador cierra el launcher antes de que la próxima partida cargue y la renueve.
 */
exports.olvidar = function(serv, faltan){
    // Primero en memoria: si el disco no deja guardar (EACCES, lleno), «Jugar ya» no debe
    // volver a parar por el mismo borrado (revisión de Codex).
    for(const r of faltan.mods || []){
        olvidados.add(r)
    }
    if(faltan.java){
        try {
            const h = leerTodo()[serv.rawServer.id]
            if(h != null && typeof h.java === 'string'){
                olvidados.add(h.java)
            }
        } catch(_e){
            // Sin huella legible no hay nada que repetir.
        }
    }
    try {
        const todo = leerTodo()
        const h = todo[serv.rawServer.id]
        if(h == null){
            return
        }
        for(const r of faltan.mods || []){
            delete h.ficheros[r]
        }
        if(faltan.java){
            h.java = null
        }
        fs.writeFileSync(rutaHuella(), JSON.stringify(todo))
    } catch(e){
        logger.warn('No se pudo actualizar la huella de archivos', e)
    }
}
