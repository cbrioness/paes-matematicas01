# Práctica PAES · Competencia Matemática 1 (M1)

Aplicación web estática para rendir ensayos de la prueba PAES de Competencia Matemática 1, construida sobre las pruebas oficiales publicadas por el DEMRE.

Se abre y se responde: no hay pantalla de configuración. La app arma un ensayo de 65 preguntas, inicia el cronómetro oficial de 2 h 20 min y te deja en la pregunta 1.

## Cómo usarla

Requiere servirla por HTTP (la app carga el banco de preguntas por `fetch`, que no funciona abriendo el archivo con `file://`).

```sh
npm install
npm run vendor:katex     # copia KaTeX a vendor/katex/
python3 -m http.server 8080
```

Luego abre `http://localhost:8080/prueba-m1.html`.

## Qué incluye

- **Ensayo de 65 preguntas** con la distribución real por eje temático medida sobre las pruebas oficiales: 22 de Números, 19 de Álgebra y funciones, 12 de Geometría y 12 de Probabilidad y estadística.
- **Corrección al terminar**: puntaje, respuesta correcta y explicación de cada pregunta.
- **Desglose por eje temático y por habilidad**, que es lo útil para saber dónde reforzar.
- **Trazabilidad al corregir**: en el detalle de cada pregunta aparece de qué prueba oficial viene, su número original, su página y el PDF, para poder ir a verla. Durante el ensayo no se muestra, porque adelanta información sobre la pregunta.
- **Ensayos reproducibles**: la misma semilla sobre el mismo pozo genera el mismo ensayo. La semilla y la huella del pozo están en el panel "Ajustes y trazabilidad".
- **Navegación completa**: cuadrícula de 65 preguntas, marcar para revisar, borrar respuesta, navegación por teclado.
- Fórmulas renderizadas con KaTeX, tablas, y soporte de figuras.

## Advertencias importantes

Conviene leerlas antes de usar los resultados para evaluarte.

**La clasificación por eje y habilidad es inferida, no oficial.** Los clavijeros del DEMRE publican únicamente el número de pregunta y la letra correcta: no indican eje temático ni habilidad. Esa clasificación se asignó contrastando cada pregunta con el temario oficial, y cada registro la marca con `clasificacion_origen: inferida`. La distribución del ensayo es una buena aproximación de la prueba real, no una réplica exacta.

**Las preguntas que dependen de una figura están excluidas de este ensayo.** Los gráficos y diagramas de los PDF originales aún no se han extraído, y una pregunta cuyo dato vive en el gráfico es irresoluble sin él. Como consecuencia, Geometría y Probabilidad y estadística quedan representadas por un subconjunto sesgado hacia lo que no necesita diagrama.

**No todas las respuestas tienen el mismo respaldo.** Las claves provienen de los clavijeros oficiales del DEMRE. En tres pruebas (invierno 2024, invierno 2025 y regular 2025) cada pregunta se resolvió de forma independiente antes de consultar la clave, y las 175 resoluciones coincidieron. En la prueba regular 2024 no existe esa verificación independiente completa. El panel de ajustes permite restringir el ensayo solo a las pruebas con verificación doble.

**Las explicaciones de cada pregunta fueron elaboradas para este proyecto**, no provienen del DEMRE. Están marcadas con `explicacion_origen: elaborada`.

## Procedencia del contenido

Los enunciados, las alternativas y las claves de respuesta se transcribieron de las pruebas oficiales de Competencia Matemática 1 publicadas por el [DEMRE](https://demre.cl/) (Departamento de Evaluación, Medición y Registro Educacional, Universidad de Chile). El material original es de sus autores; este repositorio contiene una transcripción estructurada con fines de estudio.

## Estructura

```
prueba-m1.html          vista principal
index.html              redirección a prueba-m1.html
dominio.js              lógica pura: pozo, generación, tokenizador, corrección
dominio.test.js         94 tests (node:test + fast-check)
app.js                  capa de interfaz y estado
banco-preguntas-m1.json banco de preguntas (esquema m1-1.1)
figuras/                imágenes de figuras referenciadas desde el banco
```

Ejecutar los tests:

```sh
npm test
```

## Parámetros de URL

Todos son opcionales y ninguno es fatal: un valor inválido se ignora, se usa el valor por defecto y queda anotado en el panel "Ajustes y trazabilidad".

| Parámetro | Valores | Para qué |
|---|---|---|
| `semilla` | 1–64 caracteres (se trunca si sobra) | repetir un ensayo exacto |
| `verificadas` | `1` / `0` / `true` / `false` | restringir el pozo a las tres pruebas con verificación doble |
| `tiempo` | `ilimitado`, o segundos entre 60 y 36000 | límite a medida; la pantalla de resultados lo declara |
| `notacion` | `1` / `0` / `true` / `false` | abrir con las fórmulas en LaTeX en vez de renderizadas |

Ejemplo: `prueba-m1.html?semilla=visual-66&tiempo=ilimitado`.

## Figuras

Las 121 figuras del banco están hoy con `archivo: null` y se muestran como "Figura no disponible (imagen pendiente)" acompañadas de su descripción y su transcripción, que es lo que permite responder las que no dependen del dibujo. La app **no** navega fuera de su directorio: resuelve `figuras/` + el nombre base del archivo. Cuando se extraigan las imágenes, se copian a `figuras/` conservando el nombre y aparecen solas, sin tocar código.

## Verificación en navegador

Comprobado con Chromium (Playwright) sobre macOS, Apple Silicon, sirviendo con `python3 -m http.server 8080`.

- **Semilla de referencia `visual-66`**: su ensayo contiene `m1-inv24-048` en la posición 9 (el caso del salto de línea: sus pasos 1), 2) y 3) tienen que verse en tres líneas distintas), `m1-reg24-059` en la 19 (tabla sin cabecera: 13 celdas `<td>` en una sola fila) y `m1-reg24-006` en la 39 (tabla + LaTeX + figura pendiente en la misma pregunta).
- `file://` muestra un `role="alert"` con el comando y la URL a abrir, sin dejar ningún botón activo.
- Con `vendor/katex/` ausente, las fórmulas salen como LaTeX legible en monoespaciado, aparece el aviso y la app sigue usable.
- Recorrido completo con teclado, sin ratón: responder, revisar, marcar, saltar por la cuadrícula con las flechas, finalizar y leer los resultados. El foco se ve siempre (contorno de 3 px).
- Correcto / incorrecto se distingue en escala de grises: además del color lleva icono y texto.
- El interruptor "mostrar notación original" alterna sin recargar ni volver a renderizar, y sigue activo al cambiar de pregunta.

**Rendimiento medido** (Chromium, MacBook Apple Silicon, banco de 548 KB):

| Medida | Presupuesto | Medido |
|---|---|---|
| Carga inicial completa (fetch + validación + pozo + barrido de contenido + primer render) | < 1000 ms | 15–48 ms |
| Barrido de avisos de contenido, por separado | — | 4,5–6,1 ms |
| Render de una pregunta con tabla + LaTeX + figura pendiente | < 50 ms | 44 ms la primera vez (incluye el arranque de KaTeX), 0,7–3,6 ms después |

Las tres se pueden volver a medir desde la consola del navegador: `Medidas.cargaInicialMs`, `Medidas.barridoContenidoMs` y `Medidas.medirRenderDe('m1-reg24-006')`.

## Proyecto hermano

La versión de Competencia Lectora comparte arquitectura y convenciones. El esquema del banco se diseñó para que ambas puedan leerse con el mismo código.
