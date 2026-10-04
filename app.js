// app.js
//
// Capa de carga, render DOM, interacción y cronómetro de la práctica PAES M1.
//
// Flujo de entrada, igual que en `paes_lenguaje01`: la app carga el banco y
// aterriza DIRECTO en la pregunta 1 de 65. No hay pantalla de configuración ni
// nada que elegir antes de empezar. La semilla, la huella del pozo, el filtro
// de verificación ciega, el interruptor del cronómetro y las advertencias
// honestas viven en el <details> "Ajustes y trazabilidad", al final de la
// pantalla del ensayo: siguen visibles y siguen siendo las mismas funciones de
// dominio.js, pero dejan de ser una compuerta de entrada.
//
// Depende de `Dominio` (dominio.js, cargado antes vía <script>) para TODA la
// lógica: validación, pozo, generación, tokenizador, corrección, transiciones
// de estado, cronómetro y avisos. Este archivo no decide nada de dominio; solo
//   1. comprueba el protocolo y carga el banco (§7.3, §7.15),
//   2. acumula los avisos en el orden fijado por §7.4 y los pinta,
//   3. clona la <template> de la fase dentro de #app y pinta desde el estado,
//   4. construye nodos DOM desde los bloques del tokenizador (§7.9),
//   5. resuelve figuras contra `figuras[]` según la tabla de RF-6,
//   6. habla por el cronómetro usando `Dominio.registrarTick` (§7.12).
//
// Invariante que este archivo sostiene: el texto del banco NUNCA pasa por
// `innerHTML`. Siempre `document.createTextNode`, que es lo que escapa los
// `<`, `&` y `>` literales de 16 preguntas por construcción.

// ---------------------------------------------------------------------------
// Estado global y acumuladores de avisos
// ---------------------------------------------------------------------------

/** Estado de la aplicación (EstadoApp de §7.4). */
var estadoGlobal = null;

/** Banco ya validado, para poder rearmar el ensayo sin volver a cargarlo. */
var bancoGlobal = null;

/**
 * Ids de las preguntas cuyo panel de revisión está abierto. La revisión por
 * pregunta es la del flujo de Lenguaje y es estado de PRESENTACIÓN, así que
 * vive aquí y no en `EstadoApp`. A diferencia de Lenguaje, no se cierra al
 * navegar: volver a una pregunta ya revisada la muestra revisada.
 */
var revisadas = {};

/** `false` si `vendor/katex/` no está: las fórmulas degradan a LaTeX (§7.10). */
var katexDisponible = false;

/** Handle del `setInterval` del cronómetro; `null` si no hay ensayo en curso. */
var temporizador = null;

// Los cinco productores de avisos de §7.4 escriben en listas separadas y
// `componerAvisos` las concatena SIEMPRE en el mismo orden. Nadie pinta desde
// su propia lista.
var avisosIntegridad = []; // paso 1 (validarBanco) + paso 3 (barrido RF-1.6)
var avisosUrl = []; // paso 4, parte de app.js: `decodeURIComponent` que lanza
var avisosParametros = []; // paso 4 (prepararConfig)
var avisosKatex = []; // paso 5 (katex_ausente)
var avisosRender = []; // RF-6: figura_sin_contenido y <img> que no carga

/** Tope de `console.warn` por fórmula inválida (§7.15). */
var MAXIMO_AVISOS_KATEX = 10;
var fallosKatex = 0;

/** Columnas de la cuadrícula de 65 casillas; 65 = 13 × 5. */
var COLUMNAS_CUADRICULA = 13;

/**
 * Límite a medida llegado por `?tiempo=<segundos>` (RF-4.6). La pantalla de
 * configuración ofrece SOLO 2 h 20 min y sin límite, así que un valor a medida
 * tiene que sobrevivir al envío del formulario mientras el usuario no toque los
 * radios; en cuanto los toca, se descarta.
 */
var limiteAMedida = null;

/**
 * Medidas del criterio 66, accesibles por consola (`Medidas` en el ámbito
 * global). Se rellenan con `performance.now()` durante el arranque y el render.
 */
var Medidas = {
  cargaInicialMs: null,
  barridoContenidoMs: null,
  ultimoRenderPreguntaMs: null,
  medirRenderDe: medirRenderDe,
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Construye un Aviso con la misma forma que `crearAviso` de dominio.js
 * (`{codigo, severidad, texto}` + `detalle`/`datos`/`conteo` opcionales). Vive
 * aquí porque los avisos de los que app.js es dueño (`katex_ausente`,
 * `url_invalida` por `decodeURIComponent`, `figura_sin_contenido`) no los puede
 * emitir dominio.js: dependen del DOM o del entorno.
 */
function crearAvisoApp(codigo, severidad, texto, extra) {
  var aviso = { codigo: codigo, severidad: severidad, texto: texto };
  if (extra && extra.detalle !== undefined) aviso.detalle = extra.detalle;
  if (extra && extra.datos !== undefined) aviso.datos = extra.datos;
  if (extra && extra.conteo !== undefined) aviso.conteo = extra.conteo;
  return aviso;
}

/** `document.getElementById`, abreviado. */
function el(id) {
  return document.getElementById(id);
}

/** Crea un elemento con clase y texto opcionales. El texto va como nodo. */
function crear(etiqueta, clase, texto) {
  var nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined && texto !== null) nodo.appendChild(document.createTextNode(texto));
  return nodo;
}

/** Vacía un contenedor sin usar `innerHTML` con datos del banco. */
function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

/** Nombre legible de una prueba, para la trazabilidad (RF-4.8). */
function nombrePrueba(prueba) {
  if (!prueba) return 'prueba desconocida';
  var proceso = prueba.proceso ? prueba.proceso.charAt(0).toUpperCase() + prueba.proceso.slice(1) : '';
  return (proceso + ' ' + prueba.admision).trim() + (prueba.forma ? ' · forma ' + prueba.forma : '');
}

/** Nombre legible de un eje o habilidad, para los desgloses. */
var NOMBRES_CATEGORIA = {
  numeros: 'Números',
  algebra_y_funciones: 'Álgebra y funciones',
  geometria: 'Geometría',
  probabilidad_y_estadistica: 'Probabilidad y estadística',
  resolver_problemas: 'Resolver problemas',
  modelar: 'Modelar',
  representar: 'Representar',
  argumentar: 'Argumentar',
};

function nombreCategoria(clave) {
  if (NOMBRES_CATEGORIA[clave]) return NOMBRES_CATEGORIA[clave];
  if (Dominio.NOMBRES_CONTENIDO[clave]) return clave + ' · ' + Dominio.NOMBRES_CONTENIDO[clave];
  // Un `contenido_id` sin nombre se muestra como el id crudo, no como
  // "desconocido" (§7.13).
  return String(clave);
}

/** Porcentaje redondeado a un decimal AL PINTAR; `null` ⇒ "sin datos". */
function textoPorcentaje(porcentaje) {
  if (porcentaje === null || porcentaje === undefined) return 'sin datos';
  return porcentaje.toFixed(1) + ' %';
}

// ---------------------------------------------------------------------------
// Arranque: protocolo, carga, validación, avisos (§7.3, §7.15, §7.4)
// ---------------------------------------------------------------------------

/**
 * Error con mensaje accionable en español para el usuario y causa técnica para
 * `console.error`, que es la regla general de §7.15 (heredada de
 * `renderizarError` en Lenguaje).
 */
function ErrorAccionable(mensaje, causa, lineasExtra) {
  this.mensaje = mensaje;
  this.causa = causa;
  this.lineasExtra = lineasExtra || [];
}

/**
 * Pinta un error fatal en `#app` con `role="alert"` y deja la interfaz sin
 * ningún botón de ensayo activo. El detalle técnico va a `console.error`.
 *
 * @param {ErrorAccionable|Error} error
 */
function renderizarError(error) {
  var app = el('app');
  vaciar(app);
  app.removeAttribute('aria-busy');

  var caja = crear('div', 'error');
  caja.setAttribute('role', 'alert');

  var mensaje = error instanceof ErrorAccionable
    ? error.mensaje
    : 'No se pudo cargar el banco de preguntas. Intenta recargar la página.';
  caja.appendChild(crear('p', null, mensaje));

  var extras = error instanceof ErrorAccionable ? error.lineasExtra : [];
  extras.forEach(function (linea) {
    var p = document.createElement('p');
    if (linea.codigo) {
      p.appendChild(document.createTextNode(linea.antes || ''));
      p.appendChild(crear('code', null, linea.codigo));
      p.appendChild(document.createTextNode(linea.despues || ''));
    } else {
      p.appendChild(document.createTextNode(linea.texto || String(linea)));
    }
    caja.appendChild(p);
  });

  app.appendChild(caja);
  console.error('Fallo fatal al arrancar la práctica M1:', error instanceof ErrorAccionable ? error.causa : error, error);
}

