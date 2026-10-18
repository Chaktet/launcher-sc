/**
 * Live server state (1.11.0): players per region, next event card, notices,
 * the events calendar and desktop reminders.
 *
 * Source: launcher/estado.json, written every minute on OVH-A by
 * servidor/sc-launcher-estado.py (status ping of each region + SCEventos'
 * table + /etc/sc-launcher/aviso.json). Unknown is never shown as zero: a
 * region that does not answer says "Sin conexión", and if the file cannot be
 * read (or is older than 5 minutes) the landing falls back to the single
 * total ping and the calendar says it could not check.
 *
 * Times: epoch ms in the file, shown in Spain's time (Europe/Madrid), like the
 * in-game messages of SCEventos.
 */
const SC_ESTADO_URL = `https://${require('./assets/js/distromanager').SC_HOST_PRINCIPAL}/launcher/estado.json`
const SC_ZONA = 'Europe/Madrid'
const SC_ESTADO_CADUCA = 5 * 60 * 1000
const SC_AVISO_ANTES = 15 * 60 * 1000

let scEstado = null          // last valid estado.json
let scEstadoError = false    // last fetch failed
let scEventosError = false   // the file arrived but the server could not read the events
let scPidiendo = false       // a fetch is in flight
let scEventosAbierto = false
let scCalMes = null          // {y, m} shown in the calendar
let scCalDia = null          // 'YYYY-MM-DD' selected

const scElem = id => document.getElementById(id)

/** The game is open, from this session or from a previous one. */
function scJugando(){
    return (typeof proc !== 'undefined' && proc != null) || ScJuegoAbierto.juegoPrevioAbierto() != null
}

/** Valid and not stale. */
function scEstadoVigente(){
    return scEstado != null && Date.now() - scEstado.actualizado <= SC_ESTADO_CADUCA
}

/** Live per-region numbers available (landing.js stops writing the single total). */
function scRegionesEnVivo(){
    return scEstadoVigente() && Array.isArray(scEstado.regiones) && scEstado.regiones.length > 0
}

