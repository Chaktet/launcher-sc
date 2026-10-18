/**
 * Puerta de actualización (1.16.0, Felix 17-10-2026).
 *
 * Cuando hay una versión nueva del launcher, un aviso grande en el centro tapa la
 * pantalla y JUGAR no se puede usar hasta actualizar. Antes solo cambiaba el texto
 * pequeño de abajo a la izquierda ("v1.15.1 · Estás al día") y nadie lo veía, así
 * que había jugadores entrando con mods, pack o menús viejos.
 *
 * Estados: oculta → disponible → descargando → lista → instalando, y al reabrir
 * a medio instalar, terminando. Si la descarga falla: error, con Reintentar, enlace
 * a la descarga y "Jugar sin actualizar" para no dejar a nadie encerrado.
 *
 * 1.16.11: es la ÚNICA pantalla de la actualización, de principio a fin. Antes, al
 * terminar la descarga salían a la vez la puerta, una cuenta atrás en un diálogo
 * encima, un aviso abajo con "Instalar ahora", y luego "Instalando…" en otro diálogo:
 * cuatro avisos para lo mismo. La cuenta atrás y "Instalando…" viven ahora aquí.
 *
 * Va por debajo de #overlayContainer (z-index 500): los diálogos de siempre (errores
 * SC, el selector de perfil) salen encima, y al cerrarlos la puerta sigue ahí. Nada
 * bloquea el hilo de la interfaz: solo cambia atributos y textos; la descarga la hace
 * electron-updater en el proceso principal.
 */
/* global Lang, ipcRenderer, shell, scInstalarAhora, scJuegoEnMarcha, scOcupado, scAvisoLauncherCuentaAtras, isOverlayVisible */

const SC_PUERTA_DESCARGA = 'https://github.com/Chaktet/launcher-sc/releases/latest'
// Segundos de la cuenta atrás antes de instalar sola con el launcher ocioso.
const SC_PUERTA_CUENTA = 10

let scPuertaEstado = 'oculta'
let scPuertaVersion = ''
let scPuertaSinActualizar = false // el jugador eligió "Jugar sin actualizar" tras un fallo
let scPuertaReloj = null          // intervalo de la cuenta atrás en 'lista'
let scPuertaToastHecho = ''       // versión ya avisada por notificación de Windows
let scPuertaRelojBarra = null     // intervalo de la barra estimada al instalar

// El instalador de Windows no dice por dónde va: la barra de "Actualizando" y
// "Terminando" se estima con lo que tardó la última actualización en este PC
// (desde pulsar el botón hasta abrirse la versión nueva). Sin medida, 25 s.
const SC_PUERTA_DURACION_DEF = 25000
const SC_PUERTA_DURACION_CLAVE = 'scDuracionActualizacion'

function scPuertaDuracion(){
    try {
        const v = Number(localStorage.getItem(SC_PUERTA_DURACION_CLAVE))
        if(v >= 5000 && v <= 180000){
            return v
        }
    } catch(e) { /* sin almacenamiento: estimación por defecto */ }
    return SC_PUERTA_DURACION_DEF
}

/** Lo llama uicore.js al abrirse ya actualizado, con lo que ha tardado de verdad. */
function scPuertaGuardaDuracion(ms){
    if(!(ms >= 5000 && ms <= 180000)){
        return
    }
    try {
        // Media con la anterior: una actualización suelta muy lenta no dispara la siguiente estimación.
        const previa = Number(localStorage.getItem(SC_PUERTA_DURACION_CLAVE))
        const nueva = previa >= 5000 && previa <= 180000 ? Math.round((previa + ms) / 2) : Math.round(ms)
        localStorage.setItem(SC_PUERTA_DURACION_CLAVE, String(nueva))
    } catch(e) { /* nada */ }
}

/** "1 min 20 s", "35 s": tiempo restante legible. */
function scPuertaTiempo(seg){
    const s = Math.max(1, Math.ceil(seg))
    if(s < 60){
        return scPuertaTxt('segundos', '{s} s').replace('{s}', s)
    }
    return scPuertaTxt('minutos', '{m} min {s} s').replace('{m}', Math.floor(s / 60)).replace('{s}', s % 60)
}

