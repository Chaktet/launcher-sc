/**
 * «Cambiar skin» para cuentas no premium (1.17). Diseño v7 de Codex aprobado por Felix el 18-10-2026
 * (diseno-v7-skin/ESPECIFICACION.md); plan y servidor en docs/PLAN-SKINS.md.
 *
 * Habla con el plugin SCSkinLauncher del Velocity a través de Apache. Reglas que no hay que romper:
 * - la identidad sale SIEMPRE del token del servidor: aquí nunca se manda un uuid;
 * - las texturas solo se pintan si vienen de textures.minecraft.net;
 * - todo dato remoto o nombre de fichero pasa por scSkin$esc antes de ir a innerHTML.
 *
 * Las peticiones van por https de Node y no por fetch: el plugin no manda cabeceras CORS y la ventana
 * tiene Node (nodeIntegration). Si la ruta normal falla por red (bloqueo de Cloudflare en España), se
 * reintenta una vez por la ruta directa, igual que las descargas.
 */
const SC_SKIN_HOSTS = ['descargas.servidorcobblemon.es', 'directo.servidorcobblemon.es']
const SC_SKIN_RUTA = '/launcher/skin'
const SC_SKIN_CARA_CADUCA = 10 * 60 * 1000
const SC_SKIN_MAX_PNG = 24 * 1024

function scSkin$esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]))
}
function scSkin$t(clave, vars){
    return Lang.queryJS('scSkin.' + clave, vars)
}
function scSkin$h(clave, vars){
    // Los valores ({name}, {code}…) se escapan antes de entrar en el texto, que ya es nuestro.
    const seguros = {}
    for(const k in (vars || {})){ seguros[k] = scSkin$esc(vars[k]) }
    return scSkin$t(clave, seguros)
}

/** Solo texturas de Mojang y siempre por https. */
function scSkin$soloMojang(raw){
    try {
        const u = new URL(raw)
        if(u.hostname !== 'textures.minecraft.net'){ return null }
        u.protocol = 'https:'
        return u.toString()
    } catch(e){
        return null
    }
}

/**
 * Petición a la API. Devuelve {status, data, espera}; status 0 = sin conexión.
 * @param {{metodo?: string, token?: string, json?: object, png?: Buffer, query?: string, plazo?: number}} o
 */
// Solo para probar contra un Velocity local (docs/PLAN-SKINS.md): SC_SKIN_PUERTO_LOCAL=8791 habla con
// http://127.0.0.1:8791 sin Apache. Únicamente a 127.0.0.1, y con sus propios tokens: los reales nunca
// salen hacia ese servidor de pruebas (revisión de Codex).
const SC_SKIN_LOCAL = (() => {
    const p = Number(process.env.SC_SKIN_PUERTO_LOCAL || 0)
    return Number.isInteger(p) && p >= 1 && p <= 65535 ? p : 0
})()

/**
 * Petición a la API. Devuelve siempre {status, data, espera}; status 0 = sin conexión. Nunca rechaza ni se
 * queda colgada: un corte a mitad de respuesta también resuelve, para que «Vinculando…» o «Preparando…» no
 * se queden puestos para siempre (revisión de Codex).
 * @param {{metodo?: string, token?: string, json?: object, png?: Buffer, query?: string, plazo?: number}} o
 */
function scSkin$api(ruta, o = {}){
    const local = SC_SKIN_LOCAL
    const red = require(local ? 'http' : 'https')
    const intentar = (host) => new Promise(resolve => {
        let hecho = false
        const fin = r => { if(!hecho){ hecho = true; resolve(r) } }
        const sinRed = () => fin({ status: 0, data: {}, espera: 0 })
        const headers = {}
        let cuerpo = null
        if(o.token){ headers.Authorization = 'Bearer ' + o.token }
        if(o.json){ cuerpo = Buffer.from(JSON.stringify(o.json), 'utf8'); headers['Content-Type'] = 'application/json' }
        if(o.png){ cuerpo = o.png; headers['Content-Type'] = 'image/png' }
        if(cuerpo){ headers['Content-Length'] = cuerpo.length }
        const destino = local ? { host: '127.0.0.1', port: local, path: ruta + (o.query || '') } : { host, path: SC_SKIN_RUTA + ruta + (o.query || '') }
        try {
            const req = red.request({ ...destino, method: o.metodo || 'GET', headers, timeout: o.plazo || 15000 }, res => {
                let txt = ''
                res.setEncoding('utf8')
                res.on('data', d => { if(txt.length < 65536){ txt += d } })
                res.on('error', sinRed)
                res.on('aborted', sinRed)
                res.on('close', () => { if(!res.complete){ sinRed() } })
                res.on('end', () => {
                    let data = null
                    try { data = JSON.parse(txt) } catch(e){ /* respuesta rota */ }
                    const espera = parseInt(res.headers['retry-after'], 10) || (data && data.espera) || 0
                    // Una página de error de Cloudflare/Apache no es JSON: cuenta como servidor caído.
                    fin({ status: data ? res.statusCode : (res.statusCode >= 500 ? res.statusCode : 0), data: data || {}, espera })
                })
            })
            req.on('timeout', () => req.destroy(new Error('plazo')))
            req.on('error', sinRed)
            req.on('close', () => setTimeout(sinRed, 0))
            if(cuerpo){ req.write(cuerpo) }
            req.end()
        } catch(e){
            sinRed()
        }
    })
    return intentar(SC_SKIN_HOSTS[0]).then(r => r.status === 0 && !local ? intentar(SC_SKIN_HOSTS[1]) : r)
}

// --- Token del PC por cuenta -------------------------------------------------------------------------
// En el almacenamiento local del launcher, como las sesiones de Microsoft de Helios. El token solo sirve
// para cambiar la skin de esa cuenta y en el servidor solo existe su hash.
const SC_SKIN_CLAVE_TOKEN = SC_SKIN_LOCAL ? 'scSkinTokenLocal:' : 'scSkinToken:'
function scSkin$token(cuenta){ try { return localStorage.getItem(SC_SKIN_CLAVE_TOKEN + cuenta.uuid) } catch(e){ return null } }
function scSkin$guardarToken(cuenta, t){ try { localStorage.setItem(SC_SKIN_CLAVE_TOKEN + cuenta.uuid, t) } catch(e){ /* nada */ } }
function scSkin$borrarToken(cuenta){ try { localStorage.removeItem(SC_SKIN_CLAVE_TOKEN + cuenta.uuid) } catch(e){ /* nada */ } }
/** La cuenta sigue en el launcher (no se quitó mientras había una petición en marcha). */
function scSkin$existe(cuenta){ return cuenta != null && ConfigManager.getAuthAccount(cuenta.uuid) != null }
/** El panel sigue mostrando esa cuenta (se compara por uuid: ConfigManager puede dar otro objeto). */
function scSkin$esActual(cuenta){ return scSkin.cuenta != null && cuenta != null && scSkin.cuenta.uuid === cuenta.uuid }

