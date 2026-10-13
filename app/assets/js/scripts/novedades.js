/**
 * Modpack changes and screenshot gallery (1.12.0).
 *
 * Modpack changes need nobody to write a changelog: the launcher keeps a
 * snapshot of the selected profile's modules (mods with their version, the
 * resource pack, emotes, configs) and, when the distribution changes,
 * records what was added, updated or removed. The landing card points at it
 * for 14 days and the news view has a "Cambios del modpack" tab.
 *
 * The gallery lists the profile's screenshots (instances/<perfil>/screenshots),
 * newest first, with thumbnails made by Windows (nativeImage thumbnails, so
 * no full-size image is decoded for the grid).
 */
const SC_MODPACK_RECIENTE = 14 * 86400000
const SC_GALERIA_MAX = 60

/* ---- Modpack snapshot and diff --------------------------------------------- */

/** "group:artifact:version@ext" -> {clave: "group:artifact", version}. */
function scPartirId(id){
    const sinExt = String(id).split('@')[0]
    const partes = sinExt.split(':')
    if(partes.length >= 3){
        return { clave: partes.slice(0, 2).join(':'), version: partes.slice(2).join(':') }
    }
    return { clave: sinExt, version: '' }
}

/** Flat snapshot: mods by key with version, files by path with MD5. */
function scFoto(serv){
    const mods = {}
    const ficheros = {}
    const recorrer = lista => {
        for(const m of lista || []){
            const raw = m.rawModule || m
            if(raw.type === 'File'){
                const ruta = raw.artifact?.path || raw.id
                ficheros[ruta] = { md5: raw.artifact?.MD5 || '', nombre: raw.name || ruta }
            } else if(raw.type === 'FabricMod' || raw.type === 'ForgeMod' || raw.type === 'LiteMod' || raw.type === 'Library'){
                const { clave, version } = scPartirId(raw.id)
                mods[clave] = { version, nombre: raw.name || clave }
            }
            recorrer(m.subModules || raw.subModules)
        }
    }
    recorrer(serv.rawServer.modules)
    return { version: serv.rawServer.version, mods, ficheros }
}

/** Human list of changes between two snapshots. */
function scDiferencias(antes, ahora){
    const cambios = []
    const nombres = []
    for(const [k, m] of Object.entries(ahora.mods)){
        const v = antes.mods[k]
        if(v == null){
            cambios.push({ tipo: 'nuevo', texto: Lang.queryJS('landing.sc2.modpackAdded', { nombre: m.nombre }) })
            nombres.push(m.nombre)
        } else if(v.version !== m.version){
            cambios.push({ tipo: 'actualizado', texto: Lang.queryJS('landing.sc2.modpackUpdated', { nombre: m.nombre, de: v.version, a: m.version }) })
            nombres.push(m.nombre)
        }
    }
    for(const [k, m] of Object.entries(antes.mods)){
        if(ahora.mods[k] == null){
            cambios.push({ tipo: 'quitado', texto: Lang.queryJS('landing.sc2.modpackRemoved', { nombre: m.nombre }) })
        }
    }
    const nModsActualizados = cambios.filter(c => c.tipo === 'actualizado').length
    let pack = false
    let shaders = false
    let emotesNuevos = 0
    let emotesCambiados = 0
    let config = 0
    let otros = 0
    for(const [ruta, f] of Object.entries(ahora.ficheros)){
        const v = antes.ficheros[ruta]
        if(v != null && v.md5 === f.md5){
            continue
        }
        if(ruta.startsWith('resourcepacks/')){
            pack = true
        } else if(ruta.startsWith('shaderpacks/')){
            shaders = true
        } else if(ruta.startsWith('emotes/')){
            if(ruta.endsWith('.emotecraft')){
                if(v == null){
                    emotesNuevos++
                } else {
                    emotesCambiados++
                }
            }
        } else if(ruta.startsWith('config/') || ruta === 'options.txt' || ruta === 'servers.dat'){
            config++
        } else {
            otros++
        }
    }
    let quitados = 0
    for(const ruta of Object.keys(antes.ficheros)){
        if(ahora.ficheros[ruta] == null){
            if(ruta.startsWith('resourcepacks/')){
                pack = true
            } else if(ruta.startsWith('emotes/') && ruta.endsWith('.emotecraft')){
                emotesCambiados++
            } else if(!ruta.startsWith('emotes/')){
                quitados++
            }
        }
    }
    if(quitados > 0){
        otros += quitados
    }
    if(pack){
        cambios.unshift({ tipo: 'pack', texto: Lang.queryJS('landing.sc2.modpackPack') })
    }
    if(shaders){
        cambios.push({ tipo: 'otro', texto: Lang.queryJS('landing.sc2.modpackShaders') })
    }
    if(emotesNuevos > 0){
        cambios.push({ tipo: 'nuevo', texto: emotesNuevos === 1 ? Lang.queryJS('landing.sc2.modpackEmotesOne') : Lang.queryJS('landing.sc2.modpackEmotesNew', { n: emotesNuevos }) })
    }
    if(emotesCambiados > 0){
        cambios.push({ tipo: 'otro', texto: Lang.queryJS('landing.sc2.modpackEmotesChanged', { n: emotesCambiados }) })
    }
    if(config > 0){
        cambios.push({ tipo: 'otro', texto: Lang.queryJS('landing.sc2.modpackConfig', { n: config }) })
    }
    if(otros > 0){
        cambios.push({ tipo: 'otro', texto: Lang.queryJS('landing.sc2.modpackOther', { n: otros }) })
    }
    // One line for the landing card.
    let resumen = null
    if(nModsActualizados > 1){
        resumen = Lang.queryJS('landing.sc2.modpackSummaryMods', { n: nModsActualizados })
    } else if(pack){
        resumen = Lang.queryJS('landing.sc2.modpackPack')
    } else if(cambios.length > 0){
        resumen = nModsActualizados === 1 ? Lang.queryJS('landing.sc2.modpackSummaryOne') : cambios[0].texto
    }
    return { cambios, resumen }
}