/** Barra estimada de "Actualizando" / "Terminando", contando desde `desde`. */
function scPuertaBarraEstimada(desde){
    clearInterval(scPuertaRelojBarra)
    const total = scPuertaDuracion()
    const n = scPuertaNodo()
    const paso = () => {
        if(scPuertaEstado !== 'instalando' && scPuertaEstado !== 'terminando'){
            clearInterval(scPuertaRelojBarra)
            return
        }
        const pasado = Date.now() - desde
        // Nunca llega al 100 % por su cuenta: la llena la versión nueva al abrirse.
        const pct = Math.min(95, pasado / total * 100)
        n.querySelector('#scPuertaRelleno').style.width = pct.toFixed(1) + '%'
        n.querySelector('#scPuertaPct').textContent = pasado < total
            ? scPuertaTxt('quedanInstalar', 'Quedan unos {t}').replace('{t}', scPuertaTiempo((total - pasado) / 1000))
            : scPuertaTxt('casiListo', 'Casi listo, unos segundos más…')
    }
    paso()
    scPuertaRelojBarra = setInterval(paso, 250)
}

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
            <div id="scPuertaCabecera">
                <div id="scPuertaIcono" aria-hidden="true">⬇</div>
                <div id="scPuertaTitulos">
                    <span id="scPuertaTitulo"></span>
                    <span id="scPuertaSub"></span>
                </div>
            </div>
            <span id="scPuertaDesc"></span>
            <div id="scPuertaBarra"><div id="scPuertaRelleno"></div></div>
            <span id="scPuertaPct"></span>
            <div id="scPuertaPie">
                <button id="scPuertaBoton" type="button"></button>
                <span id="scPuertaNota"></span>
                <div id="scPuertaEnlaces">
                    <a id="scPuertaWeb" href="#"></a>
                    <button id="scPuertaSaltar" type="button"></button>
                </div>
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

/** Instala ya, salvo con Minecraft abierto: el instalador lo cerraría a media partida. */
function scPuertaInstalar(){
    return Promise.resolve(typeof scJuegoEnMarcha === 'function' ? scJuegoEnMarcha(true) : false)
        .catch(() => false)
        .then(abierto => {
            if(abierto){
                scPuertaNota(scPuertaTxt('cierraJuego', 'Cierra Minecraft primero y vuelve a pulsar el botón.'))
                return false
            }
            if(typeof scInstalarAhora === 'function'){
                scInstalarAhora(scPuertaVersion)
            } else {
                ipcRenderer.send('autoUpdateAction', 'installUpdateNow')
            }
            return true
        })
}