// --- Cara del servidor para la cabeza de la cuenta -----------------------------------------------------
function scSkin$cacheCara(nombre, url){
    try { localStorage.setItem('scSkinSrv:' + String(nombre).toLowerCase(), JSON.stringify({ url, ts: Date.now() })) } catch(e){ /* nada */ }
}
/**
 * URL de la skin que la cuenta no premium lleva en el servidor, o null (sin skin o sin conexión).
 * Caché de 10 minutos; tras un cambio desde el panel se reescribe al momento.
 */
function scSkinServidor(nombre){
    if(!/^[A-Za-z0-9_]{3,16}$/.test(String(nombre || ''))){ return Promise.resolve(null) }
    try {
        const c = JSON.parse(localStorage.getItem('scSkinSrv:' + nombre.toLowerCase()) || 'null')
        // La URL se vuelve a validar al leerla: la caché está en disco y podría venir manipulada.
        if(c != null && Date.now() - c.ts < SC_SKIN_CARA_CADUCA){ return Promise.resolve(c.url ? scSkin$soloMojang(c.url) : null) }
    } catch(e){ /* sin caché */ }
    return scSkin$api('/cara', { query: '?nombre=' + encodeURIComponent(nombre) }).then(r => {
        if(r.status !== 200){ return null }
        const url = r.data.url ? scSkin$soloMojang(r.data.url) : null
        scSkin$cacheCara(nombre, url)
        return url
    })
}

/** Skin de un premium por su nick, directa de Mojang: {url, fino} o null. Solo para la vista previa. */
function scSkin$premium(nick){
    const https = require('https')
    const get = (host, path) => new Promise((resolve, reject) => {
        const req = https.get({ host, path, timeout: 8000 }, res => {
            let t = ''
            res.setEncoding('utf8')
            res.on('data', d => { if(t.length < 65536){ t += d } })
            res.on('end', () => resolve({ status: res.statusCode, t }))
        })
        req.on('timeout', () => req.destroy(new Error('plazo')))
        req.on('error', reject)
    })
    return get('api.mojang.com', '/users/profiles/minecraft/' + encodeURIComponent(nick)).then(r => {
        if(r.status === 204 || r.status === 404){ return null }
        if(r.status !== 200){ throw new Error('mojang ' + r.status) }
        const id = JSON.parse(r.t).id
        if(!/^[0-9a-f]{32}$/i.test(id)){ return null }
        return get('sessionserver.mojang.com', '/session/minecraft/profile/' + id).then(p => {
            if(p.status !== 200){ throw new Error('session ' + p.status) }
            const prop = JSON.parse(p.t).properties.find(x => x.name === 'textures')
            const skin = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')).textures.SKIN
            if(skin == null){ return null }
            const url = scSkin$soloMojang(skin.url)
            return url ? { url, fino: !!(skin.metadata && skin.metadata.model === 'slim') } : null
        })
    })
}

// --- Dibujo de la skin -----------------------------------------------------------------------------------
/** Steve aproximado (lo dibujó Codex para la maqueta): la cara por defecto sin pedir nada a internet. */
function scSkin$steve(){
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    const r = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h) }
    const [pelo, piel, camisa, pantalon, zapato] = ['#543a27', '#bd8b6b', '#1e999f', '#3c438a', '#40454d']
    r(0, 0, 64, 64, piel); r(0, 0, 32, 16, pelo); r(8, 8, 8, 8, piel); r(8, 8, 8, 2, pelo); r(8, 10, 1, 1, pelo); r(15, 10, 1, 1, pelo)
    r(9, 12, 2, 1, '#f1eee6'); r(13, 12, 2, 1, '#f1eee6'); r(10, 12, 1, 1, '#5159a2'); r(13, 12, 1, 1, '#34475b'); r(11, 14, 2, 1, '#9e6350')
    r(16, 16, 24, 16, camisa); r(40, 16, 16, 16, camisa); r(44, 25, 4, 7, piel); r(32, 48, 16, 16, camisa); r(36, 57, 4, 7, piel)
    r(0, 16, 16, 16, pantalon); r(4, 29, 4, 3, zapato); r(16, 48, 16, 16, pantalon); r(20, 61, 4, 3, zapato)
    g.clearRect(32, 0, 32, 16); g.clearRect(0, 32, 64, 16); g.clearRect(0, 48, 16, 16); g.clearRect(48, 48, 16, 16)
    return c
}
let scSkin$steveTex = null

/** Vista frontal (16x32) o cara (8x8). Las skins antiguas de 64x32 reflejan brazo y pierna. */
function scSkin$dibujar(canvas, img, fino, cara){
    if(img == null){ img = scSkin$steveTex || (scSkin$steveTex = scSkin$steve()) }
    const g = canvas.getContext('2d')
    canvas.width = cara ? 8 : 16
    canvas.height = cara ? 8 : 32
    g.imageSmoothingEnabled = false
    const p = (sx, sy, w, h, dx, dy) => g.drawImage(img, sx, sy, w, h, dx, dy, w, h)
    if(cara){ p(8, 8, 8, 8, 0, 0); p(40, 8, 8, 8, 0, 0); return }
    const brazo = fino ? 3 : 4, bx = fino ? 1 : 0
    const moderna = (img.naturalHeight || img.height) >= 64
    p(8, 8, 8, 8, 4, 0); p(20, 20, 8, 12, 4, 8); p(44, 20, brazo, 12, bx, 8); p(4, 20, 4, 12, 4, 20)
    if(moderna){
        p(36, 52, brazo, 12, 12, 8); p(20, 52, 4, 12, 8, 20)
    } else {
        g.save(); g.translate(16, 0); g.scale(-1, 1); p(44, 20, brazo, 12, bx, 8); p(4, 20, 4, 12, 4, 20); g.restore()
    }
    p(40, 8, 8, 8, 4, 0)
    if(moderna){ p(20, 36, 8, 12, 4, 8); p(44, 36, brazo, 12, bx, 8); p(52, 52, brazo, 12, 12, 8); p(4, 36, 4, 12, 4, 20); p(4, 52, 4, 12, 8, 20) }
}

const scSkin$imgs = new Map()
/** Carga una textura (URL de Mojang) una vez; null si falla. */
function scSkin$cargar(url){
    if(!url){ return Promise.resolve(null) }
    if(!scSkin$imgs.has(url)){
        scSkin$imgs.set(url, new Promise(resolve => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => { scSkin$imgs.delete(url); resolve(null) }
            img.src = url
        }))
    }
    return scSkin$imgs.get(url)
}

