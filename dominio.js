// dominio.js
//
// Capa de dominio pura de la Práctica PAES · Competencia Matemática 1 (M1).
//
// Aquí viven las constantes del esquema, la validación del banco, la
// construcción del pozo utilizable, el PRNG reproducible y la generación del
// ensayo calibrado, el tokenizador de contenido, la corrección y los
// resultados, el cronómetro, las transiciones del modelo de estado y la
// construcción de los avisos. Todo son funciones puras: ningún acceso al DOM
// y ninguna escritura en consola, de modo que el archivo se pueda cargar tanto
// desde `prueba-m1.html` (vía <script src="dominio.js">) como desde los tests
// de Node (`node --test` + fast-check), sin navegador.
//
// Única excepción a la pureza, declarada: `prepararConfig` llama a `Date.now()`
// cuando la semilla llega vacía, porque §7.14 fija `String(Date.now())` como su
// valor por defecto. Ninguna otra función del archivo lee el reloj: el tiempo
// entra siempre por parámetro (`ahoraMs`).
//
// Referencia: .agents/tasks/design.md §7.5 (API), §7.6 (generación), RF-2.5
// (orden de los motivos de descarte). El documento de diseño es la fuente de
// verdad; donde quedaba ambiguo, la decisión va anotada en un comentario.

// ---------------------------------------------------------------------------
// Constantes del esquema M1
// ---------------------------------------------------------------------------

/** Las 4 habilidades de M1 (reemplazan a los 7 tipos de lectura de Lenguaje). */
var HABILIDADES_M1 = new Set([
  'resolver_problemas',
  'modelar',
  'representar',
  'argumentar',
]);

/** Los 4 ejes temáticos de M1. */
var EJES_M1 = new Set([
  'numeros',
  'algebra_y_funciones',
  'geometria',
  'probabilidad_y_estadistica',
]);

/** Familia de esquema soportada: `m1-1.x` (§8.1: el snapshot dice `m1-1.1`). */
var ESQUEMA_SOPORTADO = /^m1-1\.\d+$/;

/**
 * Los 8 rangos de distribución de preguntas que DEMRE publicó SOLO en el
 * temario T24I (identificadores E-D1..E-D8).
 *
 * PROCEDENCIA: `docs/matematicas/temario-m1.md`, líneas 84-91, verbatim:
 *   E-D1 Resolver Problemas: entre 21 y 38 preguntas.
 *   E-D2 Representar: entre 9 y 24 preguntas.
 *   E-D3 Modelar: entre 3 y 15 preguntas.
 *   E-D4 Argumentar: entre 3 y 9 preguntas.
 *   E-D5 Números: entre 12 y 24 preguntas.
 *   E-D6 Álgebra y funciones: entre 9 y 18 preguntas.
 *   E-D7 Geometría: entre 6 y 15 preguntas.
 *   E-D8 Probabilidad y estadística: entre 6 y 15 preguntas.
 *
 * DEMRE dejó de publicarlos desde T24R. Se usan SOLO para declarar la
 * desviación de la app (RF-8.5, RF-8.6), NUNCA como cuota.
 */
var RANGOS_T24I = {
  resolver_problemas: [21, 38],
  representar: [9, 24],
  modelar: [3, 15],
  argumentar: [3, 9],
  numeros: [12, 24],
  algebra_y_funciones: [9, 18],
  geometria: [6, 15],
  probabilidad_y_estadistica: [6, 15],
};

/**
 * Pruebas cuyo clavijero se verificó a ciegas de forma independiente
 * (175/175 preguntas).
 *
 * PROCEDENCIA: el único origen de este dato es el brief del encargo. NO lo
 * respalda ningún archivo del repositorio: `banco-preguntas-m1.json` solo trae
 * `estado_clave` ('oficial' en las 5 pruebas), que describe el clavijero y no
 * la verificación. Queda fuera regular 2024 porque solo 5 de sus 65 se
 * resolvieron a ciegas.
 *
 * Si algún día `pruebas[]` gana un campo `verificacion`, esta constante debe
 * pasar a LEERLO en vez de llevar los ids a mano, y el criterio 9bis debe
 * seguirla.
 */
var PRUEBAS_VERIFICADAS_CIEGO = new Set([
  '2024-23-06-22-paes-invierno-oficial-matematica1-p2024',  // invierno 2024
  '2025-24-06-19-paes-invierno-oficial-matematica1-p2025',  // invierno 2025
  '2025-24-12-04-paes-regular-matematica1-p2025',           // regular 2025 (sin "-oficial")
]);

/**
 * Vocabulario CERRADO de los motivos que puede emitir `motivosInvalidez`, en
 * el orden exacto de la tabla de §7.5. Un motivo que no esté en esta lista es
 * un bug, no un caso nuevo (criterio 6).
 */
var MOTIVOS_INVALIDEZ = [
  'id',
  'texto_lectura_id',
  'prueba_id',
  'numero_original',
  'pagina_pdf',
  'enunciado',
  'alternativas.length',
  'alternativas.ids',
  'alternativas.texto',
  'estado_respuesta',
  'alternativa_correcta',
  'alternativa_correcta_sin_clave',
  'sin_puntaje',
  'explicacion',
  'explicacion_origen',
  'habilidad',
  'tipo_pregunta',
  'eje',
  'contenido_id',
  'clasificacion_origen',
  'figura_ids',
  'requiere_figura',
  'estado_enunciado',
  'tipo',
  'documento_origen',
  'notas_extraccion',
];

/**
 * Nombre legible de los 53 `contenido_id` presentes en el banco COMPLETO (no
 * los 45 del pozo). Los nombres son verbatim de `docs/matematicas/temario-m1.md`.
 *
 * Los tres ids de la unidad G4 ("Semejanza y proporcionalidad de figuras
 * planas") llevan la nota de unidad eliminada desde T24R (caso borde 9): son
 * preguntas oficiales que el estudiante rindió, así que se muestran tal cual y
 * no se fuerzan a un id vigente. El banco usa 3 de los 4 contenidos de G4
 * (`G4.2`, `G4.3`, `G4.4`); `G4.1` no etiqueta ninguna pregunta y por eso no
 * está aquí: esta tabla cubre exactamente los ids del banco.
 */
var NOMBRES_CONTENIDO = {
  'N1.1a': 'Operaciones y orden en el conjunto de los números enteros y racionales.',
  'N1.1b': 'Operaciones y orden en el conjunto de los números enteros.',
  'N1.1c': 'Operaciones y comparación entre números en el conjunto de los números racionales.',
  'N1.2': 'Problemas que involucren el conjunto de los números enteros y racionales en diversos contextos.',
  'N2.1': 'Concepto y cálculo de porcentaje.',
  'N2.2': 'Problemas que involucren porcentaje en diversos contextos.',
  'N3.1': 'Propiedades de las potencias de base racional y exponente racional.',
  'N3.2': 'Descomposición y propiedades de las raíces enésimas en los números reales.',
  'N3.3': 'Problemas que involucren potencias y raíces enésimas en los números reales en diversos contextos.',
  'A1.1': 'Productos notables.',
  'A1.2a': 'Factorizaciones de expresiones algebraicas.',
  'A1.2b': 'Factorizaciones y desarrollo de expresiones algebraicas.',
  'A1.3': 'Operatoria con expresiones algebraicas.',
  'A1.4': 'Problemas que involucren expresiones algebraicas en diversos contextos.',
  'A2.1': 'Concepto de proporción directa e inversa con sus diferentes representaciones.',
  'A2.2': 'Problemas que involucren proporción directa e inversa en diversos contextos.',
  'A3.1': 'Resolución de ecuaciones lineales.',
  'A3.2': 'Problemas que involucren ecuaciones lineales en diversos contextos.',
  'A3.3': 'Resolución de inecuaciones lineales.',
  'A3.4': 'Problemas que involucren inecuaciones lineales en diversos contextos.',
  'A4.1': 'Resolución de sistemas de ecuaciones lineales.',
  'A4.2': 'Problemas que involucren sistemas de ecuaciones lineales en diversos contextos.',
  'A5.2': 'Tablas y gráficos de función lineal y función afín.',
  'A5.3': 'Problemas que involucren función lineal y función afín en diversos contextos.',
  'A6.1': 'Resolución y problemas de ecuaciones de segundo grado en diversos contextos.',
  'A6.2': 'Tablas y gráficos de la función cuadrática, considerando la variación de sus parámetros.',
  'A6.3': 'Puntos especiales de la gráfica de la función cuadrática: vértice, ceros de la función e intersección con los ejes.',
  'A6.4': 'Problemas que involucren la función cuadrática en diversos contextos.',
  'G1.1': 'Problemas que involucren el Teorema de Pitágoras en diversos contextos.',
  'G1.2a': 'Perímetro y áreas de triángulos, paralelogramos, trapecios, círculos, segmentos y sectores circulares.',
  'G1.3a': 'Problemas que involucren perímetro y áreas de triángulos, paralelogramos, trapecios, círculos, segmentos y sectores circulares en diversos contextos.',
  'G1.3b': 'Problemas que involucren perímetro y áreas de triángulos, paralelogramos, trapecios y círculos en diversos contextos.',
  'G2.1b': 'Área de superficies de prismas rectos con diferentes bases y cilindros.',
  'G2.2a': 'Volumen de prismas rectos con diferentes bases, cilindros y conos.',
  'G2.2b': 'Volumen de prismas rectos con diferentes bases y cilindros.',
  'G2.3a': 'Problemas que involucren área y volumen de prismas rectos, cilindros y conos en diversos contextos.',
  'G2.3b': 'Problemas que involucren área y volumen de prismas rectos y cilindros en diversos contextos.',
  'G3.1': 'Puntos y vectores en el plano cartesiano.',
  'G3.2': 'Rotación, traslación y reflexión de figuras geométricas.',
  'G3.3': 'Problemas que involucren rotación, traslación y reflexión en diversos contextos.',
  'G4.2': 'Modelos a escala. (contenido del temario T24I, unidad eliminada desde T24R)',
  'G4.3': 'Problemas que involucren propiedades de semejanza en diversos contextos. (contenido del temario T24I, unidad eliminada desde T24R)',
  'G4.4': 'Problemas que involucren el Teorema de Thales en diversos contextos. (contenido del temario T24I, unidad eliminada desde T24R)',
  'P1.1': 'Tablas de frecuencia absoluta y relativa.',
  'P1.2': 'Tipos de gráficos que permitan representar datos.',
  'P1.3': 'Problemas que involucren tablas y gráficos en diversos contextos.',
  'P2.1': 'Medidas de tendencia central y rango de uno o más grupos de datos.',
  'P2.2': 'Problemas que involucren medidas de tendencia central y rango en diversos contextos.',
  'P3.1': 'Cuartiles y percentiles de uno o más grupos de datos.',
  'P3.2': 'Diagrama de cajón para representar distribución de datos.',
  'P3.3': 'Problemas que involucren medidas de posición en diversos contextos.',
  'P4.1': 'Problemas que involucren probabilidad de un evento en diversos contextos.',
  'P4.2': 'Problemas que involucren la regla aditiva y multiplicativa de probabilidades en diversos contextos.',
};

/**
 * Vocabulario CERRADO de códigos de aviso, con el DUEÑO de cada uno (hallazgo
 * 8 del review). `agregarAvisos` agrupa por código, así que dos advertencias
 * fijas que compartieran código se fusionarían en una: las 6 de RF-8 llevan 6
 * códigos DISTINTOS.
 *
 * Dueño único por código, para que nadie reemita lo que ya emitió otro:
 *
 *   fijos de RF-8 (severidad 'info', solo `construirAvisos`):
 *     clasificacion_inferida, sesgo_figuras, pruebas_usadas,
 *     no_es_puntaje_paes, desviacion_cuota_eje, mezcla_habilidades
 *   integridad del banco (solo `validarBanco`, SIN agregar):
 *     esquema_version, coleccion_ausente, ids_duplicados, prueba_inexistente,
 *     prueba_invalida, figura_rota, figura_huerfana, figura_invalida,
 *     figura_alternativa_incoherente
 *   descartes del pozo (solo `construirAvisos`, a partir de `descartes`):
 *     esquema_invalido, prueba_incompleta
 *   render de figuras (solo `app.js`, tabla de RF-6 con la fila del hallazgo 7):
 *     figura_sin_contenido
 *   tokenizador (solo `recolectarAvisosDeContenido`, que los reemite del
 *   tokenizador con el id de la pregunta):
 *     dolar_impar, marcador_malformado, marcador_inline,
 *     tabla_sin_separadora, tabla_fila_irregular, tabla_sin_cabecera
 *   configuración (solo `prepararConfig`):
 *     url_invalida, semilla_truncada
 *   entorno (solo `app.js`):
 *     katex_ausente
 */
var CODIGOS_AVISO = new Set([
  'clasificacion_inferida',
  'sesgo_figuras',
  'pruebas_usadas',
  'no_es_puntaje_paes',
  'desviacion_cuota_eje',
  'mezcla_habilidades',
  'esquema_version',
  'coleccion_ausente',
  'ids_duplicados',
  'prueba_inexistente',
  'prueba_invalida',
  'figura_rota',
  'figura_huerfana',
  'figura_invalida',
  'figura_alternativa_incoherente',
  'esquema_invalido',
  'prueba_incompleta',
  'figura_sin_contenido',
  'dolar_impar',
  'marcador_malformado',
  'marcador_inline',
  'tabla_sin_separadora',
  'tabla_fila_irregular',
  'tabla_sin_cabecera',
  'url_invalida',
  'semilla_truncada',
  'katex_ausente',
]);

/** Inicial de `contenido_id` que corresponde a cada eje (§7.5). */
var INICIAL_POR_EJE = {
  numeros: 'N',
  algebra_y_funciones: 'A',
  geometria: 'G',
  probabilidad_y_estadistica: 'P',
};