function scLeerJson(clave){
    try {
        return JSON.parse(localStorage.getItem(clave) || 'null')
    } catch(_e){
        return null
    }
}

function scGuardarJson(clave, valor){
    try {
        localStorage.setItem(clave, JSON.stringify(valor))
    } catch(e){
        loggerLanding.warn('No se pudo guardar la foto del modpack', e)
    }
}

/**
 * Compares the selected profile with its last snapshot and records the
 * changes. The first time there is nothing to compare: it only takes the photo.
 */
async function scRevisarModpack(){
    try {
        const sel = ConfigManager.getSelectedServer()
        const serv = (await DistroAPI.getDistribution()).getServerById(sel)
        if(serv == null){
            return
        }
        const ahora = scFoto(serv)
        const antes = scLeerJson('scModpackFoto:' + sel)
        if(antes != null && antes.mods != null){
            const { cambios, resumen } = scDiferencias(antes, ahora)
            if(cambios.length > 0){
                scGuardarJson('scModpackCambios:' + sel, { fecha: Date.now(), version: ahora.version, cambios, resumen, perfil: serv.rawServer.name })
                loggerLanding.info(`Modpack ${sel}: ${cambios.length} cambios registrados.`)
            }
        }
        scGuardarJson('scModpackFoto:' + sel, ahora)
        scPintarTarjetaNovedades()
        scPintarModpack()
    } catch(e){
        loggerLanding.warn('No se pudieron revisar los cambios del modpack', e)
    }
}

function scCambiosRecientes(){
    const reg = scLeerJson('scModpackCambios:' + ConfigManager.getSelectedServer())
    return reg != null && Date.now() - reg.fecha < SC_MODPACK_RECIENTE ? reg : null
}

/** Landing card: modpack changes for 14 days, otherwise the server news. */
function scPintarTarjetaNovedades(){
    const card = document.getElementById('sc2NewsCard')
    const reg = scCambiosRecientes()
    card.querySelector('.sc2CardKicker').textContent = reg ? Lang.queryJS('landing.sc2.modpackKicker') : Lang.queryEJS('landing.sc2.newsKicker')
    card.querySelector('.sc2CardTitle').textContent = reg ? reg.resumen : Lang.queryEJS('landing.sc2.newsTitle')
    card.querySelector('.sc2CardSub').textContent = reg ? Lang.queryJS('landing.sc2.modpackSee') : Lang.queryEJS('landing.sc2.newsSub')
    card.toggleAttribute('data-modpack', reg != null)
}

