# Códigos de error de arranque (SC-01 … SC-12)

> Estado verificado: 2026-08-03. Definidos en [landing.js](../app/assets/js/scripts/landing.js),
> constante `SC_ERR`.

Antes, cualquier fallo enseñaba el mismo diálogo genérico y el jugador no tenía nada que aportar en
un ticket. Ahora **cada punto donde el arranque puede fallar tiene su propio código**, el jugador ve
una explicación en cristiano y un botón que copia un informe completo al portapapeles.

## Tabla de códigos

| Código | Constante | Qué ha pasado | Primera cosa que mirar |
|---|---|---|---|
| **SC-01** | `DISTRO` | No se pudo leer la lista de archivos del servidor | ¿Responde `descargas.servidorcobblemon.es`? |
| **SC-02** | `JAVA` | Fallo descargando o instalando Java | Red, o la API de Adoptium caída |
| **SC-03** | `VERIFICACION` | Fallo verificando archivos ya descargados | Disco lleno o antivirus |
| **SC-04** | `DESCARGA` | Fallo descargando mods o recursos | Red, o el servidor de descargas |
| **SC-05** | `REPARACION` | El proceso de reparación murió | Permisos sobre el directorio de datos |
| **SC-06** | `JVM` | El juego no llegó a arrancar (genérico) | El informe adjunto |
| **SC-07** | `LAUNCHWRAPPER` | Faltan librerías de arranque | Descarga incompleta; forzar reparación |
| **SC-08** | `RAM` | Memoria asignada imposible para este equipo | Bajar la RAM en Ajustes |
| **SC-09** | `CUENTA` | Problema con la cuenta seleccionada | Volver a iniciar sesión |
| **SC-10** | `JAVA_ROTO` | La instalación de Java está incompleta o dañada | **Antivirus.** Ver abajo |
| **SC-11** | `MEMORIA` | El juego se quedó sin memoria | Subir RAM, o pasar a LITE |
| **SC-12** | `GRAFICOS` | Tarjeta gráfica o drivers: no se pudo crear la ventana | Actualizar drivers |

## El informe de diagnóstico

`scInformeDiagnostico()` genera un texto plano con:

```
=== INFORME SC LAUNCHER ===
Codigo / Fecha / Launcher (versión) / Version (PRO o LITE)
SO / CPU / RAM total y libre / RAM asignada al juego
Java (ruta del ejecutable) / Directorio de datos
--- ERROR ---
<stack real>
```

Se guarda además en `<dataDir>/informes/<CODIGO>-<timestamp>.txt` y el botón del diálogo abre esa
carpeta en el explorador. **Es lo que hay que pedir en un ticket.**

Si lo que falla es el launcher y no el juego (cuelgues, login, actualizaciones), lo que hace falta es
otra cosa: `<userData>/logs/launcher.log`, accesible desde **Ajustes → Ver registro del launcher**.

## Detección automática de causa

Cuando el juego se cierra con código distinto de 0 **y no llegó a conectar**,
`scAnalizarCierreDelJuego()` intenta averiguar por qué en vez de dejarlo en SC-06. Analiza la salida
de error acumulada (últimas 120 líneas) **más el informe de fallo de Minecraft** si hay uno reciente
(menos de 5 minutos) en `crash-reports/`.

Ese informe hace falta porque **los fallos de gráficos no aparecen por la salida de error**: van
directamente al crash report.

### SC-12 · Gráficos

Minecraft 1.21 necesita OpenGL 3.2 y Sodium 4.3. Con drivers viejos, ausentes o los genéricos de
Windows, el juego ni siquiera crea la ventana.

`PATRONES_GRAFICOS` cubre: fallos de GLFW y de contexto OpenGL, el renderizador por software de
Windows (`GDI Generic`, `llvmpipe`, `swiftshader`), y los ICD de los tres fabricantes por generación
— NVIDIA (`nvoglv32/64`, `nvd3dum`, `nvapi`…), AMD (`atioglxx`, `amdvlk`, `aticfx`…) e Intel
(`ig4icd`/`ig7icd`/`ig9icd`/`igxelpicd`, Arc/Xe). También caídas con
`EXCEPTION_ACCESS_VIOLATION` dentro de una biblioteca gráfica, y avisos del propio Sodium o Iris.

Si se identifica el fabricante, el diálogo enseña **su enlace de drivers concreto** en vez de los
tres (`landing.launch.errGraficosNvidia` / `errGraficosAmd` / `errGraficosIntel`).

### SC-10 · Java roto — y su reparación

Se detecta por `tzdb.dat`, `Error occurred during initialization of VM`,
`NoClassDefFoundError: java/…` o un `FileNotFoundException` apuntando a `runtime/` o `jdk-`.

Causa casi siempre: **el antivirus ha puesto ficheros del JDK en cuarentena**, o una extracción
interrumpida.

Este código es el único con acción de reparación en el propio diálogo. `scRepararJava()`:

1. Borra `<dataDir>/runtime/` entero
2. Pone el ejecutable de Java a `null` en la configuración
3. Guarda

En el siguiente intento el launcher se descarga Java de cero.

También se dispara desde `proc.on('error')`: si el proceso **ni siquiera llega a nacer** (ejecutable
borrado por el antivirus, permisos, ruta rota), Node emite `error` y **nunca** emite `close`. Sin ese
listener el botón JUGAR no volvía nunca y la guarda anti doble clic bloqueaba todos los intentos
siguientes — el launcher quedaba inservible hasta reiniciarlo.

### SC-08 · RAM imposible (comprobación previa)

`scComprobacionesPrevias()` corre **antes** de lanzar. Si la RAM máxima configurada supera el 92% de
la memoria física, la JVM no va a arrancar: se avisa con las dos cifras en el mensaje en vez de
dejar que falle con un error incomprensible.

### SC-11 · Sin memoria

`OutOfMemoryError`, `Could not reserve enough space`, `Failed to allocate`.

## Añadir un código nuevo

1. Añade la constante a `SC_ERR` con un comentario de una línea.
2. Añade el texto explicativo a `[landing.launch]` en [_custom.toml](../app/assets/lang/_custom.toml).
3. Llama a `scFalloArranque(SC_ERR.X, Lang.queryJS('landing.launch.errX'), err)`.
4. **Añádelo a la tabla de arriba** — es la que usa soporte.

`scFalloArranque()` ya se encarga de generar el informe, guardarlo, escribir en el registro, montar
el diálogo con el botón de copiar y devolver el botón JUGAR (`toggleLaunchArea(false)`).
