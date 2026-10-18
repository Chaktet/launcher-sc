/**
 * Imágenes de Noticias (1.16.12, diseño v6 de Codex aprobado por Felix el 18-10-2026).
 *
 * Antes cada imagen del RSS ocupaba todo el ancho del texto (unos 620x620 px) y una
 * sola llenaba el panel: el resto de la noticia no se leía. Ahora, sin tocar los
 * artículos a mano:
 * - toda imagen tiene un tope de alto (240u; las apaisadas, 180u) y nunca se amplía
 *   por encima de su tamaño real;
 * - una imagen sola bajo un encabezado se pone al lado de su texto (columna de 264u)
 *   cuando cabe, y debajo cuando no;
 * - cualquier imagen se amplía en un visor a pantalla completa (Esc, botón o clic
 *   fuera para cerrar).
 *
 * El HTML ya viene limpio de scLimpiarHtmlNoticia(); aquí solo se mueven nodos y se
 * crean controles con createElement/textContent, nunca HTML remoto concatenado.
 * Especificación completa: diseno-v6-noticias/ESPECIFICACION.md (fuera del instalador).
 */
/* global Lang, newsArticleTitle */

const SC_NOTICIA_ANCHA = 1.7 // relación ancho/alto desde la que una imagen es una franja

let scNoticiaRonda = 0       // cambia con cada artículo: lo que cargue tarde del anterior se ignora
let scNoticiaOrigen = null   // botón que abrió el visor, para devolverle el foco
let scNoticiaInertes = []    // nodos marcados inert al abrir el visor

function scNoticiaTxt(clave, datos){
    return Lang.queryJS('landing.noticias.' + clave, datos)
}

/** Raíz del visor, creada una vez fuera de cualquier contenedor que se desplace. */
function scNoticiaVisor(){
    let v = document.getElementById('scNoticiaVisor')
    if(v != null){
        return v
    }
    v = document.createElement('section')
    v.id = 'scNoticiaVisor'
    v.hidden = true
    v.setAttribute('role', 'dialog')
    v.setAttribute('aria-modal', 'true')
    v.setAttribute('aria-labelledby', 'scNoticiaVisorTitulo')
    v.setAttribute('aria-describedby', 'scNoticiaVisorAyuda')
    const cab = document.createElement('header')
    cab.className = 'scNoticiaVisorCabecera'
    const titulos = document.createElement('div')
    const h = document.createElement('h2')
    h.id = 'scNoticiaVisorTitulo'
    const sub = document.createElement('small')
    sub.id = 'scNoticiaVisorArticulo'
    titulos.append(h, sub)
    const cerrar = document.createElement('button')
    cerrar.type = 'button'
    cerrar.id = 'scNoticiaCerrar'
    cerrar.textContent = scNoticiaTxt('cerrar')
    cab.append(titulos, cerrar)
    const lienzo = document.createElement('div')
    lienzo.id = 'scNoticiaLienzo'
    const img = document.createElement('img')
    img.id = 'scNoticiaImagen'
    img.alt = ''
    lienzo.append(img)
    const pie = document.createElement('footer')
    pie.id = 'scNoticiaVisorAyuda'
    pie.textContent = scNoticiaTxt('ayudaVisor')
    v.append(cab, lienzo, pie)
    document.body.appendChild(v)

    cerrar.addEventListener('click', scNoticiaCerrarVisor)
    // Cualquier clic en el fondo cierra; sobre la imagen o un control, no.
    v.addEventListener('click', e => {
        if(!e.target.closest('img, button, a')){
            scNoticiaCerrarVisor()
        }
    })
    return v
}

/**
 * Teclado con el visor abierto, en fase de captura: Esc lo cierra y las flechas no
 * deben cambiar de noticia por detrás (landing.js las escucha en document).
 */