function scPintarModpack(){
    const sel = ConfigManager.getSelectedServer()
    const reg = scLeerJson('scModpackCambios:' + sel)
    const lista = document.getElementById('sc2ModpackLista')
    lista.replaceChildren()
    const perfil = reg?.perfil || DistroAPI.distribution?.getServerById(sel)?.rawServer?.name || ''
    document.getElementById('sc2ModpackTitulo').textContent = Lang.queryJS('landing.sc2.modpackTitle', { perfil })
    if(reg == null){
        document.getElementById('sc2ModpackFecha').textContent = ''
        const p = document.createElement('p')
        p.className = 'sc2CalMsg'
        p.textContent = Lang.queryJS('landing.sc2.modpackNone')
        lista.append(p)
        return
    }
    document.getElementById('sc2ModpackFecha').textContent = Lang.queryJS('landing.sc2.modpackDate', {
        fecha: new Date(reg.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) })
    for(const c of reg.cambios){
        const fila = document.createElement('div')
        fila.className = 'sc2ModpackItem sc2Mp-' + c.tipo
        fila.textContent = c.texto
        lista.append(fila)
    }
}

function scVerModpack(si){
    document.getElementById('sc2NewsFrame').classList.toggle('sc2VerModpack', si)
    document.getElementById('sc2ModpackPanel').hidden = !si
    document.getElementById('sc2NewsTabNoticias').setAttribute('aria-selected', si ? 'false' : 'true')
    document.getElementById('sc2NewsTabModpack').setAttribute('aria-selected', si ? 'true' : 'false')
    if(si){
        scPintarModpack()
    }
}

document.getElementById('sc2NewsTabNoticias').addEventListener('click', () => scVerModpack(false))
document.getElementById('sc2NewsTabModpack').addEventListener('click', () => scVerModpack(true))
// The landing card opens the tab it talks about.
document.getElementById('sc2NewsCard').addEventListener('click', () => {
    scVerModpack(document.getElementById('sc2NewsCard').hasAttribute('data-modpack'))
}, true)
document.getElementById('newsButton').addEventListener('click', () => {
    if(!document.getElementById('sc2NewsCard').hasAttribute('data-modpack')){
        scVerModpack(false)
    }
}, true)

/* ---- Gallery ------------------------------------------------------------------ */

let scGaleriaAbierta = false
let scGaleriaTurno = 0

function scCarpetaCapturas(){
    return require('path').join(ConfigManager.getInstanceDirectory(), ConfigManager.getSelectedServer() || '', 'screenshots')
}