/** Forma válida de un `contenido_id`: 13 de los 53 llevan sufijo de letra. */
var PATRON_CONTENIDO = /^[NAGP][1-9]\.[1-9][a-c]?$/;

// ---------------------------------------------------------------------------
// Utilidades internas (no exportadas)
// ---------------------------------------------------------------------------

/** Indica si `v` es un string no vacío tras `trim`. */
function esTextoNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Indica si `v` es un entero dentro de `[min, max]`. */
function esEnteroEnRango(v, min, max) {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/** Indica si `lista` es un array de enteros en `[min, max]` sin duplicados. */
function esListaDeEnterosUnicos(lista, min, max) {
  if (!Array.isArray(lista)) return false;
  if (!lista.every(function (n) { return esEnteroEnRango(n, min, max); })) return false;
  return new Set(lista).size === lista.length;
}

/**
 * Construye un Aviso. `extra` puede traer `detalle` (prosa), `datos`
 * (estructurado, hallazgo 9) y `conteo`.
 */
function crearAviso(codigo, severidad, texto, extra) {
  var aviso = { codigo: codigo, severidad: severidad, texto: texto };
  if (extra && extra.detalle !== undefined) aviso.detalle = extra.detalle;
  if (extra && extra.datos !== undefined) aviso.datos = extra.datos;
  if (extra && extra.conteo !== undefined) aviso.conteo = extra.conteo;
  return aviso;
}

/** Marcador de figura tal como aparece en el contenido: `[[figura:<id>]]`. */
function marcadorDeFigura(idFigura) {
  return '[[figura:' + idFigura + ']]';
}

// ---------------------------------------------------------------------------
// Validación de esquema
// ---------------------------------------------------------------------------

/**
 * Devuelve los nombres de campo que incumplen el esquema M1 de una pregunta,
 * en el orden de declaración de la tabla de §7.5. Vocabulario cerrado:
 * `MOTIVOS_INVALIDEZ`.
 *
 * No comprueba lo que no es asunto de una pregunta aislada (unicidad de ids,
 * resolución de `figura_ids`, coherencia con `prueba.sin_puntaje[]`): eso vive
 * en `validarBanco`.
 *
 * @param {Object} pregunta
 * @returns {Array<string>} motivos; vacío si la pregunta es válida
 */
function motivosInvalidez(pregunta) {
  // Un registro que no es objeto no tiene ni `id`: se emite ese motivo, que es
  // el primero de la tabla, para no inventar un motivo fuera del vocabulario.
  if (typeof pregunta !== 'object' || pregunta === null) return ['id'];

  var motivos = [];
  var p = pregunta;

  if (!esTextoNoVacio(p.id)) motivos.push('id');
  if (p.texto_lectura_id !== null) motivos.push('texto_lectura_id');
  if (!esTextoNoVacio(p.prueba_id)) motivos.push('prueba_id');
  if (!esEnteroEnRango(p.numero_original, 1, 65)) motivos.push('numero_original');
  if (!(typeof p.pagina_pdf === 'number' && Number.isInteger(p.pagina_pdf) && p.pagina_pdf >= 1)) {
    motivos.push('pagina_pdf');
  }
  if (!esTextoNoVacio(p.enunciado)) motivos.push('enunciado');

  var alternativas = Array.isArray(p.alternativas) ? p.alternativas : null;
  if (alternativas === null || alternativas.length !== 4) {
    motivos.push('alternativas.length');
  }
  if (alternativas !== null) {
    var ids = alternativas
      .map(function (a) { return a && typeof a.id === 'string' ? a.id : ''; })
      .join('');
    if (ids !== 'ABCD') motivos.push('alternativas.ids');
    if (!alternativas.every(function (a) { return a !== null && typeof a === 'object' && esTextoNoVacio(a.texto); })) {
      motivos.push('alternativas.texto');
    }
  } else {
    motivos.push('alternativas.ids');
    motivos.push('alternativas.texto');
  }

  if (p.estado_respuesta !== 'oficial' && p.estado_respuesta !== 'sin_clave') {
    motivos.push('estado_respuesta');
  }
  // Las dos ramas son MUTUAMENTE EXCLUYENTES: para una pregunta dada solo uno
  // de los dos motivos puede salir.
  if (p.estado_respuesta === 'oficial') {
    var apunta = alternativas !== null && alternativas.some(function (a) {
      return a !== null && typeof a === 'object' && a.id === p.alternativa_correcta;
    });
    if (!apunta) motivos.push('alternativa_correcta');
  } else if (p.estado_respuesta === 'sin_clave') {
    if (p.alternativa_correcta !== null) motivos.push('alternativa_correcta_sin_clave');
  }

  if (typeof p.sin_puntaje !== 'boolean') motivos.push('sin_puntaje');
  if (!esTextoNoVacio(p.explicacion)) motivos.push('explicacion');
  if (p.explicacion_origen !== 'elaborada' && p.explicacion_origen !== 'oficial') {
    motivos.push('explicacion_origen');
  }
  if (!HABILIDADES_M1.has(p.habilidad)) motivos.push('habilidad');
  if (p.tipo_pregunta !== p.habilidad) motivos.push('tipo_pregunta');
  if (!EJES_M1.has(p.eje)) motivos.push('eje');
  if (typeof p.contenido_id !== 'string' ||
      !PATRON_CONTENIDO.test(p.contenido_id) ||
      p.contenido_id.charAt(0) !== INICIAL_POR_EJE[p.eje]) {
    motivos.push('contenido_id');
  }
  if (p.clasificacion_origen !== 'inferida' && p.clasificacion_origen !== 'oficial') {
    motivos.push('clasificacion_origen');
  }
  if (!Array.isArray(p.figura_ids) || !p.figura_ids.every(esTextoNoVacio)) {
    motivos.push('figura_ids');
  }
  if (typeof p.requiere_figura !== 'boolean') motivos.push('requiere_figura');
  if (p.estado_enunciado !== 'completo' && p.estado_enunciado !== 'ilegible_parcial') {
    motivos.push('estado_enunciado');
  }
  if (p.tipo !== 'real' && p.tipo !== 'generada') motivos.push('tipo');
  if (!esTextoNoVacio(p.documento_origen)) motivos.push('documento_origen');
  // `notas_extraccion` es array en las 282; se acepta `null` por tolerancia.
  if (!(p.notas_extraccion === null ||
        (Array.isArray(p.notas_extraccion) &&
         p.notas_extraccion.every(function (n) { return typeof n === 'string'; })))) {
    motivos.push('notas_extraccion');
  }

  return motivos;
}

/**
 * Predicado de validez de una pregunta M1. Única fuente de verdad compartida
 * con `motivosInvalidez`, que es quien lleva las reglas.
 *
 * `validarPregunta` de Lenguaje no se reimporta ni se parametriza: sus cuatro
 * reglas incompatibles están en la tabla de §7.5.
 *
 * @param {Object} pregunta
 * @returns {boolean}
 */
function validarPreguntaM1(pregunta) {
  return motivosInvalidez(pregunta).length === 0;
}

/**
 * Devuelve los nombres de campo que incumplen el esquema de una prueba
 * (hallazgo 5 del review). Un motivo no vacío es FATAL: `validarBanco` lo
 * manda a `errores` y `construirPozo` no se ejecuta.
 *
 * @param {Object} prueba
 * @returns {Array<string>} motivos; vacío si la prueba es válida
 */
function validarPrueba(prueba) {
  if (typeof prueba !== 'object' || prueba === null) return ['id'];

  var motivos = [];
  if (!esTextoNoVacio(prueba.id)) motivos.push('id');
  if (!esEnteroEnRango(prueba.n_preguntas, 1, 65)) motivos.push('n_preguntas');

  if (!esListaDeEnterosUnicos(prueba.preguntas_no_publicadas, 1, 65) ||
      (esEnteroEnRango(prueba.n_preguntas, 1, 65) &&
       prueba.preguntas_no_publicadas.length > prueba.n_preguntas)) {
    motivos.push('preguntas_no_publicadas');
  }
  if (!esListaDeEnterosUnicos(prueba.sin_puntaje, 1, 65)) motivos.push('sin_puntaje');

  if (prueba.estado_clave !== 'oficial' &&
      prueba.estado_clave !== 'preliminar' &&
      prueba.estado_clave !== 'ausente') {
    motivos.push('estado_clave');
  }
  if (!esTextoNoVacio(prueba.documento_origen)) motivos.push('documento_origen');
  if (!esTextoNoVacio(prueba.formato_folleto)) motivos.push('formato_folleto');
  if (!esTextoNoVacio(prueba.fuente)) motivos.push('fuente');

  return motivos;
}

/**
 * Devuelve los nombres de campo que incumplen el esquema de una figura
 * (hallazgo 6 del review). Gravedad RECUPERABLE: `validarBanco` emite el aviso
 * `figura_invalida` y la figura se trata como NO resuelta, reusando la
 * degradación de la referencia rota de RF-6.
 *
 * @param {Object} figura
 * @returns {Array<string>} motivos; vacío si la figura es válida
 */
function validarFigura(figura) {
  if (typeof figura !== 'object' || figura === null) return ['id'];

  var motivos = [];
  if (!esTextoNoVacio(figura.id)) motivos.push('id');
  if (!esTextoNoVacio(figura.pregunta_id)) motivos.push('pregunta_id');
  if (figura.rol !== 'enunciado' && figura.rol !== 'alternativa') motivos.push('rol');
  if (figura.estado !== 'pendiente' && figura.estado !== 'extraida' && figura.estado !== 'descartada') {
    motivos.push('estado');
  }
  if (!(figura.archivo === null || esTextoNoVacio(figura.archivo))) motivos.push('archivo');
  if (!(figura.descripcion === null || typeof figura.descripcion === 'string')) {
    motivos.push('descripcion');
  }
  if (!(figura.transcripcion === null || typeof figura.transcripcion === 'string')) {
    motivos.push('transcripcion');
  }
  if (!(typeof figura.pagina_pdf === 'number' && Number.isInteger(figura.pagina_pdf) && figura.pagina_pdf >= 1)) {
    motivos.push('pagina_pdf');
  }
  // `alternativa_id` es obligatorio cuando el rol es 'alternativa' (es el único
  // contrato del campo, RF-6) y tiene que ser una de las 4 alternativas.
  var idAlternativaValido = figura.alternativa_id === 'A' || figura.alternativa_id === 'B' ||
                            figura.alternativa_id === 'C' || figura.alternativa_id === 'D';
  if (figura.rol === 'alternativa') {
    if (!idAlternativaValido) motivos.push('alternativa_id');
  } else if (!(figura.alternativa_id === null || idAlternativaValido)) {
    motivos.push('alternativa_id');
  }

  return motivos;
}

/**
 * Indica si una lista de registros con campo `id` no contiene identificadores
 * duplicados. Reutilizada tal cual de `paes_lenguaje01/dominio.js`.
 *
 * @param {Array<{id: string}>} registros
 * @returns {boolean}
 */
function tieneIdsUnicos(registros) {
  const ids = registros.map((r) => r.id);
  return new Set(ids).size === ids.length;
}

/**
 * Devuelve las referencias cruzadas que no resuelven. La gravedad depende de
 * la DIRECCIÓN de la referencia (RF-1.4) y la decide `validarBanco`:
 * `prueba_inexistente` es fatal; `figura_rota` y `figura_huerfana` son
 * recuperables.
 *
 * @param {Object} banco
 * @returns {Array<{tipo: string, origenId: string, destinoId: string}>}
 *   tipo ∈ {'prueba_inexistente', 'figura_rota', 'figura_huerfana'}
 */
function referenciasRotas(banco) {
  var rotas = [];
  var idsPrueba = new Set(banco.pruebas.map(function (pr) { return pr.id; }));
  var idsFigura = new Set(banco.figuras.map(function (f) { return f.id; }));
  var idsPregunta = new Set(banco.preguntas.map(function (p) { return p.id; }));

  banco.preguntas.forEach(function (p) {
    if (!idsPrueba.has(p.prueba_id)) {
      rotas.push({ tipo: 'prueba_inexistente', origenId: p.id, destinoId: p.prueba_id });
    }
    (Array.isArray(p.figura_ids) ? p.figura_ids : []).forEach(function (idFig) {
      if (!idsFigura.has(idFig)) {
        rotas.push({ tipo: 'figura_rota', origenId: p.id, destinoId: idFig });
      }
    });
  });

  banco.figuras.forEach(function (f) {
    if (!idsPregunta.has(f.pregunta_id)) {
      rotas.push({ tipo: 'figura_huerfana', origenId: f.id, destinoId: f.pregunta_id });
    }
  });

  return rotas;
}

/**
 * Valida el banco completo.
 *
 * Fatal (`errores`, la app no arranca): `esquema_version` fuera de `m1-1.x`,
 * colecciones que no son arrays, ids duplicados, `prueba_inexistente` y
 * cualquier motivo de `validarPrueba`.
 *
 * Recuperable (`avisos`): `figura_rota`, `figura_huerfana`, `figura_invalida` y
 * `figura_alternativa_incoherente`. Las preguntas que no cumplen el esquema NO
 * se cuentan aquí: las descarta `construirPozo` con motivo `esquema_invalido` y
 * el aviso lo redacta `construirAvisos` desde ese conteo.
 *
 * DUEÑO ÚNICO (hallazgo 8): estos cuatro avisos se devuelven SIN agregar y no
 * los reemite nadie más. `agregarAvisos` es el paso previo a pintarlos.
 *
 * @param {Object} banco
 * @returns {{valido: boolean, errores: Array<Object>, avisos: Array<Object>}}
 */
function validarBanco(banco) {
  var errores = [];
  var avisos = [];

  if (typeof banco !== 'object' || banco === null) {
    errores.push(crearAviso('coleccion_ausente', 'error',
      'El banco de preguntas no es un objeto válido.'));
    return { valido: false, errores: errores, avisos: avisos };
  }

  if (!ESQUEMA_SOPORTADO.test(String(banco.esquema_version))) {
    errores.push(crearAviso('esquema_version', 'error',
      'Versión de esquema no soportada: ' + banco.esquema_version + ' (se espera m1-1.x).',
      { datos: { encontrada: banco.esquema_version, esperada: 'm1-1.x' } }));
  }
  ['pruebas', 'preguntas', 'figuras', 'textos'].forEach(function (coleccion) {
    if (!Array.isArray(banco[coleccion])) {
      errores.push(crearAviso('coleccion_ausente', 'error',
        'La colección "' + coleccion + '" no es un array.',
        { datos: { coleccion: coleccion } }));
    }
  });
  // Sin estructura no se puede seguir comprobando nada: se corta aquí.
  if (errores.length > 0) return { valido: false, errores: errores, avisos: avisos };

  ['pruebas', 'preguntas', 'figuras'].forEach(function (coleccion) {
    if (!tieneIdsUnicos(banco[coleccion])) {
      var vistos = new Set();
      var duplicados = [];
      banco[coleccion].forEach(function (r) {
        if (vistos.has(r.id)) duplicados.push(r.id);
        vistos.add(r.id);
      });
      errores.push(crearAviso('ids_duplicados', 'error',
        'Hay ' + duplicados.length + ' id duplicado(s) en "' + coleccion + '".',
        { datos: { coleccion: coleccion, ids: duplicados.slice(0, 5) } }));
    }
  });

  banco.pruebas.forEach(function (pr) {
    var motivos = validarPrueba(pr);
    if (motivos.length > 0) {
      errores.push(crearAviso('prueba_invalida', 'error',
        'La prueba "' + pr.id + '" no cumple el esquema: ' + motivos.join(', ') + '.',
        { datos: { ids: [pr.id], motivos: motivos } }));
    }
  });

  referenciasRotas(banco).forEach(function (r) {
    if (r.tipo === 'prueba_inexistente') {
      errores.push(crearAviso('prueba_inexistente', 'error',
        'La pregunta ' + r.origenId + ' cita la prueba ' + r.destinoId + ', que no existe.',
        { datos: { ids: [r.origenId, r.destinoId] } }));
    } else if (r.tipo === 'figura_rota') {
      avisos.push(crearAviso('figura_rota', 'aviso',
        'La pregunta ' + r.origenId + ' cita la figura ' + r.destinoId + ', que no existe.',
        { datos: { ids: [r.origenId, r.destinoId] } }));
    } else {
      avisos.push(crearAviso('figura_huerfana', 'aviso',
        'La figura ' + r.origenId + ' cita la pregunta ' + r.destinoId + ', que no existe.',
        { datos: { ids: [r.origenId, r.destinoId] } }));
    }
  });

  var preguntaPorId = new Map(banco.preguntas.map(function (p) { return [p.id, p]; }));

  banco.figuras.forEach(function (f) {
    var motivos = validarFigura(f);
    if (motivos.length > 0) {
      avisos.push(crearAviso('figura_invalida', 'aviso',
        'La figura ' + f.id + ' no cumple el esquema: ' + motivos.join(', ') +
        '; se trata como no resuelta.',
        { datos: { ids: [f.id], motivos: motivos } }));
      return;
    }
    if (f.rol !== 'alternativa') return;
    // Único contrato de `alternativa_id`: el marcador de esta figura tiene que
    // estar en el texto de la alternativa que el campo señala. El render no usa
    // el campo (resuelve el marcador en la dirección contraria, RF-6).
    var pregunta = preguntaPorId.get(f.pregunta_id);
    if (pregunta === undefined) return;  // ya avisado como figura_huerfana
    var alternativa = (pregunta.alternativas || []).find(function (a) {
      return a.id === f.alternativa_id;
    });
    var marcador = marcadorDeFigura(f.id);
    if (alternativa === undefined || alternativa.texto.indexOf(marcador) === -1) {
      avisos.push(crearAviso('figura_alternativa_incoherente', 'aviso',
        'La figura ' + f.id + ' dice ser de la alternativa ' + f.alternativa_id +
        ' de ' + f.pregunta_id + ', pero su marcador no está en el texto de esa alternativa.',
        { datos: { ids: [f.id, f.pregunta_id], alternativaId: f.alternativa_id } }));
    }
  });

  return { valido: errores.length === 0, errores: errores, avisos: avisos };
}

// ---------------------------------------------------------------------------
// Pozo utilizable
// ---------------------------------------------------------------------------

/**
 * Los 7 motivos de descarte EN ORDEN DE PRECEDENCIA (RF-2.5). El primero que
 * aplica gana, de modo que cada pregunta descartada cuenta en exactamente un
 * motivo. `figura_rota` va ANTES de `figura_requerida` a propósito: con el
 * orden inverso `figura_rota` sería inalcanzable para toda pregunta con
 * `requiere_figura: true`.
 */
var MOTIVOS_DESCARTE = [
  'esquema_invalido',
  'prueba_incompleta',
  'prueba_no_verificada',
  'figura_rota',
  'figura_requerida',
  'sin_clave',
  'ilegible',
];

/**
 * Indica si una prueba está completa, derivándolo de los datos (RF-2.1) y no
 * de una lista de ids: completa cuando las preguntas presentes en el banco son
 * `n_preguntas - preguntas_no_publicadas.length`.
 *
 * `nEnBanco` es 0 cuando la prueba no aporta ninguna pregunta: `construirPozo`
 * inicializa el conteo de las 5 pruebas en 0 ANTES de recorrer `preguntas[]`,
 * así que nunca llega `undefined` (caso borde 24). Una prueba declarada con 0
 * preguntas presentes es incompleta.
 *
 * @param {Object} prueba
 * @param {number} nEnBanco
 * @returns {boolean}
 */
function pruebaCompleta(prueba, nEnBanco) {
  var noPublicadas = Array.isArray(prueba.preguntas_no_publicadas)
    ? prueba.preguntas_no_publicadas.length
    : 0;
  return nEnBanco === prueba.n_preguntas - noPublicadas;
}

/**
 * Devuelve la figura con ese id, o `null` si no resuelve.
 *
 * @param {Object} banco
 * @param {string} idFigura
 * @returns {Object|null}
 */
function resolverFigura(banco, idFigura) {
  var figura = banco.figuras.find(function (f) { return f.id === idFigura; });
  return figura === undefined ? null : figura;
}

/**
 * Construye el pozo de preguntas utilizables.
 *
 * Evalúa los 7 motivos de `MOTIVOS_DESCARTE` en orden y el primero que aplica
 * gana, así que cada pregunta descartada cuenta en UN solo motivo. Comprueba la
 * identidad `suma(descartes) + pozo.length === banco.preguntas.length` y lanza
 * si no se cumple: es la red que detecta un motivo contado dos veces o una
 * pregunta que se cayó sin motivo.
 *
 * `idsDescartados` está acotado a los primeros 50 ids por motivo (hallazgo 12).
 * Lo consumen `construirAvisos` para el campo `datos.ids` de sus avisos y el
 * `console.warn` de arranque de `app.js`; no es una lista completa y no se debe
 * usar para contar (para eso está `descartes`).
 *
 * @param {Object} banco
 * @param {{soloVerificadas?: boolean}} [opciones]
 * @returns {{pozo: Array<Object>, descartes: Object<string,number>, idsDescartados: Object<string,Array<string>>}}
 */
function construirPozo(banco, opciones) {
  var soloVerificadas = !!(opciones && opciones.soloVerificadas);
  var LIMITE_IDS = 50;

  var descartes = {};
  var idsDescartados = {};
  MOTIVOS_DESCARTE.forEach(function (motivo) {
    descartes[motivo] = 0;
    idsDescartados[motivo] = [];
  });

  // Conteo de preguntas presentes por prueba, inicializado en 0 para las 5
  // pruebas declaradas ANTES de recorrer preguntas[] (caso borde 24).
  var presentes = new Map();
  banco.pruebas.forEach(function (pr) { presentes.set(pr.id, 0); });
  banco.preguntas.forEach(function (p) {
    if (presentes.has(p.prueba_id)) presentes.set(p.prueba_id, presentes.get(p.prueba_id) + 1);
  });

  var pruebaPorId = new Map(banco.pruebas.map(function (pr) { return [pr.id, pr]; }));
  var figuraPorId = new Map(banco.figuras.map(function (f) { return [f.id, f]; }));

  var pozo = [];
  banco.preguntas.forEach(function (p) {
    var motivo = motivoDeDescarte(p, pruebaPorId, presentes, figuraPorId, soloVerificadas);
    if (motivo === null) {
      pozo.push(p);
      return;
    }
    descartes[motivo] += 1;
    if (idsDescartados[motivo].length < LIMITE_IDS) idsDescartados[motivo].push(p.id);
  });

  var suma = MOTIVOS_DESCARTE.reduce(function (acc, m) { return acc + descartes[m]; }, 0);
  if (suma + pozo.length !== banco.preguntas.length) {
    throw new Error('construirPozo: suma de descartes (' + suma + ') + pozo (' + pozo.length +
      ') !== preguntas del banco (' + banco.preguntas.length + ').');
  }

  return { pozo: pozo, descartes: descartes, idsDescartados: idsDescartados };
}

/**
 * Primer motivo de descarte que aplica a una pregunta, o `null` si entra al
 * pozo. Interna: el orden de las comprobaciones es el contrato (RF-2.5).
 */
function motivoDeDescarte(p, pruebaPorId, presentes, figuraPorId, soloVerificadas) {
  if (!validarPreguntaM1(p)) return 'esquema_invalido';

  var prueba = pruebaPorId.get(p.prueba_id);
  // Una prueba que no resuelve ya es fatal en validarBanco; si se llega aquí
  // por otra vía, la pregunta no se puede situar y se trata como incompleta.
  if (prueba === undefined) return 'prueba_incompleta';
  if (!pruebaCompleta(prueba, presentes.get(p.prueba_id) || 0)) return 'prueba_incompleta';

  if (soloVerificadas && !PRUEBAS_VERIFICADAS_CIEGO.has(p.prueba_id)) return 'prueba_no_verificada';

  var figuras = [];
  var hayRota = false;
  p.figura_ids.forEach(function (idFig) {
    var figura = figuraPorId.get(idFig);
    if (figura === undefined) hayRota = true;
    else figuras.push(figura);
  });
  if (hayRota) return 'figura_rota';

  // Acotado a las figuras QUE RESUELVEN: una que no resuelve ya cayó arriba.
  if (p.requiere_figura && figuras.some(function (f) { return f.archivo === null; })) {
    return 'figura_requerida';
  }

  if (p.alternativa_correcta === null) return 'sin_clave';
  if (p.estado_enunciado === 'ilegible_parcial') return 'ilegible';
  return null;
}

// ---------------------------------------------------------------------------
// Aleatoriedad reproducible (§7.6)
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32 bits: convierte una semilla escrita a mano en un entero estable.
 * Con la cadena vacía devuelve el *offset basis* (2166136261) y no lanza.
 *
 * @param {string} cadena
 * @returns {number} uint32
 */
function hashSemilla(cadena) {
  let h = 0x811c9dc5;
  for (let i = 0; i < cadena.length; i += 1) {
    h ^= cadena.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32: 32 bits de estado, determinista en cualquier motor JS. Devuelve
 * un generador de números en [0, 1).
 *
 * @param {number} semilla uint32
 * @returns {function(): number}
 */
function crearAleatorio(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates DESCENDENTE. No muta la entrada.
 *
 * El sentido del bucle está pinchado: un Fisher-Yates ascendente consume el
 * PRNG de otra forma y daría ensayos distintos con la misma semilla.
 *
 * @param {Array} lista
 * @param {function(): number} rnd
 * @returns {Array} permutación nueva
 */
function mezclar(lista, rnd) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = copia[i]; copia[i] = copia[j]; copia[j] = t;
  }
  return copia;
}

/**
 * Huella de 8 hex que identifica el pozo con el que se generó un ensayo. Los
 * ids se ordenan antes de hashear, así que depende del CONJUNTO del pozo y no
 * de su orden. No es criptográfica: sirve para detectar divergencias
 * accidentales entre dos ensayos "con la misma semilla".
 *
 * @param {Object} banco
 * @param {Array<Object>} pozo
 * @param {{soloVerificadas?: boolean}} config
 * @returns {string} 8 caracteres hex
 */
function huellaPozo(banco, pozo, config) {
  const ids = pozo.map(function (p) { return p.id; }).sort();
  const base = banco.esquema_version + '|' + (config.soloVerificadas ? 'V' : 'T') +
               '|' + pozo.length + '|' + ids.join(',');
  return hashSemilla(base).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// Generación del ensayo (§7.6)
// ---------------------------------------------------------------------------

/**
 * Cuotas por eje del ensayo de 65. Procedencia: proporciones de eje de las 240
 * preguntas cerradas escaladas a 65 y repartidas por mayores restos. La
 * habilidad NO se usa como cuota, solo como dimensión de informe (RF-8.6).
 */
var CUOTAS_EJE = {
  numeros: 22,
  algebra_y_funciones: 19,
  geometria: 12,
  probabilidad_y_estadistica: 12,
};

/**
 * Orden fijo de recorrido de los ejes. Lista LITERAL, nunca `Object.keys`: el
 * determinismo se rompe en el orden de iteración, así que se fija donde se
 * itera (§7.6, criterio 17).
 */
var ORDEN_EJES = ['numeros', 'algebra_y_funciones', 'geometria', 'probabilidad_y_estadistica'];

/**
 * Comprueba si el pozo alcanza para cubrir las cuotas. La llama `app.js` al
 * cambiar el filtro de verificadas, sobre el pozo que acaba de devolver
 * `aplicarFiltroPozo`, para deshabilitar "Generar ensayo" con el déficit a la
 * vista (§7.15).
 *
 * @param {Array<Object>} pozo
 * @param {Object<string,number>} cuotas
 * @returns {{factible: boolean, deficits: Array<{eje: string, requerido: number, disponible: number}>}}
 */
function verificarFactibilidad(pozo, cuotas) {
  var deficits = [];
  ORDEN_EJES.forEach(function (eje) {
    var requerido = cuotas[eje];
    if (requerido === undefined) return;
    var disponible = pozo.filter(function (p) { return p.eje === eje; }).length;
    if (disponible < requerido) {
      deficits.push({ eje: eje, requerido: requerido, disponible: disponible });
    }
  });
  return { factible: deficits.length === 0, deficits: deficits };
}

/**
 * Genera el ensayo de 65 preguntas, reproducible: mismo pozo + misma semilla
 * ⇒ mismo ensayo, en el mismo orden.
 *
 * @param {Array<Object>} pozo
 * @param {number} semilla uint32 YA hasheado (`prepararConfig` es el único
 *   sitio que convierte `semillaTexto` en `semilla`; aquí no se vuelve a hashear)
 * @param {Object<string,number>} cuotas
 * @returns {Array<Object>} 65 preguntas en orden de presentación
 * @throws {Error} si las cuotas no suman 65, si sus claves no son los 4 ejes,
 *   o si el pozo no alcanza (con el déficit por eje en el mensaje)
 */
function generarEnsayo(pozo, semilla, cuotas) {
  var claves = Object.keys(cuotas);
  var total = ORDEN_EJES.reduce(function (acc, eje) {
    return acc + (typeof cuotas[eje] === 'number' ? cuotas[eje] : 0);
  }, 0);
  if (claves.length !== ORDEN_EJES.length ||
      !ORDEN_EJES.every(function (eje) { return typeof cuotas[eje] === 'number'; })) {
    throw new Error('generarEnsayo: las claves de las cuotas tienen que ser exactamente los 4 ' +
      'ejes (' + ORDEN_EJES.join(', ') + '); llegaron: ' + claves.join(', ') + '.');
  }
  if (total !== 65) {
    throw new Error('generarEnsayo: las cuotas tienen que sumar 65 y suman ' + total + '.');
  }

  var factibilidad = verificarFactibilidad(pozo, cuotas);
  if (!factibilidad.factible) {
    throw new Error('generarEnsayo: el pozo no alcanza para las cuotas. ' +
      factibilidad.deficits.map(function (d) {
        return d.eje + ': requeridas ' + d.requerido + ', disponibles ' + d.disponible;
      }).join('; ') + '.');
  }

  // Un ÚNICO flujo de PRNG para los 4 ejes y para la mezcla final.
  var rnd = crearAleatorio(semilla);
  var seleccion = [];
  ORDEN_EJES.forEach(function (eje) {
    var candidatos = pozo.filter(function (p) { return p.eje === eje; });
    // Orden canónico (prueba_id, numero_original, id): es lo que hace el
    // resultado independiente del orden del array de entrada.
    candidatos.sort(function (a, b) {
      if (a.prueba_id !== b.prueba_id) return a.prueba_id < b.prueba_id ? -1 : 1;
      if (a.numero_original !== b.numero_original) return a.numero_original - b.numero_original;
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
    seleccion = seleccion.concat(mezclar(candidatos, rnd).slice(0, cuotas[eje]));
  });

  return mezclar(seleccion, rnd);
}

// ---------------------------------------------------------------------------
// Tokenizador de contenido (§7.9). Capa PURA: no escribe en consola ni en el
// estado, y no conoce el banco (el `idFigura` lo resuelve `app.js`).
// ---------------------------------------------------------------------------

/**
 * Centinela con que el paso 1 marca la posición de cada fórmula dentro de
 * `textoEnmascarado`: `\u0000<índice en base 36>\u0000`. No puede colisionar
 * porque antes de empezar se sustituye cualquier carácter de control distinto
 * de `\n` por el carácter de reemplazo (§7.9, §8.14: hoy no hay ninguno).
 */
var PATRON_CENTINELA = '\\u0000([0-9a-z]+)\\u0000';

/** Caracteres de control que el paso 1 sustituye por `\uFFFD` (todos salvo `\n`). */
var PATRON_CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

/** Marcador de figura bien formado (juego de caracteres del esquema). */
var PATRON_MARCADOR = '\\[\\[figura:([A-Za-z0-9_.:-]+)\\]\\]';

/** El mismo patrón anclado: el caso "línea completa", los 121 del banco. */
var PATRON_MARCADOR_LINEA = new RegExp('^' + PATRON_MARCADOR + '$');

/** Prefijo de cualquier marcador `[[algo:`, para detectar los mal formados. */
var PATRON_PREFIJO_MARCADOR = '\\[\\[([A-Za-z_]+):';

/** Fila separadora de tabla Markdown (§7.9 paso 3): se descarta. */
var PATRON_SEPARADORA = /^\|?[\s:|-]*-[\s:|-]*\|?$/;

/**
 * Paso 1 del tokenizador: segmenta la matemática resolviendo los escapes `\$`
 * en el MISMO recorrido, carácter a carácter y sin regex con lookbehind.
 *
 * El papel de `\$` depende del estado del recorrido (§2): fuera de matemática
 * es un peso chileno literal (146 casos) y dentro es el escape LaTeX que tiene
 * que llegar a KaTeX con su barra (28 casos). Resolverlo antes de segmentar
 * dejaría un `$` desnudo dentro del cuerpo LaTeX.
 *
 * @param {string} texto
 * @returns {{textoEnmascarado: string, formulas: Array<{tipo: 'inline'|'bloque', latex: string}>, avisos: Array<Object>}}
 */
function segmentarMatematica(texto) {
  var limpio = String(texto).replace(PATRON_CONTROL, '\uFFFD');
  var salida = '';
  var formulas = [];
  var avisos = [];
  var enMatematica = false;
  var modo = null;
  var inicio = -1;
  var latex = '';
  var i = 0;

  function cerrarFormula() {
    formulas.push({ tipo: modo, latex: latex });
    salida += '\u0000' + (formulas.length - 1).toString(36) + '\u0000';
    enMatematica = false;
    modo = null;
    latex = '';
  }

  while (i < limpio.length) {
    var c = limpio.charAt(i);

    // `\$`: nunca delimita, en ninguno de los dos estados.
    if (c === '\\' && limpio.charAt(i + 1) === '$') {
      if (enMatematica) latex += '\\$';
      else salida += '$';
      i += 2;
      continue;
    }

    if (c === '$') {
      var doble = limpio.charAt(i + 1) === '$';
      if (!enMatematica) {
        enMatematica = true;
        modo = doble ? 'bloque' : 'inline';
        inicio = i;
        latex = '';
        i += doble ? 2 : 1;
        continue;
      }
      if (modo === 'inline') {
        // El cierre coincide con la apertura: dentro de una inline, un `$$`
        // cierra la inline y el segundo `$` vuelve a abrir (`$x$$y$` ⇒ dos
        // inline). Por eso aquí se consume UN solo `$`.
        cerrarFormula();
        i += 1;
        continue;
      }
      // Dentro de un bloque, un `$` suelto NO cierra: se acumula al LaTeX.
      if (doble) {
        cerrarFormula();
        i += 2;
        continue;
      }
      latex += '$';
      i += 1;
      continue;
    }

    if (enMatematica) latex += c;
    else salida += c;
    i += 1;
  }

  if (enMatematica) {
    // Delimitador sin pareja: el que quedó abierto y todo lo que le sigue
    // salen como texto literal, se avisa y NO se lanza (§7.18 caso 2).
    salida += limpio.slice(inicio);
    avisos.push(crearAviso('dolar_impar', 'aviso',
      'Hay un delimitador de matemática sin pareja: el tramo se muestra como texto literal.',
      { detalle: 'Delimitador abierto en la posición ' + inicio + '.' }));
  }

  return { textoEnmascarado: salida, formulas: formulas, avisos: avisos };
}

/** Indica si una lista de spans aporta algo que merezca un bloque párrafo. */
function spansConContenido(spans) {
  return spans.some(function (s) {
    if (s.tipo === 'texto') return s.valor.trim() !== '';
    if (s.tipo === 'salto') return false;
    if (s.tipo === 'enfasis') return spansConContenido(s.spans);
    return true;
  });
}

/** Cierra el párrafo en curso. Un párrafo sin contenido no se emite. */
function cerrarParrafo(ctx) {
  if (spansConContenido(ctx.parrafo)) {
    ctx.bloques.push({ tipo: 'parrafo', spans: ctx.parrafo });
  }
  ctx.parrafo = [];
  // Un `\n` consumido por una estructura (tabla, lista, marcador, promoción de
  // `formula_bloque`) no emite nada: el salto pendiente se descarta.
  ctx.saltoPendiente = false;
}

/**
 * Añade spans al párrafo en curso, materializando el salto pendiente. Es el
 * único sitio donde nace un span `{tipo:'salto'}` (hallazgo 1 del review).
 */
function agregarSpans(ctx, spans) {
  if (spans.length === 0) return;
  if (ctx.saltoPendiente) {
    ctx.parrafo.push({ tipo: 'salto' });
    ctx.saltoPendiente = false;
  }
  spans.forEach(function (s) { ctx.parrafo.push(s); });
}

/**
 * Empuja un tramo de texto plano como span `{tipo:'texto'}`, VERBATIM y sin
 * `trim` (§7.9 paso 2, criterio 26), resolviendo antes los marcadores.
 */
function empujarTexto(destino, bruto, ctx) {
  if (bruto === '') return;
  var texto = bruto;
  if (ctx.resolverFiguras) {
    // Un marcador bien formado que llega hasta aquí viene de una celda de
    // tabla, de un ítem de lista o de dentro de un `**énfasis**`, donde no
    // existe el bloque `figura` ni se puede partir el párrafo: se descarta el
    // marcador y se avisa, que es lo que mantiene la invariante de que ningún
    // `[[figura:` queda visible. 0 casos en el banco.
    texto = texto.replace(new RegExp(PATRON_MARCADOR, 'g'), function (_, id) {
      ctx.avisos.push(crearAviso('marcador_inline', 'aviso',
        'Un marcador de figura aparece dentro de una celda, un ítem o un énfasis, ' +
        'donde no se puede pintar como bloque: se omite.',
        { datos: { ids: [id] } }));
      return '';
    });
  }
  // Mal formados (y `[[ilegible:`, que NO es un tipo de bloque): quedan
  // literales y solo se avisa. Con `resolverFiguras: false` caen aquí también
  // los bien formados, que es la degradación declarada de ese modo.
  var patron = new RegExp(PATRON_PREFIJO_MARCADOR, 'g');
  var m;
  while ((m = patron.exec(texto)) !== null) {
    ctx.avisos.push(crearAviso('marcador_malformado', 'aviso',
      'Hay un marcador que no se pudo interpretar y se muestra tal cual.',
      { detalle: 'Prefijo encontrado: [[' + m[1] + ':' }));
  }
  if (texto !== '') destino.push({ tipo: 'texto', valor: texto });
}

/** Expande los centinelas de fórmula de un tramo ya libre de `**`. */
function empujarSpansLlanos(destino, texto, ctx) {
  if (texto === '') return;
  var patron = new RegExp(PATRON_CENTINELA, 'g');
  var desde = 0;
  var m;
  while ((m = patron.exec(texto)) !== null) {
    empujarTexto(destino, texto.slice(desde, m.index), ctx);
    var formula = ctx.formulas[parseInt(m[1], 36)];
    // Un centinela de BLOQUE solo llega aquí desde una celda, un ítem o un
    // énfasis, donde no cabe un bloque: degrada a fórmula inline.
    if (formula) destino.push({ tipo: 'formula', latex: formula.latex });
    desde = m.index + m[0].length;
  }
  empujarTexto(destino, texto.slice(desde), ctx);
}

/**
 * Paso 4: `**...**` ⇒ `{tipo:'enfasis', spans}` sobre `textoEnmascarado`, así
 * que el centinela queda DENTRO del énfasis (§7.9, 0 casos en el banco).
 *
 * @returns {Array<Object>} spans
 */
function spansDeTexto(valor, ctx) {
  if (valor === '') return [];
  var spans = [];
  var patron = /\*\*([\s\S]*?)\*\*/g;
  var desde = 0;
  var m;
  while ((m = patron.exec(valor)) !== null) {
    empujarSpansLlanos(spans, valor.slice(desde, m.index), ctx);
    var internos = [];
    empujarSpansLlanos(internos, m[1], ctx);
    spans.push({ tipo: 'enfasis', spans: internos });
    desde = m.index + m[0].length;
  }
  empujarSpansLlanos(spans, valor.slice(desde), ctx);
  return spans;
}

/**
 * Parte una línea de texto por lo que PROMUEVE a bloque propio: los marcadores
 * de figura bien formados y los centinelas de fórmula de bloque. Lo demás
 * queda en tramos de texto para `spansDeTexto`.
 */
function partirLinea(linea, ctx) {
  var trozos = [];
  var patron = new RegExp(PATRON_MARCADOR + '|' + PATRON_CENTINELA, 'g');
  var desde = 0;
  var m;
  while ((m = patron.exec(linea)) !== null) {
    var corte = null;
    if (m[1] !== undefined) {
      if (ctx.resolverFiguras) corte = { tipo: 'figura', idFigura: m[1] };
    } else if (m[2] !== undefined) {
      var formula = ctx.formulas[parseInt(m[2], 36)];
      if (formula && formula.tipo === 'bloque') {
        corte = { tipo: 'formula_bloque', latex: formula.latex };
      }
    }
    if (corte === null) continue;
    if (m.index > desde) trozos.push({ tipo: 'texto', valor: linea.slice(desde, m.index) });
    trozos.push(corte);
    desde = m.index + m[0].length;
  }
  if (desde < linea.length) trozos.push({ tipo: 'texto', valor: linea.slice(desde) });
  return trozos;
}

/** Procesa una línea que no es de tabla ni de lista. */
function procesarLineaDeTexto(linea, ctx) {
  var recortada = linea.trim();

  // Caso 1 de la gramática de marcadores: línea completa (los 121 del banco).
  var completo = PATRON_MARCADOR_LINEA.exec(recortada);
  if (completo && ctx.resolverFiguras) {
    cerrarParrafo(ctx);
    ctx.bloques.push({ tipo: 'figura', idFigura: completo[1] });
    return;
  }

  partirLinea(linea, ctx).forEach(function (trozo) {
    if (trozo.tipo === 'texto') {
      agregarSpans(ctx, spansDeTexto(trozo.valor, ctx));
      return;
    }
    if (trozo.tipo === 'figura') {
      // Caso 2: marcador inline. Se promueve a bloque propio y parte el
      // párrafo en dos. 0 casos hoy; soportado para que la invariante aguante.
      cerrarParrafo(ctx);
      ctx.bloques.push({ tipo: 'figura', idFigura: trozo.idFigura });
      ctx.avisos.push(crearAviso('marcador_inline', 'aviso',
        'Un marcador de figura aparece dentro de una línea con más texto: se pinta como bloque aparte.',
        { datos: { ids: [trozo.idFigura] } }));
      return;
    }
    // `displayMode: true` produce un bloque de nivel, que no puede ir dentro
    // de un `<p>` junto a texto: se promueve (4 de las 18, en m1-reg24-025).
    cerrarParrafo(ctx);
    ctx.bloques.push({ tipo: 'formula_bloque', latex: trozo.latex });
  });
}

/** Parte una línea de tabla en celdas: `trim` y `|` de los extremos fuera. */
function celdasDeLinea(linea, ctx) {
  var cuerpo = linea;
  if (cuerpo.charAt(0) === '|') cuerpo = cuerpo.slice(1);
  if (cuerpo.charAt(cuerpo.length - 1) === '|') cuerpo = cuerpo.slice(0, -1);
  return cuerpo.split('|').map(function (celda) {
    // Excepción declarada al verbatim del criterio 26: las celdas van con
    // `trim`, porque los espacios alrededor del `|` son maquetación.
    return spansDeTexto(celda.trim(), ctx);
  });
}

/** Paso 3: construye el bloque `tabla` de un grupo de líneas `|` (§7.9). */
function construirTabla(grupo, ctx) {
  var haySeparadora = grupo.length >= 2 && PATRON_SEPARADORA.test(grupo[1]);

  if (grupo.length === 2 && haySeparadora) {
    // Grupo de 2 líneas: la tabla no tiene filas de datos, así que la primera
    // línea SON los datos (1 caso real, m1-reg24-059, con 13 celdas).
    ctx.avisos.push(crearAviso('tabla_sin_cabecera', 'aviso',
      'Una tabla trae solo cabecera y fila separadora: se pinta como fila de datos.'));
    return { tipo: 'tabla', cabecera: [], filas: [celdasDeLinea(grupo[0], ctx)] };
  }

  var cabecera = celdasDeLinea(grupo[0], ctx);
  var datos;
  if (haySeparadora) {
    datos = grupo.slice(2);
  } else {
    if (grupo.length >= 2) {
      ctx.avisos.push(crearAviso('tabla_sin_separadora', 'aviso',
        'Una tabla no trae fila separadora: su segunda línea se trata como datos.'));
    }
    datos = grupo.slice(1);
  }

  var filas = datos.map(function (linea) {
    var celdas = celdasDeLinea(linea, ctx);
    if (celdas.length !== cabecera.length) {
      ctx.avisos.push(crearAviso('tabla_fila_irregular', 'aviso',
        'Una fila de tabla tiene ' + celdas.length + ' celdas y la cabecera ' +
        cabecera.length + ': se normaliza al ancho de la cabecera.'));
      while (celdas.length < cabecera.length) celdas.push([]);
      celdas = celdas.slice(0, cabecera.length);
    }
    return celdas;
  });

  return { tipo: 'tabla', cabecera: cabecera, filas: filas };
}

/**
 * Paso 2: divide un tramo (lo que hay entre dos `\n\n`) en bloques. El ORDEN
 * importa: primero se extraen las estructuras —líneas `|`, grupos `- `, líneas
 * de marcador y la promoción de `formula_bloque`—, y los `\n` que esas
 * estructuras consumen no emiten nada. Un `\n` que sobrevive entre dos líneas
 * de texto normal emite `{tipo:'salto'}` y NO abre párrafo nuevo (hallazgo 1).
 */
function procesarTramo(tramo, ctx) {
  var lineas = tramo.split('\n');
  var i = 0;
  while (i < lineas.length) {
    var recortada = lineas[i].trim();

    if (recortada.charAt(0) === '|') {
      var grupo = [];
      // El grupo cierra en la primera línea que no empieza con `|` (§7.18.5).
      while (i < lineas.length && lineas[i].trim().charAt(0) === '|') {
        grupo.push(lineas[i].trim());
        i += 1;
      }
      cerrarParrafo(ctx);
      ctx.bloques.push(construirTabla(grupo, ctx));
      continue;
    }

    if (recortada.slice(0, 2) === '- ') {
      // Hallazgo 15 (NIT): el grupo de lista cierra el párrafo anterior y
      // termina en la primera línea que no empieza por `- `.
      cerrarParrafo(ctx);
      var items = [];
      while (i < lineas.length && lineas[i].trim().slice(0, 2) === '- ') {
        items.push(spansDeTexto(lineas[i].trim().slice(2).trim(), ctx));
        i += 1;
      }
      ctx.bloques.push({ tipo: 'lista', items: items });
      continue;
    }

    if (ctx.parrafo.length > 0) ctx.saltoPendiente = true;
    procesarLineaDeTexto(lineas[i], ctx);
    i += 1;
  }
}

/**
 * Tokeniza un campo renderizable del banco (`enunciado`, `explicacion` o
 * `alternativas[].texto`, y también una `transcripcion` de figura) en el árbol
 * de bloques de §7.9. Función PURA: devuelve sus avisos en el mismo objeto y no
 * escribe en consola ni en el estado.
 *
 * Cinco tipos de bloque (no hay `ilegible`):
 *
 *   {tipo: 'parrafo',        spans: Span[]}
 *   {tipo: 'formula_bloque', latex: string}
 *   {tipo: 'tabla',          cabecera: Span[][], filas: Span[][][]}
 *   {tipo: 'lista',          items: Span[][]}
 *   {tipo: 'figura',         idFigura: string}
 *
 * Cuatro tipos de span:
 *
 *   {tipo: 'texto',   valor: string}   // VERBATIM, sin trim
 *   {tipo: 'formula', latex: string}
 *   {tipo: 'enfasis', spans: Span[]}
 *   {tipo: 'salto'}                    // un `\n` suelto dentro de un párrafo
 *
 * @param {string} texto
 * @param {{resolverFiguras?: boolean}} [opciones] `resolverFiguras: false`
 *   (modo con que se pintan las transcripciones de figura) degrada los tres
 *   casos de marcador a texto literal con aviso, cortando la recursión
 *   figura → transcripción → figura.
 * @returns {{bloques: Array<Object>, avisos: Array<Object>}}
 */
function tokenizarContenido(texto, opciones) {
  var paso1 = segmentarMatematica(texto);
  var ctx = {
    formulas: paso1.formulas,
    avisos: paso1.avisos,
    resolverFiguras: !(opciones && opciones.resolverFiguras === false),
    bloques: [],
    parrafo: [],
    saltoPendiente: false,
  };

  paso1.textoEnmascarado.split('\n\n').forEach(function (tramo) {
    procesarTramo(tramo, ctx);
    cerrarParrafo(ctx);
  });

  return { bloques: ctx.bloques, avisos: ctx.avisos };
}

// ---------------------------------------------------------------------------
// Corrección y resultados (§7.13)
// ---------------------------------------------------------------------------

/**
 * Una pregunta puntúa exactamente cuando no es piloto y tiene clave (RF-7.4).
 * `piloto` y `sinClave` pueden solaparse en la misma pregunta, así que este
 * predicado es la ÚNICA forma de obtener `puntuables`: restar `piloto +
 * sinClave` de 65 descontaría dos veces (§7.7bis, criterio 42).
 *
 * @param {Object} pregunta
 * @returns {boolean}
 */
function esPuntuable(pregunta) {
  return pregunta.sin_puntaje !== true && pregunta.alternativa_correcta !== null;
}

/**
 * Revisa una pregunta contra la alternativa que seleccionó el usuario.
 *
 * Sin clave (`alternativa_correcta === null`) el estado es `'sin_clave'`,
 * `esCorrecta` es `null` y `puntuable` es `false`: NUNCA `'incorrecta'`, porque
 * nadie puede corregir lo que no tiene clave (RF-7.3, §7.7bis).
 *
 * Una `seleccion` que no corresponde a ninguna alternativa de ESTA pregunta
 * (`null`, `undefined` o un id de otra pregunta) se trata como **omitida**, no
 * como incorrecta (criterio 48).
 *
 * @param {Object} pregunta
 * @param {string|null} [seleccion]
 * @returns {{estado: string, alternativaCorrectaId: string|null, esCorrecta: boolean|null, puntuable: boolean, explicacion: string}}
 *   `estado` ∈ {'correcta', 'incorrecta', 'omitida', 'sin_clave'}
 */
function revisarPregunta(pregunta, seleccion) {
  var correcta = pregunta.alternativa_correcta === undefined ? null : pregunta.alternativa_correcta;

  if (correcta === null) {
    return {
      estado: 'sin_clave',
      alternativaCorrectaId: null,
      esCorrecta: null,
      puntuable: false,
      explicacion: pregunta.explicacion,
    };
  }

  var deEsta = Array.isArray(pregunta.alternativas) &&
    pregunta.alternativas.some(function (a) { return a.id === seleccion; });
  if (!deEsta) {
    return {
      estado: 'omitida',
      alternativaCorrectaId: correcta,
      esCorrecta: false,
      puntuable: esPuntuable(pregunta),
      explicacion: pregunta.explicacion,
    };
  }

  var esCorrecta = seleccion === correcta;
  return {
    estado: esCorrecta ? 'correcta' : 'incorrecta',
    alternativaCorrectaId: correcta,
    esCorrecta: esCorrecta,
    puntuable: esPuntuable(pregunta),
    explicacion: pregunta.explicacion,
  };
}

/**
 * Corrige un ensayo completo.
 *
 * `correctas`, `incorrectas` y `omitidas` se cuentan SOLO sobre las puntuables,
 * así que la identidad es `correctas + incorrectas + omitidas === puntuables`
 * y no `=== 65` (criterio 44). El contador que sí cubre las 65 es
 * `sinResponder`: preguntas sin selección, piloto y sin clave incluidas
 * (hallazgo 10, RF-7.1). La interfaz LEE ese campo, no lo deriva.
 *
 * `porcentaje` es `correctas / puntuables * 100` SIN redondear, y `null` si
 * `puntuables === 0` (hallazgo 14). El redondeo a un decimal ocurre al pintar,
 * en `app.js`.
 *
 * @param {Array<Object>} preguntas las del ensayo, en orden de presentación
 * @param {Object<string,string>} respuestas id de pregunta -> id de alternativa
 * @param {{huellaPozo?: string, semillaTexto?: string, tiempoSegundos?: number}} [contexto]
 *   trazabilidad: se COPIA tal cual y vale `null` si no se pasa. Ningún cálculo
 *   depende de estos tres campos (criterio 48bis).
 * @returns {Object} Resultado de §7.13 más `sinResponder`
 */
function calcularResultado(preguntas, respuestas, contexto) {
  var ctx = contexto || {};
  var resp = respuestas || {};

  var correctas = 0;
  var incorrectas = 0;
  var omitidas = 0;
  var puntuables = 0;
  var piloto = 0;
  var sinClave = 0;
  var sinResponder = 0;

  var detalle = preguntas.map(function (p, i) {
    var tiene = Object.prototype.hasOwnProperty.call(resp, p.id) &&
      resp[p.id] !== null && resp[p.id] !== undefined;
    var seleccion = tiene ? resp[p.id] : null;
    if (!tiene) sinResponder += 1;
    if (p.sin_puntaje === true) piloto += 1;
    if (p.alternativa_correcta === null) sinClave += 1;

    var revision = revisarPregunta(p, seleccion);
    if (revision.puntuable) {
      puntuables += 1;
      if (revision.estado === 'correcta') correctas += 1;
      else if (revision.estado === 'incorrecta') incorrectas += 1;
      else omitidas += 1;
    }

    return {
      indice: i,
      pregunta: p,
      seleccion: seleccion,
      estado: revision.estado,
      puntuable: revision.puntuable,
      alternativaCorrectaId: revision.alternativaCorrectaId,
      explicacion: revision.explicacion,
    };
  });

  return {
    correctas: correctas,
    incorrectas: incorrectas,
    omitidas: omitidas,
    sinResponder: sinResponder,
    puntuables: puntuables,
    piloto: piloto,
    sinClave: sinClave,
    huellaPozo: ctx.huellaPozo === undefined ? null : ctx.huellaPozo,
    semillaTexto: ctx.semillaTexto === undefined ? null : ctx.semillaTexto,
    porcentaje: puntuables === 0 ? null : (correctas / puntuables) * 100,
    tiempoSegundos: ctx.tiempoSegundos === undefined ? null : ctx.tiempoSegundos,
    detalle: detalle,
    porEje: agruparPor(detalle, 'eje'),
    porHabilidad: agruparPor(detalle, 'habilidad'),
    porContenido: agruparPor(detalle, 'contenido_id'),
  };
}

/** Comparación de claves de agrupación, ascendente y estable. */
function compararClaves(a, b) {
  var ca = String(a.clave);
  var cb = String(b.clave);
  if (ca === cb) return 0;
  return ca < cb ? -1 : 1;
}

/**
 * Agrupa el `detalle` de un Resultado por eje, habilidad o `contenido_id`.
 *
 * El campo de agrupación se lee en **`entrada.pregunta[campo]`**, no en
 * `entrada[campo]`: las entradas de `detalle` no llevan esos tres campos en la
 * raíz y leerlos ahí daría un único grupo con clave `undefined` (hallazgo 13,
 * criterio 46).
 *
 * Devuelve el array YA ORDENADO por `porcentaje` ascendente, con los `null`
 * (categorías sin preguntas puntuables, que se pintan "sin datos") al FINAL y
 * los empates resueltos por clave ascendente. `porcentaje` va sin redondear
 * (hallazgo 14).
 *
 * @param {Array<Object>} detalle
 * @param {'eje'|'habilidad'|'contenido_id'} campo
 * @returns {Array<{clave: string, correctas: number, puntuables: number, porcentaje: number|null}>}
 */
function agruparPor(detalle, campo) {
  var porClave = new Map();

  detalle.forEach(function (entrada) {
    var clave = entrada.pregunta === undefined || entrada.pregunta === null
      ? undefined
      : entrada.pregunta[campo];
    if (!porClave.has(clave)) {
      porClave.set(clave, { clave: clave, correctas: 0, puntuables: 0, porcentaje: null });
    }
    var grupo = porClave.get(clave);
    if (entrada.puntuable) {
      grupo.puntuables += 1;
      if (entrada.estado === 'correcta') grupo.correctas += 1;
    }
  });

  var grupos = Array.from(porClave.values());
  grupos.forEach(function (g) {
    g.porcentaje = g.puntuables === 0 ? null : (g.correctas / g.puntuables) * 100;
  });

  grupos.sort(function (a, b) {
    if (a.porcentaje === null && b.porcentaje === null) return compararClaves(a, b);
    if (a.porcentaje === null) return 1;
    if (b.porcentaje === null) return -1;
    if (a.porcentaje !== b.porcentaje) return a.porcentaje - b.porcentaje;
    return compararClaves(a, b);
  });

  return grupos;
}

// ---------------------------------------------------------------------------
// Cronómetro (§7.12)
// ---------------------------------------------------------------------------

/** Límite oficial de M1: 2 h 20 min. */
var LIMITE_OFICIAL_SEGUNDOS = 8400;

/** Umbrales de anuncio, de mayor a menor: 30, 10, 5 y 1 minutos. */
var UMBRALES_AVISO = [1800, 600, 300, 60];

/**
 * Segundos transcurridos. Siempre `ahoraMs - inicioMs`, nunca un contador de
 * *ticks*: el navegador estrangula los *timers* en pestañas de fondo (§7.12).
 *
 * @param {number|null} inicioMs
 * @param {number} ahoraMs
 * @returns {number} entero >= 0
 */
function calcularTranscurrido(inicioMs, ahoraMs) {
  if (inicioMs === null || inicioMs === undefined) return 0;
  return Math.max(0, Math.floor((ahoraMs - inicioMs) / 1000));
}

/**
 * Segundos restantes, o `null` en modo ilimitado. Nunca negativo.
 *
 * @param {number|null} inicioMs
 * @param {number} ahoraMs
 * @param {number|null} limiteSegundos `null` ⇒ ilimitado
 * @returns {number|null}
 */
function calcularRestante(inicioMs, ahoraMs, limiteSegundos) {
  if (limiteSegundos === null || limiteSegundos === undefined) return null;
  return Math.max(0, limiteSegundos - calcularTranscurrido(inicioMs, ahoraMs));
}

/**
 * Formatea segundos como `H:MM:SS` (8400 ⇒ "2:20:00", 0 ⇒ "0:00:00").
 *
 * @param {number} segundos
 * @returns {string}
 */
function formatearTiempo(segundos) {
  var s = Number.isFinite(segundos) ? Math.max(0, Math.floor(segundos)) : 0;
  var horas = Math.floor(s / 3600);
  var minutos = Math.floor((s % 3600) / 60);
  var resto = s % 60;
  return horas + ':' + String(minutos).padStart(2, '0') + ':' + String(resto).padStart(2, '0');
}

/**
 * Detecta el CRUCE de un umbral, no la igualdad: devuelve
 * `max{u ∈ UMBRALES_AVISO : restante <= u < restanteAnterior}` o `null`.
 *
 * Hace falta el par porque el reloj se recalcula con `Date.now()` y salta
 * segundos: el valor exacto 1800 puede no ocurrir nunca (§7.12). Con
 * `restanteAnterior === null` (modo ilimitado) devuelve siempre `null`.
 *
 * @param {number|null} restanteAnterior
 * @param {number|null} restante
 * @returns {number|null}
 */
function umbralAviso(restanteAnterior, restante) {
  if (restanteAnterior === null || restanteAnterior === undefined) return null;
  if (restante === null || restante === undefined) return null;
  var cruzados = UMBRALES_AVISO.filter(function (u) {
    return restante <= u && u < restanteAnterior;
  });
  return cruzados.length === 0 ? null : Math.max.apply(null, cruzados);
}

/**
 * Único punto que escribe `restanteAnterior` y `umbralesAnunciados`, y único
 * que filtra el anuncio repetido: así el filtro vive en la capa con tests y no
 * en `app.js` (§7.12, criterio 55ter). Pura.
 *
 * @param {Object} estado
 * @param {number} ahoraMs
 * @returns {{estado: Object, umbralCruzado: number|null, expirado: boolean}}
 */
function registrarTick(estado, ahoraMs) {
  var restante = calcularRestante(estado.inicioMs, ahoraMs, estado.config.limiteSegundos);
  var cruzado = umbralAviso(estado.restanteAnterior, restante);
  var anunciados = estado.umbralesAnunciados;
  var umbralCruzado = null;

  if (cruzado !== null && anunciados.indexOf(cruzado) === -1) {
    umbralCruzado = cruzado;
    anunciados = anunciados.concat([cruzado]);
  }

  return {
    estado: Object.assign({}, estado, {
      restanteAnterior: restante,
      umbralesAnunciados: anunciados,
    }),
    umbralCruzado: umbralCruzado,
    expirado: restante === 0,
  };
}

// ---------------------------------------------------------------------------
// Modelo de estado y transiciones (§7.4). Todas puras: devuelven un estado
// nuevo con `Object.assign`, nunca mutan el que reciben.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} EntradaConfig   valores CRUDOS, sin normalizar
 * @property {string|null} semillaTexto
 * @property {string|boolean|null} verificadas  los 4 literales de la URL o un
 *   booleano del formulario
 * @property {'ilimitado'|string|number|null} tiempo  el FORMULARIO entrega la
 *   MISMA forma que la URL (hallazgo 3): la opción sin límite entrega el string
 *   `'ilimitado'` y la oficial entrega `8400`. `null` queda reservado a "campo
 *   ausente" y `prepararConfig` lo mapea a `LIMITE_OFICIAL_SEGUNDOS`.
 * @property {string|boolean|null} notacion  interruptor de RF-9.5
 */

/**
 * Estado inicial, en fase `'configuracion'`, con el pozo sin filtrar.
 *
 * El `config` que deja es el de por defecto y con la semilla SIN resolver
 * (`semillaTexto: ''`, `semilla: 0`): la semilla real la fija `prepararConfig`,
 * que es el único sitio que la hashea, y `app.js` reemplaza este `config` antes
 * de llamar a `iniciarEnsayo`. Así `crearEstadoInicial` se queda pura (no llama
 * a `Date.now()`).
 *
 * @param {Object} banco banco ya validado
 * @returns {Object} EstadoApp
 */
function crearEstadoInicial(banco) {
  var construido = construirPozo(banco, { soloVerificadas: false });
  var config = {
    semillaTexto: '',
    semilla: 0,
    soloVerificadas: false,
    limiteSegundos: LIMITE_OFICIAL_SEGUNDOS,
    notacionOriginal: false,
  };

  return {
    fase: 'configuracion',
    banco: banco,
    pozo: construido.pozo,
    descartes: construido.descartes,
    // `idsDescartados` no está en el typedef de §7.4, pero `construirAvisos`
    // lo necesita para `datos.ids` y el estado es el único sitio desde donde
    // app.js lo tiene a mano (hallazgo 12).
    idsDescartados: construido.idsDescartados,
    preguntas: [],
    indice: 0,
    respuestas: {},
    marcadas: [],
    config: config,
    huellaPozo: huellaPozo(banco, construido.pozo, config),
    inicioMs: null,
    finMs: null,
    restanteAnterior: null,
    umbralesAnunciados: [],
    avisos: [],
    resultado: null,
  };
}

/**
 * Normaliza uno de los campos booleanos de `EntradaConfig`.
 *
 * Acepta el booleano del formulario y los 4 literales de la URL (`'1'`, `'0'`,
 * `'true'`, `'false'`, tras `trim`). Un campo ausente (`null`/`undefined`) toma
 * el valor por defecto SIN aviso; cualquier otro valor toma el valor por
 * defecto CON aviso, porque es un parámetro que el usuario escribió y que se
 * está ignorando (§7.14).
 */
function normalizarBooleano(valor, nombre, porDefecto, avisos) {
  if (valor === null || valor === undefined) return porDefecto;
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'string') {
    var v = valor.trim();
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  }
  avisos.push(avisoParametroIgnorado(nombre, valor, String(porDefecto)));
  return porDefecto;
}

/**
 * Aviso de "parámetro ignorado, se usa el valor por defecto".
 *
 * Usa el código `url_invalida`, que es el que `CODIGOS_AVISO` asigna a
 * `prepararConfig` para esto (hallazgo 8): el vocabulario está cerrado y no se
 * inventa un código nuevo. El nombre del parámetro va en `datos`, no en el
 * texto, para que los tests no parseen prosa (hallazgo 9).
 */
function avisoParametroIgnorado(nombre, valor, usado) {
  return crearAviso(
    'url_invalida',
    'aviso',
    'Se ignoró el parámetro «' + nombre + '» porque su valor no es válido; se usa ' + usado + '.',
    { detalle: 'parámetro ' + nombre + ' = ' + String(valor), datos: { parametro: nombre, valor: String(valor), usado: usado } }
  );
}

/**
 * Normaliza `EntradaConfig.tiempo` (hallazgo 3): `'ilimitado'` ⇒ `null`; un
 * entero de 60..36000 (número o string numérico) ⇒ límite a medida (RF-4.6);
 * campo ausente ⇒ `LIMITE_OFICIAL_SEGUNDOS` sin aviso; fuera de rango o no
 * numérico ⇒ `LIMITE_OFICIAL_SEGUNDOS` con aviso.
 */
function normalizarTiempo(valor, avisos) {
  if (valor === null || valor === undefined) return LIMITE_OFICIAL_SEGUNDOS;

  var bruto = typeof valor === 'string' ? valor.trim() : valor;
  if (bruto === 'ilimitado') return null;

  var n = NaN;
  if (typeof bruto === 'number') n = bruto;
  else if (typeof bruto === 'string' && /^-?\d+$/.test(bruto)) n = Number(bruto);

  if (Number.isInteger(n) && n >= 60 && n <= 36000) return n;

  avisos.push(avisoParametroIgnorado('tiempo', valor, String(LIMITE_OFICIAL_SEGUNDOS) + ' s'));
  return LIMITE_OFICIAL_SEGUNDOS;
}

/**
 * ÚNICO normalizador de la configuración y ÚNICO emisor de sus avisos (§7.14),
 * y único sitio que convierte `semillaTexto` en `semilla` (uint32). Nunca
 * lanza: todo parámetro inválido degrada al valor por defecto con un aviso,
 * porque un enlace mal copiado no debe dejar al usuario sin ensayo.
 *
 * La semilla se procesa en este orden: `trim`, truncado a 64 con aviso
 * `semilla_truncada`, defecto `String(Date.now())` si queda vacía, y hasheo del
 * texto resultante — así la semilla es siempre la del texto que se MUESTRA.
 *
 * Es la única función del archivo que no es pura, y solo en el caso de la
 * semilla vacía: `Date.now()` lo exige §7.14 ("vacía ⇒ `String(Date.now())`").
 *
 * @param {EntradaConfig} [entrada]
 * @returns {{config: {semillaTexto: string, semilla: number, soloVerificadas: boolean, limiteSegundos: number|null, notacionOriginal: boolean}, avisos: Array<Object>}}
 */
function prepararConfig(entrada) {
  var e = entrada || {};
  var avisos = [];

  var bruto = (typeof e.semillaTexto === 'string' || typeof e.semillaTexto === 'number')
    ? String(e.semillaTexto)
    : '';
  var texto = bruto.trim();
  if (texto.length > 64) {
    var original = texto.length;
    texto = texto.slice(0, 64);
    avisos.push(crearAviso(
      'semilla_truncada',
      'aviso',
      'La semilla se truncó a 64 caracteres; el ensayo se generó con la semilla truncada.',
      { detalle: 'semilla de ' + original + ' caracteres', datos: { semillaTexto: texto, longitudOriginal: original } }
    ));
  }
  if (texto.length === 0) texto = String(Date.now());

  var config = {
    semillaTexto: texto,
    semilla: hashSemilla(texto),
    soloVerificadas: normalizarBooleano(e.verificadas, 'verificadas', false, avisos),
    limiteSegundos: normalizarTiempo(e.tiempo, avisos),
    notacionOriginal: normalizarBooleano(e.notacion, 'notacion', false, avisos),
  };

  return { config: config, avisos: avisos };
}

/**
 * Aplica (o quita) el filtro de verificación ciega: reconstruye `pozo`,
 * `descartes` y `huellaPozo` y fija `config.soloVerificadas`.
 *
 * Solo actúa en fase `'configuracion'`; en otra fase devuelve el estado sin
 * tocar, porque cambiar el pozo a mitad de ensayo invalidaría la trazabilidad
 * del resultado (criterio 55quater).
 *
 * @param {Object} estado
 * @param {boolean} soloVerificadas
 * @returns {Object} EstadoApp
 */
function aplicarFiltroPozo(estado, soloVerificadas) {
  if (estado.fase !== 'configuracion') return estado;

  var valor = !!soloVerificadas;
  var construido = construirPozo(estado.banco, { soloVerificadas: valor });
  var config = Object.assign({}, estado.config, { soloVerificadas: valor });

  return Object.assign({}, estado, {
    pozo: construido.pozo,
    descartes: construido.descartes,
    idsDescartados: construido.idsDescartados,
    config: config,
    huellaPozo: huellaPozo(estado.banco, construido.pozo, config),
  });
}

/**
 * Arranca el ensayo (hallazgo 4). Pura, pasa a fase `'en_curso'` y recibe el
 * `config` YA preparado: no vuelve a tocar la semilla.
 *
 * `restanteAnterior` se inicializa con `calcularRestante(ahoraMs, ahoraMs,
 * config.limiteSegundos)`, que vale `limiteSegundos` con límite y `null` sin
 * él. Eso deja `null` como centinela EXCLUSIVO de "ilimitado": con
 * `restanteAnterior` en `null`, el primer *tick* de un ensayo CON límite se iría
 * por la rama de ilimitado y perdería el umbral que ese *tick* cruzaba (caso
 * medido: `?tiempo=1810`, *tick* a los 20 s, restante 1790, umbral 1800).
 *
 * @param {Object} estado
 * @param {Object} config salida de `prepararConfig`
 * @param {number} ahoraMs
 * @returns {Object} EstadoApp
 * @throws {Error} lo que lance `generarEnsayo` (cuotas o pozo insuficiente)
 */
function iniciarEnsayo(estado, config, ahoraMs) {
  var preguntas = generarEnsayo(estado.pozo, config.semilla, CUOTAS_EJE);

  return Object.assign({}, estado, {
    fase: 'en_curso',
    config: config,
    preguntas: preguntas,
    indice: 0,
    respuestas: {},
    marcadas: [],
    inicioMs: ahoraMs,
    finMs: null,
    restanteAnterior: calcularRestante(ahoraMs, ahoraMs, config.limiteSegundos),
    umbralesAnunciados: [],
    resultado: null,
  });
}

/** Devuelve la pregunta del ensayo con ese id, o `null`. */
function preguntaDelEnsayo(estado, idPregunta) {
  var p = estado.preguntas.find(function (q) { return q.id === idPregunta; });
  return p === undefined ? null : p;
}

/**
 * Registra la respuesta a una pregunta. Valida que `idAlternativa` sea una de
 * las alternativas de SU pregunta; un id desconocido se ignora sin cambiar el
 * estado (§7.14, última fila de la tabla).
 *
 * @param {Object} estado
 * @param {string} idPregunta
 * @param {string} idAlternativa
 * @returns {Object} EstadoApp
 */
function responder(estado, idPregunta, idAlternativa) {
  var pregunta = preguntaDelEnsayo(estado, idPregunta);
  if (pregunta === null) return estado;
  if (!pregunta.alternativas.some(function (a) { return a.id === idAlternativa; })) return estado;

  var respuestas = Object.assign({}, estado.respuestas);
  respuestas[idPregunta] = idAlternativa;
  return Object.assign({}, estado, { respuestas: respuestas });
}

/**
 * Deja una pregunta sin responder (RF-4.1: la selección se puede desmarcar).
 * No toca ninguna otra respuesta.
 *
 * @param {Object} estado
 * @param {string} idPregunta
 * @returns {Object} EstadoApp
 */
function limpiarRespuesta(estado, idPregunta) {
  if (!Object.prototype.hasOwnProperty.call(estado.respuestas, idPregunta)) return estado;

  var respuestas = Object.assign({}, estado.respuestas);
  delete respuestas[idPregunta];
  return Object.assign({}, estado, { respuestas: respuestas });
}

/**
 * Marca o desmarca una pregunta para revisar, de forma independiente de
 * haberla respondido (RF-4.4). Un id que no es del ensayo se ignora.
 *
 * @param {Object} estado
 * @param {string} idPregunta
 * @returns {Object} EstadoApp
 */
function alternarMarca(estado, idPregunta) {
  if (preguntaDelEnsayo(estado, idPregunta) === null) return estado;

  var marcadas = estado.marcadas.indexOf(idPregunta) === -1
    ? estado.marcadas.concat([idPregunta])
    : estado.marcadas.filter(function (id) { return id !== idPregunta; });
  return Object.assign({}, estado, { marcadas: marcadas });
}

/**
 * Invierte `config.notacionOriginal` y no toca nada más (hallazgo 11, RF-9.5).
 * `app.js` sincroniza la clase del `<body>` DESDE el estado, nunca con un
 * `classList.toggle` sin fuente.
 *
 * @param {Object} estado
 * @returns {Object} EstadoApp
 */
function alternarNotacion(estado) {
  var config = Object.assign({}, estado.config, {
    notacionOriginal: !estado.config.notacionOriginal,
  });
  return Object.assign({}, estado, { config: config });
}

/**
 * Salta a otra pregunta. CONSERVA respuestas y marcas: es una divergencia
 * explícita con Lenguaje, que limpia la selección al cambiar de pregunta
 * (RF-4.2, criterio 50). Un índice fuera de rango devuelve el estado sin tocar.
 *
 * @param {Object} estado
 * @param {number} nuevoIndice
 * @returns {Object} EstadoApp
 */
function irAIndice(estado, nuevoIndice) {
  if (!Number.isInteger(nuevoIndice)) return estado;
  if (nuevoIndice < 0 || nuevoIndice >= estado.preguntas.length) return estado;
  return Object.assign({}, estado, { indice: nuevoIndice });
}

/**
 * Índice siguiente, acotado al último (criterio 52).
 *
 * @param {number} indice
 * @param {number} total
 * @returns {number}
 */
function calcularSiguienteIndice(indice, total) {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, indice) + 1, total - 1);
}

/**
 * Índice anterior, acotado a 0 (criterio 52).
 *
 * @param {number} indice
 * @param {number} total
 * @returns {number}
 */
function calcularIndiceAnterior(indice, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(indice, total - 1) - 1);
}

/** Indica si hay una pregunta siguiente. */
function puedeAvanzar(indice, total) {
  return indice < total - 1;
}

/** Indica si hay una pregunta anterior. */
function puedeRetroceder(indice) {
  return indice > 0;
}

/** Texto del indicador de progreso, 1-based (igual que en Lenguaje). */
function formatoProgreso(indice, total) {
  return 'Pregunta ' + (indice + 1) + ' de ' + total;
}

/**
 * Resumen de avance para la cabecera del ensayo (RF-4.5).
 *
 * @param {Object} estado
 * @returns {{respondidas: number, marcadas: number, pendientes: number}}
 */
function resumenAvance(estado) {
  var respondidas = estado.preguntas.filter(function (p) {
    return Object.prototype.hasOwnProperty.call(estado.respuestas, p.id);
  }).length;
  var marcadas = estado.preguntas.filter(function (p) {
    return estado.marcadas.indexOf(p.id) !== -1;
  }).length;

  return {
    respondidas: respondidas,
    marcadas: marcadas,
    pendientes: estado.preguntas.length - respondidas,
  };
}

/**
 * Estado de una casilla de la cuadrícula. Son los CINCO valores de la tabla de
 * RF-4.3, y `'actual'` gana sobre los demás.
 *
 * @param {Object} estado
 * @param {number} indice 0-based
 * @returns {'actual'|'respondida_marcada'|'respondida'|'marcada'|'pendiente'}
 */
function estadoCasilla(estado, indice) {
  if (indice === estado.indice) return 'actual';

  var pregunta = estado.preguntas[indice];
  if (pregunta === undefined) return 'pendiente';

  var respondida = Object.prototype.hasOwnProperty.call(estado.respuestas, pregunta.id);
  var marcada = estado.marcadas.indexOf(pregunta.id) !== -1;

  if (respondida && marcada) return 'respondida_marcada';
  if (respondida) return 'respondida';
  if (marcada) return 'marcada';
  return 'pendiente';
}

/**
 * `aria-label` de una casilla de la cuadrícula, con los textos literales de la
 * tabla de RF-4.3 y `N` 1-based (la posición en el ensayo, no el
 * `numero_original`).
 *
 * Vive aquí y no en `app.js` a propósito: el diseño fija los cinco textos y la
 * precedencia de `'actual'`, y `app.js` es la capa sin tests (criterio
 * 55sexies). `app.js` solo asigna el string al atributo.
 *
 * @param {Object} estado
 * @param {number} indice 0-based
 * @returns {string}
 */
function etiquetaCasilla(estado, indice) {
  var n = indice + 1;
  var pregunta = estado.preguntas[indice];
  var respondida = pregunta !== undefined &&
    Object.prototype.hasOwnProperty.call(estado.respuestas, pregunta.id);
  var marcada = pregunta !== undefined && estado.marcadas.indexOf(pregunta.id) !== -1;

  if (indice === estado.indice) {
    var texto = 'Pregunta ' + n + ', actual';
    if (respondida) texto += ', respondida';
    if (marcada) texto += ', marcada para revisar';
    return texto;
  }

  if (respondida && marcada) return 'Pregunta ' + n + ', respondida, marcada para revisar';
  if (respondida) return 'Pregunta ' + n + ', respondida';
  if (marcada) return 'Pregunta ' + n + ', sin responder, marcada para revisar';
  return 'Pregunta ' + n + ', sin responder';
}

/**
 * Cierra el ensayo y corrige. Idempotente: en fase `'resultados'` devuelve el
 * mismo estado sin recalcular (criterio 56).
 *
 * Llama a `calcularResultado` con el contexto completo, de modo que
 * `estado.resultado` siga siendo EXACTAMENTE la salida de `calcularResultado`
 * (§7.4) y no haya una segunda fuente de verdad rellenando campos después.
 *
 * @param {Object} estado
 * @param {number} ahoraMs
 * @returns {Object} EstadoApp
 */
function finalizar(estado, ahoraMs) {
  if (estado.fase === 'resultados') return estado;

  var resultado = calcularResultado(estado.preguntas, estado.respuestas, {
    huellaPozo: estado.huellaPozo,
    semillaTexto: estado.config.semillaTexto,
    tiempoSegundos: calcularTranscurrido(estado.inicioMs, ahoraMs),
  });

  return Object.assign({}, estado, {
    fase: 'resultados',
    finMs: ahoraMs,
    resultado: resultado,
  });
}

// ---------------------------------------------------------------------------
// Advertencias honestas y avisos (RF-8, §7.4)
// ---------------------------------------------------------------------------

/** Conteo por valor de un campo, sobre una lista de preguntas. */
function contarPor(preguntas, campo) {
  var conteo = {};
  preguntas.forEach(function (p) {
    conteo[p[campo]] = (conteo[p[campo]] || 0) + 1;
  });
  return conteo;
}

/** Nombre legible de un eje o habilidad para la prosa de los avisos. */
function enEspanol(clave) {
  var nombres = {
    numeros: 'números',
    algebra_y_funciones: 'álgebra y funciones',
    geometria: 'geometría',
    probabilidad_y_estadistica: 'probabilidad y estadística',
    resolver_problemas: 'resolver problemas',
    representar: 'representar',
    modelar: 'modelar',
    argumentar: 'argumentar',
  };
  return nombres[clave] === undefined ? clave : nombres[clave];
}

/**
 * Normaliza el tercer parámetro de `construirAvisos`, que acepta las dos formas
 * con que se tiene a mano el resultado de `construirPozo`: el mapa de conteos
 * (`{motivo: n}`) o el objeto completo (`{descartes, idsDescartados}`). Con el
 * objeto completo los avisos de integridad pueden llevar `datos.ids`.
 */
function normalizarDescartes(descartes) {
  if (descartes && descartes.descartes !== undefined) {
    return {
      conteos: descartes.descartes || {},
      ids: descartes.idsDescartados || {},
    };
  }
  return { conteos: descartes || {}, ids: {} };
}

/**
 * Las SEIS advertencias fijas de RF-8, con `severidad: 'info'` y seis códigos
 * DISTINTOS de `CODIGOS_AVISO` (hallazgo 8: `agregarAvisos` agrupa por código,
 * así que dos iguales fusionarían dos advertencias en una). Todas las cifras se
 * derivan de `descartes`, de los conteos por eje y de los conteos por
 * habilidad; ninguna está escrita a mano.
 *
 * Además convierte en aviso de integridad los dos motivos de descarte de los
 * que es dueña (`esquema_invalido` y `prueba_incompleta`, §7.4 paso 2), y solo
 * cuando su conteo es > 0. NO reemite los avisos de referencia (`figura_rota`,
 * `figura_huerfana`, `figura_invalida`, `figura_alternativa_incoherente`): esos
 * son de `validarBanco` y tienen dueño único (hallazgo 8).
 *
 * @param {Object} banco
 * @param {Array<Object>} pozo
 * @param {Object<string,number>|{descartes: Object, idsDescartados: Object}} descartes
 * @param {Object} config
 * @param {Array<Object>|null} [preguntasEnsayo] `null` ⇒ las advertencias 3 y 6
 *   describen el POZO (pantalla de configuración); las 65 del ensayo ⇒ describen
 *   el ENSAYO (pie de resultados)
 * @returns {Array<Object>} Aviso[]
 */
function construirAvisos(banco, pozo, descartes, config, preguntasEnsayo) {
  var d = normalizarDescartes(descartes);
  var ensayo = preguntasEnsayo === undefined ? null : preguntasEnsayo;
  var muestra = ensayo === null ? pozo : ensayo;
  var ambito = ensayo === null ? 'pozo' : 'ensayo';
  var avisos = [];

  // 1 · La clasificación es inferida, no publicada por pregunta.
  var inferidas = banco.preguntas.filter(function (p) {
    return p.clasificacion_origen === 'inferida';
  }).length;
  avisos.push(crearAviso(
    'clasificacion_inferida',
    'info',
    'El eje, la habilidad y el contenido de cada pregunta son inferidos contra el temario ' +
    'oficial (' + inferidas + ' de ' + banco.preguntas.length + '), no publicados por DEMRE ' +
    'pregunta a pregunta. El desglose orienta, no mide.',
    { datos: { inferidas: inferidas, total: banco.preguntas.length } }
  ));

  // 2 · Sesgo por exclusión de las preguntas con figura requerida.
  var enBancoPorEje = contarPor(banco.preguntas, 'eje');
  var enPozoPorEje = contarPor(pozo, 'eje');
  var porEje = ORDEN_EJES.map(function (eje) {
    return {
      eje: eje,
      enBanco: enBancoPorEje[eje] || 0,
      utilizables: enPozoPorEje[eje] || 0,
    };
  });
  var afectados = porEje.filter(function (f) { return f.utilizables < f.enBanco; });
  var excluidas = d.conteos.figura_requerida || 0;
  avisos.push(crearAviso(
    'sesgo_figuras',
    'info',
    'Las preguntas que necesitan una figura están excluidas mientras no haya imagen: ' +
    excluidas + ' quedan fuera por ese motivo. ' +
    afectados.map(function (f) {
      return enEspanol(f.eje) + ' pasa de ' + f.enBanco + ' a ' + f.utilizables + ' utilizables';
    }).join('; ') + '. Esos ejes quedan representados por un subconjunto sesgado.',
    { datos: { excluidas: excluidas, porEje: porEje } }
  ));

  // 3 · Qué pruebas aportaron, con su estado de verificación ciega.
  var conteoPorPrueba = contarPor(muestra, 'prueba_id');
  var porPrueba = Object.keys(conteoPorPrueba).map(function (id) {
    return {
      prueba_id: id,
      n: conteoPorPrueba[id],
      verificada: PRUEBAS_VERIFICADAS_CIEGO.has(id),
    };
  }).sort(function (a, b) {
    if (a.n !== b.n) return b.n - a.n;
    return a.prueba_id < b.prueba_id ? -1 : 1;
  });
  avisos.push(crearAviso(
    'pruebas_usadas',
    'info',
    (ambito === 'ensayo'
      ? 'Este ensayo se armó con preguntas de ' + porPrueba.length + ' pruebas: '
      : 'El pozo de ' + pozo.length + ' preguntas utilizables viene de ' + porPrueba.length + ' pruebas: ') +
    porPrueba.map(function (f) {
      return f.prueba_id + ' aporta ' + f.n +
        (f.verificada ? ' (verificación ciega completa)' : ' (clave oficial, verificación ciega parcial)');
    }).join('; ') + '.' +
    (config && config.soloVerificadas
      ? ' El filtro de verificación ciega está activo: solo entran las pruebas verificadas.'
      : ''),
    { datos: { ambito: ambito, total: muestra.length, porPrueba: porPrueba } }
  ));

  // 4 · El puntaje no es un puntaje PAES.
  avisos.push(crearAviso(
    'no_es_puntaje_paes',
    'info',
    'El puntaje de este ensayo es un conteo de respuestas correctas sobre las preguntas ' +
    'puntuables, no un puntaje PAES de 100 a 1000: la tabla de conversión de DEMRE no está ' +
    'en el banco.',
    { datos: {} }
  ));

  // 5 · Cuotas de eje frente a los rangos que T24I publicaba.
  var desviaciones = ORDEN_EJES.filter(function (eje) {
    var rango = RANGOS_T24I[eje];
    return rango !== undefined && (CUOTAS_EJE[eje] < rango[0] || CUOTAS_EJE[eje] > rango[1]);
  }).map(function (eje) {
    return { eje: eje, cuota: CUOTAS_EJE[eje], rango: RANGOS_T24I[eje] };
  });
  avisos.push(crearAviso(
    'desviacion_cuota_eje',
    'info',
    (desviaciones.length === 0
      ? 'Las cuatro cuotas de eje caen dentro de los rangos que T24I publicaba.'
      : desviaciones.map(function (f) {
        return 'La cuota de ' + enEspanol(f.eje) + ' (' + f.cuota + ') queda fuera del rango ' +
          f.rango[0] + '-' + f.rango[1] + ' que T24I publicaba';
      }).join('; ') + ' (' + desviaciones.length + ' de ' + ORDEN_EJES.length + ' cuotas de eje).') +
    ' DEMRE dejó de publicar estos rangos desde T24R.',
    { datos: { cuotas: CUOTAS_EJE, desviaciones: desviaciones } }
  ));

  // 6 · La mezcla de habilidades no está calibrada, y es la desviación grande.
  var habPozo = contarPor(pozo, 'habilidad');
  var habEnsayo = ensayo === null ? null : contarPor(ensayo, 'habilidad');
  var rangosHabilidad = {};
  HABILIDADES_M1.forEach(function (h) { rangosHabilidad[h] = RANGOS_T24I[h]; });
  var conteos = habEnsayo === null ? habPozo : habEnsayo;
  avisos.push(crearAviso(
    'mezcla_habilidades',
    'info',
    'La mezcla de habilidades no está calibrada. ' +
    (ambito === 'ensayo' ? 'Este ensayo trae ' : 'El pozo trae ') +
    (conteos.resolver_problemas || 0) + ' de resolver problemas (T24I publicaba ' +
    RANGOS_T24I.resolver_problemas[0] + '-' + RANGOS_T24I.resolver_problemas[1] + ') y ' +
    (conteos.representar || 0) + ' de representar (publicaba ' +
    RANGOS_T24I.representar[0] + '-' + RANGOS_T24I.representar[1] + '). El pozo tiene ' +
    (habPozo.resolver_problemas || 0) + ' de ' + pozo.length + ' en resolver problemas, así que ' +
    'respetar esos rangos obligaría a repetir casi siempre las mismas ' +
    (habPozo.representar || 0) + ' de representar. El desglose por habilidad describe ' +
    (ambito === 'ensayo' ? 'este ensayo' : 'el ensayo que se genere') + ', no tu nivel.',
    { datos: { ensayo: habEnsayo, pozo: habPozo, rangos: rangosHabilidad } }
  ));

  // Integridad de la que construirAvisos es dueña: los descartes de esquema y
  // de prueba incompleta (§7.15). Severidad 'aviso': van al <details> de
  // integridad, nunca entre las 6 fijas.
  [
    {
      motivo: 'esquema_invalido',
      texto: ' preguntas se descartaron por no cumplir el esquema del banco.',
    },
    {
      motivo: 'prueba_incompleta',
      texto: ' preguntas quedaron fuera porque su prueba está incompleta en el banco ' +
        '(las presentes no llegan a las que la prueba declara).',
    },
  ].forEach(function (fila) {
    var n = d.conteos[fila.motivo] || 0;
    if (n === 0) return;
    var ids = d.ids[fila.motivo] || [];
    avisos.push(crearAviso(
      fila.motivo,
      'aviso',
      n + fila.texto,
      { conteo: n, datos: { ids: ids } }
    ));
  });

  return avisos;
}

/** Los tres campos renderizables de una pregunta (§2): enunciado, alternativas, explicación. */
function camposRenderizablesDe(pregunta) {
  var campos = [{ campo: 'enunciado', texto: pregunta.enunciado }];
  pregunta.alternativas.forEach(function (a) {
    campos.push({ campo: 'alternativa ' + a.id, texto: a.texto });
  });
  campos.push({ campo: 'explicacion', texto: pregunta.explicacion });
  return campos;
}

/**
 * Tokeniza los tres campos renderizables de cada pregunta del pozo UNA vez,
 * DESCARTA los bloques y devuelve solo los avisos, con el id de la pregunta en
 * `datos.ids`.
 *
 * Existe porque el grupo de integridad de RF-8 se pinta en configuración, donde
 * el render bajo demanda (RNF-4) todavía no ha tokenizado nada: sin este
 * barrido, `dolar_impar` y `marcador_malformado` aparecerían solo después de
 * rendir la pregunta que los provoca.
 *
 * Sobre el pozo actual de 194 devuelve exactamente 1 aviso: el
 * `tabla_sin_cabecera` de `m1-reg24-059` (criterio 59bis).
 *
 * @param {Array<Object>} pozo
 * @returns {Array<Object>} Aviso[], uno por ocurrencia (los agrupa `agregarAvisos`)
 */
function recolectarAvisosDeContenido(pozo) {
  var avisos = [];

  pozo.forEach(function (p) {
    camposRenderizablesDe(p).forEach(function (c) {
      tokenizarContenido(c.texto).avisos.forEach(function (aviso) {
        // `datos.ids` pasa a llevar el id de la PREGUNTA, que es lo que la
        // interfaz necesita para localizar el problema; el resto de `datos`
        // que trajera el tokenizador se conserva.
        var datos = Object.assign({}, aviso.datos, { ids: [p.id], campo: c.campo });
        avisos.push(crearAviso(aviso.codigo, aviso.severidad, aviso.texto, {
          detalle: p.id + ' · ' + c.campo,
          datos: datos,
        }));
      });
    });
  });

  return avisos;
}

/**
 * Agrupa avisos por `codigo`: un aviso por código, con `conteo` igual a
 * `Σ(aviso.conteo ?? 1)` (hallazgo 8), la severidad del PRIMERO del grupo, su
 * texto, y los ids acumulados en `detalle` y en `datos.ids`. Conserva el orden
 * de PRIMERA APARICIÓN y es el paso obligatorio antes de pintar (§7.4).
 *
 * Un grupo de un solo aviso se devuelve tal cual, sin añadirle `conteo`: así
 * las 6 advertencias fijas pasan intactas (criterio 59).
 *
 * @param {Array<Object>} avisos
 * @returns {Array<Object>} Aviso[]
 */
function agregarAvisos(avisos) {
  var orden = [];
  var grupos = new Map();

  avisos.forEach(function (aviso) {
    if (!grupos.has(aviso.codigo)) {
      grupos.set(aviso.codigo, []);
      orden.push(aviso.codigo);
    }
    grupos.get(aviso.codigo).push(aviso);
  });

  return orden.map(function (codigo) {
    var grupo = grupos.get(codigo);
    var primero = grupo[0];
    var conteo = grupo.reduce(function (acc, a) {
      return acc + (a.conteo === undefined ? 1 : a.conteo);
    }, 0);

    if (grupo.length === 1 && primero.conteo === undefined) return primero;

    var ids = [];
    var detalles = [];
    grupo.forEach(function (a) {
      if (a.datos && Array.isArray(a.datos.ids)) {
        a.datos.ids.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
      }
      if (a.detalle !== undefined && detalles.indexOf(a.detalle) === -1) detalles.push(a.detalle);
    });

    var extra = { conteo: conteo };
    if (ids.length > 0) extra.detalle = ids.join(', ');
    else if (detalles.length > 0) extra.detalle = detalles.join('; ');
    var datos = Object.assign({}, primero.datos);
    if (ids.length > 0) datos.ids = ids;
    if (Object.keys(datos).length > 0) extra.datos = datos;

    return crearAviso(codigo, primero.severidad, primero.texto, extra);
  });
}

// ---- Exportación compatible con Node (CommonJS) y navegador (<script>) ----

var Dominio = {
  HABILIDADES_M1,
  EJES_M1,
  ESQUEMA_SOPORTADO,
  RANGOS_T24I,
  PRUEBAS_VERIFICADAS_CIEGO,
  MOTIVOS_INVALIDEZ,
  NOMBRES_CONTENIDO,
  CODIGOS_AVISO,
  motivosInvalidez,
  validarPreguntaM1,
  validarPrueba,
  validarFigura,
  tieneIdsUnicos,
  referenciasRotas,
  validarBanco,
  MOTIVOS_DESCARTE,
  pruebaCompleta,
  construirPozo,
  resolverFigura,
  huellaPozo,
  hashSemilla,
  crearAleatorio,
  mezclar,
  CUOTAS_EJE,
  ORDEN_EJES,
  verificarFactibilidad,
  generarEnsayo,
  tokenizarContenido,
  esPuntuable,
  revisarPregunta,
  calcularResultado,
  agruparPor,
  LIMITE_OFICIAL_SEGUNDOS,
  calcularTranscurrido,
  calcularRestante,
  formatearTiempo,
  umbralAviso,
  registrarTick,
  crearEstadoInicial,
  prepararConfig,
  aplicarFiltroPozo,
  iniciarEnsayo,
  responder,
  limpiarRespuesta,
  alternarMarca,
  alternarNotacion,
  irAIndice,
  calcularSiguienteIndice,
  calcularIndiceAnterior,
  puedeAvanzar,
  puedeRetroceder,
  formatoProgreso,
  resumenAvance,
  estadoCasilla,
  etiquetaCasilla,
  finalizar,
  construirAvisos,
  recolectarAvisosDeContenido,
  agregarAvisos,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dominio;
}
if (typeof window !== 'undefined') {
  window.Dominio = Dominio;
}