function scNoticiaTeclas(e){
    const v = document.getElementById('scNoticiaVisor')
    if(v == null || v.hidden){
        return
    }
    if(e.key === 'Escape'){
        e.preventDefault()
        e.stopImmediatePropagation()
        scNoticiaCerrarVisor()
    } else if(e.key === 'Tab'){
        // Solo hay un control: el foco no sale del visor.
        e.preventDefault()
        document.getElementById('scNoticiaCerrar').focus({ preventScroll: true })
    } else if(e.key.startsWith('Arrow')){
        e.stopImmediatePropagation()
    }
}
document.addEventListener('keydown', scNoticiaTeclas, true)

function scNoticiaAbrirVisor(img, origen, titulo){
    const v = scNoticiaVisor()
    scNoticiaOrigen = origen
    const grande = document.getElementById('scNoticiaImagen')
    // La imagen que ya se ve, nunca el href del enlace: puede ser una página o una tienda.
    grande.src = img.currentSrc || img.src
    grande.alt = img.alt || ''
    document.getElementById('scNoticiaVisorTitulo').textContent = titulo
    document.getElementById('scNoticiaVisorArticulo').textContent =
        typeof newsArticleTitle !== 'undefined' && newsArticleTitle ? newsArticleTitle.textContent : ''
    // El resto de la ventana, inerte: ni clic ni tabulación detrás del visor.
    // Menos la barra de la ventana (#frameBar): cerrar y minimizar tienen que seguir
    // funcionando con el visor abierto (revisión de Codex).
    scNoticiaInertes = Array.from(document.body.children).filter(n => n !== v && n.id !== 'frameBar' && !n.inert)
    scNoticiaInertes.forEach(n => { n.inert = true })
    v.hidden = false
    document.getElementById('scNoticiaCerrar').focus({ preventScroll: true })
}

function scNoticiaCerrarVisor(){
    const v = document.getElementById('scNoticiaVisor')
    if(v == null || v.hidden){
        return
    }
    v.hidden = true
    scNoticiaInertes.forEach(n => { n.inert = false })
    scNoticiaInertes = []
    // La copia grande se suelta; la miniatura sigue donde estaba.
    document.getElementById('scNoticiaImagen').removeAttribute('src')
    if(scNoticiaOrigen != null && scNoticiaOrigen.isConnected){
        scNoticiaOrigen.focus({ preventScroll: true })
    }
    scNoticiaOrigen = null
}

/** Imagen sola: un img, o un p/div/a cuyo único contenido es esa imagen (puede haber un enlace en medio). */
function scNoticiaSola(n){
    if(n == null){
        return false
    }
    if(n.matches('img')){
        return true
    }
    if(!n.matches('p, div, a') || n.querySelectorAll('img').length !== 1 || n.textContent.trim()){
        return false
    }
    const resto = Array.from(n.querySelectorAll('*')).filter(x => !x.matches('img, a, br'))
    return resto.length === 0
}

/** Estilos en línea del RSS (width:100%, float…) se quitan: mandan las reglas locales. */
function scNoticiaLimpiarImagen(img){
    const pixel = img.style.imageRendering === 'pixelated'
    img.removeAttribute('style')
    img.removeAttribute('class')
    if(pixel){
        img.style.imageRendering = 'pixelated'
    }
}

function scNoticiaTitulo(img, n){
    return img.alt && img.alt.trim() ? img.alt.trim() : scNoticiaTxt('imagenN', { n })
}

