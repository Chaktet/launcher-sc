/**
 * Script for overlay.ejs
 */

/* Overlay Wrapper Functions */

/**
 * Check to see if the overlay is visible.
 * 
 * @returns {boolean} Whether or not the overlay is visible.
 */
function isOverlayVisible(){
    return document.getElementById('main').hasAttribute('overlay')
}

let overlayHandlerContent

/**
 * Overlay keydown handler for a non-dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyHandler (e){
    if(e.key === 'Enter' || e.key === 'Escape'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
    }
}
/**
 * Overlay keydown handler for a dismissable overlay.
 * 
 * @param {KeyboardEvent} e The keydown event.
 */
function overlayKeyDismissableHandler (e){
    if(e.key === 'Enter'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEnter')[0].click()
    } else if(e.key === 'Escape'){
        document.getElementById(overlayHandlerContent).getElementsByClassName('overlayKeybindEsc')[0].click()
    }
}

/**
 * Bind overlay keydown listeners for escape and exit.
 * 
 * @param {boolean} state Whether or not to add new event listeners.
 * @param {string} content The overlay content which will be shown.
 * @param {boolean} dismissable Whether or not the overlay is dismissable 
 */
function bindOverlayKeys(state, content, dismissable){
    overlayHandlerContent = content
    document.removeEventListener('keydown', overlayKeyHandler)
    document.removeEventListener('keydown', overlayKeyDismissableHandler)
    if(state){
        if(dismissable){
            document.addEventListener('keydown', overlayKeyDismissableHandler)
        } else {
            document.addEventListener('keydown', overlayKeyHandler)
        }
    }
}

/**
 * Toggle the visibility of the overlay.
 * 
 * @param {boolean} toggleState True to display, false to hide.
 * @param {boolean} dismissable Optional. True to show the dismiss option, otherwise false.
 * @param {string} content Optional. The content div to be shown.
 */
// El fundido de jQuery repintaba toda la ventana en cada tick (lag al abrir el
// selector); ahora la visibilidad se anima con una transición CSS compuesta en GPU.
let overlayHideTimeout = null

function toggleOverlay(toggleState, dismissable = false, content = 'overlayContent'){
    if(toggleState == null){
        toggleState = !document.getElementById('main').hasAttribute('overlay')
    }
    if(typeof dismissable === 'string'){
        content = dismissable
        dismissable = false
    }
    bindOverlayKeys(toggleState, content, dismissable)
    const overlayContainer = document.getElementById('overlayContainer')
    if(toggleState){
        if(overlayHideTimeout != null){
            clearTimeout(overlayHideTimeout)
            overlayHideTimeout = null
        }
        document.getElementById('main').setAttribute('overlay', true)
        // Make things untabbable.
        $('#main *').attr('tabindex', '-1')
        $('#' + content).parent().children().hide()
        $('#' + content).show()
        if(dismissable){
            $('#overlayDismiss').show()
        } else {
            $('#overlayDismiss').hide()
        }
        if(getCurrentView() === VIEWS.settings){
            document.getElementById('settingsContainer').style.backgroundColor = 'transparent'
        }
        overlayContainer.style.display = 'flex'
        // Doble rAF: garantiza que el display ya está aplicado antes de iniciar la transición.
        requestAnimationFrame(() => requestAnimationFrame(() => overlayContainer.setAttribute('visible', '')))
    } else {
        document.getElementById('main').removeAttribute('overlay')
        // Make things tabbable.
        $('#main *').removeAttr('tabindex')
        if(getCurrentView() === VIEWS.settings){
            document.getElementById('settingsContainer').style.backgroundColor = 'rgba(0, 0, 0, 0.50)'
        }
        overlayContainer.removeAttribute('visible')
        overlayHideTimeout = setTimeout(() => {
            overlayHideTimeout = null
            overlayContainer.style.display = 'none'
            $('#' + content).parent().children().hide()
            $('#' + content).show()
            if(dismissable){
                $('#overlayDismiss').show()
            } else {
                $('#overlayDismiss').hide()
            }
        }, 200)
    }
}

// Cuando es la primera vez, el selector se muestra con otro texto y al cerrarlo
// se anota la elección para no volver a preguntar.
let scEligiendoPorPrimeraVez = false

async function toggleServerSelection(toggleState, primeraVez = false){
    scEligiendoPorPrimeraVez = primeraVez
    await prepareServerSelectionList()
    const cabecera = document.getElementById('serverSelectHeader')
    if(cabecera != null){
        // Las cabeceras viven en [ejs.overlay], no en [js.overlay]: con queryJS el
        // selector del primer arranque enseñaba "undefined".
        cabecera.innerHTML = primeraVez
            ? Lang.queryEJS('overlay.serverSelectHeaderPrimera')
            : Lang.queryEJS('overlay.serverSelectHeader')
    }
    const pista = document.getElementById('serverSelectPista')
    if(pista != null){
        pista.style.display = primeraVez ? 'block' : 'none'
    }
    toggleOverlay(toggleState, true, 'serverSelectContent')
}