// --- Estado del panel ------------------------------------------------------------------------------------
const scSkin = {
    abierto: false, cuenta: null, origen: null,
    vista: 'link',          // link | edit | status | confirm-remove | confirm-unlink | premium
    // vincular
    codigo: '', linkBusy: false, linkError: null, linkMin: 0,
    // editar
    actualUrl: null, actualImg: null, actualFino: false,
    metodo: 'upload', modelo: 'clasico',
    fichero: null, ficheroError: null, arrastrando: false,
    nick: '', copia: '', copiaRes: null, copiaImg: null, busqueda: 0, temporizador: null,
    aplicarError: null, bloqueadoHasta: 0,
    // espera / resultado
    ocupado: null, estado: null, quitada: false   // ocupado = uuid de la cuenta con un cambio en marcha
}

function scSkin$raiz(){
    let r = document.getElementById('scSkin')
    if(r == null){
        r = document.createElement('div')
        r.id = 'scSkin'
        r.innerHTML = '<div id="scSkinScrim" hidden></div><section id="scSkinPanel" role="dialog" aria-modal="true" aria-labelledby="scSkinTitulo" hidden></section>'
        document.body.appendChild(r)
        r.addEventListener('click', scSkin$clic)
        r.addEventListener('keydown', scSkin$tecla)
        r.addEventListener('input', scSkin$escribir)
        r.addEventListener('change', scSkin$cambio)
        const panel = r.querySelector('#scSkinPanel')
        panel.addEventListener('dragover', e => { if(scSkin.vista === 'edit' && scSkin.metodo === 'upload'){ e.preventDefault(); if(!scSkin.arrastrando){ scSkin.arrastrando = true; scSkin$pintar() } } })
        panel.addEventListener('dragleave', e => { if(e.target.id === 'scSkinDrop' && scSkin.arrastrando){ scSkin.arrastrando = false; scSkin$pintar() } })
        panel.addEventListener('drop', e => {
            e.preventDefault()
            scSkin.arrastrando = false
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
            if(f && scSkin.vista === 'edit'){ scSkin$leerFichero(f) } else { scSkin$pintar() }
        })
    }
    return r
}

// --- Plantillas ------------------------------------------------------------------------------------------
function scSkin$btn(clave, accion, primario = false, deshabilitado = false, extra = ''){
    return `<button type="button" class="btn${primario ? ' primary' : ''} ${extra}" data-accion="${accion}"${deshabilitado ? ' disabled' : ''}>${scSkin$h(clave)}</button>`
}
function scSkin$aviso(clave, tipo = 'error', vars){
    const sim = tipo === 'info' ? 'i' : '!'
    return `<div class="feedback ${tipo === 'error' ? '' : tipo}" role="${tipo === 'error' ? 'alert' : 'status'}"><span class="symbol" aria-hidden="true">${sim}</span><span>${scSkin$h(clave, vars)}</span></div>`
}
function scSkin$cabecera(subtitulo, vars){
    return `<header class="panel-head"><div><h2 id="scSkinTitulo">${scSkin$h('title')}</h2><small>${scSkin$h(subtitulo, vars)}</small></div>${scSkin$btn('close', 'cerrar', false, false, 'close')}</header>`
}
function scSkin$vistaPrevia(cual, etiqueta, pie){
    const n = scSkin$esc(scSkin.cuenta.displayName)
    return `<aside class="preview"><span class="preview-label">${scSkin$h(etiqueta)}</span><div class="preview-stage"><canvas width="16" height="32" data-skin="${cual}" role="img" aria-label="${scSkin$h('account.previewAlt', { name: scSkin.cuenta.displayName })}"></canvas></div><b>${n}</b><small>${scSkin$h(pie)}</small></aside>`
}
function scSkin$cara(cual){
    return `<span class="cara"><canvas data-skin="${cual}" data-cara="1" aria-hidden="true"></canvas></span>`
}

function scSkin$htmlVincular(){
    const e = scSkin.linkError
    const crudo = scSkin.codigo.replace(/[^A-Z0-9]/g, '')
    const bloqueado = e === 'attempts'
    return `${scSkin$cabecera('link.subtitle')}<div class="panel-body"><div class="skin-layout">${scSkin$vistaPrevia('actual', 'editor.current', 'editor.front')}<div class="editor">
<p class="link-intro">${scSkin$h('link.intro')}</p>
<ol class="steps"><li>${scSkin$h('link.step1')}</li><li>${scSkin$h('link.step2')}</li><li>${scSkin$h('link.step3')}</li></ol>
<label class="field-label" for="scSkinCodigo">${scSkin$h('link.label')}</label>
<div class="field-row"><input id="scSkinCodigo" class="input code-input" maxlength="7" autocomplete="off" spellcheck="false" placeholder="${scSkin$h('link.placeholder')}" value="${scSkin$esc(scSkin.codigo)}" aria-describedby="scSkinCodigoAyuda${e ? ' scSkinCodigoError' : ''}" aria-invalid="${!!e && !bloqueado}"${scSkin.linkBusy || bloqueado ? ' disabled' : ''}>${scSkin$btn(scSkin.linkBusy ? 'link.busy' : 'link.action', 'vincular', true, scSkin.linkBusy || bloqueado || crudo.length !== 6)}</div>
<p class="helper" id="scSkinCodigoAyuda">${scSkin$h('link.help')}</p><p class="once">${scSkin$h('link.once')}</p>
${e ? `<div id="scSkinCodigoError">${scSkin$aviso('link.' + e, bloqueado ? 'warning' : 'error', { minutes: scSkin.linkMin })}</div>` : ''}
${scSkin.linkBusy ? `<div class="feedback info" role="status"><span class="spinner" aria-hidden="true"></span><span>${scSkin$h('link.busy')}</span></div>` : ''}
</div></div></div><footer class="panel-foot"><span class="small">${scSkin$h('account.offline')} · ${scSkin$esc(scSkin.cuenta.displayName)}</span>${scSkin$btn('cancel', 'cerrar')}</footer>`
}