async function scPintarGaleria(){
    const fs = require('fs')
    const path = require('path')
    const turno = ++scGaleriaTurno
    const grid = document.getElementById('sc2GaleriaGrid')
    const cuenta = document.getElementById('sc2GaleriaCuenta')
    grid.replaceChildren()
    cuenta.textContent = ''
    const msg = texto => {
        const p = document.createElement('p')
        p.className = 'sc2CalMsg sc2GaleriaMsg'
        p.textContent = texto
        grid.append(p)
    }
    const vigente = () => turno === scGaleriaTurno && scGaleriaAbierta
    let fotos
    try {
        const dir = scCarpetaCapturas()
        if(!fs.existsSync(dir)){
            msg(Lang.queryJS('landing.sc2.galleryEmpty'))
            return
        }
        const entradas = (await fs.promises.readdir(dir, { withFileTypes: true }))
            .filter(e => e.isFile() && /\.(png|jpe?g)$/i.test(e.name))
        if(!vigente()){
            return
        }
        // Dates with at most 16 stat calls at a time; files deleted meanwhile drop out.
        fotos = []
        for(let i = 0; i < entradas.length; i += 16){
            const lote = await Promise.all(entradas.slice(i, i + 16).map(async e => {
                const ruta = path.join(dir, e.name)
                try {
                    const st = await fs.promises.stat(ruta)
                    return st.isFile() ? { f: e.name, ruta, t: st.mtimeMs } : null
                } catch(_e){
                    return null
                }
            }))
            if(!vigente()){
                return
            }
            fotos.push(...lote.filter(Boolean))
        }
        fotos.sort((a, b) => b.t - a.t)
    } catch(e){
        if(!vigente()){
            return
        }
        loggerLanding.warn('No se pudo leer la carpeta de capturas', e)
        msg(Lang.queryJS('landing.sc2.galleryError'))
        return
    }
    if(!vigente()){
        return
    }
    if(fotos.length === 0){
        msg(Lang.queryJS('landing.sc2.galleryEmpty'))
        return
    }
    cuenta.textContent = fotos.length === 1 ? Lang.queryJS('landing.sc2.galleryOne') : Lang.queryJS('landing.sc2.galleryCount', { n: fotos.length })
    const visibles = fotos.slice(0, SC_GALERIA_MAX)
    const tarjetas = visibles.map(x => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'sc2Foto'
        b.title = x.f
        const img = document.createElement('img')
        img.alt = ''
        img.draggable = false
        const pie = document.createElement('span')
        pie.className = 'sc2FotoPie'
        pie.textContent = new Date(x.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        b.append(img, pie)
        b.addEventListener('click', async () => {
            const error = await shell.openPath(x.ruta)
            if(error){
                loggerLanding.warn('No se pudo abrir la captura', x.ruta, error)
                scPintarGaleria()
            }
        })
        grid.append(b)
        return { img, ruta: x.ruta }
    })
    if(fotos.length > SC_GALERIA_MAX){
        msg(Lang.queryJS('landing.sc2.galleryMore', { n: SC_GALERIA_MAX }))
    }
    // Thumbnails one by one: Windows makes them from its own cache.
    const { nativeImage } = require('@electron/remote')
    for(const t of tarjetas){
        if(!vigente()){
            return
        }
        try {
            const mini = await nativeImage.createThumbnailFromPath(t.ruta, { width: 480, height: 270 })
            t.img.src = mini.toDataURL()
        } catch(_e){
            t.img.closest('.sc2Foto').classList.add('sc2FotoSinMini')
        }
    }
}

function scAbrirGaleria(){
    if(typeof newsActive !== 'undefined' && newsActive){
        document.getElementById('newsButton').click()
    }
    scCerrarEventos()
    scGaleriaAbierta = true
    document.getElementById('landingContainer').classList.add('sc2GaleriaOpen')
    document.getElementById('sc2GaleriaView').setAttribute('aria-hidden', 'false')
    scMarcarPestana('sc2TabGaleria')
    scPintarGaleria()
}

function scCerrarGaleria(){
    if(!scGaleriaAbierta){
        return
    }
    scGaleriaAbierta = false
    scGaleriaTurno++
    document.getElementById('landingContainer').classList.remove('sc2GaleriaOpen')
    document.getElementById('sc2GaleriaView').setAttribute('aria-hidden', 'true')
    scMarcarPestana('sc2TabJugar')
}

/** Closes the extra views (events, gallery); used by the other tabs. */
function scCerrarVistasExtra(){
    scCerrarEventos()
    scCerrarGaleria()
}

document.getElementById('sc2TabGaleria').addEventListener('click', () => scAbrirGaleria())
document.getElementById('sc2GaleriaCarpeta').addEventListener('click', async () => {
    const dir = scCarpetaCapturas()
    try {
        await require('fs').promises.mkdir(dir, { recursive: true })
    } catch(_e){ /* openPath reports it */ }
    shell.openPath(dir)
})

/* ---- Start ------------------------------------------------------------------- */

// The distribution is loaded by the time the profile button gets its name.
new MutationObserver(() => {
    scRevisarModpack()
    if(scGaleriaAbierta){
        scPintarGaleria()
    }
}).observe(document.getElementById('server_selection_button'), { childList: true, characterData: true, subtree: true })
scPintarTarjetaNovedades()
