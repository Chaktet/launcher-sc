/**
 * Linux: arranque del AppImage sin sandbox SOLO donde el sistema lo bloquea (1.17.8,
 * decisión de Felix 26-10-2026).
 *
 * Ubuntu 24.04+ (AppArmor) y algunas distros prohíben los espacios de nombres sin
 * privilegios, y un AppImage no puede llevar el chrome-sandbox con SUID: Electron moría
 * al abrirse con «The SUID sandbox helper binary was found, but is not configured
 * correctly» (visto en CI, 26-10). app.commandLine.appendSwitch llega tarde (el zygote
 * ya se lanzó), así que el ejecutable pasa a ser un script que mira esos ajustes del
 * kernel y solo entonces añade --no-sandbox. Donde el sandbox funciona, se queda.
 */
const fs = require('fs')
const path = require('path')

exports.default = async function(context){
    if(context.electronPlatformName !== 'linux'){
        return
    }
    const nombre = context.packager.executableName
    const exe = path.join(context.appOutDir, nombre)
    fs.renameSync(exe, exe + '.bin')
    fs.writeFileSync(exe, [
        '#!/bin/sh',
        'DIR="$(dirname "$(readlink -f "$0")")"',
        'bloqueado() { [ "$(cat "$1" 2>/dev/null)" = "$2" ]; }',
        'if bloqueado /proc/sys/kernel/apparmor_restrict_unprivileged_userns 1 \\',
        '   || bloqueado /proc/sys/kernel/unprivileged_userns_clone 0 \\',
        '   || bloqueado /proc/sys/user/max_user_namespaces 0; then',
        `  exec "$DIR/${nombre}.bin" --no-sandbox "$@"`,
        'fi',
        `exec "$DIR/${nombre}.bin" "$@"`,
        ''
    ].join('\n'), { mode: 0o755 })
}