function scSkin$htmlModelos(){
    return `<fieldset class="models"><legend>${scSkin$h('upload.model')}</legend>${[['clasico', 'classic', 'classicHelp'], ['fino', 'slim', 'slimHelp']].map(([v, t, a]) =>
        `<label class="model"><input type="radio" name="scSkinModelo" value="${v}"${scSkin.modelo === v ? ' checked' : ''}><canvas width="16" height="32" data-skin="nueva" data-fino="${v === 'fino'}" aria-hidden="true"></canvas><span><b>${scSkin$h('upload.' + t)}</b><small>${scSkin$h('upload.' + a)}</small></span></label>`).join('')}</fieldset>`
}
function scSkin$htmlSubir(){
    const f = scSkin.fichero
    const zona = f
        ? `<div class="file-row"><span><b>${scSkin$esc(f.nombre)}</b><small>${scSkin$h('upload.metadata', { width: f.ancho, height: f.alto, size: f.kb })}</small></span><button type="button" class="text-btn" data-accion="buscar">${scSkin$h('upload.replace')}</button></div>`
        : `<div class="dropzone${scSkin.arrastrando ? ' dragging' : ''}" id="scSkinDrop"><span class="drop-icon" aria-hidden="true">↓</span><strong>${scSkin$h(scSkin.arrastrando ? 'upload.drag' : 'upload.drop')}</strong><small>${scSkin$h('upload.formats')}</small>${scSkin$btn('upload.browse', 'buscar')}</div>`
    return `${zona}<input type="file" id="scSkinFichero" class="file-input" accept=".png,image/png" tabindex="-1" aria-label="${scSkin$h('upload.browse')}">
<p class="privacy">${scSkin$h('upload.privacy')}</p>${scSkin$htmlModelos()}${scSkin.ficheroError ? scSkin$aviso('upload.' + scSkin.ficheroError) : ''}`
}
function scSkin$htmlCopiar(){
    const c = scSkin.copia
    const err = c === 'error' || c === 'network'
    let res = ''
    if(c === 'ready'){
        res = `<div class="result">${scSkin$cara('nueva')}<span><b>${scSkin$h('copy.ready')}</b><small>${scSkin$h('copy.source', { name: scSkin.nick })}</small></span><span style="margin-left:auto;color:#b7e3c8" aria-hidden="true">✓</span></div>`
    } else if(c === 'busy'){
        res = `<div class="feedback info" role="status"><span class="spinner" aria-hidden="true"></span><span>${scSkin$h('copy.loading')}</span></div>`
    } else if(err){
        res = `<div id="scSkinNickError">${scSkin$aviso(c === 'error' ? 'copy.error' : 'copy.network')}</div>${c === 'network' ? scSkin$btn('copy.retry', 'buscarNick') : ''}`
    }
    return `<label class="field-label" for="scSkinNick">${scSkin$h('copy.label')}</label>
<input id="scSkinNick" class="input" maxlength="16" autocomplete="off" spellcheck="false" placeholder="${scSkin$h('copy.placeholder')}" value="${scSkin$esc(scSkin.nick)}" aria-invalid="${err}" aria-describedby="scSkinNickAyuda${err ? ' scSkinNickError' : ''}">
<p class="helper" id="scSkinNickAyuda">${scSkin$h('copy.help')}</p>${res}`
}
const SC_SKIN_ERR_APLICAR = { minute: 'warning', day: 'warning', service: 'warning', server: 'error', session: 'error', format: 'error', copy: 'error' }
function scSkin$hayCandidata(){
    return scSkin.metodo === 'upload' ? scSkin.fichero != null : scSkin.copia === 'ready'
}
function scSkin$htmlEditar(){
    const copia = scSkin.metodo === 'copy'
    const hay = scSkin$hayCandidata()
    const e = scSkin.aplicarError
    const bloqueado = Date.now() < scSkin.bloqueadoHasta
    const textoErr = e === 'format' ? 'upload.formatError' : e === 'copy' ? 'copy.error' : 'apply.' + e
    const accion = e === 'session' ? ['apply.relink', 'revincular'] : (e === 'server' ? ['apply.retry', 'aplicar'] : ['apply.action', 'aplicar'])
    return `${scSkin$cabecera('editor.subtitle', { name: scSkin.cuenta.displayName })}<div class="panel-body"><div class="skin-layout">${scSkin$vistaPrevia(hay ? 'nueva' : 'actual', hay ? 'editor.preview' : 'editor.current', hay ? 'editor.unsaved' : 'editor.linked')}<div class="editor">
<div class="method-tabs" role="tablist" aria-label="${scSkin$h('title')}"><button type="button" class="tab" role="tab" id="scSkinTabSubir" aria-controls="scSkinMetodo" aria-selected="${!copia}" tabindex="${copia ? -1 : 0}" data-accion="tabSubir">${scSkin$h('upload.tab')}</button><button type="button" class="tab" role="tab" id="scSkinTabCopiar" aria-controls="scSkinMetodo" aria-selected="${copia}" tabindex="${copia ? 0 : -1}" data-accion="tabCopiar">${scSkin$h('copy.tab')}</button></div>
<div id="scSkinMetodo" role="tabpanel" aria-labelledby="${copia ? 'scSkinTabCopiar' : 'scSkinTabSubir'}">${copia ? scSkin$htmlCopiar() : scSkin$htmlSubir()}</div>
${e ? scSkin$aviso(textoErr, SC_SKIN_ERR_APLICAR[e]) : ''}
</div></div></div><footer class="panel-foot"><button type="button" class="text-btn" data-accion="desvincular">${scSkin$h('unlink.action')}</button><div class="foot-actions"><button type="button" class="text-btn" data-accion="quitar"${scSkin.actualUrl ? '' : ' disabled'}>${scSkin$h('remove.action')}</button>${scSkin$btn(accion[0], accion[1], true, e === 'session' ? false : (!hay || bloqueado))}</div></footer>`
}
function scSkin$htmlEstado(){
    const ocupado = scSkin.ocupado === scSkin.cuenta.uuid
    const quitada = scSkin.quitada
    const titulo = ocupado ? 'apply.busy' : quitada ? 'remove.success' : 'apply.successTitle'
    const texto = ocupado ? 'apply.wait' : quitada ? 'remove.successBody' : 'apply.success'
    const prev = scSkin$vistaPrevia(ocupado ? (quitada ? 'steve' : 'nueva') : 'actual', ocupado ? 'editor.preview' : 'editor.current', ocupado ? 'editor.unsaved' : 'apply.updated')
    const extra = ocupado
        ? `<div class="progress-track" role="progressbar" aria-label="${scSkin$h('apply.busy')}"><span></span></div><p class="helper">${scSkin$h('apply.waitHelp')}</p><p class="helper">${scSkin$h('apply.busyClose')}</p>`
        : quitada ? '' : `<p class="helper">${scSkin$h('apply.successOffline')}</p>`
    return `${scSkin$cabecera('editor.subtitle', { name: scSkin.cuenta.displayName })}<div class="panel-body"><div class="skin-layout">${prev}<div class="status-hero" role="status"><div class="status-icon" aria-hidden="true">${ocupado ? '<span class="spinner"></span>' : '✓'}</div><h3>${scSkin$h(titulo)}</h3><p>${scSkin$h(texto)}</p>${extra}</div></div></div><footer class="panel-foot"><span class="small">${scSkin$h('editor.linked')}</span>${scSkin$btn(ocupado ? 'close' : 'done', ocupado ? 'cerrar' : 'hecho', !ocupado)}</footer>`
}
function scSkin$htmlConfirmar(){
    const quitar = scSkin.vista === 'confirm-remove'
    return `<header class="panel-head"><div class="notice-heading"><div class="status-icon" aria-hidden="true">!</div><div><small>${scSkin$h('common.attention')}</small><h2 id="scSkinTitulo">${scSkin$h(quitar ? 'remove.title' : 'unlink.title')}</h2></div></div></header>
<div class="panel-body notice-content"><p>${scSkin$h(quitar ? 'remove.body' : 'unlink.body')}</p>${quitar ? '' : `<p class="small">${scSkin$h('unlink.other')}</p>`}
<div class="notice-profile">${scSkin$cara(quitar ? 'steve' : 'actual')}<span><b>${scSkin$esc(scSkin.cuenta.displayName)}</b><small>${scSkin$h(quitar ? 'account.fallback' : 'account.offline')}</small></span></div>
${scSkin.aplicarError ? scSkin$aviso('apply.' + scSkin.aplicarError, SC_SKIN_ERR_APLICAR[scSkin.aplicarError]) : ''}</div>
<footer class="panel-foot">${scSkin$btn('cancel', 'cancelarConfirmar')} ${scSkin$btn(quitar ? 'remove.confirm' : 'unlink.confirm', quitar ? 'confirmarQuitar' : 'confirmarDesvincular', true)}</footer>`
}
function scSkin$htmlPremium(){
    return `<header class="panel-head"><div><h2 id="scSkinTitulo">${scSkin$h('title')}</h2><small>${scSkin$esc(scSkin.cuenta.displayName)} · ${scSkin$h('account.premium')}</small></div>${scSkin$btn('close', 'cerrar', false, false, 'close')}</header>
<div class="panel-body notice-content"><div class="notice-heading"><div class="status-icon" aria-hidden="true">i</div><p>${scSkin$h('premium.body')}</p></div>
<div class="notice-profile">${scSkin$cara('actual')}<span><b>${scSkin$esc(scSkin.cuenta.displayName)}</b><small>${scSkin$h('premium.subtitle')}</small></span></div><p class="helper">${scSkin$h('premium.help')}</p></div>
<footer class="panel-foot"><span></span><button type="button" class="btn primary" data-accion="minecraftNet">${scSkin$h('premium.link')}</button></footer>`
}

