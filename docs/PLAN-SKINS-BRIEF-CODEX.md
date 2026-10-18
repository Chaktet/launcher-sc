# Codex design brief · "Cambiar skin" in SC Launcher

Design only (mockups + spec), no production code. Output to `E:/PROYECTOS-MC/sc-launcher/diseno-v7-skin/`
(same layout as `diseno-v6-noticias/`: `ESPECIFICACION.md`, `composiciones/*.png`, `maqueta/` static HTML/CSS).

## Product
SC Launcher is the Electron launcher (Helios fork) of a Spanish Cobblemon Minecraft network (servidorcobblemon.es).
Players are mostly Spanish-speaking teens, many on low-end PCs, many with **non-premium** (offline) accounts.
Today non-premium players change skin only with `/skin` in game, and the launcher shows Steve as their account head.

## What to design
1. **Account head everywhere** (top-right avatar on the landing, account list in Settings → Cuenta): it now shows
   the player's real server skin face. No visual change needed beyond states: loading, skin, fallback (Steve).
   Add a subtle affordance on the avatar ("Cambiar skin") for non-premium accounts.
2. **"Cambiar skin" panel** (opened from the avatar or from Settings → Cuenta, on a non-premium account):
   - **Not linked yet (first time on this PC):** explain in one line, then 3 numbered steps: "Entra al servidor",
     "Escribe /launcher en el chat", "Pega aquí el código". A 6-character code input (format `ABC-123`, paste
     friendly, auto-uppercase), a "Vincular" button, and error states: wrong/expired code, too many tries (wait N
     minutes), no connection. Mention "Solo hace falta una vez en este PC".
   - **Linked:** current skin preview (front view of the full body, flat pixel-art render is fine; a 3D turntable
     is a nice-to-have, must stay light for weak PCs), and two ways to choose a new one, as tabs or two cards:
     - **Subir imagen**: drag-and-drop zone + "Buscar archivo"; accepts only `.png` 64×64 or 64×32; choose arms
       "Clásico" (Steve, 4 px) or "Fino" (Alex, 3 px) with a tiny visual of each; instant preview of the new skin.
       Errors: wrong size, not a PNG, file too big (>24 KB).
     - **Copiar de un jugador premium**: nick input with preview after typing; error "Ese jugador no existe o no es
       premium".
     - Primary button **"Aplicar skin"**, with a busy state (signing can take 5–20 s: show progress copy like
       "Preparando tu skin…"), success ("¡Hecho! Si estás jugando, ya la llevas puesta"), and errors: rate limit
       ("Espera un minuto antes de volver a cambiarla"), service busy ("Inténtalo en un minuto"), server down.
     - Secondary actions: "Quitar skin" (back to default) and, small, "Desvincular este PC".
   - A one-line privacy note under the upload: "Las skins son públicas: cualquiera que juegue contigo la ve."
3. **In-game chat message** mockup for `/launcher` (Minecraft chat, MiniMessage-style colors): the code, big and
   clickable to copy, 10-minute validity, and the warning "No se lo des a nadie. El staff nunca te lo pedirá."

Premium (Microsoft) accounts: the panel shows a short note "Tu skin es la de tu cuenta de Minecraft; cámbiala en
minecraft.net" with a link, no upload.

## Existing style (must match, don't invent a new look)
- Read `app/assets/css/scpantallas.css` (design v5, used by Settings, account pickers, notices; unit `--u` = 1 px at
  1100×700) and `app/assets/css/rediseno.css`, and the previous design folders (`diseno-v6-noticias/`,
  `diseno-v4-fondo/`) for colors, typography, radii and panel style. Reuse its notice/overlay patterns
  (`scTipoAviso()` in overlay.js).
- Window is 1100×700 by default and must work down to 980×560 (users shrink it). Spanish copy, short and friendly.
- Keyboard accessible, visible focus, no pure-colour-only errors.

## Constraints
- Everything in plain HTML/CSS/vanilla JS (no frameworks); assets small. No external fonts or CDNs at runtime.
- All UI strings will live in `app/assets/lang/_custom.toml`; list every string in the spec with a suggested key.
- Pixel-art skin rendering must use `image-rendering: pixelated`.

## Deliverables
`ESPECIFICACION.md` (screens, states, sizes, strings, interactions), PNG compositions of every state above at
1100×700, and a static clickable mockup in `maqueta/`.
