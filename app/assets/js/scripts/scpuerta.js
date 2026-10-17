/**
 * Puerta de actualización (1.16.0, Felix 17-10-2026).
 *
 * Cuando hay una versión nueva del launcher, un aviso grande en el centro tapa la
 * pantalla y JUGAR no se puede usar hasta actualizar. Antes solo cambiaba el texto
 * pequeño de abajo a la izquierda ("v1.15.1 · Estás al día") y nadie lo veía, así
 * que había jugadores entrando con mods, pack o menús viejos.
 *
 * Estados: oculta → disponible → descargando → lista. Si la descarga falla: error,
 * con Reintentar, enlace a la descarga y "Jugar sin actualizar" para no dejar a
 * nadie encerrado.
 *
 * Va por debajo de #overlayContainer (z-index 500): los diálogos de siempre (la
 * cuenta atrás de la instalación automática, errores SC, "Instalando…") salen
 * encima, y al cerrarlos la puerta sigue ahí. Nada bloquea el hilo de la interfaz:
 * solo cambia atributos y textos; la descarga la hace electron-updater en el
 * proceso principal.
 */
/* global Lang, ipcRenderer, shell, scInstalarAhora, scJuegoEnMarcha */

const SC_PUERTA_DESCARGA = 'https://github.com/Chaktet/launcher-sc/releases/latest'

let scPuertaEstado = 'oculta'
let scPuertaVersion = ''
let scPuertaSinActualizar = false // el jugador eligió "Jugar sin actualizar" tras un fallo

function scPuertaTxt(clave, def){
    try {
        const t = Lang.queryJS('uicore.puerta.' + clave)
        if(typeof t === 'string' && t.length > 0 && !t.startsWith('uicore.')){
            return t
        }
    } catch(e) { /* sin traducción: texto por defecto */ }
    return def
}

function scPuertaNodo(){
    let n = document.getElementById('scPuerta')
    if(n != null || document.body == null){
        return n
    }
    n = document.createElement('div')
    n.id = 'scPuerta'
    n.setAttribute('role', 'dialog')
    n.setAttribute('aria-modal', 'true')
    n.innerHTML = `
        <div id="scPuertaCaja">
            <div id="scPuertaIcono">⬇</div>
            <span id="scPuertaTitulo"></span>
            <span id="scPuertaDesc"></span>
            <div id="scPuertaBarra"><div id="scPuertaRelleno"></div></div>
            <span id="scPuertaPct"></span>
            <button id="scPuertaBoton" type="button"></button>
            <span id="scPuertaNota"></span>
            <div id="scPuertaEnlaces">
                <a id="scPuertaWeb" href="#"></a>
                <button id="scPuertaSaltar" type="button"></button>
            </div>
        </div>`
    document.body.appendChild(n)
    n.querySelector('#scPuertaWeb').addEventListener('click', e => {
        e.preventDefault()
        shell.openExternal(SC_PUERTA_DESCARGA)
    })
    n.querySelector('#scPuertaSaltar').addEventListener('click', () => {
        scPuertaSinActualizar = true
        scPuertaPinta('oculta')
    })
    n.querySelector('#scPuertaBoton').addEventListener('click', scPuertaPulsaBoton)
    return n
}

function scPuertaPulsaBoton(){
    if(scPuertaEstado === 'lista'){
        // El instalador cerraría Minecraft: con el juego abierto se pide cerrarlo antes.
        Promise.resolve(typeof scJuegoEnMarcha === 'function' ? scJuegoEnMarcha(true) : false)
            .catch(() => false)
            .then(abierto => {
                if(abierto){
                    scPuertaNota(scPuertaTxt('cierraJuego', 'Cierra Minecraft primero y vuelve a pulsar el botón.'))
                } else if(typeof scInstalarAhora === 'function'){
                    scInstalarAhora(scPuertaVersion)
                } else {
                    ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
                }
            })
    } else if(scPuertaEstado === 'error'){
        scPuertaPinta('disponible', { reintento: true })
        ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
    }
}

function scPuertaNota(texto){
    const n = scPuertaNodo()
    if(n != null){
        n.querySelector('#scPuertaNota').innerHTML = texto || ''
    }
}

/** JUGAR deshabilitado mientras la puerta está a la vista (y de vuelta al quitarla). */
function scPuertaJugar(bloquear){
    const b = document.getElementById('launch_button')
    if(b == null){
        return
    }
    if(bloquear){
        if(!b.hasAttribute('data-sc-puerta')){
            b.setAttribute('data-sc-puerta', b.disabled ? '1' : '0')
        }
        b.disabled = true
    } else if(b.hasAttribute('data-sc-puerta')){
        b.disabled = b.getAttribute('data-sc-puerta') === '1'
        b.removeAttribute('data-sc-puerta')
    }
}

/** ¿Está la puerta impidiendo jugar? (lo mira el clic de JUGAR en landing.js). */
function scPuertaBloquea(){
    return scPuertaEstado !== 'oculta'
}