// --- Pintar ------------------------------------------------------------------------------------------------
function scSkin$pintar(foco){
    const panel = document.getElementById('scSkinPanel')
    if(panel == null || !scSkin.abierto){ return }
    // Conserva el foco y el cursor del campo que se está escribiendo (el diseño lo pide al buscar un nick).
    const activo = document.activeElement
    const idActivo = activo && panel.contains(activo) ? activo.id : null
    const cursor = idActivo && activo.selectionStart != null ? activo.selectionStart : null
    const v = scSkin.vista
    panel.className = (v === 'premium' || v.startsWith('confirm')) ? 'compacto' + (v.startsWith('confirm') ? ' atencion' : '') : ''
    panel.innerHTML = v === 'link' ? scSkin$htmlVincular() : v === 'edit' ? scSkin$htmlEditar() : v === 'status' ? scSkin$htmlEstado()
        : v === 'premium' ? scSkin$htmlPremium() : scSkin$htmlConfirmar()
    panel.querySelectorAll('canvas[data-skin]').forEach(c => {
        const cual = c.dataset.skin
        const img = cual === 'nueva' ? (scSkin.metodo === 'copy' ? scSkin.copiaImg : (scSkin.fichero && scSkin.fichero.img))
            : cual === 'steve' ? null : scSkin.actualImg
        const fino = c.dataset.fino != null ? c.dataset.fino === 'true'
            : cual === 'nueva' ? (scSkin.metodo === 'copy' ? !!(scSkin.copiaRes && scSkin.copiaRes.fino) : scSkin.modelo === 'fino')
                : cual === 'actual' ? scSkin.actualFino : false
        scSkin$dibujar(c, img || (cual === 'nueva' ? scSkin.actualImg : null), fino, c.dataset.cara === '1')
    })
    if(idActivo && document.getElementById(idActivo) && !foco){
        const el = document.getElementById(idActivo)
        el.focus({ preventScroll: true })
        if(cursor != null && el.setSelectionRange){ try { el.setSelectionRange(cursor, cursor) } catch(e){ /* radio */ } }
    } else if(foco){
        const destino = v === 'link' ? panel.querySelector('#scSkinCodigo:not(:disabled)') : v.startsWith('confirm') ? panel.querySelector('[data-accion="cancelarConfirmar"]') : null
        ;(destino || panel.querySelector('[data-accion="cerrar"]') || panel.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true })
    }
}

// --- Abrir y cerrar --------------------------------------------------------------------------------------------
/** Abre el panel para la cuenta seleccionada. */
async function scSkinAbrir(){
    const cuenta = ConfigManager.getSelectedAccount()
    if(cuenta == null){ return }
    scSkin$raiz()
    const otraCuenta = scSkin.cuenta == null || scSkin.cuenta.uuid !== cuenta.uuid
    scSkin.cuenta = cuenta
    scSkin.origen = document.activeElement
    scSkin.abierto = true
    if(otraCuenta){
        // Otra cuenta empieza limpia aunque la anterior tenga un cambio en marcha: nada de A se ve bajo B.
        scSkin.busqueda++
        Object.assign(scSkin, { codigo: '', linkBusy: false, linkError: null, fichero: null, ficheroError: null, nick: '', copia: '', copiaRes: null, copiaImg: null, aplicarError: null, metodo: 'upload', modelo: 'clasico', actualUrl: null, actualImg: null, actualFino: false, bloqueadoHasta: 0 })
    }
    const premium = cuenta.type === 'microsoft'
    scSkin.vista = scSkin.ocupado === cuenta.uuid ? 'status' : premium ? 'premium' : scSkin$token(cuenta) ? 'edit' : 'link'
    document.getElementById('scSkinScrim').hidden = false
    document.getElementById('scSkinPanel').hidden = false
    const main = document.getElementById('main')
    if(main){ main.inert = true }
    scSkin$pintar(true)
    // Skin actual: la premium de Mojang o la del servidor.
    const url = premium ? await scSkinPremium(cuenta.uuid) : await scSkinServidor(cuenta.displayName)
    if(!scSkin$esActual(cuenta)){ return }
    const img = await scSkin$cargar(url)
    if(!scSkin$esActual(cuenta)){ return }
    scSkin.actualUrl = url
    scSkin.actualImg = img
    scSkin$pintar()
    if(!premium && scSkin.vista === 'edit'){ scSkin$comprobarToken(cuenta) }
}

/** Si el PC se desvinculó desde el juego, vuelve a pedir el código en vez de fallar al aplicar. */
function scSkin$comprobarToken(cuenta){
    const t = scSkin$token(cuenta)
    if(!t){ return }
    scSkin$api('/yo', { token: t }).then(r => {
        // Solo si el token guardado sigue siendo el consultado: si entretanto se revinculó, el nuevo vale.
        if(r.status !== 401 || scSkin$token(cuenta) !== t){ return }
        scSkin$borrarToken(cuenta)
        if(scSkin$esActual(cuenta) && scSkin.vista === 'edit' && scSkin.ocupado !== cuenta.uuid){ scSkin.aplicarError = 'session'; scSkin$pintar() }
    })
}