/** Date parts in Spain's time. */
function scPartes(ms){
    const p = {}
    for(const x of new Intl.DateTimeFormat('es-ES', { timeZone: SC_ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23' }).formatToParts(new Date(ms))){
        p[x.type] = x.value
    }
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hora: `${p.hour}:${p.minute}`, diaSemana: p.weekday,
        clave: `${p.year}-${p.month}-${p.day}` }
}

function scMayus(s){
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** "Hoy", "Mañana" or "Sábado 17 oct". */
function scNombreDia(ms){
    const h = scPartes(Date.now())
    const hoy = h.clave
    const m = new Date(Date.UTC(h.y, h.m - 1, h.d + 1))
    const manana = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}-${String(m.getUTCDate()).padStart(2, '0')}`
    const p = scPartes(ms)
    if(p.clave === hoy){
        return Lang.queryJS('landing.sc2.today')
    }
    if(p.clave === manana){
        return Lang.queryJS('landing.sc2.tomorrow')
    }
    const mes = new Intl.DateTimeFormat('es-ES', { timeZone: SC_ZONA, month: 'short' }).format(new Date(ms)).replace('.', '')
    return `${scMayus(p.diaSemana)} ${p.d} ${mes}`
}

/** "02 d 04 h 18 min" / "04 h 18 min" / "18 min". */
function scCuentaAtras(ms){
    const min = Math.max(0, Math.ceil(ms / 60000))
    const d = Math.floor(min / 1440)
    const h = Math.floor((min % 1440) / 60)
    const m = min % 60
    const dos = n => String(n).padStart(2, '0')
    if(d > 0){
        return `${dos(d)} d ${dos(h)} h ${dos(m)} min`
    }
    if(h > 0){
        return `${dos(h)} h ${dos(m)} min`
    }
    return `${m} min`
}

/**
 * Events to show: the staff ones (/eventos) plus, since 1.16.12, the fixed ones (`fijos`: legendary raids and
 * Community Days, read by the server from the plugin configs). The calendar was empty most weeks while Discord
 * listed ten events. `soloStaff` is for the Windows notices: the fixed raids are almost daily (01:00 in Spain on
 * weekdays) and would notify every night; Discord's «Interesado» covers whoever wants them.
 * null = the staff events could not be read and there are no fixed ones either.
 */
function scEventosValidos(soloStaff = false){
    if(!scEstadoVigente()){
        return null
    }
    const staff = Array.isArray(scEstado.eventos) ? scEstado.eventos : null
    const fijos = !soloStaff && Array.isArray(scEstado.fijos) ? scEstado.fijos.map(e => ({ ...e, fijo: true })) : []
    if(staff == null && fijos.length === 0){
        return null
    }
    return (staff || []).filter(e => e && !e.fijo).concat(fijos)
        .filter(e => e && typeof e.nombre === 'string' && Number.isFinite(e.inicio) && Number.isFinite(e.fin) && e.fin > Date.now())
        .sort((a, b) => a.inicio - b.inicio)
}

/* ---- Regions panel ------------------------------------------------------- */

function scPintarRegiones(){
    const caja = scElem('sc2Regiones')
    if(!scRegionesEnVivo()){
        if(!caja.hidden){
            caja.hidden = true
            scElem('landingPlayerLabel').textContent = Lang.queryJS('landing.serverStatus.players')
            scElem('player_count').textContent = '—'
            scElem('player_count').hidden = false
            refreshServerStatus(false).catch(() => {})
        }
        return
    }
    caja.replaceChildren()
    for(const r of scEstado.regiones){
        const fila = document.createElement('div')
        fila.className = 'sc2Region' + (r.online ? '' : ' sc2RegionOff')
        const nombre = document.createElement('span')
        nombre.className = 'sc2RegionNombre'
        nombre.textContent = String(r.nombre || r.id || '')
        const valor = document.createElement('span')
        valor.className = 'sc2RegionValor'
        if(!r.online || !Number.isFinite(r.jugadores)){
            valor.textContent = Lang.queryJS('landing.sc2.regionOffline')
        } else if(r.jugadores === 1){
            valor.textContent = Lang.queryJS('landing.sc2.regionOne')
        } else {
            valor.textContent = Lang.queryJS('landing.sc2.regionPlayers', { n: Number(r.jugadores).toLocaleString('es-ES') })
        }
        fila.append(nombre, valor)
        caja.append(fila)
    }
    scElem('landingPlayerLabel').textContent = Lang.queryJS('landing.sc2.regionsLabel')
    scElem('player_count').hidden = true
    caja.hidden = false
}

/* ---- Event / notice card ------------------------------------------------- */

function scPintarTarjeta(){
    const card = scElem('sc2EventCard')
    const aviso = scEstadoVigente() ? scEstado.aviso : null
    card.classList.remove('sc2EventLive', 'sc2EventAviso')
    if(aviso && typeof aviso.texto === 'string'){
        card.classList.add('sc2EventAviso')
        scElem('sc2EventKicker').textContent = Lang.queryJS(aviso.tipo === 'mantenimiento' ? 'landing.sc2.maintenance' : 'landing.sc2.notice')
        scElem('sc2EventTitle').textContent = String(aviso.titulo || '')
        scElem('sc2EventWhen').textContent = aviso.texto
        scElem('sc2EventCount').textContent = ''
        scElem('sc2EventCalendar').hidden = true
        card.hidden = false
        return
    }
    const lista = scEventosValidos()
    const ev = lista && lista[0]
    if(ev == null){
        card.hidden = true
        return
    }
    const ahora = Date.now()
    const enCurso = ev.inicio <= ahora
    card.classList.toggle('sc2EventLive', enCurso)
    scElem('sc2EventKicker').textContent = Lang.queryJS(enCurso ? 'landing.sc2.liveEvent' : 'landing.sc2.nextEvent')
    scElem('sc2EventTitle').textContent = ev.nombre
    scElem('sc2EventWhen').textContent = Lang.queryJS('landing.sc2.whenLine', {
        dia: scNombreDia(ev.inicio), hora: scPartes(ev.inicio).hora, region: String(ev.region || '') })
    scElem('sc2EventCount').textContent = enCurso
        ? Lang.queryJS('landing.sc2.endsAt', { h: scPartes(ev.fin).hora })
        : Lang.queryJS('landing.sc2.startsIn', { t: scCuentaAtras(ev.inicio - ahora) })
    scElem('sc2EventCalendar').hidden = false
    card.hidden = false
}

/* ---- Calendar view ------------------------------------------------------- */

function scPorDia(lista){
    const mapa = new Map()
    for(const e of lista || []){
        // Every Madrid day the event touches (an event over midnight shows on both).
        const ultimo = scPartes(Math.max(e.inicio, e.fin - 1)).clave
        let p = scPartes(e.inicio)
        for(let i = 0; i < 31; i++){
            if(!mapa.has(p.clave)){
                mapa.set(p.clave, [])
            }
            mapa.get(p.clave).push(e)
            if(p.clave === ultimo){
                break
            }
            const sig = new Date(Date.UTC(p.y, p.m - 1, p.d + 1))
            p = { y: sig.getUTCFullYear(), m: sig.getUTCMonth() + 1, d: sig.getUTCDate(),
                clave: `${sig.getUTCFullYear()}-${String(sig.getUTCMonth() + 1).padStart(2, '0')}-${String(sig.getUTCDate()).padStart(2, '0')}` }
        }
    }
    return mapa
}

function scPintarCalendario(){
    if(!scEventosAbierto){
        return
    }
    const lista = scEventosValidos()
    const porDia = scPorDia(lista)
    const hoy = scPartes(Date.now())
    if(scCalMes == null){
        const primero = lista && lista[0] ? scPartes(lista[0].inicio) : hoy
        scCalMes = { y: primero.y, m: primero.m }
        scCalDia = primero.clave
    }
    const { y, m } = scCalMes
    scElem('sc2CalMes').textContent = scMayus(new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(y, m - 1, 15))))

    const grid = scElem('sc2CalGrid')
    grid.replaceChildren()
    for(const n of ['L', 'M', 'X', 'J', 'V', 'S', 'D']){
        const c = document.createElement('span')
        c.className = 'sc2CalSemana'
        c.textContent = n
        grid.append(c)
    }
    const primerDia = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 // Monday = 0
    const diasMes = new Date(Date.UTC(y, m, 0)).getUTCDate()
    for(let i = 0; i < primerDia; i++){
        grid.append(document.createElement('span'))
    }
    for(let d = 1; d <= diasMes; d++){
        const clave = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'sc2CalDiaBtn'
        b.textContent = String(d)
        if(porDia.has(clave)){
            b.classList.add('sc2CalConEvento')
            b.setAttribute('aria-label', `${d}: ${porDia.get(clave).length} evento(s)`)
        }
        if(clave === hoy.clave){
            b.classList.add('sc2CalHoy')
        }
        if(clave === scCalDia){
            b.setAttribute('aria-selected', 'true')
        }
        b.addEventListener('click', () => {
            scCalDia = clave
            scPintarCalendario()
        })
        grid.append(b)
    }

    // Selected day's list (or the general state).
    const caja = scElem('sc2CalLista')
    caja.replaceChildren()
    const msg = texto => {
        const p = document.createElement('p')
        p.className = 'sc2CalMsg'
        p.textContent = texto
        caja.append(p)
    }
    if(lista == null){
        scElem('sc2CalDiaTitulo').textContent = ''
        msg(Lang.queryJS(scEstadoError || scEventosError ? 'landing.sc2.calError' : 'landing.sc2.calLoading'))
        return
    }
    const [cy, cm, cd] = (scCalDia || hoy.clave).split('-').map(Number)
    scElem('sc2CalDiaTitulo').textContent = scMayus(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
        .format(new Date(Date.UTC(cy, cm - 1, cd, 12))))
    if(lista.length === 0){
        msg(Lang.queryJS('landing.sc2.calNone'))
        return
    }
    const delDia = porDia.get(scCalDia) || []
    if(delDia.length === 0){
        msg(Lang.queryJS('landing.sc2.calEmptyDay'))
        return
    }
    for(const e of delDia){
        const art = document.createElement('div')
        art.className = 'sc2CalEvento' + (e.inicio <= Date.now() ? ' sc2EventLive' : '')
        const t = document.createElement('span')
        t.className = 'sc2CalEventoNombre'
        t.textContent = e.nombre
        const w = document.createElement('span')
        w.className = 'sc2CalEventoHora'
        const pi = scPartes(e.inicio)
        const pf = scPartes(e.fin)
        w.textContent = Lang.queryJS('landing.sc2.calOrganiza', {
            inicio: (pi.clave !== scCalDia ? scNombreDia(e.inicio) + ' ' : '') + pi.hora,
            fin: (pf.clave !== pi.clave ? scNombreDia(e.fin) + ' ' : '') + pf.hora,
            region: String(e.region || '') })
        art.append(t, w)
        if(typeof e.descripcion === 'string' && e.descripcion.trim()){
            const d = document.createElement('span')
            d.className = 'sc2CalEventoDesc'
            d.textContent = e.descripcion
            art.append(d)
        }
        caja.append(art)
    }
}

function scAbrirEventos(){
    if(typeof newsActive !== 'undefined' && newsActive){
        document.getElementById('newsButton').click()
    }
    if(typeof scCerrarGaleria === 'function'){
        scCerrarGaleria()
    }
    scEventosAbierto = true
    scElem('landingContainer').classList.add('sc2EventosOpen')
    scElem('sc2EventosView').setAttribute('aria-hidden', 'false')
    scMarcarPestana('sc2TabEventos')
    scPintarCalendario()
}

function scCerrarEventos(){
    if(!scEventosAbierto){
        return
    }
    scEventosAbierto = false
    scElem('landingContainer').classList.remove('sc2EventosOpen')
    scElem('sc2EventosView').setAttribute('aria-hidden', 'true')
    scMarcarPestana('sc2TabJugar')
}

scElem('sc2TabEventos').addEventListener('click', () => scAbrirEventos())
scElem('sc2EventCalendar').addEventListener('click', () => scAbrirEventos())
function scCambiarMes(delta){
    if(scCalMes == null){
        return
    }
    const d = new Date(Date.UTC(scCalMes.y, scCalMes.m - 1 + delta, 1))
    scCalMes = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }
    const prefijo = `${scCalMes.y}-${String(scCalMes.m).padStart(2, '0')}-`
    const conEvento = [...scPorDia(scEventosValidos()).keys()].filter(k => k.startsWith(prefijo)).sort()[0]
    scCalDia = conEvento || prefijo + '01'
    scPintarCalendario()
}
scElem('sc2CalPrev').addEventListener('click', () => scCambiarMes(-1))
scElem('sc2CalNext').addEventListener('click', () => scCambiarMes(1))

/* ---- Desktop reminders ----------------------------------------------------- */

function scYaAvisado(clave){
    try {
        const v = JSON.parse(localStorage.getItem('scAvisosEventos') || '{}')
        return v[clave] === true
    } catch(_e){
        return false
    }
}

function scMarcarAvisado(clave, si = true){
    try {
        const v = JSON.parse(localStorage.getItem('scAvisosEventos') || '{}')
        if(si){
            v[clave] = true
        } else {
            delete v[clave]
        }
        // Keep the store small: only the last 100 keys.
        const claves = Object.keys(v)
        for(const k of claves.slice(0, Math.max(0, claves.length - 100))){
            delete v[k]
        }
        localStorage.setItem('scAvisosEventos', JSON.stringify(v))
    } catch(_e){ /* no storage: at worst a reminder repeats */ }
}

function scAvisosEscritorio(){
    const lista = scEventosValidos(true)
    // Playing: the server already announces it in the chat.
    if(lista == null || scJugando()){
        return
    }
    const ahora = Date.now()
    for(const e of lista){
        const falta = e.inicio - ahora
        let tipo = null
        if(falta <= SC_AVISO_ANTES && falta > 60000){
            tipo = 'antes'
        } else if(falta <= 60000 && falta > -5 * 60000){
            tipo = 'ya'
        }
        if(tipo == null){
            continue
        }
        // Keyed by start time too: a rescheduled event reminds again.
        const clave = `${e.id}:${e.inicio}:${tipo}`
        if(scYaAvisado(clave)){
            continue
        }
        const datos = { nombre: e.nombre, hora: scPartes(e.inicio).hora, region: String(e.region || '') }
        try {
            const n = new Notification(
                Lang.queryJS(tipo === 'antes' ? 'landing.sc2.notifTitle' : 'landing.sc2.notifNowTitle', datos),
                { body: Lang.queryJS(tipo === 'antes' ? 'landing.sc2.notifBody' : 'landing.sc2.notifNowBody', datos), silent: false })
            n.onclick = () => ipcRenderer.send('sc-ventana-juego', 'mostrar')
            // Marked once created; an error from Windows unmarks it so it is retried.
            scMarcarAvisado(clave)
            n.onerror = () => {
                scMarcarAvisado(clave, false)
                loggerLanding.warn('Windows no mostró el aviso del evento')
            }
        } catch(err){
            loggerLanding.warn('No se pudo mostrar el aviso del evento', err)
        }
    }
}

/* ---- Fetch loop ------------------------------------------------------------ */

async function scRefrescarEstado(){
    if(scPidiendo){
        return
    }
    scPidiendo = true
    try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 8000)
        let datos
        try {
            const res = await fetch(SC_ESTADO_URL + '?t=' + Date.now(), { signal: ctrl.signal, cache: 'no-store' })
            if(!res.ok){
                throw new Error('HTTP ' + res.status)
            }
            datos = await res.json()
        } finally {
            clearTimeout(t)
        }
        if(datos == null || datos.version !== 1 || !Number.isFinite(datos.actualizado)){
            throw new Error('formato desconocido')
        }
        // A stopped cron would leave old numbers: treat as unknown.
        if(Date.now() - datos.actualizado > SC_ESTADO_CADUCA){
            throw new Error('estado caducado')
        }
        scEstado = datos
        scEstadoError = false
        scEventosError = !Array.isArray(datos.eventos)
    } catch(err){
        loggerLanding.debug('Estado del servidor no disponible', err)
        scEstado = null
        scEstadoError = true
    } finally {
        scPidiendo = false
    }
    scPintarTodo()
    scAvisosEscritorio()
}

function scPintarTodo(){
    try {
        scPintarRegiones()
        scPintarTarjeta()
        scPintarCalendario()
    } catch(err){
        loggerLanding.warn('No se pudo pintar el estado del servidor', err)
    }
}

scRefrescarEstado()
setInterval(() => {
    // Same rule as the ping: nothing while the game is running.
    if(scJugando()){
        return
    }
    scRefrescarEstado()
}, 60000)
// The countdown moves between fetches (and a stale state hides itself).
setInterval(() => {
    if(scJugando()){
        return
    }
    scPintarTodo()
    scAvisosEscritorio()
}, 30000)