function scPuertaPinta(estado, extra = {}){
    const n = scPuertaNodo()
    if(n == null){
        // Aún sin <body> (el script va en <head>): se repite en cuanto exista.
        document.addEventListener('DOMContentLoaded', () => scPuertaPinta(estado, extra), { once: true })
        return
    }
    scPuertaEstado = estado
    n.setAttribute('estado', estado)
    if(estado === 'oculta'){
        n.removeAttribute('visible')
        scPuertaJugar(false)
        return
    }
    const v = scPuertaVersion ? ' ' + scPuertaVersion : ''
    const q = s => n.querySelector(s)
    const pct = Math.max(0, Math.min(100, Math.round(extra.pct || 0)))
    let titulo = '', desc = '', boton = '', web = '', saltar = ''
    if(estado === 'disponible' || estado === 'descargando'){
        titulo = scPuertaTxt('tituloDisponible', 'Hay una actualización del launcher')
        desc = extra.reintento
            ? scPuertaTxt('descReintento', 'Volviendo a intentar la descarga…')
            : scPuertaTxt('descDisponible', 'Se está descargando la versión{v}. Hasta que termine no se puede jugar: así todos tenéis los mismos mods, el pack y los menús al día.').replace('{v}', v)
        q('#scPuertaRelleno').style.width = (estado === 'descargando' ? pct : 0) + '%'
        q('#scPuertaPct').textContent = estado === 'descargando'
            ? scPuertaTxt('descargando', 'Descargando… {p} %').replace('{p}', pct)
            : scPuertaTxt('preparando', 'Preparando la descarga…')
    } else if(estado === 'lista'){
        titulo = scPuertaTxt('tituloLista', 'Actualización lista')
        desc = scPuertaTxt('descLista', 'Pulsa el botón: el launcher se cierra, se actualiza y <b>vuelve a abrirse solo</b> en unos segundos.')
        boton = scPuertaTxt('botonLista', 'Reiniciar y actualizar')
        q('#scPuertaRelleno').style.width = '100%'
        q('#scPuertaPct').textContent = ''
    } else if(estado === 'error'){
        titulo = scPuertaTxt('tituloError', 'No se pudo descargar la actualización')
        desc = scPuertaTxt('descError', 'Puede ser la conexión o el antivirus. Vuelve a intentarlo o descarga el launcher nuevo desde la web.')
        boton = scPuertaTxt('botonError', 'Reintentar')
        web = scPuertaTxt('enlaceWeb', 'Descargar el launcher desde la web')
        saltar = scPuertaTxt('saltar', 'Jugar sin actualizar')
        q('#scPuertaPct').textContent = ''
    }
    q('#scPuertaIcono').textContent = estado === 'error' ? '!' : (estado === 'lista' ? '✓' : '⬇')
    q('#scPuertaTitulo').textContent = titulo
    q('#scPuertaDesc').innerHTML = desc
    q('#scPuertaBoton').textContent = boton
    q('#scPuertaBoton').style.display = boton ? '' : 'none'
    q('#scPuertaWeb').textContent = web
    q('#scPuertaSaltar').textContent = saltar
    q('#scPuertaEnlaces').style.display = web || saltar ? '' : 'none'
    q('#scPuertaBarra').style.display = estado === 'error' ? 'none' : ''
    if(estado !== 'lista'){
        scPuertaNota('')
    }
    n.setAttribute('visible', '')
    scPuertaJugar(true)
}

/**
 * Entrada única desde los avisos de electron-updater (uicore.js).
 * @param {string} evento update-available | download-progress | update-downloaded | update-not-available | realerror
 * @param {object} info Lo que manda electron-updater.
 */
function scPuerta(evento, info){
    try {
        switch(evento){
            case 'update-available':
                scPuertaVersion = info != null && info.version ? String(info.version) : scPuertaVersion
                scPuertaSinActualizar = false
                if(scPuertaEstado !== 'lista'){
                    scPuertaPinta('disponible')
                }
                break
            case 'download-progress':
                if(scPuertaEstado !== 'lista' && !scPuertaSinActualizar){
                    scPuertaPinta('descargando', { pct: info != null ? info.percent : 0 })
                }
                break
            case 'update-downloaded':
                scPuertaVersion = info != null && info.version ? String(info.version) : scPuertaVersion
                scPuertaSinActualizar = false
                scPuertaPinta('lista')
                break
            case 'update-not-available':
                if(scPuertaEstado !== 'lista'){
                    scPuertaPinta('oculta')
                }
                break
            case 'realerror':
                // Solo si estaba esperando una descarga: un fallo al buscar (sin red al
                // arrancar) no debe tapar nada, y una ya descargada sigue valiendo.
                if(scPuertaEstado === 'disponible' || scPuertaEstado === 'descargando'){
                    scPuertaPinta('error')
                }
                break
        }
    } catch(e){
        // La puerta nunca puede dejar el launcher inservible.
        console.error('[SC Puerta]', e)
        try { scPuertaPinta('oculta') } catch(e2) { /* nada */ }
    }
}