function scSkinCerrar(){
    if(!scSkin.abierto){ return }
    if(scSkin.vista.startsWith('confirm')){ scSkin.vista = 'edit'; scSkin.aplicarError = null; return scSkin$pintar(true) }
    scSkin.abierto = false
    clearTimeout(scSkin.temporizador)
    document.getElementById('scSkinScrim').hidden = true
    const panel = document.getElementById('scSkinPanel')
    panel.hidden = true
    panel.innerHTML = ''
    const main = document.getElementById('main')
    if(main){ main.inert = false }
    const o = scSkin.origen
    ;(o && o.isConnected ? o : document.getElementById('avatarOverlay'))?.focus({ preventScroll: true })
}

// --- Acciones -------------------------------------------------------------------------------------------------
function scSkin$clic(e){
    if(e.target.id === 'scSkinScrim'){ return scSkinCerrar() }
    const b = e.target.closest('[data-accion]')
    if(b == null || b.disabled){ return }
    const a = b.dataset.accion
    if(a === 'cerrar'){ return scSkinCerrar() }
    if(a === 'hecho'){ scSkin.vista = 'edit'; return scSkinCerrar() }
    if(a === 'vincular'){ return scSkin$vincular() }
    if(a === 'buscar'){ return document.getElementById('scSkinFichero')?.click() }
    if(a === 'tabSubir' || a === 'tabCopiar'){
        scSkin.metodo = a === 'tabSubir' ? 'upload' : 'copy'
        scSkin.aplicarError = null
        scSkin$pintar()
        return document.getElementById(a === 'tabSubir' ? 'scSkinTabSubir' : 'scSkinTabCopiar')?.focus()
    }
    if(a === 'buscarNick'){ return scSkin$buscarNick() }
    if(a === 'aplicar'){ return scSkin$aplicar(false) }
    if(a === 'revincular'){ scSkin.vista = 'link'; scSkin.aplicarError = null; scSkin.codigo = ''; scSkin.linkError = null; return scSkin$pintar(true) }
    if(a === 'quitar'){ scSkin.vista = 'confirm-remove'; scSkin.aplicarError = null; return scSkin$pintar(true) }
    if(a === 'desvincular'){ scSkin.vista = 'confirm-unlink'; scSkin.aplicarError = null; return scSkin$pintar(true) }
    if(a === 'cancelarConfirmar'){ scSkin.vista = 'edit'; scSkin.aplicarError = null; return scSkin$pintar(true) }
    if(a === 'confirmarQuitar'){ return scSkin$aplicar(true) }
    if(a === 'confirmarDesvincular'){ return scSkin$desvincular() }
    if(a === 'minecraftNet'){ return require('electron').shell.openExternal('https://www.minecraft.net/msaprofile/mygames/editskin') }
}

function scSkin$tecla(e){
    if(e.key === 'Escape'){ e.preventDefault(); return scSkinCerrar() }
    if(e.key === 'Enter' && e.target.id === 'scSkinCodigo'){ e.preventDefault(); return scSkin$vincular() }
    if(e.key === 'Enter' && e.target.id === 'scSkinNick'){ e.preventDefault(); return scSkin$buscarNick() }
    if(e.target.getAttribute && e.target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)){
        e.preventDefault()
        // Solo hay dos pestañas: las flechas alternan, Inicio va a la primera y Fin a la última.
        scSkin.metodo = e.key === 'Home' ? 'upload' : e.key === 'End' ? 'copy' : (scSkin.metodo === 'upload' ? 'copy' : 'upload')
        scSkin.aplicarError = null
        scSkin$pintar()
        return document.getElementById(scSkin.metodo === 'upload' ? 'scSkinTabSubir' : 'scSkinTabCopiar')?.focus()
    }
    if(e.key === 'Tab'){
        // Foco atrapado dentro del panel mientras está abierto.
        const f = [...document.getElementById('scSkinPanel').querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=file]),a[href]')].filter(x => x.offsetParent !== null && x.tabIndex !== -1)
        if(f.length === 0){ return }
        if(e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length - 1].focus() }
        else if(!e.shiftKey && document.activeElement === f[f.length - 1]){ e.preventDefault(); f[0].focus() }
    }
}

function scSkin$escribir(e){
    if(e.target.id === 'scSkinCodigo'){
        const el = e.target
        const crudo = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
        const pos = el.selectionStart, antes = el.value.length
        el.value = crudo.slice(0, 3) + (crudo.length > 3 ? '-' + crudo.slice(3) : '')
        const p = Math.max(0, pos + (el.value.length - antes))
        el.setSelectionRange(p, p)
        scSkin.codigo = el.value
        el.setAttribute('aria-invalid', 'false')
        const b = document.querySelector('#scSkinPanel [data-accion="vincular"]')
        if(b){ b.disabled = scSkin.linkBusy || crudo.length !== 6 }
    } else if(e.target.id === 'scSkinNick'){
        scSkin.nick = e.target.value.trim()
        // Al cambiar el nombre, Aplicar se apaga al momento: nunca se aplica la búsqueda anterior.
        scSkin.copia = ''
        scSkin.copiaRes = null
        scSkin.copiaImg = null
        scSkin.aplicarError = null
        const b = document.querySelector('#scSkinPanel [data-accion="aplicar"]')
        if(b){ b.disabled = true }
        clearTimeout(scSkin.temporizador)
        scSkin.busqueda++
        if(scSkin.nick.length >= 3){ scSkin.temporizador = setTimeout(scSkin$buscarNick, 450) }
    }
}

function scSkin$cambio(e){
    if(e.target.id === 'scSkinFichero'){
        const f = e.target.files && e.target.files[0]
        if(f){ scSkin$leerFichero(f) }
    } else if(e.target.name === 'scSkinModelo'){
        scSkin.modelo = e.target.value
        scSkin$pintar()
        document.querySelector(`#scSkinPanel input[name=scSkinModelo][value=${scSkin.modelo}]`)?.focus()
    }
}

/** Validación local (el servidor repite toda): peso, PNG real que se decodifica, 64x64 o 64x32. */
async function scSkin$leerFichero(f){
    const gen = ++scSkin.busqueda
    scSkin.aplicarError = null
    // Elegir otro fichero descarta el anterior al momento: si el nuevo no vale, no se puede subir el viejo.
    scSkin.fichero = null
    const fallo = (clave) => { scSkin.ficheroError = clave; scSkin$pintar() }
    if(f.size > SC_SKIN_MAX_PNG){ return fallo('weightError') }
    const bytes = new Uint8Array(await f.arrayBuffer())
    if(gen !== scSkin.busqueda){ return }
    if(![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)){ return fallo('formatError') }
    // data: y no createObjectURL: en esta ventana el URL global es el de Node (no lo tiene). Como mucho 24 KB.
    const img = new Image()
    img.src = 'data:image/png;base64,' + Buffer.from(bytes).toString('base64')
    try {
        await img.decode()
        if(gen !== scSkin.busqueda){ return }
        if(img.naturalWidth !== 64 || ![32, 64].includes(img.naturalHeight)){ return fallo('sizeError') }
        scSkin.fichero = { img, bytes: Buffer.from(bytes), nombre: f.name, ancho: img.naturalWidth, alto: img.naturalHeight, kb: (f.size / 1024).toFixed(1).replace('.', ',') }
        scSkin.ficheroError = null
        scSkin$pintar()
    } catch(err){
        if(gen === scSkin.busqueda){ fallo('formatError') }
    }
}

