// Parche de helios-core para el modo "conexión lenta" del launcher (1.6.3).
//
// Por qué: helios-core descarga siempre con 15 conexiones a la vez. En routers de
// operadora flojos, PLC o repetidores, eso satura la red hasta tumbarla: al jugador se
// le caen el cable Y el wifi cada vez que el launcher descarga (reporte del 24-09-2026).
// Bajarlo a todos haría la descarga lenta para quien no tiene el problema, así que el
// número pasa a salir de una variable de entorno que landing.js pone por jugador:
//   SC_DESCARGAS_PARALELAS  -> cuántas a la vez (por defecto 15, como upstream)
//   SC_MODO_LENTO=1         -> además reintenta los cortes de red con más paciencia
//
// Se aplica en postinstall (npm install) y es idempotente: si ya está, no toca nada.
// Si helios-core cambia y no encuentra el código a parchear, FALLA en voz alta: un
// parche que no se aplica en silencio es exactamente el fallo que queremos evitar.
const fs = require('fs')
const path = require('path')

const F = path.join(__dirname, '..', 'node_modules', 'helios-core', 'dist', 'dl', 'DownloadEngine.js')
if(!fs.existsSync(F)){
    console.log('[parche-helios] helios-core no instalado todavía; nada que hacer.')
    process.exit(0)
}
let s = fs.readFileSync(F, 'utf8')
const MARCA = '/* sc-modo-lento */'
if(s.includes(MARCA)){
    console.log('[parche-helios] ya aplicado.')
    process.exit(0)
}

const cambios = [
    [
        'const q = fastq.promise(wrap, 15);',
        MARCA + ' const q = fastq.promise(wrap, Math.max(1, parseInt(process.env.SC_DESCARGAS_PARALELAS, 10) || 15));'
    ],
    [
        'function retryableError(error) {',
        'function retryableError(error) {\n'
        + '    ' + MARCA + '\n'
        + '    if (process.env.SC_MODO_LENTO === \'1\' && error\n'
        + '        && /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ECONNABORTED|EPIPE|socket hang up/i\n'
        + '            .test(String(error.code || \'\') + \' \' + String(error.message || \'\'))) {\n'
        + '        return true;\n'
        + '    }'
    ],
    [
        'await (0, NodeUtil_1.sleep)(1000);',
        MARCA + ' await (0, NodeUtil_1.sleep)(process.env.SC_MODO_LENTO === \'1\' ? 4000 : 1000);'
    ]
]
for(const [antes, despues] of cambios){
    if(!s.includes(antes)){
        console.error('[parche-helios] NO encuentro en DownloadEngine.js: ' + antes)
        process.exit(1)
    }
    s = s.replace(antes, despues)
}
fs.writeFileSync(F, s)
console.log('[parche-helios] aplicado: descargas paralelas por SC_DESCARGAS_PARALELAS y reintentos del modo lento.')