/** Anota que el jugador ya ha pasado por la pantalla de elección. */
function scMarcarPerfilElegido(){
    if(scEligiendoPorPrimeraVez){
        scEligiendoPorPrimeraVez = false
        ConfigManager.setPerfilElegido(true)
        ConfigManager.save()
    }
}

/**
 * Set the content of the overlay.
 * 
 * @param {string} title Overlay title text.
 * @param {string} description Overlay description text.
 * @param {string} acknowledge Acknowledge button text.
 * @param {string} dismiss Dismiss button text.
 */
function setOverlayContent(title, description, acknowledge, dismiss = Lang.queryJS('overlay.dismiss')){
    document.getElementById('overlayTitle').innerHTML = title
    document.getElementById('overlayDesc').innerHTML = description
    document.getElementById('overlayAcknowledge').innerHTML = acknowledge
    document.getElementById('overlayDismiss').innerHTML = dismiss
    // Cada aviso nuevo empieza como informativo: si no, heredaría el rojo del error anterior.
    scTipoAviso('info')
}

/**
 * Tipo visual del aviso genérico (rediseño v5): icono y color de la cabecera.
 * Se llama después de setOverlayContent(); el tipo nunca se deduce del texto traducido.
 *
 * @param {'info'|'atencion'|'error'} tipo
 */
function scTipoAviso(tipo){
    document.getElementById('overlayContent').setAttribute('tipo', tipo)
}

/**
 * Set the onclick handler of the overlay acknowledge button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setOverlayHandler(handler){
    if(handler == null){
        document.getElementById('overlayAcknowledge').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayAcknowledge').onclick = handler
    }
}

/**
 * Set the onclick handler of the overlay dismiss button.
 * If the handler is null, a default handler will be added.
 * 
 * @param {function} handler 
 */
function setDismissHandler(handler){
    if(handler == null){
        document.getElementById('overlayDismiss').onclick = () => {
            toggleOverlay(false)
        }
    } else {
        document.getElementById('overlayDismiss').onclick = handler
    }
}

/* Server Select View */

document.getElementById('serverSelectConfirm').addEventListener('click', async () => {
    const listings = document.getElementsByClassName('serverListing')
    scMarcarPerfilElegido()
    for(let i=0; i<listings.length; i++){
        if(listings[i].hasAttribute('selected')){
            const serv = (await DistroAPI.getDistribution()).getServerById(listings[i].getAttribute('servid'))
            updateSelectedServer(serv)
            refreshServerStatus(true)
            toggleOverlay(false)
            return
        }
    }
    // Si no hay ninguna marcada (p.ej. la config apunta a una versión que ya no
    // existe) se elige la primera. Antes usaba 'i' fuera del bucle -> ReferenceError
    // y el jugador se quedaba sin poder elegir versión.
    if(listings.length > 0){
        try {
            const serv = (await DistroAPI.getDistribution()).getServerById(listings[0].getAttribute('servid'))
            updateSelectedServer(serv)
            refreshServerStatus(true)
        } catch(err) {
            console.error('No se pudo seleccionar la versión.', err)
        } finally {
            toggleOverlay(false)
        }
    }
})

document.getElementById('accountSelectConfirm').addEventListener('click', async () => {
    const listings = document.getElementsByClassName('accountListing')
    for(let i=0; i<listings.length; i++){
        if(listings[i].hasAttribute('selected')){
            const authAcc = ConfigManager.setSelectedAccount(listings[i].getAttribute('uuid'))
            ConfigManager.save()
            updateSelectedAccount(authAcc)
            if(getCurrentView() === VIEWS.settings) {
                await prepareSettings()
            }
            toggleOverlay(false)
            validateSelectedAccount()
            return
        }
    }
    // None are selected? Not possible right? Meh, handle it.
    if(listings.length > 0){
        const authAcc = ConfigManager.setSelectedAccount(listings[0].getAttribute('uuid'))
        ConfigManager.save()
        updateSelectedAccount(authAcc)
        if(getCurrentView() === VIEWS.settings) {
            await prepareSettings()
        }
        toggleOverlay(false)
        validateSelectedAccount()
    }
})

// Bind server select cancel button.
document.getElementById('serverSelectCancel').addEventListener('click', () => {
    // Aunque cierre sin tocar nada, ya se le ha preguntado: no insistimos.
    scMarcarPerfilElegido()
    toggleOverlay(false)
})

document.getElementById('accountSelectCancel').addEventListener('click', () => {
    $('#accountSelectContent').fadeOut(250, () => {
        $('#overlayContent').fadeIn(250)
    })
})

function setServerListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('serverListing'))
    listings.map((val) => {
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            const cListings = document.getElementsByClassName('serverListing')
            for(let i=0; i<cListings.length; i++){
                if(cListings[i].hasAttribute('selected')){
                    cListings[i].removeAttribute('selected')
                }
            }
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
    })
}

function setAccountListingHandlers(){
    const listings = Array.from(document.getElementsByClassName('accountListing'))
    listings.map((val) => {
        val.onclick = e => {
            if(val.hasAttribute('selected')){
                return
            }
            const cListings = document.getElementsByClassName('accountListing')
            for(let i=0; i<cListings.length; i++){
                if(cListings[i].hasAttribute('selected')){
                    cListings[i].removeAttribute('selected')
                }
            }
            val.setAttribute('selected', '')
            document.activeElement.blur()
        }
    })
}

async function populateServerListings(){
    const distro = await DistroAPI.getDistribution()
    const servers = distro.servers
    // PRO, LITE or SUPER LITE by this PC's RAM, cores and graphics card (screndimiento.perfilRecomendado).
    // With an older manifest the recommended level may not exist: the closest available one is marked instead.
    const recId = ScRendimiento.perfilDisponible(servers)
    const esRecomendado = serv => serv.rawServer.id === recId
    let giaSel = ConfigManager.getSelectedServer()
    // First choice: start on the profile that suits the PC.
    if(scEligiendoPorPrimeraVez){
        giaSel = (servers.find(esRecomendado) || servers[0]).rawServer.id
    }
    let htmlString = ''
    for(const serv of servers){
        // Rediseño v5: filas con personaje, nombre corto ("LITE" + "(Gama Baja)") y marca de
        // selección. El nombre completo sigue en title y en el lector de pantalla.
        const nombre = String(serv.rawServer.name || '')
        const corto = nombre.includes('·') ? nombre.slice(nombre.lastIndexOf('·') + 1).trim() : nombre
        const parentesis = corto.indexOf('(')
        const principal = parentesis > 0 ? corto.slice(0, parentesis).trim() : corto
        const apellido = parentesis > 0 ? corto.slice(parentesis) : ''
        const id = String(serv.rawServer.id || '')
        // La línea evolutiva marca el peso del perfil: Raichu PRO, Pikachu LITE, Pichu SUPER LITE.
        const pokemon = /superlite/i.test(id) ? 'pichu' : (/lite/i.test(id) ? 'pikachu' : 'raichu')
        htmlString += `<button class="serverListing" servid="${sc$escapeHtml(id)}" ${serv.rawServer.id === giaSel ? 'selected' : ''} title="${sc$escapeHtml(nombre)}" aria-label="${sc$escapeHtml(nombre)}">
            <img class="serverListingImg" src="./assets/images/ui/pokemon-${pokemon}@2x.png" alt=""/>
            <div class="serverListingDetails">
                <span class="serverListingName">${sc$escapeHtml(principal)}${apellido ? ` <small>${sc$escapeHtml(apellido)}</small>` : ''}</span>
                <span class="serverListingDescription">${sc$escapeHtml(serv.rawServer.description || '')}</span>
            </div>
            <div class="scPerfilMeta">
                ${esRecomendado(serv) ? `<span class="serverListingRecomendado">★ ${Lang.queryJS('landing.sc2.recommended')}</span>` : ''}
                <span class="scPerfilElegido">✓ ${Lang.queryJS('overlay.sc2.seleccionado')}</span>
                <span class="scPerfilVersion">${Lang.queryJS('overlay.sc2.minecraft', { v: sc$escapeHtml(serv.rawServer.minecraftVersion || '') })}</span>
            </div>
            <span class="scPerfilMarca" aria-hidden="true"></span>
        </button>`
    }
    document.getElementById('serverSelectListScrollable').innerHTML = htmlString

}

function populateAccountListings(){
    const accountsObj = ConfigManager.getAuthAccounts()
    const accounts = Array.from(Object.keys(accountsObj), v=>accountsObj[v])
    let htmlString = ''
    for(let i=0; i<accounts.length; i++){
        htmlString += `<button class="accountListing" uuid="${accounts[i].uuid}" ${i===0 ? 'selected' : ''}>
            <img src="https://minotar.net/helm/${encodeURIComponent(String(accounts[i].uuid).replace(/-/g, ''))}/40.png" alt="">
            <div class="accountListingName">${accounts[i].displayName}</div>
        </button>`
    }
    document.getElementById('accountSelectListScrollable').innerHTML = htmlString

}

async function prepareServerSelectionList(){
    await populateServerListings()
    setServerListingHandlers()
}

function prepareAccountSelectionList(){
    populateAccountListings()
    setAccountListingHandlers()
}