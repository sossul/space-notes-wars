# 🎮 Space Notes Wars

**[▶ Jugar (PC)](https://sossul.github.io/space-notes-wars/)** · **[📱 Jugar (Mobile)](https://sossul.github.io/space-notes-wars/mobile.html)**

> La versión Mobile viene con un tamaño fijo pensado para celular en **horizontal** (estilo iPhone), así se ve completa de entrada sin depender de que el navegador calcule bien el alto disponible.

Un shooter arcade estilo *Space Invaders* para practicar lectura de partituras: cada nave enemiga es una nota musical ubicada en su posición real del pentagrama, y hay que identificarla y "dispararle" antes de que llegue a tu base.

## Por qué existe

La necesidad era simple: **aprender mejor a leer notas musicales**, tanto en clave de Sol como en clave de Fa, de una forma más entretenida que una app de flashcards tradicional. La idea fue inspirarse en la mecánica de reconocimiento rápido de apps tipo "Notes Teacher", pero con la estética y la adrenalina de un arcade espacial retro.

## Cómo jugar

1. Elige un modo:
   - **Clásico** — 8 niveles fijos que van sumando notas de a poco (empieza con Do-Re-Mi y termina cubriendo casi dos octavas, incluso fuera del pentagrama).
   - **Arcade** — estilo *piano tiles*: el set de notas queda fijo según la dificultad elegida, pero la velocidad sube sola con el tiempo, sin límite, hasta que pierdas.
2. Elige la clave: Sol, Fa, o ambas a la vez (como una partitura de piano real).
3. Lee la nota que se acerca y presiona la tecla correspondiente (con el mouse o el teclado — cada tecla del piano muestra su atajo).
4. Solo puedes disparar a la nave **más cercana** a tu base: hay que leer en orden, no se puede "saltar" notas.

Guarda automáticamente tus récords personales (mejor puntaje y mejor tiempo) y qué niveles del modo Clásico ya superaste, todo en el almacenamiento local del navegador.

## Jugarlo localmente

No necesita instalación ni dependencias — es HTML/JS/CSS puro, con audio sintetizado en vivo (Web Audio API, sin archivos de sonido externos).

```bash
python -m http.server 8791
```

y abre `http://localhost:8791`. En Windows también puedes hacer doble clic en `Jugar.bat`, que abre el juego en su propia ventana (sin pestañas ni barra de direcciones), usando Microsoft Edge.

## Tecnología

- Canvas 2D puro (sin librerías ni frameworks)
- Web Audio API para todo el sonido (piano, láser, explosiones)
- Sin build step: son 3 archivos (`index.html`, `game.js`, `style.css`) más el sprite del enemigo