/**
 * Carga el banco con `fetch` y traduce los tres fallos de transporte de §7.15
 * (red, HTTP ≠ 2xx con su código, JSON corrupto) a `ErrorAccionable`.
 *
 * @returns {Promise<Object>}
 */
function cargarBanco() {
  var respuesta;
  return fetch('banco-preguntas-m1.json')
    .catch(function (causa) {
      throw new ErrorAccionable(
        'No se pudo cargar el banco de preguntas. Comprueba que el servidor local sigue en ' +
        'marcha y vuelve a cargar la página.',
        causa
      );
    })
    .then(function (r) {
      respuesta = r;
      if (!respuesta.ok) {
        throw new ErrorAccionable(
          'No se pudo cargar el banco de preguntas: el servidor respondió HTTP ' +
          respuesta.status + '. Comprueba que «banco-preguntas-m1.json» está junto a este HTML.',
          new Error('HTTP ' + respuesta.status)
        );
      }
      return respuesta.json().catch(function (causa) {
        throw new ErrorAccionable(
          'El banco de preguntas está corrupto: el archivo no es un JSON válido.',
          causa
        );
      });
    });
}

/**
 * Lee los parámetros de URL soportados (§7.14) y los entrega CRUDOS en una
 * `EntradaConfig`. `decodeURIComponent` va dentro de un `try`: si lanza (un `%`
 * suelto), se omite ESE parámetro con aviso `url_invalida` y el resto se
 * procesa.
 *
 * Nota: `URLSearchParams` ya decodifica, así que este `decodeURIComponent`
 * actúa sobre el valor decodificado. Es lo que fija §7.14 y es observable: un
 * `%` literal en la semilla la descarta con aviso en vez de pasarla a medias.
 *
 * @returns {Object} EntradaConfig con los 4 campos (null si el parámetro no vino)
 */
function leerParametrosUrl() {
  var parametros = new URLSearchParams(location.search);
  var entrada = { semillaTexto: null, verificadas: null, tiempo: null, notacion: null };
  var mapa = [
    ['semilla', 'semillaTexto'],
    ['verificadas', 'verificadas'],
    ['tiempo', 'tiempo'],
    ['notacion', 'notacion'],
  ];

  mapa.forEach(function (par) {
    if (!parametros.has(par[0])) return;
    var crudo = parametros.get(par[0]);
    try {
      entrada[par[1]] = decodeURIComponent(crudo);
    } catch (causa) {
      avisosUrl.push(crearAvisoApp(
        'url_invalida',
        'aviso',
        'Se ignoró el parámetro «' + par[0] + '» de la URL porque no se pudo descodificar; ' +
        'se usa el valor por defecto.',
        { detalle: 'parámetro ' + par[0], datos: { parametro: par[0], valor: crudo, usado: 'por defecto' } }
      ));
      console.warn('Parámetro de URL no descodificable:', par[0], causa);
    }
  });

  return entrada;
}

/**
 * Punto de arranque. Guardia de protocolo ANTES del `fetch` (§7.3): con
 * `file://` el `fetch` está bloqueado, así que se explica el comando exacto en
 * vez de dejar un error genérico en la consola, y no queda ningún botón de
 * ensayo activo porque ninguna plantilla se clona.
 */
function iniciar() {
  if (location.protocol === 'file:') {
    renderizarError(new ErrorAccionable(
      'Esta página necesita servirse por HTTP: abierta directamente desde el disco (file://), ' +
      'el navegador bloquea la lectura del banco de preguntas.',
      new Error('protocolo file: no soportado'),
      [
        { antes: 'Desde la carpeta del proyecto, ejecuta: ', codigo: 'python3 -m http.server 8080' },
        { antes: 'y abre ', codigo: 'http://localhost:8080/prueba-m1.html' },
      ]
    ));
    return;
  }

  var t0 = performance.now();

  cargarBanco().then(function (banco) {
    // Paso 1 de §7.4: integridad del banco. Lo fatal corta el arranque.
    var validacion = Dominio.validarBanco(banco);
    if (!validacion.valido) {
      var primeros = validacion.errores.slice(0, 5).map(function (e) { return { texto: '· ' + e.texto }; });
      throw new ErrorAccionable(
        'El banco de preguntas no se puede usar: ' + validacion.errores.length +
        ' problema(s) de integridad. Los primeros:',
        new Error(validacion.errores.map(function (e) { return e.codigo; }).join(', ')),
        primeros
      );
    }
    bancoGlobal = banco;
    avisosIntegridad = validacion.avisos.slice();
    if (validacion.avisos.length > 0) {
      console.warn('Avisos de integridad del banco:', validacion.avisos);
    }

    // Paso 2: pozo (dentro de `crearEstadoInicial`).
    var base = Dominio.crearEstadoInicial(banco);

    // Paso 3: barrido de avisos de contenido (RF-1.6), medido por separado
    // porque de ese número depende si hay que diferirlo (criterio 66).
    var tBarrido = performance.now();
    var avisosContenido = Dominio.recolectarAvisosDeContenido(base.pozo);
    Medidas.barridoContenidoMs = performance.now() - tBarrido;
    avisosIntegridad = avisosIntegridad.concat(avisosContenido);
    if (avisosContenido.length > 0) {
      console.warn('Avisos de contenido del pozo:', avisosContenido);
    }

    // Paso 5: KaTeX (el paso 4, `prepararConfig`, lo hace `armarEnsayo`).
    katexDisponible = typeof katex !== 'undefined';
    if (!katexDisponible) {
      avisosKatex = [crearAvisoApp(
        'katex_ausente',
        'aviso',
        'Las fórmulas se muestran en notación LaTeX porque KaTeX no está disponible. Ejecuta ' +
        '«npm install && npm run vendor:katex» en la carpeta del proyecto para activarlo.',
        { detalle: 'vendor/katex/katex.min.js no se cargó' }
      )];
      console.warn('KaTeX no está disponible: las fórmulas se pintan como LaTeX en texto.');
    }

    // Ensayo armado SIN preguntar nada: semilla automática (o la de la URL),
    // cuotas 22/19/12/12 sobre el pozo, cronómetro de 2 h 20 min corriendo.
    if (!armarEnsayo(leerParametrosUrl(), base)) return;

    sincronizarNotacion();
    pintarEnCurso();

    Medidas.cargaInicialMs = performance.now() - t0;
    console.info(
      'Medidas de arranque (criterio 66): carga inicial ' + Medidas.cargaInicialMs.toFixed(1) +
      ' ms, de los cuales el barrido de contenido ' + Medidas.barridoContenidoMs.toFixed(1) + ' ms.'
    );
  }).catch(renderizarError);
}

/**
 * Normaliza la entrada con `prepararConfig`, aplica el filtro de verificadas,
 * comprueba la factibilidad y genera el ensayo. Deja `estadoGlobal` en fase
 * `'en_curso'`.
 *
 * El orden es el de §7.15: `aplicarFiltroPozo` PRIMERO (sobre un estado en fase
 * `'configuracion'`, que es la única en la que esa transición actúa),
 * `verificarFactibilidad` sobre el pozo que acaba de salir, y solo entonces
 * `iniciarEnsayo`.
 *
 * @param {Object} entrada EntradaConfig cruda (URL o controles de ajustes)
 * @param {Object} [estadoBase] estado en fase `'configuracion'`; si no se pasa,
 *   se construye uno nuevo desde el banco
 * @returns {boolean} `true` si el ensayo se armó
 */