/** Convierte una imagen sola en figura con botón de ampliar, y la junta con su texto si toca. */
function scNoticiaFigura(img, host, wrapper, n){
    const titulo = scNoticiaTitulo(img, n)
    const ancha = img.naturalWidth / Math.max(1, img.naturalHeight) >= SC_NOTICIA_ANCHA
    const enlace = host.matches('a') ? host : host.querySelector('a')
    const href = enlace != null ? enlace.getAttribute('href') : null

    const fig = document.createElement('figure')
    fig.className = 'scNoticiaFigura' + (ancha ? ' scNoticiaFigura--ancha' : '')
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'scNoticiaAbrir'
    boton.setAttribute('aria-haspopup', 'dialog')
    boton.setAttribute('aria-label', scNoticiaTxt('ampliarImagen', { t: titulo }))
    const marca = document.createElement('span')
    marca.className = 'scNoticiaAmpliar'
    marca.setAttribute('aria-hidden', 'true')
    marca.textContent = '⤢'
    const pie = document.createElement('figcaption')
    pie.textContent = (img.alt && img.alt.trim() ? img.alt.trim() + ' · ' : '') + scNoticiaTxt('ampliar')

    host.replaceWith(fig)
    boton.append(img, marca)
    fig.append(boton, pie)
    boton.addEventListener('click', () => scNoticiaAbrirVisor(img, boton, titulo))
    // Un enlace que lleva a otra cosa que la propia imagen se conserva aparte.
    if(href && href !== img.getAttribute('src')){
        const a = document.createElement('a')
        a.href = href
        a.target = '_blank'
        a.textContent = scNoticiaTxt('enlaceOriginal')
        pie.append(document.createTextNode(' · '), a)
    }

    if(ancha){
        return
    }
    // Texto que va con la imagen: hermanos simples hacia atrás hasta un encabezado.
    // Sin encabezado cerca no se inventa la relación y la figura se queda en su sitio.
    const nodos = []
    let prev = fig.previousElementSibling
    while(prev && prev.matches('p, ul, ol, h2, h3') && !prev.querySelector('img')){
        nodos.unshift(prev)
        if(prev.matches('h2, h3')){
            break
        }
        prev = prev.previousElementSibling
    }
    if(nodos.length && nodos[0].matches('h2, h3') && fig.parentElement === wrapper){
        const bloque = document.createElement('div')
        bloque.className = 'scNoticiaBloque'
        const texto = document.createElement('div')
        texto.className = 'scNoticiaTexto'
        nodos[0].before(bloque)
        texto.append(...nodos)
        bloque.append(texto, fig)
    }
}

/** Imagen dentro de una estructura que no se reagrupa: se amplía igual, en su sitio. */
function scNoticiaSuelta(img, n){
    const titulo = scNoticiaTitulo(img, n)
    img.classList.add('scNoticiaSuelta')
    img.tabIndex = 0
    img.setAttribute('role', 'button')
    img.setAttribute('aria-haspopup', 'dialog')
    img.setAttribute('aria-label', scNoticiaTxt('ampliarImagen', { t: titulo }))
    const abrir = e => {
        // Dentro de un enlace con texto, el clic en la imagen amplía; el texto sigue siendo enlace.
        e.preventDefault()
        e.stopPropagation()
        scNoticiaAbrirVisor(img, img, titulo)
    }
    img.addEventListener('click', abrir)
    img.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' '){
            abrir(e)
        }
    })
}

/**
 * Llamado por displayArticle() justo después de pintar el HTML. Cada imagen se trata
 * al cargar (hace falta su tamaño real), sin esperar a las demás ni bloquear el texto.
 */
function scPrepararNoticia(contenedor){
    scNoticiaCerrarVisor()
    const ronda = ++scNoticiaRonda
    const wrapper = contenedor != null ? contenedor.querySelector('#newsArticleContentWrapper') : null
    if(wrapper == null){
        return
    }
    Array.from(wrapper.querySelectorAll('img')).forEach((img, i) => {
        scNoticiaLimpiarImagen(img)
        const listo = () => {
            if(ronda !== scNoticiaRonda || !img.isConnected){
                return
            }
            if(!img.naturalWidth){
                // Rota: se queda su texto alternativo y un aviso, sin visor vacío.
                img.classList.add('scNoticiaRota')
                img.setAttribute('aria-label', scNoticiaTxt('noCarga'))
                return
            }
            // Nunca más grande que su tamaño real.
            img.style.setProperty('--sc-noticia-ancho', img.naturalWidth + 'px')
            let host = img
            while(host.parentElement !== wrapper && host.parentElement != null && scNoticiaSola(host.parentElement)){
                host = host.parentElement
            }
            if(host.parentElement === wrapper && scNoticiaSola(host)){
                scNoticiaFigura(img, host, wrapper, i + 1)
            } else {
                scNoticiaSuelta(img, i + 1)
            }
        }
        if(img.complete){
            listo()
        } else {
            img.addEventListener('load', listo, { once: true })
            img.addEventListener('error', listo, { once: true })
        }
    })
}
