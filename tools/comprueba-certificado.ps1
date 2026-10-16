# Lists the code-signing certificates Windows can use to sign the launcher (Certum Open Source Code Signing in the
# Cloud, bought 2026-10-16). With SimplySign Desktop connected, the certificate shows up in CurrentUser\My with its
# key on the virtual card. Its thumbprint goes into electron-builder.yml (win.signtoolOptions.certificateSha1).
# Usage: pwsh -File tools/comprueba-certificado.ps1
$certs = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue
if (-not $certs) {
    Write-Output 'No hay ningun certificado de firma de codigo. Abre SimplySign Desktop y conectate con el codigo de la app del movil.'
    exit 1
}
foreach ($c in $certs) {
    [pscustomobject]@{
        Titular   = $c.Subject
        Emisor    = $c.Issuer
        Desde     = $c.NotBefore.ToString('yyyy-MM-dd')
        Hasta     = $c.NotAfter.ToString('yyyy-MM-dd')
        Huella    = $c.Thumbprint
        ConClave  = $c.HasPrivateKey
    } | Format-List
}
