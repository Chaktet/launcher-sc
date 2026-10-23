# SC Launcher · historial

## Estado actual
- Rama `fix/packs-viejos-pistas` (23-10, probada, sin publicar): borra solos los SC-Pack viejos y afina las pistas de
  Voice Chat y de descargas. **Felix: sale en la MISMA versión que las ramas de rediseño y de peso**; quien junte esas
  dos, que la junte también (detalle en la entrada del 23-10 de esa rama). `sc-stats.py` nuevo sin instalar en OVH-A.
- Rama `claude/rework-tienda-a39596`: rediseño PokéNav (aspecto de la tienda) terminado y comprobado en la app.
  Sin publicar: la sesión principal lo junta con la rama de peso `claude/peso-launcher-d11b48` y saca una sola versión.

## 2026-10-22 · Rediseño del launcher con el estilo de la tienda (PokéNav)

- Pedido de Felix (22-10): que el launcher se vea como store.servidorcobblemon.es. Mismas funciones y textos.
- Diseño: Codex hizo 31 maquetas HTML (`E:/codex-work/launcher-rework/`, `FICHA.md`, láminas en `laminas/`). Felix
  eligió la **variante A** («PokéNav completo»: la ventana es el aparato, pantalla crema, el fondo elegido dentro de un
  marco arriba). Base: el sistema de diseño `E:/RESOURCE-MC/marca-pokenav/` (los mismos colores y recetas que la tienda).
- Hecho: `app/assets/css/scpokenav.css` (nueva, la última en `app.ejs`) pisa launcher.css, rediseno.css, scpantallas.css
  y scskin.css; no cambia IDs ni JS de pantallas. Letras Silkscreen y Source Sans 3 en woff2 recortado al alfabeto latino
  (60 KB en total, licencia OFL en `fonts/PokeNav-fonts-LICENSE.txt`). `scfondos.js` pone además la variable `--sc-fondo`
  para que el fondo elegido salga en el marco de la portada y de la entrada.
- Comprobado con la app arrancada (carpeta de datos aparte en `E:/tmp/launcher-rework/ud`, capturas en
  `E:/tmp/launcher-rework/v/`): portada (normal, descargando, con cuenta), Eventos, Novedades (3 pestañas), Galería, las
  9 pestañas de Ajustes, selector de perfil, de cuenta, avisos (info y error), puerta de actualización (descargando y
  error), bienvenida, tipo de cuenta, login, espera de Microsoft, «Cambiar skin», pantalla de carga; a 900×540, 1100×700
  y 1600×1000.
- Pendiente / ideas: los PNG del diseño anterior (`images/ui`, 2,1 MB) y `Inter.woff2` (343 KB) ya casi no se ven;
  quitarlos (y sus referencias en las hojas viejas) bajaría el peso. No hecho aquí para no pisar la rama de peso.
  Los textos «Termina a las 07:45» y «Horas de España» del calendario siguen enseñando horas fijas (regla del 21-10).