function scPuertaPulsaBoton(){
    if(scPuertaEstado === 'lista'){
        scPuertaInstalar()
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

function scPuertaParaCuenta(){
    clearInterval(scPuertaReloj)
    scPuertaReloj = null
}

/**
 * Con la actualización descargada, se instala sola si nadie la está usando: el
 * instalador público está congelado en una versión vieja y quien acaba de instalar
 * no debería tener que pulsar nada. Nunca con el juego abierto ni con una descarga
 * del modpack en marcha: entonces se espera, y la cuenta empieza de nuevo cuando
 * deja de estar ocupado.
 */
function scPuertaCuenta(){
    if(scPuertaReloj != null){
        return
    }
    let restantes = SC_PUERTA_CUENTA
    const paso = () => {
        if(scPuertaEstado !== 'lista'){
            scPuertaParaCuenta()
            return
        }
        // Con un diálogo encima (un error SC, el selector de perfil) se espera a que
        // lo cierre: instalar ahí le quitaría el mensaje sin dejarle leerlo.
        if(typeof isOverlayVisible === 'function' && isOverlayVisible()){
            restantes = SC_PUERTA_CUENTA
            return
        }
        const ocupado = typeof scOcupado === 'function' && scOcupado()
        if(ocupado){
            restantes = SC_PUERTA_CUENTA
            scPuertaNota(scPuertaTxt('esperaJuego', 'Se actualizará solo en cuanto cierres Minecraft o termine la descarga.'))
            return
        }
        if(restantes === SC_PUERTA_CUENTA && scPuertaToastHecho !== scPuertaVersion
            && typeof scAvisoLauncherCuentaAtras === 'function'){
            // Con la ventana detrás nadie ve la cuenta atrás: aviso de Windows.
            scPuertaToastHecho = scPuertaVersion
            scAvisoLauncherCuentaAtras(scPuertaVersion)
        }
        if(restantes <= 0){
            scPuertaParaCuenta()
            // Comprobación completa antes de instalar (la rápida no ve un juego abierto
            // antes de reabrir el launcher): si lo hay, se vuelve a esperar.
            scPuertaInstalar().then(instala => {
                if(!instala && scPuertaEstado === 'lista'){
                    setTimeout(scPuertaCuenta, 5000)
                }
            })
            return
        }
        scPuertaNota(scPuertaTxt('cuenta', 'Se reinicia solo en <b>{s}</b> s.').replace('{s}', restantes))
        restantes--
    }
    paso()
    scPuertaReloj = setInterval(paso, 1000)
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
    if(extra.version){
        scPuertaVersion = String(extra.version)
    }
    scPuertaEstado = estado
    n.setAttribute('estado', estado)
    if(estado !== 'lista'){
        scPuertaParaCuenta()
    }
    if(estado === 'oculta'){
        n.removeAttribute('visible')
        scPuertaJugar(false)
        return
    }
    const v = scPuertaVersion ? ' ' + scPuertaVersion : ''
    const q = s => n.querySelector(s)
    const pct = Math.max(0, Math.min(100, Math.round(extra.pct || 0)))
    let titulo = '', desc = '', boton = '', web = '', saltar = '', barra = true
    if(estado === 'disponible' || estado === 'descargando'){
        titulo = scPuertaTxt('tituloDisponible', 'Hay una actualización del launcher')
        desc = extra.reintento
            ? scPuertaTxt('descReintento', 'Volviendo a intentar la descarga…')
            : scPuertaTxt('descDisponible', 'Se está descargando la versión{v}. Hasta que termine no se puede jugar: así todos tenéis los mismos mods, el pack y los menús al día.').replace('{v}', v)
        q('#scPuertaRelleno').style.width = (estado === 'descargando' ? pct : 0) + '%'
        // Tiempo restante con la velocidad que da electron-updater (bytesPerSecond).
        let resto = ''
        if(estado === 'descargando' && extra.bps > 0 && extra.total > extra.hecho){
            resto = scPuertaTxt('quedanDescarga', ' · quedan unos {t}').replace('{t}', scPuertaTiempo((extra.total - extra.hecho) / extra.bps))
        }
        q('#scPuertaPct').textContent = estado === 'descargando'
            ? scPuertaTxt('descargando', 'Descargando… {p} %').replace('{p}', pct) + resto
            : scPuertaTxt('preparando', 'Preparando la descarga…')
    } else if(estado === 'lista'){
        titulo = scPuertaTxt('tituloLista', 'Actualización lista')
        desc = scPuertaTxt('descLista', 'Pulsa el botón: el launcher se cierra, se actualiza y <b>vuelve a abrirse solo</b> en unos segundos.')
        boton = scPuertaTxt('botonLista', 'Reiniciar y actualizar')
        q('#scPuertaRelleno').style.width = '100%'
        q('#scPuertaPct').textContent = ''
    } else if(estado === 'instalando' || estado === 'terminando'){
        titulo = estado === 'instalando'
            ? scPuertaTxt('tituloInstalando', 'Actualizando el launcher…')
            : scPuertaTxt('tituloTerminando', 'Terminando de actualizar…')
        desc = estado === 'instalando'
            ? scPuertaTxt('descInstalando', 'Se cierra y <b>vuelve a abrirse solo</b> en unos segundos. No hace falta que hagas nada.')
            : scPuertaTxt('descTerminando', 'Se está instalando la versión{v}. Este launcher se cerrará y se abrirá el nuevo en unos segundos.').replace('{v}', v)
    } else if(estado === 'error'){
        titulo = scPuertaTxt('tituloError', 'No se pudo descargar la actualización')
        desc = scPuertaTxt('descError', 'Puede ser la conexión o el antivirus. Vuelve a intentarlo o descarga el launcher nuevo desde la web.')
        boton = scPuertaTxt('botonError', 'Reintentar')
        web = scPuertaTxt('enlaceWeb', 'Descargar el launcher desde la web')
        saltar = scPuertaTxt('saltar', 'Jugar sin actualizar')
        q('#scPuertaPct').textContent = ''
        barra = false
    }
    // El subtítulo repetía el título ("Hay una actualización del launcher" /
    // "Actualización del launcher"): ahora dice qué versión es.
    q('#scPuertaSub').textContent = scPuertaVersion
        ? scPuertaTxt('subtituloVersion', 'Versión {v}').replace('{v}', scPuertaVersion)
        : scPuertaTxt('subtitulo', 'Actualización del launcher')
    q('#scPuertaIcono').textContent = estado === 'error' ? '!' : (estado === 'lista' ? '✓' : (estado === 'disponible' || estado === 'descargando' ? '⬇' : '↻'))
    q('#scPuertaTitulo').textContent = titulo
    q('#scPuertaDesc').innerHTML = desc
    q('#scPuertaBoton').textContent = boton
    q('#scPuertaBoton').style.display = boton ? '' : 'none'
    q('#scPuertaWeb').textContent = web
    q('#scPuertaSaltar').textContent = saltar
    q('#scPuertaEnlaces').style.display = web || saltar ? '' : 'none'
    q('#scPuertaBarra').style.display = barra ? '' : 'none'
    if(estado !== 'lista'){
        scPuertaNota('')
    }
    n.setAttribute('visible', '')
    scPuertaJugar(true)
    if(estado === 'lista'){
        scPuertaCuenta()
    } else if(estado === 'instalando' || estado === 'terminando'){
        scPuertaBarraEstimada(extra.desde || Date.now())
    }
}

/**
 * Entrada única desde los avisos de electron-updater (uicore.js).
 * @param {string} evento update-available | download-progress | update-downloaded | update-not-available | realerror
 * @param {object} info Lo que manda electron-updater.
 */
function scPuerta(evento, info){
    try {
        // Instalando o terminando, el launcher está a punto de cerrarse: una
        // comprobación periódica que llegue entretanto no debe cambiar la pantalla.
        if(scPuertaEstado === 'instalando' || scPuertaEstado === 'terminando'){
            return
        }
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
                    scPuertaPinta('descargando', info != null
                        ? { pct: info.percent, bps: info.bytesPerSecond, total: info.total, hecho: info.transferred }
                        : { pct: 0 })
                }
                break
            case 'update-downloaded':
                // La comprobación de cada pocos minutos repite este evento con la
                // misma versión: si ya está a la vista, no se reinicia la cuenta.
                if(scPuertaEstado === 'lista' && info != null && String(info.version) === scPuertaVersion){
                    break
                }
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