async function scSkin$buscarNick(){
    clearTimeout(scSkin.temporizador)
    const nick = scSkin.nick
    if(!/^[A-Za-z0-9_]{3,16}$/.test(nick)){
        scSkin.copia = nick ? 'error' : ''
        return scSkin$pintar()
    }
    const gen = ++scSkin.busqueda
    scSkin.copia = 'busy'
    scSkin$pintar()
    try {
        const r = await scSkin$premium(nick)
        if(gen !== scSkin.busqueda){ return }
        const img = r ? await scSkin$cargar(r.url) : null
        if(gen !== scSkin.busqueda){ return }
        scSkin.copiaRes = r && img ? r : null
        scSkin.copiaImg = img
        scSkin.copia = r && img ? 'ready' : 'error'
    } catch(e){
        if(gen !== scSkin.busqueda){ return }
        scSkin.copia = 'network'
    }
    scSkin$pintar()
}

async function scSkin$vincular(){
    const crudo = scSkin.codigo.replace(/[^A-Z0-9]/g, '')
    if(crudo.length !== 6 || scSkin.linkBusy){ return }
    const cuenta = scSkin.cuenta
    scSkin.linkBusy = true
    scSkin.linkError = null
    scSkin$pintar()
    const r = await scSkin$api('/vincular', { metodo: 'POST', json: { nombre: cuenta.displayName, codigo: crudo } })
    if(scSkin$esActual(cuenta)){ scSkin.linkBusy = false }
    if(r.status === 200 && r.data.ok && r.data.token){
        // Si la cuenta se quitó del launcher mientras tanto, el token nuevo no se guarda y se revoca.
        if(!scSkin$existe(cuenta)){
            scSkin$api('/desvincular', { metodo: 'POST', token: r.data.token })
            return
        }
        scSkin$guardarToken(cuenta, r.data.token)
        // Vinculada: la sugerencia de vincular ya no vuelve para esta cuenta.
        if(typeof scCerrarAviso === 'function'){ scCerrarAviso(SC_SKIN_AVISO) }
        if(!scSkin$esActual(cuenta)){ return }
        scSkin.codigo = ''
        scSkin.vista = 'edit'
        scSkin.aplicarError = null
        return scSkin$pintar(true)
    }
    if(!scSkin$esActual(cuenta)){ return }
    if(r.status === 429){
        scSkin.linkError = 'attempts'
        scSkin.linkMin = Math.max(1, Math.ceil((r.espera || 600) / 60))
        // Pasada la espera se puede volver a intentar sin cerrar el panel.
        setTimeout(() => { if(scSkin.linkError === 'attempts'){ scSkin.linkError = null; scSkin$pintar() } }, (r.espera || 600) * 1000)
    } else if(r.status === 0 || r.status >= 500){
        scSkin.linkError = 'network'
    } else {
        scSkin.linkError = r.data.error === 'codigo_caducado' || r.data.error === 'codigo_agotado' ? 'expired' : 'invalid'
    }
    scSkin$pintar(true)
}

/** Traduce la respuesta del servidor a un aviso del editor. */
function scSkin$errorDe(r){
    const e = r.data.error
    if(r.status === 401){ return 'session' }
    if(e === 'espera_minuto'){ return 'minute' }
    if(e === 'limite_dia'){ return 'day' }
    if(e === 'ocupado' || e === 'servidor_no_listo' || e === 'mineskin_rechaza'){ return 'service' }
    if(e === 'premium_no_existe'){ return 'copy' }
    if(e === 'png_medida' || e === 'png_grande' || e === 'no_es_png' || e === 'png_vacio'){ return 'format' }
    return 'server'
}

/** Aplica la skin elegida (o la quita). Sigue aunque se cierre el panel; el éxito llega solo con la respuesta del servidor. */
async function scSkin$aplicar(quitar){
    if(scSkin.ocupado){ return }
    const cuenta = scSkin.cuenta
    const token = scSkin$token(cuenta)
    if(!token){ scSkin.aplicarError = 'session'; scSkin.vista = 'edit'; return scSkin$pintar() }
    let peticion
    if(quitar){
        peticion = scSkin$api('/quitar', { metodo: 'POST', token })
    } else if(scSkin.metodo === 'upload' && scSkin.fichero){
        peticion = scSkin$api('/subir', { metodo: 'POST', token, png: scSkin.fichero.bytes, query: '?modelo=' + (scSkin.modelo === 'fino' ? 'fino' : 'clasico'), plazo: 45000 })
    } else if(scSkin.metodo === 'copy' && scSkin.copia === 'ready'){
        peticion = scSkin$api('/copiar', { metodo: 'POST', token, json: { nick: scSkin.nick } })
    } else {
        return
    }
    // Lo que se aplica se fija ahora: si entretanto se abre otra cuenta, su panel empieza limpio.
    const fino = quitar ? false : (scSkin.metodo === 'copy' ? !!(scSkin.copiaRes && scSkin.copiaRes.fino) : scSkin.modelo === 'fino')
    scSkin.ocupado = cuenta.uuid
    scSkin.quitada = quitar
    scSkin.aplicarError = null
    scSkin.vista = 'status'
    scSkin$pintar(true)
    let r
    try {
        r = await peticion
    } finally {
        scSkin.ocupado = null
    }
    if(r.status === 200 && r.data.ok){
        const url = r.data.url ? scSkin$soloMojang(r.data.url) : null
        scSkin$cacheCara(cuenta.displayName, url)
        const img = await scSkin$cargar(url)
        if(scSkin$esActual(cuenta)){
            Object.assign(scSkin, { actualUrl: url, actualImg: img, actualFino: fino, fichero: null, copia: '', copiaRes: null, copiaImg: null, nick: '', vista: 'status' })
        }
        // Las dos cabezas se actualizan ya, sin esperar a la caché de 10 minutos.
        const sel = ConfigManager.getSelectedAccount()
        if(sel && sel.uuid === cuenta.uuid && typeof updateSelectedAccount === 'function'){ updateSelectedAccount(sel) }
    } else {
        const err = scSkin$errorDe(r)
        if(err === 'session' && scSkin$token(cuenta) === token){ scSkin$borrarToken(cuenta) }
        if(!scSkin$esActual(cuenta)){ return }
        if((err === 'minute' || err === 'day') && r.espera){
            scSkin.bloqueadoHasta = Date.now() + r.espera * 1000
            setTimeout(() => { if(scSkin.abierto && scSkin$esActual(cuenta) && scSkin.vista === 'edit'){ scSkin.aplicarError = null; scSkin$pintar() } }, r.espera * 1000 + 200)
        }
        scSkin.aplicarError = err
        scSkin.vista = quitar && err !== 'session' ? 'confirm-remove' : 'edit'
    }
    if(scSkin.abierto && scSkin$esActual(cuenta)){ scSkin$pintar(true) }
}