function armarEnsayo(entrada, estadoBase) {
  var base = estadoBase || Dominio.crearEstadoInicial(bancoGlobal);

  // Paso 4 de §7.4: `prepararConfig` es el único normalizador y el único
  // emisor de los avisos de parámetro. Se REEMPLAZAN, no se acumulan.
  var preparado = Dominio.prepararConfig(entrada);
  avisosParametros = preparado.avisos.slice();
  if (preparado.avisos.length > 0) {
    console.warn('Parámetros de configuración ignorados:', preparado.avisos);
  }

  if (preparado.config.limiteSegundos !== null &&
      preparado.config.limiteSegundos !== Dominio.LIMITE_OFICIAL_SEGUNDOS) {
    limiteAMedida = preparado.config.limiteSegundos;
  }

  base = Object.assign({}, base, { config: preparado.config });
  base = Dominio.aplicarFiltroPozo(base, preparado.config.soloVerificadas);

  var factibilidad = Dominio.verificarFactibilidad(base.pozo, Dominio.CUOTAS_EJE);
  if (!factibilidad.factible) {
    var texto = 'No se puede armar un ensayo de 65 preguntas con los filtros elegidos: ' +
      factibilidad.deficits.map(function (d) {
        return 'faltan ' + (d.requerido - d.disponible) + ' de ' + nombreCategoria(d.eje);
      }).join('; ') + '.';

    if (estadoGlobal === null) {
      renderizarError(new ErrorAccionable(texto, new Error('pozo insuficiente')));
    } else {
      mostrarDeficit(texto + ' Desactiva el filtro de verificación ciega y vuelve a rearmar.');
    }
    console.error('Pozo insuficiente:', factibilidad.deficits);
    return false;
  }

  try {
    estadoGlobal = Dominio.iniciarEnsayo(base, preparado.config, Date.now());
  } catch (error) {
    if (estadoGlobal === null) {
      renderizarError(new ErrorAccionable(
        'No se pudo generar el ensayo: ' + error.message, error));
    } else {
      mostrarDeficit(error.message);
    }
    console.error('No se pudo generar el ensayo:', error);
    return false;
  }

  revisadas = {};
  return true;
}

/**
 * Concatena los avisos de los cinco productores SIEMPRE en el orden de §7.4 y
 * los pasa por `agregarAvisos`, que es el paso obligatorio antes de pintar.
 *
 * @param {Array<Object>|null} preguntasEnsayo las 65 en el pie de resultados,
 *   `null` en configuración (cambia la redacción de las advertencias 3 y 6)
 * @returns {Array<Object>} Aviso[]
 */
function componerAvisos(preguntasEnsayo) {
  // El tercer argumento es el ESTADO completo: `construirAvisos` necesita
  // `idsDescartados` para rellenar `datos.ids` de los avisos de integridad.
  var fijas = Dominio.construirAvisos(
    estadoGlobal.banco,
    estadoGlobal.pozo,
    estadoGlobal,
    estadoGlobal.config,
    preguntasEnsayo
  );

  return Dominio.agregarAvisos(
    avisosIntegridad
      .concat(avisosRender)
      .concat(avisosUrl)
      .concat(avisosParametros)
      .concat(avisosKatex)
      .concat(fijas)
  );
}

/**
 * Pinta el componente de avisos de RF-8 dentro de `contenedor`: las 6
 * advertencias fijas (`severidad: 'info'`) en un `<ul>` siempre visible y sin
 * botón de cerrar, y debajo un `<details>` colapsado con lo variable.
 *
 * Es la misma función en configuración y en el pie de resultados: no hay dos
 * copias del texto.
 *
 * @param {Array<Object>} avisos
 * @param {HTMLElement} contenedor
 */
function pintarAvisos(avisos, contenedor) {
  vaciar(contenedor);

  var fijas = avisos.filter(function (a) { return a.severidad === 'info'; });
  var variables = avisos.filter(function (a) { return a.severidad !== 'info'; });

  var seccion = crear('section', 'avisos');
  seccion.setAttribute('role', 'region');
  seccion.setAttribute('aria-label', 'Advertencias sobre los datos');
  seccion.appendChild(crear('h3', null, 'Lo que esta práctica no puede prometerte'));

  var lista = document.createElement('ul');
  fijas.forEach(function (aviso) {
    lista.appendChild(crear('li', null, aviso.texto));
  });
  seccion.appendChild(lista);

  var detalles = document.createElement('details');
  var conteo = variables.reduce(function (acc, a) {
    return acc + (a.conteo === undefined ? 1 : a.conteo);
  }, 0);
  detalles.appendChild(crear(
    'summary',
    null,
    conteo === 0
      ? 'Sin avisos de integridad de los datos'
      : conteo + ' aviso(s) de integridad de los datos'
  ));

  if (variables.length === 0) {
    detalles.appendChild(crear('p', 'secundario', 'El banco cargado no produjo ningún aviso.'));
  } else {
    var listaVariables = document.createElement('ul');
    variables.forEach(function (aviso) {
      var li = crear('li', null, aviso.texto);
      if (aviso.detalle !== undefined) {
        li.appendChild(crear('span', 'aviso-detalle', aviso.detalle));
      }
      listaVariables.appendChild(li);
    });
    detalles.appendChild(listaVariables);
  }

  seccion.appendChild(detalles);
  contenedor.appendChild(seccion);
}

// ---------------------------------------------------------------------------
// Render de contenido desde los bloques del tokenizador (§7.9)
// ---------------------------------------------------------------------------

/**
 * Pinta los bloques del tokenizador como nodos DOM dentro de `contenedor`.
 *
 * `texto` siempre con `createTextNode`, nunca `innerHTML`: así los `<`, `&` y
 * `>` literales del banco quedan escapados por construcción.
 *
 * @param {Array<Object>} bloques salida de `Dominio.tokenizarContenido`
 * @param {HTMLElement} contenedor
 * @param {Object} banco
 * @param {{pregunta?: Object, resolverFiguras?: boolean}} [opciones]
 */
function pintarContenido(bloques, contenedor, banco, opciones) {
  var opts = opciones || {};

  bloques.forEach(function (bloque, indice) {
    if (bloque.tipo === 'parrafo') {
      contenedor.appendChild(pintarParrafo(bloque.spans));
      return;
    }
    if (bloque.tipo === 'formula_bloque') {
      pintarFormula(contenedor, bloque.latex, true);
      return;
    }
    if (bloque.tipo === 'tabla') {
      // `<caption>` solo si el párrafo anterior la introduce (§7.9). Se exige
      // además que ese párrafo sea texto llano terminado en ':': una
      // `<caption>` con LaTeX crudo dentro sería peor que ninguna, y una
      // inventada peor todavía. Si se usa como caption, el párrafo no se
      // pinta dos veces.
      var anterior = indice > 0 ? bloques[indice - 1] : null;
      var caption = null;
      if (anterior && anterior.tipo === 'parrafo' && esParrafoIntroductorio(anterior) &&
          contenedor.lastChild && contenedor.lastChild.nodeName === 'P') {
        caption = textoLlanoDeSpans(anterior.spans).trim();
        contenedor.removeChild(contenedor.lastChild);
      }
      contenedor.appendChild(pintarTabla(bloque, caption));
      return;
    }
    if (bloque.tipo === 'lista') {
      var ul = document.createElement('ul');
      bloque.items.forEach(function (spans) {
        var li = document.createElement('li');
        pintarSpans(spans, li);
        ul.appendChild(li);
      });
      contenedor.appendChild(ul);
      return;
    }
    if (bloque.tipo === 'figura') {
      pintarFigura(contenedor, bloque.idFigura, banco, opts);
    }
  });
}

/** Un párrafo es "introductorio" de la tabla si es texto llano acabado en ':'. */
function esParrafoIntroductorio(bloque) {
  var soloTexto = bloque.spans.every(function (s) { return s.tipo === 'texto' || s.tipo === 'salto'; });
  if (!soloTexto) return false;
  return /:\s*$/.test(textoLlanoDeSpans(bloque.spans));
}

/** Concatena el texto llano de una lista de spans (ignora fórmulas y saltos). */
function textoLlanoDeSpans(spans) {
  return spans.map(function (span) {
    if (span.tipo === 'texto') return span.valor;
    if (span.tipo === 'enfasis') return textoLlanoDeSpans(span.spans);
    return '';
  }).join('');
}

/** Pinta un bloque `parrafo` como `<p>`. */
function pintarParrafo(spans) {
  var p = document.createElement('p');
  pintarSpans(spans, p);
  return p;
}

/**
 * Pinta una lista de spans dentro de `destino`.
 *
 * HALLAZGO 1 (HIGH): el span `{tipo: 'salto'}` se pinta como un `<br>` DENTRO
 * del párrafo en curso, sin abrir párrafo nuevo. Es lo que hace que los pasos
 * 1), 2) y 3) de `m1-inv24-048` salgan en tres líneas y no como un párrafo
 * corrido.
 */
function pintarSpans(spans, destino) {
  spans.forEach(function (span) {
    if (span.tipo === 'texto') {
      destino.appendChild(document.createTextNode(span.valor));
      return;
    }
    if (span.tipo === 'salto') {
      destino.appendChild(document.createElement('br'));
      return;
    }
    if (span.tipo === 'formula') {
      pintarFormula(destino, span.latex, false);
      return;
    }
    if (span.tipo === 'enfasis') {
      var strong = document.createElement('strong');
      pintarSpans(span.spans, strong);
      destino.appendChild(strong);
    }
  });
}

