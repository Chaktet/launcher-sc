// Comprueba, ANTES de publicar una versión firmada, que el publisherName que se graba en
// app-update.yml es exactamente el CN del certificado que firma el instalador. Si no cuadra,
// cada launcher instalado con esta versión rechazará la SIGUIENTE actualización
// (ERR_UPDATER_INVALID_SIGNATURE): pasó de la 1.16.16 a la 1.16.18 con una «é» rota (21-10-2026).
//
// Uso: node tools/comprueba-publisher.js [dist]   → sale con 1 si algo no cuadra.
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const dist = process.argv[2] || 'dist'
const yml = fs.readFileSync(path.join(dist, 'win-unpacked', 'resources', 'app-update.yml'), 'utf8')
const nombres = [...yml.matchAll(/^\s+-\s+['"]?(.+?)['"]?\s*$/gm)].map(m => m[1])
const version = require(path.resolve('package.json')).version
const exe = path.join(dist, `SC-Launcher-setup-${version}.exe`)

// El sujeto del firmante, leído como lo hace electron-updater (PowerShell + JSON), pero forzando UTF-8.
const ps = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; (Get-AuthenticodeSignature -LiteralPath '${exe.replace(/'/g, '\'\'')}') | Select-Object Status, @{n='Subject';e={$_.SignerCertificate.Subject}} | ConvertTo-Json -Compress`
const firma = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }))
const cn = (/(?:^|,\s*)CN=([^,]+)/.exec(firma.Subject || '') || [])[1]

let ok = true
if (yml.includes('�')) { console.error('✗ app-update.yml tiene un carácter roto (\\uFFFD)'); ok = false }
if (String(firma.Status) !== '0' && firma.Status !== 'Valid') { console.error('✗ el instalador no tiene una firma válida:', firma.Status); ok = false }
if (!nombres.includes(cn)) { console.error(`✗ publisherName ${JSON.stringify(nombres)} no contiene el CN del firmante ${JSON.stringify(cn)}`); ok = false }
console.log(ok ? `✓ publisherName = CN del firmante (${cn}), firma válida, v${version}` : 'NO PUBLICAR')
process.exit(ok ? 0 : 1)