async function scSkin$desvincular(){
    const cuenta = scSkin.cuenta
    const token = scSkin$token(cuenta)
    if(token){
        const r = await scSkin$api('/desvincular', { metodo: 'POST', token })
        // Si el servidor no confirma, el PC sigue vinculado: no se finge (diseño, «Quitar y desvincular»).
        if(r.status !== 200){
            if(scSkin$esActual(cuenta)){ scSkin.aplicarError = 'server'; scSkin$pintar(true) }
            return
        }
    }
    if(scSkin$token(cuenta) === token){ scSkin$borrarToken(cuenta) }
    // La respuesta de A nunca cambia el panel si ahora se está viendo B.
    if(!scSkin$esActual(cuenta)){ return }
    Object.assign(scSkin, { vista: 'link', codigo: '', linkError: null, aplicarError: null, fichero: null, copia: '', nick: '' })
    scSkin$pintar(true)
}

/** Al quitar una cuenta del launcher: desvincula este PC en el servidor (sin esperar) y olvida su token. */
function scSkinOlvidar(uuid){
    const cuenta = { uuid }
    const token = scSkin$token(cuenta)
    if(token){ scSkin$api('/desvincular', { metodo: 'POST', token }) }
    scSkin$borrarToken(cuenta)
}

// --- Sugerencia de vincular (Felix, 18-10-2026) -----------------------------------------------------------------
// Diseño: diseno-v7-skin/aviso/ESPECIFICACION.md (texto A). Regla de Felix: sale al abrir el launcher; si se cierra,
// vuelve a los 3 días, y así cada 3 días hasta que la cuenta se vincule. Vinculada, no sale más. Por cuenta.
// Reutiliza el aviso de abajo de avisos.js (scMostrarAviso); solo se enseña con la ventana delante para que no salte
// también una notificación de Windows, y nunca encima de otro aviso, de un modal o con el juego abierto.
const SC_SKIN_AVISO = 'vincularSkin'
const SC_SKIN_AVISO_CADA = 3 * 24 * 3600 * 1000
let scSkin$avisoIntentos = 0

function scSkin$avisoCerradoEn(uuid){ try { return Number(localStorage.getItem('scSkinAvisoCerrado:' + uuid)) || 0 } catch(e){ return 0 } }
function scSkin$apuntarAvisoCerrado(uuid){ try { localStorage.setItem('scSkinAvisoCerrado:' + uuid, String(Date.now())) } catch(e){ /* nada */ } }

/** Si toca, enseña la sugerencia; si todavía no se puede (modal, otro aviso…), lo reintenta un rato. */
function scSkin$sugerirVincular(){
    const cuenta = ConfigManager.getSelectedAccount()
    if(cuenta == null || cuenta.type === 'microsoft' || scSkin$token(cuenta)){ return }
    if(Date.now() - scSkin$avisoCerradoEn(cuenta.uuid) < SC_SKIN_AVISO_CADA){ return }
    const puede = typeof scMostrarAviso === 'function' && typeof scAvisoClave !== 'undefined' && scAvisoClave == null
        && typeof getCurrentView === 'function' && getCurrentView() === VIEWS.landing
        && !(typeof isOverlayVisible === 'function' && isOverlayVisible()) && !scSkin.abierto
        && !(typeof scJugandoAhora === 'function' && scJugandoAhora())
        && (typeof scVentanaAtendida !== 'function' || scVentanaAtendida())
    if(!puede){
        // Durante los primeros ~2 minutos tras abrir; si no hay hueco, ya saldrá la próxima vez que se abra.
        if(++scSkin$avisoIntentos < 24){ setTimeout(scSkin$sugerirVincular, 5000) }
        return
    }
    scMostrarAviso({
        clave: SC_SKIN_AVISO,
        kicker: scSkin$t('aviso.kicker'),
        titulo: scSkin$t('aviso.title'),
        texto: scSkin$t('aviso.text'),
        accion: scSkin$t('aviso.action'),
        alPulsar: () => {
            scSkin$apuntarAvisoCerrado(cuenta.uuid)
            scCerrarAviso(SC_SKIN_AVISO)
            scSkinAbrir()
        }
    })
    // La X del aviso es común a todos: solo cuenta como «cerrado» si en ese momento el aviso era este.
    const caja = document.getElementById('scAvisoUpd')
    const x = caja && caja.querySelector('.scAvisoCerrar')
    if(x && !x.dataset.scSkin){
        x.dataset.scSkin = '1'
        x.addEventListener('click', () => {
            if(caja.dataset.clave === SC_SKIN_AVISO){
                const c = ConfigManager.getSelectedAccount()
                if(c){ scSkin$apuntarAvisoCerrado(c.uuid) }
            }
        }, true)
    }
}

// --- Enganche con la portada ----------------------------------------------------------------------------------
;(function scSkin$iniciar(){
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = './assets/css/scskin.css'
    document.head.appendChild(css)
    // La cabeza y la píldora de cuenta abren «Cambiar skin» (diseño v7). Las cuentas se siguen gestionando
    // desde Ajustes → Cuenta.
    const abrir = e => { e.preventDefault(); e.stopImmediatePropagation(); scSkinAbrir() }
    const overlay = document.getElementById('avatarOverlay')
    const chip = document.getElementById('user_content')
    if(overlay){ overlay.onclick = null; overlay.addEventListener('click', abrir, true) }
    if(chip){ chip.addEventListener('click', abrir, true) }
    // Quitar una cuenta del launcher (por cualquier camino: Ajustes, cierre de sesión de Microsoft…) también
    // desvincula este PC para esa cuenta. Se engancha aquí para no tocar settings.js ni authmanager.js.
    const quitarCuenta = ConfigManager.removeAuthAccount
    ConfigManager.removeAuthAccount = function(uuid){
        try { scSkinOlvidar(uuid) } catch(e){ /* nunca bloquea quitar la cuenta */ }
        return quitarCuenta.apply(this, arguments)
    }
    // landing.js ya pintó la cabeza antes de que este fichero existiera: repintar con la del servidor.
    if(typeof updateSelectedAccount === 'function'){ updateSelectedAccount(ConfigManager.getSelectedAccount()) }
    // Unos segundos después de abrir, cuando la portada ya está a la vista.
    setTimeout(scSkin$sugerirVincular, 6000)
})()