/**
 * Emite el PAR de nodos hermanos de §7.9: el nodo de KaTeX (con `data-latex` y
 * MathML) y, a continuación, un `<code class="formula-cruda" hidden>` con el
 * LaTeX como texto. El par es el mecanismo del interruptor de RF-9.5 y, a la
 * vez, el de la degradación sin KaTeX (§7.10): un solo camino de código.
 *
 * Sin KaTeX se emite solo la segunda mitad, SIN `hidden`, y no se llama a
 * `katex.render`.
 */
function pintarFormula(destino, latex, enBloque) {
  if (katexDisponible) {
    var span = document.createElement('span');
    span.className = enBloque ? 'formula formula-bloque' : 'formula';
    span.dataset.latex = latex;
    try {
      katex.render(latex, span, {
        displayMode: !!enBloque,
        throwOnError: false,
        output: 'htmlAndMathml',
      });
    } catch (error) {
      // `throwOnError: false` ya deja la fórmula en rojo con su fuente; esto
      // cubre cualquier otro fallo para que no se caiga la pregunta entera.
      if (fallosKatex < MAXIMO_AVISOS_KATEX) {
        fallosKatex += 1;
        console.warn('KaTeX no pudo renderizar una fórmula:', latex, error);
      }
      span.appendChild(document.createTextNode(latex));
    }
    destino.appendChild(span);
  }

  var codigo = crear('code', enBloque ? 'formula-cruda formula-cruda-bloque' : 'formula-cruda', latex);
  if (katexDisponible) codigo.hidden = true;
  destino.appendChild(codigo);
}

/**
 * Pinta un bloque `tabla`. Sin `<thead>` si `cabecera` está vacía (el caso de
 * `m1-reg24-059`, cuyas 13 celdas son datos) y sin `<tbody>` si `filas` está
 * vacía (§7.9 paso 3).
 */
function pintarTabla(bloque, caption) {
  var tabla = document.createElement('table');

  if (caption) tabla.appendChild(crear('caption', null, caption));

  if (bloque.cabecera.length > 0) {
    var thead = document.createElement('thead');
    var trCabecera = document.createElement('tr');
    bloque.cabecera.forEach(function (celda) {
      var th = document.createElement('th');
      th.setAttribute('scope', 'col');
      pintarSpans(celda, th);
      trCabecera.appendChild(th);
    });
    thead.appendChild(trCabecera);
    tabla.appendChild(thead);
  }

  if (bloque.filas.length > 0) {
    var tbody = document.createElement('tbody');
    bloque.filas.forEach(function (fila) {
      var tr = document.createElement('tr');
      fila.forEach(function (celda) {
        var td = document.createElement('td');
        pintarSpans(celda, td);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
  }

  return tabla;
}

// ---------------------------------------------------------------------------
// Figuras (RF-6, §7.11) — incluida la fila que faltaba (hallazgo 7)
// ---------------------------------------------------------------------------

/** Nombre base de `figura.archivo`: la app NUNCA navega con `../docs/…` (§7.11). */
function rutaDeFigura(archivo) {
  var partes = String(archivo).split('/');
  return 'figuras/' + partes[partes.length - 1];
}

/**
 * Caja de figura con título y descripción. Se usa `<div>` y no
 * `<figure>`/`<figcaption>` a propósito: la transcripción se añade después de
 * la descripción y `<figcaption>` solo puede ser el primer o el último hijo de
 * un `<figure>`.
 */
function cajaFigura(titulo, descripcion, clase) {
  var caja = crear('div', clase ? 'figura ' + clase : 'figura');
  caja.setAttribute('role', 'group');
  caja.appendChild(crear('p', 'figura-titulo', titulo));
  if (descripcion) caja.appendChild(crear('p', 'figura-descripcion', descripcion));
  return caja;
}

/**
 * Añade la transcripción de una figura, renderizada con las figuras SIN
 * resolver para cortar la recursión figura → transcripción → figura (RF-5.7).
 */
function anexarTranscripcion(caja, figura, banco, enDetalle) {
  var bloques = Dominio.tokenizarContenido(figura.transcripcion, { resolverFiguras: false }).bloques;
  var destino = caja;

  if (enDetalle) {
    var detalles = document.createElement('details');
    detalles.appendChild(crear('summary', null, 'Transcripción de la figura'));
    destino = crear('div', 'bloque-contenido');
    detalles.appendChild(destino);
    caja.appendChild(detalles);
  } else {
    destino = crear('div', 'bloque-contenido');
    caja.appendChild(destino);
  }

  pintarContenido(bloques, destino, banco, { resolverFiguras: false });
}

/**
 * Resuelve un bloque `figura` contra `figuras[]` y pinta según la tabla de
 * RF-6, incluida la fila que el diseño no escribía (hallazgo 7): sin archivo,
 * sin transcripción y con `requiere_figura === false` la figura es decorativa,
 * así que se pinta un bloque con la descripción si existe y, si tampoco
 * existe, NO se pinta nada y se emite `figura_sin_contenido`. La pregunta sigue
 * respondible en los dos casos.
 */
function pintarFigura(contenedor, idFigura, banco, opciones) {
  var pregunta = opciones && opciones.pregunta ? opciones.pregunta : null;
  var figura = Dominio.resolverFigura(banco, idFigura);

  if (figura === null) {
    // Referencia rota: recuperable, nunca fatal.
    contenedor.appendChild(cajaFigura(
      'Figura no disponible (referencia rota: ' + idFigura + ')',
      null,
      'figura-bloqueante'
    ));
    return;
  }

  if (figura.archivo !== null && figura.archivo !== undefined) {
    var caja = cajaFigura('Figura', null);
    var img = document.createElement('img');
    img.src = rutaDeFigura(figura.archivo);
    img.alt = figura.descripcion || 'Figura de la pregunta';
    img.addEventListener('error', function () {
      // Sustitución en caliente por el bloque de transcripción (§7.11): no se
      // deja un icono roto.
      var reemplazo = cajaFigura('Figura no disponible (la imagen no se pudo cargar)', figura.descripcion);
      if (figura.transcripcion) anexarTranscripcion(reemplazo, figura, banco, false);
      if (caja.parentNode) caja.parentNode.replaceChild(reemplazo, caja);
      registrarAvisoRender(crearAvisoApp(
        'figura_rota',
        'aviso',
        'Una imagen de figura no se pudo cargar; se muestra su transcripción.',
        { detalle: figura.id, datos: { ids: [figura.id] } }
      ));
      console.warn('La imagen de la figura no cargó:', img.src);
    });
    caja.insertBefore(img, caja.firstChild.nextSibling);
    if (figura.transcripcion) anexarTranscripcion(caja, figura, banco, true);
    contenedor.appendChild(caja);
    return;
  }

  if (figura.transcripcion !== null && figura.transcripcion !== undefined) {
    var pendiente = cajaFigura('Figura no disponible (imagen pendiente)', figura.descripcion);
    anexarTranscripcion(pendiente, figura, banco, false);
    contenedor.appendChild(pendiente);
    return;
  }

  // Sin archivo y sin transcripción.
  if (pregunta && pregunta.requiere_figura === true) {
    contenedor.appendChild(cajaFigura(
      'Esta pregunta no se puede responder sin la figura, y la figura todavía no está disponible.',
      figura.descripcion,
      'figura-bloqueante'
    ));
    return;
  }

  // HALLAZGO 7: figura decorativa (`requiere_figura === false`) sin imagen y
  // sin transcripción.
  if (figura.descripcion) {
    contenedor.appendChild(cajaFigura(
      'Figura no disponible (imagen pendiente, sin transcripción)',
      figura.descripcion
    ));
    return;
  }

  registrarAvisoRender(crearAvisoApp(
    'figura_sin_contenido',
    'aviso',
    'Una figura decorativa no tiene imagen, transcripción ni descripción: no se pinta nada y la ' +
    'pregunta sigue respondible.',
    {
      detalle: (pregunta ? pregunta.id : figura.pregunta_id) + ' · ' + figura.id,
      datos: { ids: [pregunta ? pregunta.id : figura.pregunta_id, figura.id] },
    }
  ));
  console.warn('Figura sin contenido alguno:', figura.id);
}

/** Acumula un aviso de render una sola vez por detalle, y lo pinta si procede. */
function registrarAvisoRender(aviso) {
  var repetido = avisosRender.some(function (a) {
    return a.codigo === aviso.codigo && a.detalle === aviso.detalle;
  });
  if (repetido) return;
  avisosRender.push(aviso);

  var contenedor = el('avisos-ensayo') || el('avisos-resultados');
  if (contenedor && estadoGlobal) {
    pintarAvisos(componerAvisos(estadoGlobal.fase === 'resultados' ? estadoGlobal.preguntas : null), contenedor);
  }
}

// ---------------------------------------------------------------------------
// Fase: configuración
// ---------------------------------------------------------------------------

/** Clona la plantilla de una fase dentro de `#app`. */
function montarPlantilla(idPlantilla) {
  var app = el('app');
  vaciar(app);
  app.removeAttribute('aria-busy');
  app.appendChild(el(idPlantilla).content.cloneNode(true));
  return app;
}

/**
 * Pinta el <details> de ajustes y trazabilidad: semilla, huella del pozo,
 * filtro de verificación ciega, interruptor del cronómetro y las advertencias
 * honestas. Está fuera del camino de entrada, pero es el mismo estado y las
 * mismas funciones de dominio.js.
 */
function pintarAjustes() {
  el('campo-semilla').value = estadoGlobal.config.semillaTexto;
  el('filtro-verificadas').checked = estadoGlobal.config.soloVerificadas;

  el('huella-pozo').textContent = '';
  el('huella-pozo').appendChild(document.createTextNode('Huella del pozo: '));
  el('huella-pozo').appendChild(crear('span', 'huella', estadoGlobal.huellaPozo));

  var porEje = Dominio.ORDEN_EJES.map(function (eje) {
    var n = estadoGlobal.pozo.filter(function (p) { return p.eje === eje; }).length;
    return nombreCategoria(eje) + ' ' + n;
  }).join(' · ');
  el('conteo-pozo').textContent =
    estadoGlobal.pozo.length + ' preguntas utilizables en el pozo (' + porEje + ').';

  if (limiteAMedida !== null) {
    var nota = el('nota-tiempo');
    nota.hidden = false;
    nota.textContent = 'Límite a medida de ' + Dominio.formatearTiempo(limiteAMedida) +
      ', fijado por el parámetro «tiempo» de la URL.';
  }

  el('btn-copiar-semilla').addEventListener('click', copiarSemilla);
  el('btn-regenerar').addEventListener('click', rearmarDesdeAjustes);
  el('btn-cronometro').addEventListener('click', alternarCronometro);

  pintarEstadoCronometro();
  pintarAvisos(componerAvisos(null), el('avisos-ensayo'));
}

/** Muestra un déficit o un fallo de generación en el panel de ajustes. */
function mostrarDeficit(texto) {
  var deficit = el('deficit-pozo');
  if (!deficit) return;
  deficit.hidden = false;
  deficit.textContent = texto;
  var ajustes = el('ajustes');
  if (ajustes) ajustes.open = true;
}

/** Rearma el ensayo con la semilla y el filtro que haya en los ajustes. */
function rearmarDesdeAjustes() {
  var entrada = {
    semillaTexto: el('campo-semilla').value,
    verificadas: el('filtro-verificadas').checked,
    tiempo: limiteAMedida !== null
      ? limiteAMedida
      : (estadoGlobal.config.limiteSegundos === null ? 'ilimitado' : Dominio.LIMITE_OFICIAL_SEGUNDOS),
    notacion: estadoGlobal.config.notacionOriginal,
  };

  if (!armarEnsayo(entrada)) return;
  sincronizarNotacion();
  pintarEnCurso();
  el('ajustes').open = true;
}

/**
 * Enciende o apaga el cronómetro sin rearmar el ensayo: es un control de
 * presentación del límite, no un filtro del pozo. `restanteAnterior` se
 * recalcula para que el primer *tick* siguiente no pierda un umbral.
 */
function alternarCronometro() {
  var nuevoLimite = estadoGlobal.config.limiteSegundos === null
    ? Dominio.LIMITE_OFICIAL_SEGUNDOS
    : null;
  limiteAMedida = null;

  var ahora = Date.now();
  estadoGlobal = Object.assign({}, estadoGlobal, {
    config: Object.assign({}, estadoGlobal.config, { limiteSegundos: nuevoLimite }),
    restanteAnterior: Dominio.calcularRestante(estadoGlobal.inicioMs, ahora, nuevoLimite),
    umbralesAnunciados: [],
  });

  el('nota-tiempo').hidden = true;
  pintarEstadoCronometro();
  pintarCronometro();
}

function pintarEstadoCronometro() {
  var boton = el('btn-cronometro');
  if (!boton) return;
  var activo = estadoGlobal.config.limiteSegundos !== null;
  boton.setAttribute('aria-pressed', String(activo));
  boton.textContent = activo
    ? 'Cronómetro de ' + Dominio.formatearTiempo(estadoGlobal.config.limiteSegundos) +
      ' activo (pulsa para quitar el límite)'
    : 'Sin límite de tiempo (pulsa para cronometrar 2 h 20 min)';
}

function copiarSemilla() {
  var campo = el('campo-semilla');
  var estado = el('copia-estado');
  campo.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(campo.value).then(function () {
      estado.textContent = 'Semilla copiada.';
    }, function () {
      estado.textContent = 'No se pudo copiar; la semilla queda seleccionada para copiarla a mano.';
    });
  } else {
    estado.textContent = 'La semilla queda seleccionada para copiarla a mano.';
  }
}

// ---------------------------------------------------------------------------
// Fase: ensayo en curso (la pantalla de entrada)
// ---------------------------------------------------------------------------

function pintarEnCurso() {
  montarPlantilla('plantilla-en-curso');

  el('btn-anterior').addEventListener('click', function () {
    irA(Dominio.calcularIndiceAnterior(estadoGlobal.indice, estadoGlobal.preguntas.length));
  });
  el('btn-siguiente').addEventListener('click', function () {
    irA(Dominio.calcularSiguienteIndice(estadoGlobal.indice, estadoGlobal.preguntas.length));
  });
  el('btn-marcar').addEventListener('click', function () {
    estadoGlobal = Dominio.alternarMarca(estadoGlobal, preguntaActual().id);
    pintarPregunta();
    pintarCuadricula();
    pintarProgreso();
  });
  el('btn-limpiar').addEventListener('click', function () {
    estadoGlobal = Dominio.limpiarRespuesta(estadoGlobal, preguntaActual().id);
    pintarPregunta();
    pintarCuadricula();
    pintarProgreso();
  });
  el('btn-revisar').addEventListener('click', function () {
    // Alterna, no deshabilita: deshabilitar el botón que tiene el foco lo
    // perdería y rompería el recorrido con teclado.
    var id = preguntaActual().id;
    if (revisadas[id] === true) delete revisadas[id];
    else revisadas[id] = true;
    pintarPregunta();
    el('btn-revisar').focus();
  });
  el('btn-notacion').addEventListener('click', alternarNotacionOriginal);
  el('btn-finalizar').addEventListener('click', finalizarConConfirmacion);

  el('alternativas').addEventListener('click', alAlternativaClic);
  el('alternativas').addEventListener('keydown', alAlternativaTeclado);
  el('cuadricula').addEventListener('click', alCasillaClic);
  el('cuadricula').addEventListener('keydown', alCuadriculaTeclado);

  pintarPregunta();
  pintarCuadricula();
  pintarProgreso();
  pintarCronometro();
  pintarAjustes();
  arrancarCronometro();
}

function preguntaActual() {
  return estadoGlobal.preguntas[estadoGlobal.indice];
}

function irA(indice) {
  var nuevo = Dominio.irAIndice(estadoGlobal, indice);
  if (nuevo === estadoGlobal) return;
  estadoGlobal = nuevo;
  pintarPregunta();
  pintarCuadricula();
  pintarProgreso();
}

/** Trazabilidad de la pregunta visible (RF-4.8). */
function pintarTrazabilidad(pregunta) {
  var prueba = estadoGlobal.banco.pruebas.find(function (pr) { return pr.id === pregunta.prueba_id; });
  var partes = [
    nombrePrueba(prueba),
    'pregunta ' + pregunta.numero_original + ' de ' + (prueba ? prueba.n_preguntas : 65),
    'página ' + pregunta.pagina_pdf,
    pregunta.documento_origen || (prueba ? prueba.documento_origen : ''),
  ];
  el('trazabilidad').textContent = partes.filter(Boolean).join(' · ');
}

function pintarPregunta() {
  var t0 = performance.now();
  var pregunta = preguntaActual();

  pintarTrazabilidad(pregunta);

  var contenedor = el('enunciado');
  vaciar(contenedor);
  pintarContenido(
    Dominio.tokenizarContenido(pregunta.enunciado).bloques,
    contenedor,
    estadoGlobal.banco,
    { pregunta: pregunta }
  );

  var revision = revisadas[pregunta.id] === true
    ? Dominio.revisarPregunta(pregunta, estadoGlobal.respuestas[pregunta.id] || null)
    : null;

  var lista = el('alternativas');
  vaciar(lista);
  pregunta.alternativas.forEach(function (alternativa) {
    lista.appendChild(pintarAlternativa(pregunta, alternativa, revision));
  });

  pintarPanelRevision(pregunta, revision);

  var marcada = estadoGlobal.marcadas.indexOf(pregunta.id) !== -1;
  var botonMarcar = el('btn-marcar');
  botonMarcar.setAttribute('aria-pressed', String(marcada));
  botonMarcar.textContent = marcada ? 'Quitar la marca de revisar' : 'Marcar para revisar';

  el('btn-limpiar').disabled =
    !Object.prototype.hasOwnProperty.call(estadoGlobal.respuestas, pregunta.id);
  el('btn-anterior').disabled = !Dominio.puedeRetroceder(estadoGlobal.indice);
  el('btn-siguiente').disabled =
    !Dominio.puedeAvanzar(estadoGlobal.indice, estadoGlobal.preguntas.length);

  // Fuerza el cálculo de layout antes de parar el reloj: sin esto la medida
  // del criterio 66 solo cubriría la construcción del árbol DOM.
  void contenedor.offsetHeight;
  Medidas.ultimoRenderPreguntaMs = performance.now() - t0;
}

/**
 * Pinta una alternativa como `role="radio"` con `aria-checked`.
 *
 * Las 4 alternativas llevan `tabindex="0"` (paridad con Lenguaje, donde el
 * recorrido con Tab alcanza cada una) y además responden a las flechas. El
 * *roving tabindex* que pide el diseño es el de la cuadrícula de 65, donde Tab
 * a Tab sería inutilizable.
 *
 * Una alternativa cuyo texto es SOLO un marcador de figura no tiene texto que
 * leer, así que recibe `aria-label` con la descripción de la figura (RF-6).
 */
function pintarAlternativa(pregunta, alternativa, revision) {
  var bloques = Dominio.tokenizarContenido(alternativa.texto).bloques;
  var li = crear('li', 'alternativa');
  li.setAttribute('role', 'radio');
  li.setAttribute('tabindex', '0');
  li.setAttribute('data-alt-id', alternativa.id);

  var seleccionada = estadoGlobal.respuestas[pregunta.id] === alternativa.id;
  li.setAttribute('aria-checked', String(seleccionada));

  li.appendChild(crear('span', 'letra', alternativa.id + ')'));
  var cuerpo = crear('div', 'cuerpo bloque-contenido');
  pintarContenido(bloques, cuerpo, estadoGlobal.banco, { pregunta: pregunta });
  li.appendChild(cuerpo);

  // Con la revisión abierta, el acierto se marca con color + icono + texto, no
  // solo con color (RF-9.4, criterio 64).
  if (revision !== null) {
    if (alternativa.id === revision.alternativaCorrectaId) {
      li.classList.add('es-correcta');
      li.appendChild(crear('span', 'etiqueta-revision marca-correcta', '✔ correcta'));
    } else if (seleccionada) {
      li.classList.add('es-incorrecta-seleccionada');
      li.appendChild(crear('span', 'etiqueta-revision marca-incorrecta', '✘ tu respuesta'));
    }
  }

  if (bloques.length === 1 && bloques[0].tipo === 'figura') {
    var figura = Dominio.resolverFigura(estadoGlobal.banco, bloques[0].idFigura);
    li.setAttribute(
      'aria-label',
      figura !== null && figura.descripcion
        ? 'Alternativa ' + alternativa.id + ': ' + figura.descripcion
        : 'Alternativa ' + alternativa.id + ': figura no disponible'
    );
  }

  return li;
}

/**
 * Panel de revisión de la pregunta visible (flujo de Lenguaje): dice si se
 * acertó, cuál era la alternativa correcta y la explicación, con el estado
 * calculado por `Dominio.revisarPregunta`.
 */
function pintarPanelRevision(pregunta, revision) {
  var panel = el('panel-revision');
  var boton = el('btn-revisar');

  if (revision === null) {
    panel.hidden = true;
    vaciar(el('revision-explicacion'));
    boton.setAttribute('aria-expanded', 'false');
    boton.textContent = 'Revisar respuesta';
    return;
  }

  boton.setAttribute('aria-expanded', 'true');
  boton.textContent = 'Ocultar la revisión';

  var marca = MARCAS_ESTADO[revision.estado] || MARCAS_ESTADO.omitida;
  var resultado = el('revision-resultado');
  vaciar(resultado);
  resultado.appendChild(crear('span', marca.clase, marca.icono + ' ' + marca.texto));
  resultado.appendChild(document.createTextNode(
    revision.alternativaCorrectaId === null
      ? ' · esta pregunta no tiene clave oficial'
      : ' · la alternativa correcta es la ' + revision.alternativaCorrectaId +
        (revision.puntuable ? '' : ' · pregunta piloto, no puntúa')
  ));

  var explicacion = el('revision-explicacion');
  vaciar(explicacion);
  if (revision.explicacion) {
    pintarContenido(
      Dominio.tokenizarContenido(revision.explicacion).bloques,
      explicacion,
      estadoGlobal.banco,
      { pregunta: pregunta }
    );
  }

  panel.hidden = false;
}

function responderActual(idAlternativa) {
  var pregunta = preguntaActual();
  var nuevo = idAlternativa === estadoGlobal.respuestas[pregunta.id]
    ? Dominio.limpiarRespuesta(estadoGlobal, pregunta.id)
    : Dominio.responder(estadoGlobal, pregunta.id, idAlternativa);
  if (nuevo === estadoGlobal) return;
  estadoGlobal = nuevo;
  pintarPregunta();
  pintarCuadricula();
  pintarProgreso();
}

function alAlternativaClic(evento) {
  var li = evento.target.closest ? evento.target.closest('.alternativa') : null;
  if (!li) return;
  responderActual(li.getAttribute('data-alt-id'));
}

function alAlternativaTeclado(evento) {
  var li = evento.target.closest ? evento.target.closest('.alternativa') : null;
  if (!li) return;

  if (evento.key === 'Enter' || evento.key === ' ' || evento.key === 'Spacebar') {
    evento.preventDefault();
    responderActual(li.getAttribute('data-alt-id'));
    var reenfocar = el('alternativas').querySelector('[data-alt-id="' + li.getAttribute('data-alt-id') + '"]');
    if (reenfocar) reenfocar.focus();
    return;
  }

  var paso = 0;
  if (evento.key === 'ArrowDown' || evento.key === 'ArrowRight') paso = 1;
  if (evento.key === 'ArrowUp' || evento.key === 'ArrowLeft') paso = -1;
  if (paso === 0) return;

  evento.preventDefault();
  var items = Array.prototype.slice.call(el('alternativas').children);
  var siguiente = items[(items.indexOf(li) + paso + items.length) % items.length];
  responderActual(siguiente.getAttribute('data-alt-id'));
  var destino = el('alternativas').querySelector(
    '[data-alt-id="' + siguiente.getAttribute('data-alt-id') + '"]'
  );
  if (destino) destino.focus();
}

/**
 * Cuadrícula de 65 casillas con *roving tabindex*: solo la casilla de la
 * pregunta actual es alcanzable con Tab, y las flechas mueven por ella. Los
 * `aria-label` son los 5 textos de `Dominio.etiquetaCasilla` (RF-4.3).
 */
function pintarCuadricula() {
  var cuadricula = el('cuadricula');
  vaciar(cuadricula);

  estadoGlobal.preguntas.forEach(function (pregunta, indice) {
    // `estadoCasilla` da el estado canónico de RF-4.3 (donde `'actual'` gana
    // sobre los demás) y va en `data-estado`. Las marcas VISUALES, en cambio,
    // se combinan: una casilla puede ser a la vez actual, respondida y marcada,
    // y las tres marcas tienen que verse.
    var estado = Dominio.estadoCasilla(estadoGlobal, indice);
    var respondida = Object.prototype.hasOwnProperty.call(estadoGlobal.respuestas, pregunta.id);
    var marcada = estadoGlobal.marcadas.indexOf(pregunta.id) !== -1;

    var clases = ['casilla'];
    if (respondida) clases.push('marca-respondida');
    if (marcada) clases.push('marca-marcada');
    if (indice === estadoGlobal.indice) clases.push('marca-actual');

    var boton = crear('button', clases.join(' '), String(indice + 1));
    boton.type = 'button';
    boton.setAttribute('data-indice', String(indice));
    boton.setAttribute('data-estado', estado);
    boton.setAttribute('aria-label', Dominio.etiquetaCasilla(estadoGlobal, indice));
    boton.setAttribute('aria-current', indice === estadoGlobal.indice ? 'true' : 'false');
    boton.setAttribute('tabindex', indice === estadoGlobal.indice ? '0' : '-1');
    cuadricula.appendChild(boton);
  });
}

function alCasillaClic(evento) {
  var boton = evento.target.closest ? evento.target.closest('.casilla') : null;
  if (!boton) return;
  irA(Number(boton.getAttribute('data-indice')));
}

/**
 * Flechas sobre la cuadrícula. El foco y la pregunta visible se mueven juntos
 * (*selection follows focus*), que es lo que hace útil navegar 65 casillas con
 * el teclado; tras repintar se devuelve el foco a la casilla actual.
 */
function alCuadriculaTeclado(evento) {
  var boton = evento.target.closest ? evento.target.closest('.casilla') : null;
  if (!boton) return;

  var total = estadoGlobal.preguntas.length;
  var indice = Number(boton.getAttribute('data-indice'));
  var destino = null;

  if (evento.key === 'ArrowRight') destino = indice + 1;
  else if (evento.key === 'ArrowLeft') destino = indice - 1;
  else if (evento.key === 'ArrowDown') destino = indice + COLUMNAS_CUADRICULA;
  else if (evento.key === 'ArrowUp') destino = indice - COLUMNAS_CUADRICULA;
  else if (evento.key === 'Home') destino = 0;
  else if (evento.key === 'End') destino = total - 1;
  else return;

  evento.preventDefault();
  if (destino < 0 || destino >= total) return;

  irA(destino);
  var nueva = el('cuadricula').querySelector('[data-indice="' + destino + '"]');
  if (nueva) nueva.focus();
}

function pintarProgreso() {
  var avance = Dominio.resumenAvance(estadoGlobal);
  el('progreso').textContent = Dominio.formatoProgreso(estadoGlobal.indice, estadoGlobal.preguntas.length);
  el('progreso-ensayo').textContent =
    'Respondidas ' + avance.respondidas + ' · marcadas ' + avance.marcadas +
    ' · sin responder ' + avance.pendientes;
}

/**
 * HALLAZGO 11: el interruptor llama a `Dominio.alternarNotacion` y DESPUÉS
 * sincroniza la clase del `<body>` DESDE `estado.config.notacionOriginal`,
 * nunca con un `classList.toggle` sin fuente. Sin re-render: funciona sobre lo
 * ya pintado y sobre lo que se pinte después (§7.9, RNF-4).
 */
function alternarNotacionOriginal() {
  estadoGlobal = Dominio.alternarNotacion(estadoGlobal);
  sincronizarNotacion();
}

function sincronizarNotacion() {
  var activa = !!(estadoGlobal && estadoGlobal.config && estadoGlobal.config.notacionOriginal);
  document.body.classList.toggle('notacion-original', activa);

  var boton = el('btn-notacion');
  if (boton) {
    boton.setAttribute('aria-pressed', String(activa));
    boton.textContent = activa ? 'Volver a la notación matemática' : 'Mostrar notación original';
  }
}

// ---------------------------------------------------------------------------
// Cronómetro (§7.12)
// ---------------------------------------------------------------------------

function arrancarCronometro() {
  detenerCronometro();
  temporizador = setInterval(tic, 1000);
}

function detenerCronometro() {
  if (temporizador !== null) {
    clearInterval(temporizador);
    temporizador = null;
  }
}

/**
 * Un solo `registrarTick` por *tick*, tal cual §7.12: app.js no decide nada del
 * filtro de anuncio único ni del cruce de umbral.
 */
function tic() {
  var r = Dominio.registrarTick(estadoGlobal, Date.now());
  estadoGlobal = r.estado;
  pintarCronometro();

  if (r.umbralCruzado !== null) {
    anunciarTiempo(textoUmbral(r.umbralCruzado));
  }
  if (r.expirado) {
    estadoGlobal = Dominio.finalizar(estadoGlobal, Date.now());
    detenerCronometro();
    pintarResultados('Se acabó el tiempo. El ensayo se cerró solo y se corrigieron las respuestas dadas.');
  }
}

function textoUmbral(segundos) {
  if (segundos >= 60) {
    var minutos = Math.round(segundos / 60);
    return 'Queda' + (minutos === 1 ? '' : 'n') + ' ' + minutos + ' minuto' + (minutos === 1 ? '' : 's') + '.';
  }
  return 'Quedan menos de un minuto.';
}

function anunciarTiempo(texto) {
  var region = el('anuncio-tiempo');
  if (region) region.textContent = texto;
}

function pintarCronometro() {
  var reloj = el('cronometro');
  if (!reloj) return;

  var ahora = Date.now();
  if (estadoGlobal.config.limiteSegundos === null) {
    reloj.textContent = Dominio.formatearTiempo(
      Dominio.calcularTranscurrido(estadoGlobal.inicioMs, ahora)
    ) + ' (sin límite)';
    return;
  }

  var restante = Dominio.calcularRestante(
    estadoGlobal.inicioMs,
    ahora,
    estadoGlobal.config.limiteSegundos
  );
  reloj.textContent = Dominio.formatearTiempo(restante);
  reloj.classList.toggle('poco-tiempo', restante <= 300);
}

// ---------------------------------------------------------------------------
// Fase: resultados (§7.13)
// ---------------------------------------------------------------------------

/** Arma un ensayo nuevo con esa semilla y vuelve a la pantalla de preguntas. */
function rearmar(semillaTexto) {
  var entrada = {
    semillaTexto: semillaTexto,
    verificadas: estadoGlobal.config.soloVerificadas,
    tiempo: estadoGlobal.config.limiteSegundos === null
      ? 'ilimitado'
      : estadoGlobal.config.limiteSegundos,
    notacion: estadoGlobal.config.notacionOriginal,
  };
  if (!armarEnsayo(entrada)) return;
  sincronizarNotacion();
  pintarEnCurso();
}

function finalizarConConfirmacion() {
  var avance = Dominio.resumenAvance(estadoGlobal);
  var mensaje = avance.pendientes === 0
    ? '¿Finalizar el ensayo? Están las 65 respondidas.'
    : 'Quedan ' + avance.pendientes + ' preguntas sin responder. ¿Finalizar?';
  if (!window.confirm(mensaje)) return;

  estadoGlobal = Dominio.finalizar(estadoGlobal, Date.now());
  detenerCronometro();
  pintarResultados(null);
}

function pintarResultados(anuncio) {
  detenerCronometro();
  montarPlantilla('plantilla-resultados');
  el('progreso').textContent = '';

  var resultado = estadoGlobal.resultado;

  el('res-puntaje').textContent =
    resultado.correctas + ' correctas de ' + resultado.puntuables + ' puntuables';
  el('res-porcentaje').textContent = 'Porcentaje de logro: ' + textoPorcentaje(resultado.porcentaje);
  el('res-contadores').textContent =
    'Correctas ' + resultado.correctas + ' · incorrectas ' + resultado.incorrectas +
    ' · omitidas ' + resultado.omitidas +
    (resultado.piloto > 0 ? ' · piloto (sin puntaje) ' + resultado.piloto : '') +
    (resultado.sinClave > 0 ? ' · sin clave oficial ' + resultado.sinClave : '');
  el('res-sin-responder').textContent =
    'Sin responder: ' + resultado.sinResponder + ' de ' + estadoGlobal.preguntas.length;

  // Un límite a medida cambia el significado del puntaje y queda registrado
  // junto a él (RF-4.6).
  var limite = estadoGlobal.config.limiteSegundos;
  if (limite !== null && limite !== Dominio.LIMITE_OFICIAL_SEGUNDOS) {
    var lineaLimite = el('res-limite');
    lineaLimite.hidden = false;
    lineaLimite.textContent =
      'Límite a medida: ' + Dominio.formatearTiempo(limite) +
      '; este ensayo no es comparable con uno de 2 h 20 min.';
  }

  el('res-trazabilidad').textContent =
    'Semilla: ' + resultado.semillaTexto + ' · huella del pozo: ' + resultado.huellaPozo +
    ' · tiempo empleado: ' + Dominio.formatearTiempo(resultado.tiempoSegundos) +
    (limite === null ? ' (sin límite)' : '');

  if (anuncio) {
    // La región `role="status"` tiene que existir ANTES de que cambie su texto
    // para que el lector de pantalla lo anuncie.
    setTimeout(function () {
      var region = el('anuncio-fin');
      if (region) region.textContent = anuncio;
    }, 50);
  }

  pintarDesglose(el('desglose-eje'), 'Por eje', resultado.porEje, true);
  pintarDesglose(el('desglose-habilidad'), 'Por habilidad', resultado.porHabilidad, true);
  pintarDesglose(el('desglose-contenido'), 'Por contenido', resultado.porContenido, false);

  pintarDetalle(resultado.detalle);

  el('btn-rehacer').addEventListener('click', function () {
    rearmar(estadoGlobal.config.semillaTexto);
  });

  // Semilla vacía ⇒ `prepararConfig` pone `String(Date.now())` (§7.14), que es
  // el mismo camino por el que se arma el ensayo al abrir la app.
  el('btn-nuevo').addEventListener('click', function () {
    rearmar('');
  });

  // Las 6 advertencias fijas, repetidas al pie, con las 65 del ensayo como
  // quinto parámetro para que la 3ª y la 6ª hablen de ESTE ensayo.
  pintarAvisos(componerAvisos(estadoGlobal.preguntas), el('avisos-resultados'));
}

/**
 * Pinta un desglose ya ordenado por `calcularResultado` (porcentaje ascendente,
 * `null` al final): app.js pinta, no reordena. Con `conRango`, cada fila lleva
 * al lado su par de `RANGOS_T24I` (§7.13).
 */
function pintarDesglose(contenedor, titulo, filas, conRango) {
  vaciar(contenedor);

  var tabla = crear('table', 'desglose');
  tabla.appendChild(crear('caption', null, titulo));

  var thead = document.createElement('thead');
  var trCabecera = document.createElement('tr');
  var columnas = ['Categoría', 'Correctas', 'Puntuables', 'Porcentaje'];
  if (conRango) columnas.push('Rango publicado (T24I)');
  columnas.forEach(function (nombre) {
    var th = crear('th', null, nombre);
    th.setAttribute('scope', 'col');
    trCabecera.appendChild(th);
  });
  thead.appendChild(trCabecera);
  tabla.appendChild(thead);

  var tbody = document.createElement('tbody');
  filas.forEach(function (fila) {
    var tr = document.createElement('tr');
    var th = crear('th', null, nombreCategoria(fila.clave));
    th.setAttribute('scope', 'row');
    tr.appendChild(th);
    tr.appendChild(crear('td', null, String(fila.correctas)));
    tr.appendChild(crear('td', null, String(fila.puntuables)));
    tr.appendChild(crear(
      'td',
      fila.porcentaje === null ? 'sin-datos' : null,
      textoPorcentaje(fila.porcentaje)
    ));
    if (conRango) {
      var rango = Dominio.RANGOS_T24I[fila.clave];
      tr.appendChild(crear('td', rango ? null : 'sin-datos',
        rango ? rango[0] + '–' + rango[1] + ' preguntas' : 'sin rango publicado'));
    }
    tbody.appendChild(tr);
  });
  tabla.appendChild(tbody);

  contenedor.appendChild(tabla);
}

var MARCAS_ESTADO = {
  correcta: { icono: '✔', texto: 'Correcta', clase: 'marca-correcta' },
  incorrecta: { icono: '✘', texto: 'Incorrecta', clase: 'marca-incorrecta' },
  omitida: { icono: '—', texto: 'Sin responder', clase: 'marca-omitida' },
  sin_clave: { icono: '?', texto: 'Sin clave oficial', clase: 'marca-sin-clave' },
};

/**
 * Detalle de las 65, renderizado BAJO DEMANDA al expandir cada `<details>`
 * (RNF-4): renderizar las 65 de golpe rompería el presupuesto.
 */
function pintarDetalle(detalle) {
  var contenedor = el('detalle-preguntas');
  vaciar(contenedor);

  detalle.forEach(function (entrada) {
    var marca = MARCAS_ESTADO[entrada.estado] || MARCAS_ESTADO.omitida;
    var caja = crear('details', 'detalle-pregunta es-' + entrada.estado);

    var resumen = document.createElement('summary');
    resumen.appendChild(document.createTextNode((entrada.indice + 1) + '. '));
    resumen.appendChild(crear('span', marca.clase, marca.icono + ' ' + marca.texto));
    resumen.appendChild(document.createTextNode(
      ' · respondiste ' + (entrada.seleccion === null ? 'nada' : entrada.seleccion) +
      ' · correcta ' + (entrada.alternativaCorrectaId === null ? 'sin clave' : entrada.alternativaCorrectaId) +
      (entrada.puntuable ? '' : ' · piloto, no puntúa')
    ));
    caja.appendChild(resumen);

    var cuerpo = crear('div', 'bloque-contenido');
    caja.appendChild(cuerpo);

    caja.addEventListener('toggle', function () {
      if (!caja.open || caja.dataset.pintado === 'si') return;
      caja.dataset.pintado = 'si';
      pintarDetalleDePregunta(cuerpo, entrada);
    });

    contenedor.appendChild(caja);
  });
}

function pintarDetalleDePregunta(cuerpo, entrada) {
  var pregunta = entrada.pregunta;
  var prueba = estadoGlobal.banco.pruebas.find(function (pr) { return pr.id === pregunta.prueba_id; });

  cuerpo.appendChild(crear('p', 'secundario', [
    nombrePrueba(prueba),
    'pregunta ' + pregunta.numero_original,
    'página ' + pregunta.pagina_pdf,
    nombreCategoria(pregunta.eje),
    nombreCategoria(pregunta.habilidad),
    pregunta.contenido_id,
  ].join(' · ')));

  var enunciado = crear('div', 'bloque-contenido');
  pintarContenido(
    Dominio.tokenizarContenido(pregunta.enunciado).bloques,
    enunciado,
    estadoGlobal.banco,
    { pregunta: pregunta }
  );
  cuerpo.appendChild(enunciado);

  var lista = document.createElement('ul');
  pregunta.alternativas.forEach(function (alternativa) {
    var li = document.createElement('li');
    var etiquetas = [];
    if (alternativa.id === entrada.alternativaCorrectaId) etiquetas.push('✔ correcta');
    if (alternativa.id === entrada.seleccion) etiquetas.push('tu respuesta');
    li.appendChild(crear('span', 'letra', alternativa.id + ') '));
    var cuerpoAlt = crear('span', 'bloque-contenido');
    pintarContenido(
      Dominio.tokenizarContenido(alternativa.texto).bloques,
      cuerpoAlt,
      estadoGlobal.banco,
      { pregunta: pregunta }
    );
    li.appendChild(cuerpoAlt);
    if (etiquetas.length > 0) {
      li.appendChild(crear(
        'strong',
        alternativa.id === entrada.alternativaCorrectaId ? 'marca-correcta' : 'marca-incorrecta',
        ' [' + etiquetas.join(', ') + ']'
      ));
    }
    lista.appendChild(li);
  });
  cuerpo.appendChild(lista);

  if (entrada.explicacion) {
    cuerpo.appendChild(crear('h4', null, 'Explicación'));
    var explicacion = crear('div', 'bloque-contenido');
    pintarContenido(
      Dominio.tokenizarContenido(entrada.explicacion).bloques,
      explicacion,
      estadoGlobal.banco,
      { pregunta: pregunta }
    );
    cuerpo.appendChild(explicacion);
  }
}

// ---------------------------------------------------------------------------
// Medidas del criterio 66
// ---------------------------------------------------------------------------

/**
 * Mide el render de UNA pregunta cualquiera del banco por su id, en el DOM
 * real (adjunto al documento y forzando layout), y deja el contenedor como
 * estaba. Es la medida (c) del criterio 66: `Medidas.medirRenderDe('m1-reg24-006')`
 * usa la pregunta del pozo que combina tabla + LaTeX + figura pendiente.
 *
 * @param {string} idPregunta
 * @returns {number|null} milisegundos, o `null` si el id no existe
 */
function medirRenderDe(idPregunta) {
  if (estadoGlobal === null) return null;
  var pregunta = estadoGlobal.banco.preguntas.find(function (p) { return p.id === idPregunta; });
  if (pregunta === undefined) return null;

  var caja = document.createElement('div');
  caja.className = 'bloque-contenido';
  document.body.appendChild(caja);

  var t0 = performance.now();
  pintarContenido(
    Dominio.tokenizarContenido(pregunta.enunciado).bloques,
    caja,
    estadoGlobal.banco,
    { pregunta: pregunta }
  );
  pregunta.alternativas.forEach(function (alternativa) {
    pintarContenido(
      Dominio.tokenizarContenido(alternativa.texto).bloques,
      caja,
      estadoGlobal.banco,
      { pregunta: pregunta }
    );
  });
  void caja.offsetHeight;
  var ms = performance.now() - t0;

  document.body.removeChild(caja);
  return ms;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.Medidas = Medidas;
}

document.addEventListener('DOMContentLoaded', iniciar);
