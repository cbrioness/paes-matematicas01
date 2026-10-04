// dominio.test.js
//
// Suite de la capa pura (`node --test` + fast-check). Convenciones de §7.17:
// un solo archivo, `describe` por área de la API, `node:assert/strict`, y
// `fast-check` dentro de un `test` normal con `fc.assert(fc.property(...))`.
//
// QUÉ CUBRE HOY, exactamente (y qué no): §7.17 dice que esta suite es "el
// 100 % de la lógica con riesgo"; eso es una aspiración, no una medida, así que
// aquí va la lista real, que es la que se puede comprobar.
//
//   - validación: `motivosInvalidez` / `validarPreguntaM1` contra las 282 del
//     banco y contra casos sintéticos inválidos, `validarPrueba` (5 pruebas),
//     `validarFigura` (121 figuras), `referenciasRotas`, `validarBanco` y sus
//     cuatro avisos recuperables.  Criterios 1-7, 9bis, 10bis, 12bis, 12ter.
//   - pozo: `pruebaCompleta`, `construirPozo` con y sin filtro de verificadas,
//     la identidad de exclusividad, `idsDescartados` y `huellaPozo`.
//     Criterios 8-12, 23.
//   - generación: `hashSemilla`, `crearAleatorio`, `mezclar`,
//     `verificarFactibilidad` y `generarEnsayo`.  Criterios 13-22, 21bis, 24, 25.
//   - constantes: `RANGOS_T24I` (criterio 57quater).
//   - tokenizador: `tokenizarContenido` con los cuatro pasos de §7.9 (escapes
//     `\$`, promoción de `formula_bloque`, tablas con y sin separadora, listas,
//     marcadores en sus tres casos, énfasis y el span `salto` del hallazgo 1),
//     medido contra los tres campos renderizables de las 282 preguntas y las
//     121 transcripciones.  Criterios 26-37, 27bis, 28bis, 30bis, 30ter, 31bis
//     y 31ter.
//   - corrección: `esPuntuable`, `revisarPregunta`, `calcularResultado` (con y
//     sin `contexto`, con `sinResponder` y el `porcentaje` sin redondear) y
//     `agruparPor`.  Criterios 39-48, 48bis, 48ter y los hallazgos 13 y 14.
//   - cronómetro: `formatearTiempo`, `calcularTranscurrido`, `calcularRestante`,
//     `umbralAviso` y `registrarTick` con su filtro de anuncio único.
//     Criterios 53-55, 55bis, 55ter y el caso discriminante del hallazgo 4.
//   - estado: `crearEstadoInicial`, `iniciarEnsayo`, `prepararConfig` fila por
//     fila de §7.14, `aplicarFiltroPozo`, las transiciones de respuesta, marca,
//     notación y navegación, `resumenAvance`, `estadoCasilla` / `etiquetaCasilla`
//     y `finalizar`.  Criterios 49, 49bis, 50-52, 55quater, 55quinquies,
//     55sexies, 56 y los hallazgos 3, 4 y 11.
//   - avisos: `construirAvisos` (las 6 fijas con 6 códigos distintos y sus
//     cifras derivadas), `recolectarAvisosDeContenido` y `agregarAvisos`.
//     Criterios 57, 57bis, 57ter, 58, 59 y 59bis.
//
// Lo que NO cubre esta suite, por diseño y no por olvido: el render en DOM
// (`app.js`), que se verifica a mano con los 11 criterios [man] del README. Los
// criterios [man] de accesibilidad, de KaTeX ausente y de rendimiento (38, 60-66)
// no son automatizables sin navegador y no están aquí.
//
// Los números del banco son tests de SNAPSHOT a propósito: si alguien regenera
// `banco-preguntas-m1.json`, fallan y obligan a volver a medir §2 del diseño en
// vez de dejar que la calibración se degrade en silencio.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const D = require('./dominio.js');
const banco = require('./banco-preguntas-m1.json');

/** Clon profundo para construir casos sintéticos sin tocar el snapshot. */
function clonar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/** Pregunta real válida, clonada, lista para romperle un campo. */
function preguntaBase() {
  return clonar(banco.preguntas[0]);
}

/** Generador de semillas uint32 para los tests de propiedad. */
function semillaUint32() {
  return fc.integer({ min: 0, max: 4294967295 });
}

const POZO = D.construirPozo(banco, { soloVerificadas: false });
const POZO_VERIFICADAS = D.construirPozo(banco, { soloVerificadas: true });

// ===========================================================================
describe('validación', function () {
  it('criterio 1: las 282 preguntas del banco son válidas y sin motivos', function () {
    const invalidas = banco.preguntas.filter(function (p) { return !D.validarPreguntaM1(p); });
    assert.deepEqual(invalidas.map(function (p) { return p.id; }), []);
    assert.equal(banco.preguntas.length, 282, 'vuelve a medir §2 del diseño');
    banco.preguntas.forEach(function (p) {
      assert.deepEqual(D.motivosInvalidez(p), [], 'pregunta ' + p.id);
    });
  });

  it('criterio 2: texto_lectura_id tiene que ser exactamente null', function () {
    const p = preguntaBase();
    p.texto_lectura_id = null;
    assert.equal(D.validarPreguntaM1(p), true);
    p.texto_lectura_id = '';
    assert.deepEqual(D.motivosInvalidez(p), ['texto_lectura_id']);
    p.texto_lectura_id = 'txt-1';
    assert.deepEqual(D.motivosInvalidez(p), ['texto_lectura_id']);
  });

  it('criterio 3: acepta las 4 habilidades M1, rechaza los 7 tipos de Lenguaje y tipo_pregunta !== habilidad', function () {
    Array.from(D.HABILIDADES_M1).forEach(function (habilidad) {
      const p = preguntaBase();
      p.habilidad = habilidad;
      p.tipo_pregunta = habilidad;
      assert.equal(D.validarPreguntaM1(p), true, 'habilidad ' + habilidad);
    });

    const tiposLenguaje = [
      'localizar_informacion_explicita',
      'vocabulario_en_contexto',
      'inferencia',
      'idea_principal',
      'funcion_de_conectores_o_fragmentos',
      'proposito_o_postura_del_autor',
      'sintesis_entre_textos',
    ];
    tiposLenguaje.forEach(function (tipo) {
      const p = preguntaBase();
      p.habilidad = tipo;
      p.tipo_pregunta = tipo;
      assert.deepEqual(D.motivosInvalidez(p), ['habilidad'], 'tipo de Lenguaje ' + tipo);
    });

    const p = preguntaBase();
    p.tipo_pregunta = 'modelar';
    p.habilidad = 'resolver_problemas';
    assert.deepEqual(D.motivosInvalidez(p), ['tipo_pregunta']);
  });

  it('criterio 4: alternativa_correcta null solo con estado_respuesta sin_clave', function () {
    const sinClave = preguntaBase();
    sinClave.estado_respuesta = 'sin_clave';
    sinClave.alternativa_correcta = null;
    assert.equal(D.validarPreguntaM1(sinClave), true);

    const oficialSinClave = preguntaBase();
    oficialSinClave.estado_respuesta = 'oficial';
    oficialSinClave.alternativa_correcta = null;
    assert.deepEqual(D.motivosInvalidez(oficialSinClave), ['alternativa_correcta']);

    const sinClaveConClave = preguntaBase();
    sinClaveConClave.estado_respuesta = 'sin_clave';
    sinClaveConClave.alternativa_correcta = 'B';
    assert.deepEqual(D.motivosInvalidez(sinClaveConClave), ['alternativa_correcta_sin_clave']);
  });

  it('criterio 5: exige 4 alternativas con ids A-D en orden', function () {
    const tres = preguntaBase();
    tres.alternativas = tres.alternativas.slice(0, 3);
    assert.deepEqual(D.motivosInvalidez(tres), ['alternativas.length', 'alternativas.ids']);

    const cinco = preguntaBase();
    cinco.alternativas = cinco.alternativas.concat([{ id: 'E', texto: '$1$' }]);
    assert.deepEqual(D.motivosInvalidez(cinco), ['alternativas.length', 'alternativas.ids']);

    const otrosIds = preguntaBase();
    otrosIds.alternativas.forEach(function (a, i) { a.id = String(i + 1); });
    otrosIds.alternativa_correcta = '3';
    assert.deepEqual(D.motivosInvalidez(otrosIds), ['alternativas.ids']);

    const desordenadas = preguntaBase();
    const textos = desordenadas.alternativas.map(function (a) { return a.texto; });
    desordenadas.alternativas = ['A', 'C', 'B', 'D'].map(function (id, i) {
      return { id: id, texto: textos[i] };
    });
    assert.deepEqual(D.motivosInvalidez(desordenadas), ['alternativas.ids']);
  });

  it('criterio 6: motivosInvalidez nombra el campo, acumula, y su vocabulario es cerrado', function () {
    const sinId = preguntaBase();
    sinId.id = '';
    assert.deepEqual(D.motivosInvalidez(sinId), ['id']);

    // Seis casos sintéticos inválidos, el último con varios fallos a la vez.
    const casos = [];
    const c1 = preguntaBase(); c1.numero_original = 0; casos.push(c1);
    const c2 = preguntaBase(); c2.pagina_pdf = 0; casos.push(c2);
    const c3 = preguntaBase(); c3.enunciado = '   '; casos.push(c3);
    const c4 = preguntaBase(); c4.sin_puntaje = 'no'; casos.push(c4);
    const c5 = preguntaBase(); c5.notas_extraccion = [1, 2]; casos.push(c5);
    const c6 = preguntaBase();
    c6.id = '';
    c6.texto_lectura_id = 'x';
    c6.explicacion = '';
    c6.explicacion_origen = 'inventada';
    c6.clasificacion_origen = 'adivinada';
    c6.figura_ids = ['', 'ok'];
    c6.requiere_figura = 'si';
    c6.estado_enunciado = 'raro';
    c6.tipo = 'copiada';
    c6.documento_origen = '';
    casos.push(c6);

    const union = new Set();
    casos.forEach(function (p) {
      const motivos = D.motivosInvalidez(p);
      assert.ok(motivos.length > 0, 'el caso sintético tenía que fallar');
      assert.equal(D.validarPreguntaM1(p), motivos.length === 0);
      motivos.forEach(function (m) { union.add(m); });
    });
    assert.deepEqual(D.motivosInvalidez(c6).length, 10, 'acumula un motivo por campo roto');

    const vocabulario = new Set(D.MOTIVOS_INVALIDEZ);
    assert.equal(D.MOTIVOS_INVALIDEZ.length, 26);
    Array.from(union).forEach(function (m) {
      assert.ok(vocabulario.has(m), 'motivo fuera del vocabulario cerrado: ' + m);
    });

    banco.preguntas.forEach(function (p) {
      assert.equal(D.validarPreguntaM1(p), D.motivosInvalidez(p).length === 0, p.id);
    });
  });

  it('criterio 7: contenido_id coherente con el eje, y los 53 reales aceptados', function () {
    const geometria = clonar(banco.preguntas.find(function (p) { return p.eje === 'geometria'; }));
    geometria.contenido_id = 'A1.2';
    assert.deepEqual(D.motivosInvalidez(geometria), ['contenido_id']);

    const ids = Array.from(new Set(banco.preguntas.map(function (p) { return p.contenido_id; })));
    assert.equal(ids.length, 53, 'vuelve a medir §2 del diseño');
    assert.equal(ids.filter(function (id) { return /[a-c]$/.test(id); }).length, 13,
      '13 de los 53 llevan sufijo de letra');
    ids.forEach(function (id) {
      const p = banco.preguntas.find(function (q) { return q.contenido_id === id; });
      assert.equal(D.validarPreguntaM1(p), true, 'contenido_id ' + id);
      assert.ok(D.NOMBRES_CONTENIDO[id] !== undefined, 'NOMBRES_CONTENIDO sin ' + id);
    });
    assert.equal(Object.keys(D.NOMBRES_CONTENIDO).length, 53);
  });

  it('criterio 9bis: los 3 ids de PRUEBAS_VERIFICADAS_CIEGO existen en banco.pruebas', function () {
    const idsBanco = new Set(banco.pruebas.map(function (pr) { return pr.id; }));
    assert.equal(D.PRUEBAS_VERIFICADAS_CIEGO.size, 3);
    Array.from(D.PRUEBAS_VERIFICADAS_CIEGO).forEach(function (id) {
      assert.ok(idsBanco.has(id), 'id de prueba verificada que no existe en el banco: ' + id);
    });
  });

  it('criterio 10bis: validarPrueba acepta las 5 del banco y nombra el campo que falla', function () {
    assert.equal(banco.pruebas.length, 5);
    banco.pruebas.forEach(function (pr) {
      assert.deepEqual(D.validarPrueba(pr), [], 'prueba ' + pr.id);
    });

    const base = clonar(banco.pruebas[0]);
    const sinId = clonar(base); sinId.id = '  ';
    assert.deepEqual(D.validarPrueba(sinId), ['id']);

    const nPreguntas = clonar(base); nPreguntas.n_preguntas = 66;
    assert.deepEqual(D.validarPrueba(nPreguntas), ['n_preguntas']);

    const noPublicadas = clonar(base); noPublicadas.preguntas_no_publicadas = [3, 3];
    assert.deepEqual(D.validarPrueba(noPublicadas), ['preguntas_no_publicadas']);

    const demasiadas = clonar(base);
    demasiadas.n_preguntas = 2;
    demasiadas.preguntas_no_publicadas = [1, 2, 3];
    assert.deepEqual(D.validarPrueba(demasiadas), ['preguntas_no_publicadas']);

    const sinPuntaje = clonar(base); sinPuntaje.sin_puntaje = [0];
    assert.deepEqual(D.validarPrueba(sinPuntaje), ['sin_puntaje']);

    const clave = clonar(base); clave.estado_clave = 'provisional';
    assert.deepEqual(D.validarPrueba(clave), ['estado_clave']);

    const textos = clonar(base);
    textos.documento_origen = '';
    textos.formato_folleto = '';
    textos.fuente = '';
    assert.deepEqual(D.validarPrueba(textos), ['documento_origen', 'formato_folleto', 'fuente']);

    // Un motivo de prueba es FATAL: va a `errores` de validarBanco.
    const bancoRoto = clonar(banco);
    bancoRoto.pruebas[0].estado_clave = 'provisional';
    const resultado = D.validarBanco(bancoRoto);
    assert.equal(resultado.valido, false);
    assert.equal(resultado.errores.filter(function (e) { return e.codigo === 'prueba_invalida'; }).length, 1);
  });

  it('criterio 12bis: 0 figura_alternativa_incoherente en el banco; un caso sintético sí lo emite', function () {
    const deAlternativa = banco.figuras.filter(function (f) { return f.rol === 'alternativa'; });
    assert.equal(deAlternativa.length, 44, 'vuelve a medir §2 del diseño');
    deAlternativa.forEach(function (f) {
      assert.ok(f.alternativa_id !== null, 'figura de alternativa sin alternativa_id: ' + f.id);
    });

    const resultado = D.validarBanco(banco);
    assert.equal(resultado.valido, true);
    assert.deepEqual(resultado.avisos.filter(function (a) {
      return a.codigo === 'figura_alternativa_incoherente';
    }), []);

    const bancoRoto = clonar(banco);
    const figura = bancoRoto.figuras.find(function (f) {
      return f.rol === 'alternativa' && f.alternativa_id === 'A';
    });
    figura.alternativa_id = 'C';
    const roto = D.validarBanco(bancoRoto);
    const incoherentes = roto.avisos.filter(function (a) {
      return a.codigo === 'figura_alternativa_incoherente';
    });
    assert.equal(incoherentes.length, 1);
    assert.equal(roto.valido, true, 'es recuperable, no fatal');
    assert.deepEqual(incoherentes[0].datos.ids, [figura.id, figura.pregunta_id]);
  });

  it('criterio 12ter: validarFigura acepta las 121 y degrada las inválidas con un aviso', function () {
    assert.equal(banco.figuras.length, 121, 'vuelve a medir §2 del diseño');
    banco.figuras.forEach(function (f) {
      assert.deepEqual(D.validarFigura(f), [], 'figura ' + f.id);
    });

    const base = clonar(banco.figuras[0]);
    const sinIds = clonar(base); sinIds.id = ''; sinIds.pregunta_id = '';
    assert.deepEqual(D.validarFigura(sinIds), ['id', 'pregunta_id']);

    const rol = clonar(base); rol.rol = 'pie_de_pagina';
    assert.deepEqual(D.validarFigura(rol), ['rol']);

    const estado = clonar(base); estado.estado = 'en_curso';
    assert.deepEqual(D.validarFigura(estado), ['estado']);

    const archivo = clonar(base); archivo.archivo = '   ';
    assert.deepEqual(D.validarFigura(archivo), ['archivo']);

    const textos = clonar(base); textos.descripcion = 3; textos.transcripcion = 7;
    assert.deepEqual(D.validarFigura(textos), ['descripcion', 'transcripcion']);

    const pagina = clonar(base); pagina.pagina_pdf = 0;
    assert.deepEqual(D.validarFigura(pagina), ['pagina_pdf']);

    const altSinId = clonar(base); altSinId.rol = 'alternativa'; altSinId.alternativa_id = null;
    assert.deepEqual(D.validarFigura(altSinId), ['alternativa_id'],
      'alternativa_id es obligatorio cuando el rol es alternativa');

    const altMala = clonar(base); altMala.alternativa_id = 'E';
    assert.deepEqual(D.validarFigura(altMala), ['alternativa_id']);

    // Recuperable: aviso figura_invalida y el banco sigue siendo válido.
    const bancoRoto = clonar(banco);
    bancoRoto.figuras[0].estado = 'en_curso';
    const roto = D.validarBanco(bancoRoto);
    assert.equal(roto.valido, true);
    const invalidas = roto.avisos.filter(function (a) { return a.codigo === 'figura_invalida'; });
    assert.equal(invalidas.length, 1);
    assert.deepEqual(invalidas[0].datos.motivos, ['estado']);
  });

  it('validarBanco: esquema no soportado y colecciones ausentes son fatales', function () {
    const otroEsquema = clonar(banco);
    otroEsquema.esquema_version = 'm1-2.0';
    const r1 = D.validarBanco(otroEsquema);
    assert.equal(r1.valido, false);
    assert.equal(r1.errores[0].codigo, 'esquema_version');
    assert.match(r1.errores[0].texto, /m1-2\.0/);

    const sinPreguntas = { esquema_version: 'm1-1.1', pruebas: [], figuras: [], textos: [] };
    const r2 = D.validarBanco(sinPreguntas);
    assert.equal(r2.valido, false);
    assert.equal(r2.errores[0].codigo, 'coleccion_ausente');

    // El banco real: válido, sin errores y sin avisos de integridad.
    const r3 = D.validarBanco(banco);
    assert.equal(r3.valido, true);
    assert.deepEqual(r3.errores, []);
    assert.deepEqual(r3.avisos, []);
    r3.avisos.forEach(function (a) { assert.ok(D.CODIGOS_AVISO.has(a.codigo)); });
  });

  it('referenciasRotas: los 3 tipos, y 0 en el banco actual', function () {
    assert.deepEqual(D.referenciasRotas(banco), []);

    const roto = clonar(banco);
    roto.preguntas[0].prueba_id = 'prueba-que-no-existe';
    roto.preguntas[1].figura_ids = ['F999'];
    roto.figuras[0].pregunta_id = 'm1-no-existe';
    const rotas = D.referenciasRotas(roto);
    assert.deepEqual(rotas.map(function (r) { return r.tipo; }).sort(),
      ['figura_huerfana', 'figura_rota', 'prueba_inexistente']);

    const resultado = D.validarBanco(roto);
    assert.equal(resultado.valido, false, 'prueba_inexistente es fatal');
    assert.equal(resultado.errores.filter(function (e) { return e.codigo === 'prueba_inexistente'; }).length, 1);
    assert.equal(resultado.avisos.filter(function (a) { return a.codigo === 'figura_rota'; }).length, 1);
    assert.equal(resultado.avisos.filter(function (a) { return a.codigo === 'figura_huerfana'; }).length, 1);
  });

  it('tieneIdsUnicos: ids duplicados son fatales', function () {
    assert.equal(D.tieneIdsUnicos(banco.preguntas), true);
    assert.equal(D.tieneIdsUnicos([{ id: 'a' }, { id: 'a' }]), false);

    const duplicado = clonar(banco);
    duplicado.preguntas[1].id = duplicado.preguntas[0].id;
    const resultado = D.validarBanco(duplicado);
    assert.equal(resultado.valido, false);
    assert.equal(resultado.errores[0].codigo, 'ids_duplicados');
  });

  it('criterio 57quater: RANGOS_T24I tiene los 8 rangos, 4 de eje y 4 de habilidad', function () {
    const claves = Object.keys(D.RANGOS_T24I);
    assert.equal(claves.length, 8);
    const esperadas = Array.from(D.EJES_M1).concat(Array.from(D.HABILIDADES_M1)).sort();
    assert.deepEqual(claves.slice().sort(), esperadas);
    claves.forEach(function (clave) {
      const rango = D.RANGOS_T24I[clave];
      assert.equal(Array.isArray(rango), true, clave);
      assert.equal(rango.length, 2, clave);
      assert.ok(Number.isInteger(rango[0]) && Number.isInteger(rango[1]), clave);
      assert.ok(rango[0] <= rango[1], clave);
    });
  });
});

// ===========================================================================
describe('pozo', function () {
  it('criterio 8: 194 preguntas, descartes {42, 46} y la identidad de exclusividad', function () {
    assert.equal(POZO.pozo.length, 194, 'vuelve a medir §2 del diseño');
    assert.deepEqual(POZO.descartes, {
      esquema_invalido: 0,
      prueba_incompleta: 42,
      prueba_no_verificada: 0,
      figura_rota: 0,
      figura_requerida: 46,
      sin_clave: 0,
      ilegible: 0,
    }, 'vuelve a medir §2 del diseño');

    const suma = Object.keys(POZO.descartes).reduce(function (acc, m) {
      return acc + POZO.descartes[m];
    }, 0);
    assert.equal(suma + POZO.pozo.length, banco.preguntas.length);
    assert.equal(suma + POZO.pozo.length, 282);

    // idsDescartados: hallazgo 12, acotado a 50 ids por motivo.
    assert.equal(POZO.idsDescartados.prueba_incompleta.length, 42);
    assert.equal(POZO.idsDescartados.figura_requerida.length, 46);
    Object.keys(POZO.idsDescartados).forEach(function (motivo) {
      assert.ok(POZO.idsDescartados[motivo].length <= 50, motivo);
    });
  });

  it('criterio 9: con el filtro de verificadas, 140 preguntas y descartes {42, 65, 35}', function () {
    assert.equal(POZO_VERIFICADAS.pozo.length, 140, 'vuelve a medir §2 del diseño');
    assert.deepEqual(POZO_VERIFICADAS.descartes, {
      esquema_invalido: 0,
      prueba_incompleta: 42,
      prueba_no_verificada: 65,
      figura_rota: 0,
      figura_requerida: 35,
      sin_clave: 0,
      ilegible: 0,
    }, 'si el desglose no cuadra, el orden de los filtros está mal, no el total');

    const suma = Object.keys(POZO_VERIFICADAS.descartes).reduce(function (acc, m) {
      return acc + POZO_VERIFICADAS.descartes[m];
    }, 0);
    assert.equal(suma + POZO_VERIFICADAS.pozo.length, 282);

    POZO_VERIFICADAS.pozo.forEach(function (p) {
      assert.ok(D.PRUEBAS_VERIFICADAS_CIEGO.has(p.prueba_id), p.id);
    });
  });

  it('criterio 10: la incompletitud se deriva de n_preguntas - no publicadas', function () {
    const presentes = new Map();
    banco.pruebas.forEach(function (pr) { presentes.set(pr.id, 0); });
    banco.preguntas.forEach(function (p) { presentes.set(p.prueba_id, presentes.get(p.prueba_id) + 1); });

    const incompletas = banco.pruebas.filter(function (pr) {
      return !D.pruebaCompleta(pr, presentes.get(pr.id));
    });
    // Solo invierno 2026: declara 65 sin ninguna no publicada y aporta 42.
    assert.deepEqual(incompletas.map(function (pr) { return pr.proceso + ' ' + pr.admision; }),
      ['invierno 2026'], 'vuelve a medir §2 del diseño');
    const idIncompleta = incompletas[0].id;
    assert.equal(presentes.get(idIncompleta), 42);
    assert.equal(incompletas[0].n_preguntas, 65);
    assert.equal(incompletas[0].preguntas_no_publicadas.length, 0);

    POZO.pozo.forEach(function (p) {
      assert.notEqual(p.prueba_id, idIncompleta, p.id);
    });

    // regular 2025: 45 presentes de 65 con 20 no publicadas ⇒ COMPLETA.
    const reg25 = banco.pruebas.find(function (pr) {
      return pr.preguntas_no_publicadas.length === 20;
    });
    assert.equal(presentes.get(reg25.id), 45);
    assert.equal(D.pruebaCompleta(reg25, 45), true);
    assert.ok(POZO.pozo.some(function (p) { return p.prueba_id === reg25.id; }));

    // Caso borde 24: una prueba que no aporta ninguna pregunta es incompleta.
    assert.equal(D.pruebaCompleta({ n_preguntas: 65, preguntas_no_publicadas: [] }, 0), false);
  });

  it('criterio 11: el pozo no tiene figura requerida, ni clave ausente, ni enunciado ilegible', function () {
    POZO.pozo.forEach(function (p) {
      assert.equal(p.requiere_figura, false, p.id);
      assert.notEqual(p.alternativa_correcta, null, p.id);
      assert.notEqual(p.estado_enunciado, 'ilegible_parcial', p.id);
    });
  });

  it('criterio 12: 44 alternativas solo-marcador en 11 preguntas, 0 en el pozo', function () {
    const soloMarcador = /^\[\[figura:[A-Za-z0-9_.:-]+\]\]$/;
    function contar(preguntas) {
      let alternativas = 0;
      const ids = new Set();
      preguntas.forEach(function (p) {
        p.alternativas.forEach(function (a) {
          if (soloMarcador.test(a.texto.trim())) {
            alternativas += 1;
            ids.add(p.id);
          }
        });
      });
      return { alternativas: alternativas, preguntas: ids.size };
    }

    assert.deepEqual(contar(banco.preguntas), { alternativas: 44, preguntas: 11 },
      'vuelve a medir §2 del diseño: la unidad es parte del número');
    assert.deepEqual(contar(POZO.pozo), { alternativas: 0, preguntas: 0 });
  });

  it('criterio 23: huellaPozo depende del conjunto del pozo, no de su orden', function () {
    const huella = D.huellaPozo(banco, POZO.pozo, { soloVerificadas: false });
    assert.match(huella, /^[0-9a-f]{8}$/);

    const otroOrden = POZO.pozo.slice().reverse();
    assert.equal(D.huellaPozo(banco, otroOrden, { soloVerificadas: false }), huella);

    const sinUna = POZO.pozo.slice(1);
    assert.notEqual(D.huellaPozo(banco, sinUna, { soloVerificadas: false }), huella);

    const huellaVerificadas = D.huellaPozo(banco, POZO_VERIFICADAS.pozo, { soloVerificadas: true });
    assert.notEqual(huellaVerificadas, huella);
    // Y también difiere solo por el flag, con el mismo pozo: la huella declara
    // con qué filtro se construyó (caso borde 20).
    assert.notEqual(D.huellaPozo(banco, POZO.pozo, { soloVerificadas: true }), huella);
  });

  it('resolverFigura devuelve la figura o null', function () {
    assert.equal(D.resolverFigura(banco, banco.figuras[0].id), banco.figuras[0]);
    assert.equal(D.resolverFigura(banco, 'F999'), null);
  });

  it('construirPozo inicializa los 7 motivos en 0 y cuadra con un banco sin preguntas', function () {
    const bancoVacio = clonar(banco);
    bancoVacio.preguntas = [];
    const vacio = D.construirPozo(bancoVacio, { soloVerificadas: false });
    assert.equal(vacio.pozo.length, 0);
    assert.deepEqual(Object.keys(vacio.descartes), D.MOTIVOS_DESCARTE);
    assert.deepEqual(D.MOTIVOS_DESCARTE, [
      'esquema_invalido', 'prueba_incompleta', 'prueba_no_verificada',
      'figura_rota', 'figura_requerida', 'sin_clave', 'ilegible',
    ], 'el orden de los motivos es el contrato de RF-2.5');
    D.MOTIVOS_DESCARTE.forEach(function (motivo) {
      assert.equal(vacio.descartes[motivo], 0, motivo);
      assert.deepEqual(vacio.idsDescartados[motivo], [], motivo);
    });
  });
});

// ===========================================================================
describe('generación', function () {
  it('criterio 18: hashSemilla con los valores calculados con el FNV-1a de §7.6', function () {
    assert.equal(D.hashSemilla('ensayo-1'), 1111415704);
    assert.equal(D.hashSemilla('ensayo-1'), 0x423edb98);
    assert.equal(D.hashSemilla(''), 2166136261);
  });

  it('criterio 24: crearAleatorio devuelve siempre un número en [0, 1)', function () {
    fc.assert(fc.property(semillaUint32(), function (semilla) {
      const rnd = D.crearAleatorio(semilla);
      for (let i = 0; i < 50; i += 1) {
        const v = rnd();
        if (!(typeof v === 'number' && v >= 0 && v < 1)) return false;
      }
      return true;
    }));
  });

  it('criterio 25: mezclar es una permutación y no muta la entrada', function () {
    fc.assert(fc.property(fc.array(fc.integer()), semillaUint32(), function (lista, semilla) {
      const copiaOriginal = lista.slice();
      const mezclada = D.mezclar(lista, D.crearAleatorio(semilla));
      assert.deepEqual(lista, copiaOriginal, 'mezclar no puede mutar la entrada');
      assert.equal(mezclada.length, lista.length);
      assert.deepEqual(mezclada.slice().sort(), lista.slice().sort());
      return true;
    }));
  });

  it('criterios 13, 14, 15 y 20: 65 preguntas, ids únicos, cuotas 22/19/12/12, todas del pozo', function () {
    const idsPozo = new Set(POZO.pozo.map(function (p) { return p.id; }));
    fc.assert(fc.property(semillaUint32(), function (semilla) {
      const ensayo = D.generarEnsayo(POZO.pozo, semilla, D.CUOTAS_EJE);
      assert.equal(ensayo.length, 65);
      assert.equal(new Set(ensayo.map(function (p) { return p.id; })).size, 65);
      const porEje = {};
      ensayo.forEach(function (p) {
        porEje[p.eje] = (porEje[p.eje] || 0) + 1;
        assert.ok(idsPozo.has(p.id), 'pregunta fuera del pozo: ' + p.id);
      });
      assert.deepEqual(porEje, D.CUOTAS_EJE);
      return true;
    }), { numRuns: 40 });
  });

  it('criterio 16: dos llamadas con la misma semilla dan la misma secuencia de ids', function () {
    fc.assert(fc.property(semillaUint32(), function (semilla) {
      const a = D.generarEnsayo(POZO.pozo, semilla, D.CUOTAS_EJE).map(function (p) { return p.id; });
      const b = D.generarEnsayo(POZO.pozo, semilla, D.CUOTAS_EJE).map(function (p) { return p.id; });
      assert.deepEqual(a, b);
      return true;
    }), { numRuns: 40 });
  });

  it('criterio 17: el resultado no depende del orden del array de entrada', function () {
    fc.assert(fc.property(semillaUint32(), semillaUint32(), function (semilla, semillaBaraja) {
      const esperado = D.generarEnsayo(POZO.pozo, semilla, D.CUOTAS_EJE)
        .map(function (p) { return p.id; });
      const pozoBarajado = D.mezclar(POZO.pozo, D.crearAleatorio(semillaBaraja));
      const obtenido = D.generarEnsayo(pozoBarajado, semilla, D.CUOTAS_EJE)
        .map(function (p) { return p.id; });
      assert.deepEqual(obtenido, esperado);
      return true;
    }), { numRuns: 25 });
  });

  it('criterio 19: dos semillas distintas conocidas producen conjuntos distintos', function () {
    const a = D.generarEnsayo(POZO.pozo, D.hashSemilla('ensayo-1'), D.CUOTAS_EJE)
      .map(function (p) { return p.id; });
    const b = D.generarEnsayo(POZO.pozo, D.hashSemilla('ensayo-2'), D.CUOTAS_EJE)
      .map(function (p) { return p.id; });
    assert.notDeepEqual(a, b);
    const comunes = new Set(a.filter(function (id) { return b.indexOf(id) !== -1; }));
    assert.ok(comunes.size < 65, 'coincidencia de ' + comunes.size + ' ids');
  });

  it('criterio 21: lanza nombrando el eje, lo requerido y lo disponible', function () {
    // Pozo al que le falta una pregunta de geometría para la cuota de 12.
    const geometria = POZO.pozo.filter(function (p) { return p.eje === 'geometria'; }).slice(0, 11);
    const resto = POZO.pozo.filter(function (p) { return p.eje !== 'geometria'; });
    const pozoCorto = resto.concat(geometria);

    assert.throws(function () {
      D.generarEnsayo(pozoCorto, 1, D.CUOTAS_EJE);
    }, function (error) {
      assert.match(error.message, /geometria/);
      assert.match(error.message, /12/);
      assert.match(error.message, /11/);
      return true;
    });
  });

  it('criterio 21bis: verificarFactibilidad es factible en 194 y en 140, y declara el déficit', function () {
    assert.deepEqual(D.verificarFactibilidad(POZO.pozo, D.CUOTAS_EJE), { factible: true, deficits: [] });
    assert.deepEqual(D.verificarFactibilidad(POZO_VERIFICADAS.pozo, D.CUOTAS_EJE),
      { factible: true, deficits: [] });

    const sinGeometria = POZO.pozo.filter(function (p) { return p.eje !== 'geometria'; });
    assert.deepEqual(D.verificarFactibilidad(sinGeometria, D.CUOTAS_EJE), {
      factible: false,
      deficits: [{ eje: 'geometria', requerido: 12, disponible: 0 }],
    });
  });

  it('criterio 22: lanza si las cuotas no suman 65 o si las claves no son los 4 ejes', function () {
    assert.throws(function () {
      D.generarEnsayo(POZO.pozo, 1, {
        numeros: 22, algebra_y_funciones: 19, geometria: 12, probabilidad_y_estadistica: 11,
      });
    }, /suman 64/);

    assert.throws(function () {
      D.generarEnsayo(POZO.pozo, 1, { numeros: 33, algebra_y_funciones: 32 });
    }, /los 4 ejes/);

    assert.throws(function () {
      D.generarEnsayo(POZO.pozo, 1, {
        numeros: 22, algebra_y_funciones: 19, geometria: 12, habilidades: 12,
      });
    }, /los 4 ejes/);
  });

  it('CUOTAS_EJE suma 65 y ORDEN_EJES es la lista literal de los 4 ejes', function () {
    const suma = D.ORDEN_EJES.reduce(function (acc, eje) { return acc + D.CUOTAS_EJE[eje]; }, 0);
    assert.equal(suma, 65);
    assert.deepEqual(D.ORDEN_EJES.slice().sort(), Array.from(D.EJES_M1).sort());
    assert.deepEqual(D.ORDEN_EJES, ['numeros', 'algebra_y_funciones', 'geometria', 'probabilidad_y_estadistica']);
  });
});

// ===========================================================================
// Tokenizador (§7.9). Criterios 26-37 más 27bis, 28bis, 30bis, 30ter, 31bis y
// 31ter. Los números del banco son snapshot: si fallan, hay que volver a medir
// §2 del diseño antes de tocar el tokenizador.
// ===========================================================================

/** Los tres campos renderizables de una pregunta (§2). */
function camposRenderizables(p) {
  return [p.enunciado, p.explicacion].concat(p.alternativas.map(function (a) { return a.texto; }));
}

/** Todos los campos renderizables de las 282, en orden. */
const CAMPOS = banco.preguntas.reduce(function (acc, p) {
  camposRenderizables(p).forEach(function (t) { acc.push({ id: p.id, texto: t }); });
  return acc;
}, []);

/** Recorre los spans de una lista aplicando `visitar` en orden de aparición. */
function recorrerSpans(spans, visitar) {
  spans.forEach(function (s) {
    visitar(s);
    if (s.tipo === 'enfasis') recorrerSpans(s.spans, visitar);
  });
}

/** Recorre bloques y spans de un árbol aplicando `visitar` a cada uno. */
function recorrerBloques(bloques, visitar) {
  bloques.forEach(function (bl) {
    visitar(bl);
    if (bl.tipo === 'parrafo') recorrerSpans(bl.spans, visitar);
    if (bl.tipo === 'lista') bl.items.forEach(function (it) { recorrerSpans(it, visitar); });
    if (bl.tipo === 'tabla') {
      bl.cabecera.forEach(function (c) { recorrerSpans(c, visitar); });
      bl.filas.forEach(function (f) {
        f.forEach(function (c) { recorrerSpans(c, visitar); });
      });
    }
  });
}

/**
 * Criterio 29: concatena el contenido en orden de aparición, SIN reinsertar
 * ningún delimitador. Un span `salto` cuenta como `\n`, que es lo que mantiene
 * el test de conservación cuadrando con "tratar `\n` como separador".
 */
function textoPlano(bloques) {
  return bloques.map(function (bl) {
    if (bl.tipo === 'parrafo') return textoPlanoSpans(bl.spans);
    if (bl.tipo === 'formula_bloque') return bl.latex;
    if (bl.tipo === 'lista') return bl.items.map(textoPlanoSpans).join(' ');
    if (bl.tipo === 'tabla') {
      return bl.cabecera.map(textoPlanoSpans).join(' ') + ' ' +
        bl.filas.map(function (f) { return f.map(textoPlanoSpans).join(' '); }).join(' ');
    }
    return ''; // los bloques `figura` se descartan
  }).join(' ');
}

function textoPlanoSpans(spans) {
  return spans.map(function (s) {
    if (s.tipo === 'texto') return s.valor;
    if (s.tipo === 'formula') return s.latex;
    if (s.tipo === 'enfasis') return textoPlanoSpans(s.spans);
    return '\n'; // salto
  }).join('');
}

/**
 * Quita los delimitadores de matemática sustituyendo `\$` por `$` SOLO donde
 * quedó en texto (las 146, no las 28). Es el método de medición de §2 (un
 * recorrido con flag, no un regex) y va escrito aquí aparte a propósito: el
 * lado "esperado" del test de conservación no puede salir del tokenizador.
 */
function quitarDelimitadoresMatematica(texto) {
  let salida = '';
  let dentro = false;
  let i = 0;
  while (i < texto.length) {
    const c = texto.charAt(i);
    if (c === '\\' && texto.charAt(i + 1) === '$') {
      salida += dentro ? '\\$' : '$';
      i += 2;
      continue;
    }
    if (c === '$') {
      const doble = texto.charAt(i + 1) === '$';
      dentro = !dentro;
      i += doble ? 2 : 1;
      continue;
    }
    salida += c;
    i += 1;
  }
  return salida;
}

const PATRON_SEPARADORA_TABLA = /^\|?[\s:|-]*-[\s:|-]*\|?$/;

function colapsar(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/** Lado esperado del criterio 29, construido sin usar el tokenizador. */
function textoEsperado(texto) {
  const lineas = quitarDelimitadoresMatematica(texto).split('\n')
    .filter(function (l) { return !PATRON_SEPARADORA_TABLA.test(l.trim()); })
    .map(function (l) { return l.trim().slice(0, 2) === '- ' ? l.trim().slice(2) : l; })
    // Los `|` se quitan solo en las líneas de tabla: el único `|` del banco
    // fuera de una tabla está DENTRO de una fórmula (m1-reg24-050) y tiene que
    // sobrevivir, que es justo lo que protege el orden de pasos de §7.9.
    .map(function (l) { return l.trim().charAt(0) === '|' ? l.replace(/\|/g, ' ') : l; });
  return colapsar(lineas.join('\n')
    .replace(/\[\[figura:[A-Za-z0-9_.:-]+\]\]/g, '')
    .replace(/\*\*/g, ''));
}

/** Atajo: tokeniza y devuelve solo los bloques. */
function bloquesDe(texto, opciones) {
  return D.tokenizarContenido(texto, opciones).bloques;
}

describe('tokenizador', function () {
  it('criterio 26 [prop]: texto llano da un párrafo con un span de texto VERBATIM', function () {
    // El alfabeto está acotado a propósito: excluye los cinco disparadores de
    // §7.9 ($, |, [[, el `- ` inicial de lista y *). Incluye el espacio, así
    // que una implementación con `valor: tramo.trim()` falla a la primera.
    const alfabeto = 'abcXYZ019 áéíóúÁÉÍÓÚñÑ.,;:()?!';
    fc.assert(fc.property(
      fc.string({
        unit: fc.constantFrom.apply(fc, alfabeto.split('')),
        minLength: 1,
        maxLength: 60,
      }).filter(function (t) { return t.trim() !== '' && !t.includes('\n\n'); }),
      function (t) {
        const r = D.tokenizarContenido(t);
        assert.deepEqual(r.avisos, []);
        assert.equal(r.bloques.length, 1);
        assert.equal(r.bloques[0].tipo, 'parrafo');
        assert.deepEqual(r.bloques[0].spans, [{ tipo: 'texto', valor: t }]);
      },
    ), { numRuns: 200 });
  });

  it('criterio 27: \\$ fuera de matemática es un peso literal y no abre fórmula', function () {
    const r = D.tokenizarContenido('Paga \\$10.000 y luego $x$ pesos');
    assert.equal(r.bloques.length, 1);
    const spans = r.bloques[0].spans;
    assert.deepEqual(spans, [
      { tipo: 'texto', valor: 'Paga $10.000 y luego ' },
      { tipo: 'formula', latex: 'x' },
      { tipo: 'texto', valor: ' pesos' },
    ]);
    assert.deepEqual(r.avisos, []);
  });

  it('criterio 27bis: \\$ dentro de matemática conserva la barra (dato real de m1-inv25-009)', function () {
    const r = D.tokenizarContenido('$\\$(a + 1600)$');
    assert.equal(r.bloques.length, 1);
    assert.deepEqual(r.bloques[0].spans, [{ tipo: 'formula', latex: '\\$(a + 1600)' }]);

    // Segunda mitad, leída DEL BANCO y no de un literal copiado (§8.8).
    const p = banco.preguntas.find(function (q) { return q.id === 'm1-inv25-009'; });
    assert.ok(p, 'm1-inv25-009 tiene que existir en el banco');
    assert.equal(p.alternativas.length, 4);
    p.alternativas.forEach(function (a) {
      const bloques = bloquesDe(a.texto);
      assert.equal(bloques.length, 1, 'alternativa ' + a.id);
      const spans = bloques[0].spans;
      const formulas = spans.filter(function (s) { return s.tipo === 'formula'; });
      assert.equal(formulas.length, 1, 'alternativa ' + a.id + ': una sola fórmula');
      assert.equal((formulas[0].latex.match(/\\\$/g) || []).length, 3,
        'alternativa ' + a.id + ': tres \\$ dentro del latex');
    });
  });

  it('criterio 28: el banco da exactamente 2 146 fórmulas inline y 18 de bloque', function () {
    let inline = 0;
    let bloque = 0;
    CAMPOS.forEach(function (c) {
      recorrerBloques(bloquesDe(c.texto), function (n) {
        if (n.tipo === 'formula') inline += 1;
        if (n.tipo === 'formula_bloque') bloque += 1;
      });
    });
    assert.equal(inline, 2146, 'vuelve a medir §2 del diseño');
    assert.equal(bloque, 18, 'vuelve a medir §2 del diseño');
  });

  it('criterio 28bis: reparto 146/28 de \\$ y ningún $ desnudo en el latex', function () {
    let enTexto = 0;
    let enLatex = 0;
    const desnudos = [];
    CAMPOS.forEach(function (c) {
      recorrerBloques(bloquesDe(c.texto), function (n) {
        if (n.tipo === 'texto') {
          enTexto += (n.valor.match(/\$/g) || []).length;
        }
        if (n.tipo === 'formula' || n.tipo === 'formula_bloque') {
          enLatex += (n.latex.match(/\\\$/g) || []).length;
          // Un `$` desnudo en el cuerpo LaTeX es un ParseError de KaTeX.
          if (/(^|[^\\])\$/.test(n.latex)) desnudos.push(c.id + ': ' + n.latex);
        }
      });
    });
    assert.equal(enTexto, 146, 'las 146 ocurrencias de peso literal');
    assert.equal(enLatex, 28, 'las 28 ocurrencias de escape LaTeX');
    assert.deepEqual(desnudos, []);
  });

  it('criterio 29: no se pierde ni se inventa texto en las 282 (conservación, no round-trip)', function () {
    const fallos = [];
    CAMPOS.forEach(function (c) {
      const obtenido = colapsar(textoPlano(bloquesDe(c.texto)));
      if (obtenido !== textoEsperado(c.texto)) fallos.push(c.id);
    });
    assert.deepEqual(fallos, []);
  });

  it('criterio 30: $$...$$ da formula_bloque, verbatim, y varios por campo', function () {
    const bloques = bloquesDe('$$L = c - 0{,}1 \\cdot x$$');
    assert.deepEqual(bloques, [{ tipo: 'formula_bloque', latex: 'L = c - 0{,}1 \\cdot x' }]);

    const alineado = '$$\\begin{aligned} a &= 1 \\\\ b &= 2 \\end{aligned}$$';
    const r = bloquesDe(alineado);
    assert.equal(r.length, 1);
    assert.equal(r[0].latex, '\\begin{aligned} a &= 1 \\\\ b &= 2 \\end{aligned}');

    const p = banco.preguntas.find(function (q) { return q.id === 'm1-inv25-041'; });
    const deBloque = camposRenderizables(p).reduce(function (acc, t) {
      return acc + bloquesDe(t).filter(function (b) { return b.tipo === 'formula_bloque'; }).length;
    }, 0);
    assert.equal(deBloque, 2, 'm1-inv25-041 trae dos bloques, no uno');
  });

  it('criterio 30bis: una fórmula de bloque con texto delante se promueve y parte el párrafo', function () {
    const bloques = bloquesDe('Paso 1: se aplica distributividad, obteniéndose:\n$$3x \\cdot (x^{2} - 6x + 5)$$');
    assert.deepEqual(bloques.map(function (b) { return b.tipo; }), ['parrafo', 'formula_bloque']);
    assert.deepEqual(bloques[0].spans, [
      { tipo: 'texto', valor: 'Paso 1: se aplica distributividad, obteniéndose:' },
    ]);
    assert.equal(bloques[1].latex, '3x \\cdot (x^{2} - 6x + 5)');

    // Y sobre el banco: los 18 son bloques de primer nivel, ninguno queda como
    // span dentro de un párrafo, y no se emite ningún párrafo vacío.
    let primerNivel = 0;
    CAMPOS.forEach(function (c) {
      const bloques2 = bloquesDe(c.texto);
      bloques2.forEach(function (bl) {
        if (bl.tipo === 'formula_bloque') primerNivel += 1;
        if (bl.tipo === 'parrafo') {
          assert.notEqual(colapsar(textoPlanoSpans(bl.spans)), '',
            c.id + ': párrafo vacío emitido');
        }
      });
    });
    assert.equal(primerNivel, 18);
  });

  it('criterio 30ter: el \\n suelto da spans salto, y son exactamente 2 en el banco', function () {
    // EXPECTATIVA MEDIDA, no la del texto del review. El fix de design-review
    // dice `[parrafo, figura, parrafo]` y "el primer párrafo"; medido sobre el
    // snapshot son CUATRO bloques y los 2 saltos están en el de índice 1,
    // porque el enunciado abre con un párrafo de presentación, luego los 3
    // pasos numerados, luego la línea del marcador y luego la pregunta.
    // Manda la medición.
    const p = banco.preguntas.find(function (q) { return q.id === 'm1-inv24-048'; });
    assert.ok(p, 'm1-inv24-048 tiene que existir en el banco');
    const bloques = bloquesDe(p.enunciado);
    assert.deepEqual(bloques.map(function (b) { return b.tipo; }),
      ['parrafo', 'parrafo', 'figura', 'parrafo']);
    const saltos = bloques[1].spans.filter(function (s) { return s.tipo === 'salto'; });
    assert.equal(saltos.length, 2, 'los 3 pasos numerados van en tres líneas');
    assert.deepEqual(saltos, [{ tipo: 'salto' }, { tipo: 'salto' }]);
    bloques.forEach(function (bl, i) {
      if (i === 1) return;
      if (bl.tipo !== 'parrafo') return;
      assert.equal(bl.spans.some(function (s) { return s.tipo === 'salto'; }), false);
    });

    // Sobre los tres campos de las 282: 2 saltos en total y ningún span de
    // texto con `\n` dentro (los `\n` que consumen las estructuras no emiten).
    let total = 0;
    const conSalto = [];
    CAMPOS.forEach(function (c) {
      recorrerBloques(bloquesDe(c.texto), function (n) {
        if (n.tipo === 'salto') total += 1;
        if (n.tipo === 'texto' && n.valor.includes('\n')) conSalto.push(c.id);
      });
    });
    assert.equal(total, 2, 'vuelve a medir §2 del diseño');
    assert.deepEqual(conSalto, []);
  });

  it('criterio 31: la tabla descarta la separadora, conserva fórmulas y recorta las celdas', function () {
    const lineas = ['| Tramo | Valor |', '|---|---|'];
    for (let n = 1; n <= 7; n += 1) lineas.push('| t' + n + ' | $0{,}15$ |');
    const bloques = bloquesDe(lineas.join('\n'));
    assert.equal(bloques.length, 1);
    const tabla = bloques[0];
    assert.equal(tabla.tipo, 'tabla');
    assert.equal(tabla.cabecera.length, 2);
    assert.deepEqual(tabla.cabecera[0], [{ tipo: 'texto', valor: 'Tramo' }]);
    assert.equal(tabla.filas.length, 7);
    assert.deepEqual(tabla.filas[0][1], [{ tipo: 'formula', latex: '0{,}15' }]);
    // Ninguna fila es la separadora.
    tabla.filas.forEach(function (f) {
      assert.equal(/^[-:\s]*$/.test(colapsar(f.map(textoPlanoSpans).join(''))), false);
    });

    // Celdas CON trim: excepción declarada al verbatim del criterio 26.
    const simple = bloquesDe('| a | b |\n|---|---|\n| c | d |')[0];
    assert.deepEqual(simple.cabecera, [
      [{ tipo: 'texto', valor: 'a' }],
      [{ tipo: 'texto', valor: 'b' }],
    ]);

    // §7.18.3: una fórmula con `|` dentro no parte la celda (caso sintético:
    // la única fórmula del banco con `|` no está en una tabla). Grupo de una
    // sola línea, para no caer en la regla de `tabla_sin_cabecera`.
    const conBarra = bloquesDe('| a | $|x| = 1$ | b |')[0];
    assert.equal(conBarra.cabecera.length, 3, 'tres celdas, no cinco');
    assert.deepEqual(conBarra.cabecera[1], [{ tipo: 'formula', latex: '|x| = 1' }]);
  });

  it('criterio 31bis: los 42 grupos del banco, más separadora ausente y fila irregular', function () {
    let grupos = 0;
    CAMPOS.forEach(function (c) {
      // Grupos de líneas `|` contados sobre el texto crudo, no sobre bloques.
      const porGrupo = [];
      let actual = null;
      String(c.texto).split('\n').forEach(function (l) {
        if (l.trim().charAt(0) === '|') {
          if (!actual) { actual = 0; porGrupo.push(actual); }
          porGrupo[porGrupo.length - 1] += 1;
          actual = porGrupo[porGrupo.length - 1];
        } else {
          actual = null;
        }
      });
      if (porGrupo.length === 0) return;
      const tablas = bloquesDe(c.texto).filter(function (b) { return b.tipo === 'tabla'; });
      assert.equal(tablas.length, porGrupo.length, c.id);
      porGrupo.forEach(function (n, k) {
        grupos += 1;
        if (n >= 3) {
          assert.equal(tablas[k].filas.length, n - 2, c.id + ': grupo de ' + n + ' líneas');
        }
        tablas[k].filas.forEach(function (f) {
          const plano = colapsar(f.map(textoPlanoSpans).join(''));
          assert.equal(/^[-:\s]*$/.test(plano) && plano !== '', false,
            c.id + ': una fila es la separadora');
        });
      });
    });
    assert.equal(grupos, 42, 'vuelve a medir §2 del diseño');

    const sinSeparadora = D.tokenizarContenido('| a | b |\n| c | d |');
    assert.equal(sinSeparadora.bloques[0].filas.length, 1, 'la segunda línea pasa a datos');
    assert.deepEqual(sinSeparadora.avisos.map(function (a) { return a.codigo; }),
      ['tabla_sin_separadora']);

    const irregular = D.tokenizarContenido('| a | b |\n|---|---|\n| c | d | e |');
    assert.equal(irregular.bloques[0].filas[0].length, 2, 'la fila se normaliza a 2 celdas');
    assert.deepEqual(irregular.avisos.map(function (a) { return a.codigo; }),
      ['tabla_fila_irregular']);

    const estrecha = D.tokenizarContenido('| a | b |\n|---|---|\n| c |');
    assert.deepEqual(estrecha.bloques[0].filas[0][1], [], 'la celda que falta va vacía');
    assert.deepEqual(estrecha.avisos.map(function (a) { return a.codigo; }),
      ['tabla_fila_irregular']);
  });

  it('criterio 31ter: el grupo de 2 líneas de m1-reg24-059 da 13 celdas de datos', function () {
    const p = banco.preguntas.find(function (q) { return q.id === 'm1-reg24-059'; });
    assert.ok(p, 'm1-reg24-059 tiene que existir en el banco');
    const r = D.tokenizarContenido(p.enunciado);
    const tabla = r.bloques.find(function (b) { return b.tipo === 'tabla'; });
    assert.equal(tabla.cabecera.length, 0, 'sin cabecera: no se pinta <thead>');
    assert.equal(tabla.filas.length, 1);
    assert.equal(tabla.filas[0].length, 13);
    assert.deepEqual(r.avisos.map(function (a) { return a.codigo; }), ['tabla_sin_cabecera']);

    // Y es el único grupo de 2 líneas del banco: el aviso sale una sola vez.
    const total = CAMPOS.reduce(function (acc, c) {
      return acc + D.tokenizarContenido(c.texto).avisos
        .filter(function (a) { return a.codigo === 'tabla_sin_cabecera'; }).length;
    }, 0);
    assert.equal(total, 1, 'vuelve a medir §2 del diseño');
  });

  it('criterio 32: el cierre coincide con la apertura y el $ impar no lanza', function () {
    const dos = D.tokenizarContenido('$x$$y$');
    assert.equal(dos.bloques.length, 1, 'un solo párrafo, ningún bloque de fórmula');
    assert.deepEqual(dos.bloques[0].spans, [
      { tipo: 'formula', latex: 'x' },
      { tipo: 'formula', latex: 'y' },
    ]);
    assert.deepEqual(dos.avisos, []);

    const abierto = D.tokenizarContenido('$$x$');
    assert.deepEqual(abierto.bloques, [{ tipo: 'parrafo', spans: [{ tipo: 'texto', valor: '$$x$' }] }]);
    assert.deepEqual(abierto.avisos.map(function (a) { return a.codigo; }), ['dolar_impar']);

    const impar = D.tokenizarContenido('cuesta $5 y sobra');
    assert.deepEqual(impar.avisos.map(function (a) { return a.codigo; }), ['dolar_impar']);
    assert.equal(colapsar(textoPlano(impar.bloques)), 'cuesta $5 y sobra');

    // El banco no tiene ninguno: 0 `$` sin pareja medidos en §2.
    const conAviso = CAMPOS.filter(function (c) {
      return D.tokenizarContenido(c.texto).avisos
        .some(function (a) { return a.codigo === 'dolar_impar'; });
    });
    assert.deepEqual(conAviso.map(function (c) { return c.id; }), []);
  });

  it('criterio 34 [prop]: no lanza para fc.string() ni para el alfabeto hostil', function () {
    fc.assert(fc.property(fc.string(), function (t) {
      D.tokenizarContenido(t);
      D.tokenizarContenido(t, { resolverFiguras: false });
      return true;
    }), { numRuns: 300 });

    const hostil = ['$', '\\$', '$$', '|', '[[figura:', '**', '- ', '\n\n', ']]'];
    fc.assert(fc.property(
      fc.array(fc.constantFrom.apply(fc, hostil), { maxLength: 24 }),
      function (piezas) {
        const t = piezas.join('');
        const r = D.tokenizarContenido(t);
        assert.ok(Array.isArray(r.bloques) && Array.isArray(r.avisos));
        r.avisos.forEach(function (a) {
          assert.equal(D.CODIGOS_AVISO.has(a.codigo), true, a.codigo);
        });
        return true;
      },
    ), { numRuns: 400 });
  });

  it('criterio 35: el banco da 121 bloques figura y ningún [[figura: visible', function () {
    let figuras = 0;
    const visibles = [];
    CAMPOS.forEach(function (c) {
      recorrerBloques(bloquesDe(c.texto), function (n) {
        if (n.tipo === 'figura') {
          figuras += 1;
          assert.equal(typeof n.idFigura, 'string');
          assert.notEqual(n.idFigura, '');
        }
        if (n.tipo === 'texto' && n.valor.includes('[[figura:')) visibles.push(c.id);
      });
    });
    assert.equal(figuras, 121, 'vuelve a medir §2 del diseño');
    assert.deepEqual(visibles, []);
  });

  it('criterio 36: marcador inline promovido y marcador mal formado literal', function () {
    const r = D.tokenizarContenido('Observe [[figura:F1]] y responda');
    assert.deepEqual(r.bloques, [
      { tipo: 'parrafo', spans: [{ tipo: 'texto', valor: 'Observe ' }] },
      { tipo: 'figura', idFigura: 'F1' },
      { tipo: 'parrafo', spans: [{ tipo: 'texto', valor: ' y responda' }] },
    ]);
    assert.deepEqual(r.avisos.map(function (a) { return a.codigo; }), ['marcador_inline']);

    ['[[figura:]]', '[[figura:F1', 'texto [[figura:F 1]] más'].forEach(function (t) {
      const malo = D.tokenizarContenido(t);
      assert.deepEqual(malo.avisos.map(function (a) { return a.codigo; }), ['marcador_malformado'], t);
      assert.ok(colapsar(textoPlano(malo.bloques)).includes('[[figura:'), t);
      assert.equal(malo.bloques.some(function (b) { return b.tipo === 'figura'; }), false, t);
    });

    // `[[ilegible:` solo emite el aviso: NO existe el tipo de bloque ilegible.
    const ilegible = D.tokenizarContenido('vea [[ilegible:parte]] aquí');
    assert.deepEqual(ilegible.avisos.map(function (a) { return a.codigo; }), ['marcador_malformado']);
    assert.deepEqual(ilegible.bloques.map(function (b) { return b.tipo; }), ['parrafo']);
  });

  it('criterio 37: con resolverFiguras:false las 121 transcripciones no dan bloques figura', function () {
    assert.equal(banco.figuras.length, 121, 'vuelve a medir §2 del diseño');
    banco.figuras.forEach(function (f) {
      [f.transcripcion, f.descripcion].forEach(function (t) {
        const r = D.tokenizarContenido(t, { resolverFiguras: false });
        assert.equal(r.bloques.some(function (b) { return b.tipo === 'figura'; }), false, f.id);
      });
    });

    // La barandilla, con un marcador sintético: degrada a texto literal.
    const r = D.tokenizarContenido('[[figura:F1]]', { resolverFiguras: false });
    assert.deepEqual(r.bloques, [{ tipo: 'parrafo', spans: [{ tipo: 'texto', valor: '[[figura:F1]]' }] }]);
    assert.deepEqual(r.avisos.map(function (a) { return a.codigo; }), ['marcador_malformado']);
  });

  it('la lista cierra el párrafo anterior y termina en la primera línea sin "- " (hallazgo 15)', function () {
    const bloques = bloquesDe('Se sabe que:\n- uno\n- dos\ny entonces');
    assert.deepEqual(bloques.map(function (b) { return b.tipo; }), ['parrafo', 'lista', 'parrafo']);
    assert.deepEqual(bloques[1].items, [
      [{ tipo: 'texto', valor: 'uno' }],
      [{ tipo: 'texto', valor: 'dos' }],
    ]);
    assert.deepEqual(bloques[2].spans, [{ tipo: 'texto', valor: 'y entonces' }]);

    let listas = 0;
    CAMPOS.forEach(function (c) {
      bloquesDe(c.texto).forEach(function (b) { if (b.tipo === 'lista') listas += 1; });
    });
    assert.equal(listas, 8, 'las 8 preguntas con lista de §2');
  });

  it('§7.18.5ter: ** alrededor de matemática da un énfasis con el centinela dentro', function () {
    const bloques = bloquesDe('**$x$ es par**');
    assert.deepEqual(bloques, [{
      tipo: 'parrafo',
      spans: [{
        tipo: 'enfasis',
        spans: [{ tipo: 'formula', latex: 'x' }, { tipo: 'texto', valor: ' es par' }],
      }],
    }]);
  });

  it('tokenizarContenido es pura: mismo texto, mismo árbol, y avisos en el objeto', function () {
    const texto = banco.preguntas[0].enunciado;
    assert.deepEqual(D.tokenizarContenido(texto), D.tokenizarContenido(texto));
    const r = D.tokenizarContenido('| a |\n| b |');
    assert.ok(Array.isArray(r.avisos) && r.avisos.length > 0);
    r.avisos.forEach(function (a) {
      assert.equal(D.CODIGOS_AVISO.has(a.codigo), true, a.codigo);
      assert.equal(a.severidad, 'aviso');
      assert.equal(typeof a.texto, 'string');
    });
  });
});

// ===========================================================================
// Corrección, estado, cronómetro y avisos (FEAT-003). Criterios 39-59bis.
// ===========================================================================

/** Ensayo real reproducible, el mismo para todos los tests de abajo. */
const ENSAYO = D.generarEnsayo(POZO.pozo, D.hashSemilla('ensayo-1'), D.CUOTAS_EJE);

/** Pregunta sintética con alternativas A-D y clave 'A', lista para retocar. */
function preguntaSintetica(id, extra) {
  return Object.assign(preguntaBase(), {
    id: id,
    alternativa_correcta: 'A',
    estado_respuesta: 'oficial',
    sin_puntaje: false,
  }, extra || {});
}

/** Respuestas que aciertan todas las preguntas con clave de una lista. */
function todasCorrectas(preguntas) {
  const respuestas = {};
  preguntas.forEach(function (p) {
    if (p.alternativa_correcta !== null) respuestas[p.id] = p.alternativa_correcta;
  });
  return respuestas;
}

// ===========================================================================
describe('corrección', function () {
  it('criterio 39: todas correctas en un ensayo sin piloto da correctas === puntuables', function () {
    const preguntas = ENSAYO.filter(function (p) { return p.sin_puntaje !== true; }).slice(0, 20);
    const r = D.calcularResultado(preguntas, todasCorrectas(preguntas));
    assert.equal(r.piloto, 0);
    assert.equal(r.puntuables, preguntas.length);
    assert.equal(r.correctas, r.puntuables);
    assert.equal(r.incorrectas, 0);
    assert.equal(r.omitidas, 0);
    assert.equal(r.porcentaje, 100);
  });

  it('criterio 40: una piloto acertada no suma en correctas ni en puntuables', function () {
    const piloto = preguntaSintetica('sin-puntaje-1', { sin_puntaje: true });
    const normal = preguntaSintetica('normal-1');
    const r = D.calcularResultado([piloto, normal], { 'sin-puntaje-1': 'A', 'normal-1': 'A' });

    assert.equal(r.piloto, 1);
    assert.equal(r.puntuables, 1);
    assert.equal(r.correctas, 1, 'solo la normal');
    assert.equal(r.detalle[0].puntuable, false);
    assert.equal(r.detalle[0].estado, 'correcta', 'se informa si acertó, aunque no puntúe');
  });

  it('criterio 41: sin clave da estado sin_clave, esCorrecta null y no puntúa', function () {
    // Sintética a propósito: el banco no tiene ninguna y el pozo no la dejaría pasar.
    const p = preguntaSintetica('sin-clave-1', {
      alternativa_correcta: null,
      estado_respuesta: 'sin_clave',
    });
    const revision = D.revisarPregunta(p, 'A');
    assert.equal(revision.estado, 'sin_clave');
    assert.equal(revision.esCorrecta, null);
    assert.equal(revision.puntuable, false);
    assert.equal(revision.alternativaCorrectaId, null);

    const r = D.calcularResultado([p], { 'sin-clave-1': 'A' });
    assert.equal(r.puntuables, 0);
    assert.equal(r.sinClave, 1);
    assert.equal(r.porcentaje, null);
    assert.equal(r.incorrectas, 0, 'nunca "incorrecta": nadie puede corregirla');
  });

  it('criterio 42: piloto y sin clave a la vez resta UNA sola unidad a puntuables', function () {
    const doble = preguntaSintetica('doble-1', {
      sin_puntaje: true,
      alternativa_correcta: null,
      estado_respuesta: 'sin_clave',
    });
    const normales = [preguntaSintetica('n-1'), preguntaSintetica('n-2')];
    const r = D.calcularResultado([doble].concat(normales), {});

    assert.equal(r.piloto, 1);
    assert.equal(r.sinClave, 1);
    assert.equal(r.puntuables, 2, 'piloto + sinClave = 2 restaría dos veces');
    assert.equal(r.puntuables, [doble].concat(normales).filter(D.esPuntuable).length);
  });

  it('criterio 43: en un ensayo de la app, sinClave === 0 y puntuables === 65 - piloto', function () {
    const r = D.calcularResultado(ENSAYO, {});
    assert.equal(ENSAYO.length, 65);
    assert.equal(r.sinClave, 0, 'el pozo ya excluyó las sin clave (RF-2.3)');
    assert.equal(r.puntuables, 65 - r.piloto);
  });

  it('criterio 44 [prop]: correctas + incorrectas + omitidas === puntuables', function () {
    fc.assert(fc.property(respuestasArbitrarias(), function (respuestas) {
      const r = D.calcularResultado(ENSAYO, respuestas);
      return r.correctas + r.incorrectas + r.omitidas === r.puntuables;
    }), { numRuns: 30 });
  });

  it('criterio 45 [prop]: 0 <= correctas <= puntuables <= 65', function () {
    fc.assert(fc.property(respuestasArbitrarias(), function (respuestas) {
      const r = D.calcularResultado(ENSAYO, respuestas);
      return 0 <= r.correctas && r.correctas <= r.puntuables && r.puntuables <= 65;
    }), { numRuns: 30 });
  });

  it('criterio 46: los desgloses suman el puntuables global y ninguna clave es undefined', function () {
    fc.assert(fc.property(respuestasArbitrarias(), function (respuestas) {
      const r = D.calcularResultado(ENSAYO, respuestas);
      return ['porEje', 'porHabilidad', 'porContenido'].every(function (campo) {
        const suma = r[campo].reduce(function (acc, g) { return acc + g.puntuables; }, 0);
        return suma === r.puntuables;
      });
    }), { numRuns: 20 });

    // La segunda mitad: la suma sola PASA con el bug de leer entrada[campo]
    // en vez de entrada.pregunta[campo] (un grupo con clave undefined).
    const r = D.calcularResultado(ENSAYO, todasCorrectas(ENSAYO));
    const ejes = new Set(ENSAYO.map(function (p) { return p.eje; }));
    assert.equal(r.porEje.length, ejes.size);
    assert.equal(r.porEje.length, 4, 'las 4 cuotas de ORDEN_EJES');
    assert.deepEqual(
      new Set(r.porEje.map(function (g) { return g.clave; })),
      ejes
    );
    ['porEje', 'porHabilidad', 'porContenido'].forEach(function (campo) {
      r[campo].forEach(function (g) {
        assert.notEqual(g.clave, undefined, campo);
        assert.notEqual(g.clave, 'undefined', campo);
      });
    });
  });

  it('criterio 47: una categoría sin puntuables sale con porcentaje null y al FINAL', function () {
    const preguntas = [
      preguntaSintetica('g-1', { eje: 'geometria', contenido_id: 'G1.1', sin_puntaje: true }),
      preguntaSintetica('n-1', { eje: 'numeros', contenido_id: 'N1.1' }),
      preguntaSintetica('a-1', { eje: 'algebra_y_funciones', contenido_id: 'A1.1' }),
    ];
    const r = D.calcularResultado(preguntas, { 'g-1': 'A', 'n-1': 'A', 'a-1': 'B' });

    assert.deepEqual(r.porEje.map(function (g) { return [g.clave, g.porcentaje]; }), [
      ['algebra_y_funciones', 0],
      ['numeros', 100],
      ['geometria', null],
    ]);
    assert.equal(Number.isNaN(r.porEje[2].porcentaje), false, 'null, nunca NaN');
    assert.equal(r.porEje[2].puntuables, 0);
  });

  it('criterio 48: una selección que no es de la pregunta cuenta como omitida', function () {
    const p = preguntaSintetica('ajena-1');
    assert.equal(D.revisarPregunta(p, 'Z').estado, 'omitida');
    assert.equal(D.revisarPregunta(p, null).estado, 'omitida');
    assert.equal(D.revisarPregunta(p, undefined).estado, 'omitida');

    const r = D.calcularResultado([p], { 'ajena-1': 'Z' });
    assert.equal(r.omitidas, 1);
    assert.equal(r.incorrectas, 0);
  });

  it('criterio 48bis: sin contexto, los 3 campos de trazabilidad son null', function () {
    const respuestas = todasCorrectas(ENSAYO);
    const sinCtx = D.calcularResultado(ENSAYO, respuestas);
    const conCtx = D.calcularResultado(ENSAYO, respuestas, {
      huellaPozo: 'a3f10b22',
      semillaTexto: 'ensayo-1',
      tiempoSegundos: 4210,
    });

    assert.equal(sinCtx.huellaPozo, null);
    assert.equal(sinCtx.semillaTexto, null);
    assert.equal(sinCtx.tiempoSegundos, null);
    assert.equal(conCtx.huellaPozo, 'a3f10b22');
    assert.equal(conCtx.semillaTexto, 'ensayo-1');
    assert.equal(conCtx.tiempoSegundos, 4210);

    // Ningún cálculo depende del contexto: el resto de campos es idéntico.
    const sinTrazabilidad = function (r) {
      const copia = Object.assign({}, r);
      delete copia.huellaPozo;
      delete copia.semillaTexto;
      delete copia.tiempoSegundos;
      return copia;
    };
    assert.deepEqual(sinTrazabilidad(sinCtx), sinTrazabilidad(conCtx));
  });

  it('criterio 48ter: omitidas cuenta solo las puntuables; sinResponder cubre todas (hallazgo 10)', function () {
    const preguntas = [
      preguntaSintetica('normal-1'),
      preguntaSintetica('piloto-1', { sin_puntaje: true }),
      preguntaSintetica('sinclave-1', { alternativa_correcta: null, estado_respuesta: 'sin_clave' }),
    ];
    const r = D.calcularResultado(preguntas, {});

    assert.equal(r.omitidas, 1);
    assert.equal(r.puntuables, 1);
    assert.equal(r.sinResponder, 3, 'el contador aparte de RF-7.1, no omitidas');

    // El caso de la pantalla: 65 preguntas y ninguna respuesta.
    const completo = D.calcularResultado(ENSAYO, {});
    assert.equal(completo.sinResponder, 65);
    assert.equal(completo.omitidas, completo.puntuables);
  });

  it('hallazgo 14: porcentaje va SIN redondear, en Resultado y en agruparPor', function () {
    const preguntas = [
      preguntaSintetica('p-1', { eje: 'numeros' }),
      preguntaSintetica('p-2', { eje: 'numeros' }),
      preguntaSintetica('p-3', { eje: 'numeros' }),
    ];
    const r = D.calcularResultado(preguntas, { 'p-1': 'A' });
    assert.equal(r.porcentaje, (1 / 3) * 100);
    assert.equal(r.porEje[0].porcentaje, (1 / 3) * 100);
    assert.notEqual(r.porcentaje, 33.3, 'el redondeo a un decimal es de app.js');
  });

  it('hallazgo 13: agruparPor lee entrada.pregunta[campo] y ordena por porcentaje', function () {
    const r = D.calcularResultado(ENSAYO, todasCorrectas(ENSAYO));

    // Si leyera entrada[campo] saldría un único grupo con clave undefined.
    assert.ok(r.porContenido.length > 1);
    assert.equal(r.porHabilidad.length, new Set(ENSAYO.map(function (p) { return p.habilidad; })).size);

    const grupos = D.agruparPor(r.detalle, 'eje');
    const visibles = grupos.filter(function (g) { return g.porcentaje !== null; });
    visibles.forEach(function (g, i) {
      if (i > 0) assert.ok(visibles[i - 1].porcentaje <= g.porcentaje, 'ascendente');
    });
    const primerNull = grupos.findIndex(function (g) { return g.porcentaje === null; });
    if (primerNull !== -1) {
      assert.deepEqual(
        grupos.slice(primerNull).filter(function (g) { return g.porcentaje !== null; }),
        [],
        'los null van todos al final'
      );
    }

    // Empates resueltos por clave ascendente.
    const empate = D.agruparPor([
      { pregunta: { eje: 'numeros' }, puntuable: true, estado: 'correcta' },
      { pregunta: { eje: 'algebra_y_funciones' }, puntuable: true, estado: 'correcta' },
      { pregunta: { eje: 'geometria' }, puntuable: true, estado: 'correcta' },
    ], 'eje');
    assert.deepEqual(empate.map(function (g) { return g.clave; }),
      ['algebra_y_funciones', 'geometria', 'numeros']);
  });
});

/** Respuestas arbitrarias (válidas, ajenas o ausentes) para las 65 del ensayo. */
function respuestasArbitrarias() {
  return fc
    .array(fc.constantFrom('A', 'B', 'C', 'D', 'Z', null), { minLength: 65, maxLength: 65 })
    .map(function (lista) {
      const respuestas = {};
      lista.forEach(function (valor, i) {
        if (valor !== null) respuestas[ENSAYO[i].id] = valor;
      });
      return respuestas;
    });
}

// ===========================================================================
describe('cronómetro', function () {
  const INICIO = 1700000000000;

  it('criterio 53: formatearTiempo da H:MM:SS', function () {
    assert.equal(D.formatearTiempo(8400), '2:20:00');
    assert.equal(D.formatearTiempo(0), '0:00:00');
    assert.equal(D.formatearTiempo(59), '0:00:59');
    assert.equal(D.formatearTiempo(-5), '0:00:00', 'nunca negativo en pantalla');
    assert.equal(D.LIMITE_OFICIAL_SEGUNDOS, 8400);
  });

  it('criterio 54: calcularRestante llega a 0 y no baja de ahí', function () {
    assert.equal(D.calcularRestante(INICIO, INICIO + 8400001, 8400), 0);
    assert.equal(D.calcularRestante(INICIO, INICIO + 99999999, 8400), 0);
    assert.equal(D.calcularRestante(INICIO, INICIO, 8400), 8400);
    assert.equal(D.calcularTranscurrido(INICIO, INICIO - 5000), 0, 'ni transcurrido negativo');
  });

  it('criterio 55: con límite null el restante es null y el transcurrido sigue subiendo', function () {
    assert.equal(D.calcularRestante(INICIO, INICIO + 60000, null), null);
    assert.equal(D.calcularTranscurrido(INICIO, INICIO + 60000), 60);
    assert.equal(D.calcularTranscurrido(INICIO, INICIO + 9000000), 9000);
  });

  it('criterio 55bis: umbralAviso detecta el CRUCE, no la igualdad', function () {
    assert.equal(D.umbralAviso(1805, 1783), 1800, 'el caso real: el reloj salta segundos');
    assert.equal(D.umbralAviso(1850, 1810), null);
    assert.equal(D.umbralAviso(700, 50), 600, 'el mayor de los cruzados en un salto grande');
    assert.equal(D.umbralAviso(1800, 1799), null, 'ya se había cruzado antes');
    assert.equal(D.umbralAviso(null, 1783), null, 'modo ilimitado');
    assert.equal(D.umbralAviso(61, 60), 60);
  });

  it('criterio 55ter: registrarTick filtra el anuncio repetido', function () {
    // El enunciado del criterio pide que la PRIMERA llamada devuelva 1800 y
    // deje restanteAnterior === 1805; medido, inicio+6_595_000 da restante
    // 1805, que todavía está POR ENCIMA de 1800, así que el cruce ocurre en la
    // llamada siguiente (1783). Manda la medición, como en el criterio 30ter.
    const base = estadoEnCurso({ limiteSegundos: 8400 });
    assert.equal(base.restanteAnterior, 8400);

    const t1 = D.registrarTick(base, INICIO + 6595000);
    assert.equal(t1.estado.restanteAnterior, 1805);
    assert.equal(t1.umbralCruzado, null, '1805 > 1800: aún no cruza');
    assert.deepEqual(t1.estado.umbralesAnunciados, []);

    const t2 = D.registrarTick(t1.estado, INICIO + 6617000);
    assert.equal(t2.estado.restanteAnterior, 1783);
    assert.equal(t2.umbralCruzado, 1800);
    assert.deepEqual(t2.estado.umbralesAnunciados, [1800]);

    // Mismo cruce, estado con 1800 ya anunciado: no se repite el anuncio
    // aunque umbralAviso(1805, 1783) siga valiendo 1800.
    const yaAnunciado = Object.assign({}, t1.estado, { umbralesAnunciados: [1800] });
    assert.equal(D.umbralAviso(1805, 1783), 1800);
    assert.equal(D.registrarTick(yaAnunciado, INICIO + 6617000).umbralCruzado, null);

    // Dos ticks dentro del mismo segundo: el segundo no anuncia nada.
    const t3 = D.registrarTick(t2.estado, INICIO + 6617400);
    assert.equal(t3.umbralCruzado, null);

    // expirado solo cuando el restante llega a 0.
    assert.equal(t2.expirado, false);
    const fin = D.registrarTick(t2.estado, INICIO + 8400000);
    assert.equal(fin.expirado, true);
    assert.equal(fin.estado.restanteAnterior, 0);

    // Modo ilimitado: ni umbrales ni expiración.
    const libre = D.registrarTick(estadoEnCurso({ limiteSegundos: null }), INICIO + 8400000);
    assert.equal(libre.umbralCruzado, null);
    assert.equal(libre.expirado, false);
    assert.equal(libre.estado.restanteAnterior, null);
  });

  it('hallazgo 4: restanteAnterior arranca en el límite, no en null', function () {
    // 1700: el ensayo arranca ya por debajo de 1800, así que ese umbral no se
    // anuncia nunca y el primero que se cruza es 600.
    const corto = estadoEnCurso({ limiteSegundos: 1700 });
    assert.equal(corto.restanteAnterior, 1700);
    assert.equal(D.registrarTick(corto, INICIO + 20000).umbralCruzado, null);
    assert.equal(D.registrarTick(corto, INICIO + 1100000).umbralCruzado, 600);

    // 1810: el caso que DISCRIMINA la inicialización. Con restanteAnterior en
    // null, este tick se iría por la rama de ilimitado y el aviso desaparecería.
    const justo = estadoEnCurso({ limiteSegundos: 1810 });
    assert.equal(justo.restanteAnterior, 1810);
    const tick = D.registrarTick(justo, INICIO + 20000);
    assert.equal(tick.estado.restanteAnterior, 1790);
    assert.equal(tick.umbralCruzado, 1800);

    // Sin límite, null es el centinela EXCLUSIVO de "ilimitado".
    assert.equal(estadoEnCurso({ limiteSegundos: null }).restanteAnterior, null);
  });
});

// ===========================================================================
describe('estado', function () {
  const INICIO = 1700000000000;

  it('crearEstadoInicial deja fase configuracion, pozo de 194 y nada de ensayo', function () {
    const estado = D.crearEstadoInicial(banco);
    assert.equal(estado.fase, 'configuracion');
    assert.equal(estado.pozo.length, 194);
    assert.deepEqual(estado.preguntas, []);
    assert.deepEqual(estado.respuestas, {});
    assert.deepEqual(estado.marcadas, []);
    assert.deepEqual(estado.avisos, []);
    assert.equal(estado.resultado, null);
    assert.equal(estado.inicioMs, null);
    assert.equal(estado.restanteAnterior, null);
    assert.equal(estado.config.limiteSegundos, 8400);
    assert.equal(estado.huellaPozo, '0f02f2af', 'huella medida del pozo de 194');
  });

  it('hallazgo 4: contrato completo de iniciarEnsayo', function () {
    const base = D.crearEstadoInicial(banco);
    const config = D.prepararConfig({ semillaTexto: 'ensayo-1' }).config;
    const estado = D.iniciarEnsayo(base, config, INICIO);

    assert.equal(estado.fase, 'en_curso');
    assert.equal(estado.config, config, 'recibe el config ya preparado, no lo rehace');
    assert.equal(estado.config.semilla, D.hashSemilla('ensayo-1'));
    assert.deepEqual(estado.preguntas.map(function (p) { return p.id; }),
      ENSAYO.map(function (p) { return p.id; }), 'generarEnsayo(pozo, config.semilla, CUOTAS_EJE)');
    assert.equal(estado.indice, 0);
    assert.deepEqual(estado.respuestas, {});
    assert.deepEqual(estado.marcadas, []);
    assert.equal(estado.inicioMs, INICIO);
    assert.equal(estado.finMs, null);
    assert.equal(estado.resultado, null);
    assert.deepEqual(estado.umbralesAnunciados, []);
    assert.equal(estado.restanteAnterior, 8400);
    assert.equal(base.fase, 'configuracion', 'pura: no toca el estado de entrada');
  });

  it('criterio 49 [prop]: responder no altera ninguna otra respuesta', function () {
    const base = estadoEnCurso();
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 64 }),
      fc.constantFrom('A', 'B', 'C', 'D'),
      fc.integer({ min: 0, max: 64 }),
      fc.constantFrom('A', 'B', 'C', 'D'),
      function (i, alt, j, alt2) {
        const uno = D.responder(base, base.preguntas[i].id, alt);
        const dos = D.responder(uno, base.preguntas[j].id, alt2);
        return Object.keys(uno.respuestas).every(function (id) {
          return id === base.preguntas[j].id || dos.respuestas[id] === uno.respuestas[id];
        });
      }
    ), { numRuns: 40 });

    // Un id de alternativa que no es de esa pregunta se ignora sin cambiar nada.
    const sinCambio = D.responder(base, base.preguntas[0].id, 'Z');
    assert.equal(sinCambio, base);
    assert.equal(D.responder(base, 'no-existe', 'A'), base);
  });

  it('criterio 49bis [prop]: limpiarRespuesta solo borra la suya', function () {
    const base = estadoEnCurso();
    fc.assert(fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 64 }), { minLength: 1, maxLength: 8 }),
      fc.integer({ min: 0, max: 64 }),
      function (indices, aBorrar) {
        let estado = base;
        indices.forEach(function (i) { estado = D.responder(estado, base.preguntas[i].id, 'A'); });
        const idBorrado = base.preguntas[aBorrar].id;
        const limpio = D.limpiarRespuesta(estado, idBorrado);

        if (Object.prototype.hasOwnProperty.call(limpio.respuestas, idBorrado)) return false;
        return Object.keys(estado.respuestas).every(function (id) {
          return id === idBorrado || limpio.respuestas[id] === estado.respuestas[id];
        });
      }
    ), { numRuns: 40 });

    assert.equal(D.limpiarRespuesta(base, base.preguntas[0].id), base, 'nada que borrar');
  });

  it('criterio 50 [prop]: irAIndice CONSERVA respuestas y marcas', function () {
    const base = estadoEnCurso();
    const conDatos = D.alternarMarca(
      D.responder(D.responder(base, base.preguntas[0].id, 'A'), base.preguntas[5].id, 'C'),
      base.preguntas[5].id
    );

    fc.assert(fc.property(fc.integer({ min: -5, max: 70 }), function (i) {
      const movido = D.irAIndice(conDatos, i);
      return JSON.stringify(movido.respuestas) === JSON.stringify(conDatos.respuestas) &&
        JSON.stringify(movido.marcadas) === JSON.stringify(conDatos.marcadas);
    }), { numRuns: 50 });

    assert.equal(D.irAIndice(conDatos, 64).indice, 64);
    assert.equal(D.irAIndice(conDatos, 65), conDatos, 'fuera de rango: sin cambio');
    assert.equal(D.irAIndice(conDatos, -1), conDatos);
  });

  it('criterio 51 [prop]: alternarMarca dos veces devuelve el conjunto original', function () {
    const base = estadoEnCurso();
    fc.assert(fc.property(fc.integer({ min: 0, max: 64 }), function (i) {
      const id = base.preguntas[i].id;
      const dos = D.alternarMarca(D.alternarMarca(base, id), id);
      return JSON.stringify(dos.marcadas) === JSON.stringify(base.marcadas);
    }), { numRuns: 40 });

    const marcado = D.alternarMarca(base, base.preguntas[3].id);
    assert.deepEqual(marcado.marcadas, [base.preguntas[3].id]);
    assert.equal(D.alternarMarca(base, 'no-existe'), base);
  });

  it('criterio 52 [prop]: los índices nunca salen de [0, 64]', function () {
    fc.assert(fc.property(fc.integer({ min: -10, max: 80 }), function (i) {
      const sig = D.calcularSiguienteIndice(i, 65);
      const ant = D.calcularIndiceAnterior(i, 65);
      return sig >= 0 && sig <= 64 && ant >= 0 && ant <= 64;
    }), { numRuns: 60 });

    assert.equal(D.calcularSiguienteIndice(64, 65), 64);
    assert.equal(D.calcularIndiceAnterior(0, 65), 0);
    assert.equal(D.puedeAvanzar(64, 65), false);
    assert.equal(D.puedeAvanzar(63, 65), true);
    assert.equal(D.puedeRetroceder(0), false);
    assert.equal(D.puedeRetroceder(1), true);
    assert.equal(D.formatoProgreso(0, 65), 'Pregunta 1 de 65');
  });

  it('resumenAvance cuenta respondidas, marcadas y pendientes', function () {
    const base = estadoEnCurso();
    assert.deepEqual(D.resumenAvance(base), { respondidas: 0, marcadas: 0, pendientes: 65 });

    const conDatos = D.alternarMarca(
      D.responder(base, base.preguntas[0].id, 'A'),
      base.preguntas[1].id
    );
    assert.deepEqual(D.resumenAvance(conDatos), { respondidas: 1, marcadas: 1, pendientes: 64 });
  });

  it('criterio 55quater: aplicarFiltroPozo reconstruye pozo, descartes y huella', function () {
    const base = D.crearEstadoInicial(banco);
    const filtrado = D.aplicarFiltroPozo(base, true);

    assert.equal(filtrado.pozo.length, 140);
    assert.equal(filtrado.config.soloVerificadas, true);
    assert.equal(filtrado.descartes.prueba_incompleta, 42);
    assert.equal(filtrado.descartes.prueba_no_verificada, 65);
    assert.equal(filtrado.descartes.figura_requerida, 35);
    assert.notEqual(filtrado.huellaPozo, base.huellaPozo);
    assert.equal(filtrado.huellaPozo, '507e1c72', 'huella medida del pozo de 140');

    const ida = D.aplicarFiltroPozo(filtrado, false);
    assert.equal(ida.pozo.length, 194);
    assert.equal(ida.huellaPozo, base.huellaPozo, 'ida y vuelta estable');
    assert.deepEqual(ida.descartes, base.descartes);

    // En otra fase no toca nada: cambiar el pozo a mitad de ensayo invalidaría
    // la trazabilidad del resultado.
    const enCurso = estadoEnCurso();
    assert.equal(D.aplicarFiltroPozo(enCurso, true), enCurso);
    const resultados = D.finalizar(enCurso, INICIO + 1000);
    assert.equal(D.aplicarFiltroPozo(resultados, true), resultados);
  });

  it('criterio 55quinquies: prepararConfig, fila por fila de §7.14', function () {
    // semilla: trim, y es el único sitio que la hashea.
    const limpia = D.prepararConfig({ semillaTexto: '  ensayo-1  ' });
    assert.equal(limpia.config.semillaTexto, 'ensayo-1');
    assert.equal(limpia.config.semilla, 1111415704);
    assert.deepEqual(limpia.avisos, []);

    // semilla > 64: se trunca, se avisa, y se REHASHEA del texto truncado.
    const larga = 'x'.repeat(100);
    const truncada = D.prepararConfig({ semillaTexto: larga });
    assert.equal(truncada.config.semillaTexto, 'x'.repeat(64));
    assert.equal(truncada.config.semilla, D.hashSemilla('x'.repeat(64)));
    assert.deepEqual(truncada.avisos.map(function (a) { return a.codigo; }), ['semilla_truncada']);

    // semilla vacía: String(Date.now()), sin aviso.
    const vacia = D.prepararConfig({ semillaTexto: '   ' });
    assert.match(vacia.config.semillaTexto, /^\d{13}$/);
    assert.equal(vacia.config.semilla, D.hashSemilla(vacia.config.semillaTexto));
    assert.deepEqual(vacia.avisos, []);
    assert.deepEqual(D.prepararConfig({}).avisos, []);

    // verificadas: los 4 literales de la URL y los dos booleanos del formulario.
    [['1', true], ['true', true], ['0', false], ['false', false], [true, true], [false, false]]
      .forEach(function (par) {
        const r = D.prepararConfig({ semillaTexto: 's', verificadas: par[0] });
        assert.equal(r.config.soloVerificadas, par[1], String(par[0]));
        assert.deepEqual(r.avisos, []);
      });
    const malVerificadas = D.prepararConfig({ semillaTexto: 's', verificadas: 'si' });
    assert.equal(malVerificadas.config.soloVerificadas, false);
    assert.deepEqual(malVerificadas.avisos.map(function (a) { return a.codigo; }), ['url_invalida']);
    assert.equal(malVerificadas.avisos[0].datos.parametro, 'verificadas');

    // tiempo: misma forma desde la URL y desde el formulario (hallazgo 3).
    assert.equal(D.prepararConfig({ semillaTexto: 's', tiempo: 'ilimitado' }).config.limiteSegundos, null);
    assert.equal(D.prepararConfig({ semillaTexto: 's', tiempo: 8400 }).config.limiteSegundos, 8400);
    assert.equal(D.prepararConfig({ semillaTexto: 's', tiempo: '1810' }).config.limiteSegundos, 1810);
    assert.equal(D.prepararConfig({ semillaTexto: 's', tiempo: 60 }).config.limiteSegundos, 60);
    assert.equal(D.prepararConfig({ semillaTexto: 's', tiempo: 36000 }).config.limiteSegundos, 36000);
    // null es "campo ausente" y mapea al límite oficial SIN aviso.
    const ausente = D.prepararConfig({ semillaTexto: 's', tiempo: null });
    assert.equal(ausente.config.limiteSegundos, 8400);
    assert.deepEqual(ausente.avisos, []);
    [59, 36001, 'mañana', '12.5', ''].forEach(function (valor) {
      const r = D.prepararConfig({ semillaTexto: 's', tiempo: valor });
      assert.equal(r.config.limiteSegundos, 8400, String(valor));
      assert.deepEqual(r.avisos.map(function (a) { return a.codigo; }), ['url_invalida']);
      assert.equal(r.avisos[0].datos.parametro, 'tiempo');
    });

    // notacion: igual que verificadas (RF-9.5).
    assert.equal(D.prepararConfig({ semillaTexto: 's', notacion: 'true' }).config.notacionOriginal, true);
    assert.equal(D.prepararConfig({ semillaTexto: 's', notacion: null }).config.notacionOriginal, false);
    const malNotacion = D.prepararConfig({ semillaTexto: 's', notacion: 'quizá' });
    assert.equal(malNotacion.config.notacionOriginal, false);
    assert.deepEqual(malNotacion.avisos.map(function (a) { return a.codigo; }), ['url_invalida']);

    // Varios parámetros inválidos a la vez: un aviso por parámetro, ninguno fatal.
    const todoMal = D.prepararConfig({ semillaTexto: larga, verificadas: 'x', tiempo: 'x', notacion: 'x' });
    assert.deepEqual(todoMal.avisos.map(function (a) { return a.codigo; }),
      ['semilla_truncada', 'url_invalida', 'url_invalida', 'url_invalida']);
    todoMal.avisos.forEach(function (a) {
      assert.equal(D.CODIGOS_AVISO.has(a.codigo), true, a.codigo);
      assert.equal(a.severidad, 'aviso');
    });

    // No lanza NUNCA, con cualquier entrada.
    fc.assert(fc.property(fc.anything(), fc.anything(), fc.anything(), fc.anything(),
      function (a, b, c, d) {
        const r = D.prepararConfig({ semillaTexto: a, verificadas: b, tiempo: c, notacion: d });
        return typeof r.config.semilla === 'number' &&
          typeof r.config.soloVerificadas === 'boolean' &&
          typeof r.config.notacionOriginal === 'boolean' &&
          (r.config.limiteSegundos === null || Number.isInteger(r.config.limiteSegundos));
      }), { numRuns: 60 });
    assert.doesNotThrow(function () { D.prepararConfig(null); });
    assert.doesNotThrow(function () { D.prepararConfig(undefined); });
  });

  it('criterio 55sexies: estadoCasilla y sus 5 aria-label con N 1-based', function () {
    let estado = estadoEnCurso();
    const ids = estado.preguntas.map(function (p) { return p.id; });
    estado = D.responder(estado, ids[1], 'A');
    estado = D.alternarMarca(estado, ids[2]);
    estado = D.responder(estado, ids[3], 'B');
    estado = D.alternarMarca(estado, ids[3]);

    assert.equal(D.estadoCasilla(estado, 0), 'actual');
    assert.equal(D.estadoCasilla(estado, 1), 'respondida');
    assert.equal(D.estadoCasilla(estado, 2), 'marcada');
    assert.equal(D.estadoCasilla(estado, 3), 'respondida_marcada');
    assert.equal(D.estadoCasilla(estado, 4), 'pendiente');

    assert.equal(D.etiquetaCasilla(estado, 0), 'Pregunta 1, actual');
    assert.equal(D.etiquetaCasilla(estado, 1), 'Pregunta 2, respondida');
    assert.equal(D.etiquetaCasilla(estado, 2), 'Pregunta 3, sin responder, marcada para revisar');
    assert.equal(D.etiquetaCasilla(estado, 3), 'Pregunta 4, respondida, marcada para revisar');
    assert.equal(D.etiquetaCasilla(estado, 4), 'Pregunta 5, sin responder');

    // 'actual' gana sobre los demás, y su etiqueta añade lo que además sea.
    const enLaMarcada = D.irAIndice(estado, 3);
    assert.equal(D.estadoCasilla(enLaMarcada, 3), 'actual');
    assert.equal(D.etiquetaCasilla(enLaMarcada, 3),
      'Pregunta 4, actual, respondida, marcada para revisar');
    assert.equal(D.etiquetaCasilla(D.irAIndice(estado, 1), 1), 'Pregunta 2, actual, respondida');
    assert.equal(D.etiquetaCasilla(D.irAIndice(estado, 2), 2),
      'Pregunta 3, actual, marcada para revisar');
  });

  it('criterio 56: finalizar es idempotente y pasa el contexto completo', function () {
    let estado = estadoEnCurso();
    estado = D.responder(estado, estado.preguntas[0].id, estado.preguntas[0].alternativa_correcta);
    const cerrado = D.finalizar(estado, INICIO + 4210000);

    assert.equal(cerrado.fase, 'resultados');
    assert.equal(cerrado.finMs, INICIO + 4210000);
    assert.equal(cerrado.resultado.huellaPozo, estado.huellaPozo);
    assert.equal(cerrado.resultado.semillaTexto, estado.config.semillaTexto);
    assert.equal(cerrado.resultado.tiempoSegundos,
      D.calcularTranscurrido(estado.inicioMs, INICIO + 4210000));
    assert.equal(cerrado.resultado.tiempoSegundos, 4210);
    assert.equal(cerrado.resultado.correctas, 1);

    const otraVez = D.finalizar(cerrado, INICIO + 9999999);
    assert.equal(otraVez, cerrado, 'mismo estado, sin recalcular');
  });

  it('hallazgo 11: alternarNotacion aplicada dos veces devuelve el config original', function () {
    const estado = estadoEnCurso();
    assert.equal(estado.config.notacionOriginal, false);

    const una = D.alternarNotacion(estado);
    assert.equal(una.config.notacionOriginal, true);
    assert.equal(una.fase, estado.fase, 'no toca nada más');
    assert.equal(una.indice, estado.indice);
    assert.equal(una.preguntas, estado.preguntas);

    const dos = D.alternarNotacion(una);
    assert.deepEqual(dos.config, estado.config);
    assert.equal(estado.config.notacionOriginal, false, 'pura: no mutó el original');
  });
});

/** Estado en fase 'en_curso' con la semilla 'ensayo-1' y el config retocado. */
function estadoEnCurso(opciones) {
  const base = D.crearEstadoInicial(banco);
  const config = Object.assign(
    D.prepararConfig({ semillaTexto: 'ensayo-1' }).config,
    opciones || {}
  );
  return D.iniciarEnsayo(base, config, 1700000000000);
}

// ===========================================================================
describe('avisos', function () {
  const CONFIG = D.prepararConfig({ semillaTexto: 'ensayo-1' }).config;
  const FIJOS = [
    'clasificacion_inferida',
    'sesgo_figuras',
    'pruebas_usadas',
    'no_es_puntaje_paes',
    'desviacion_cuota_eje',
    'mezcla_habilidades',
  ];

  it('criterio 57: las 6 advertencias fijas, con 6 códigos distintos y severidad info', function () {
    const avisos = D.construirAvisos(banco, POZO.pozo, POZO, CONFIG);
    const fijos = avisos.filter(function (a) { return a.severidad === 'info'; });

    assert.deepEqual(fijos.map(function (a) { return a.codigo; }), FIJOS);
    assert.equal(new Set(fijos.map(function (a) { return a.codigo; })).size, 6);
    fijos.forEach(function (a) {
      assert.equal(D.CODIGOS_AVISO.has(a.codigo), true, a.codigo);
      assert.ok(a.texto.length > 0, a.codigo);
    });

    // Dueño único (hallazgo 8): construirAvisos NO reemite los avisos de
    // referencia de validarBanco, que hoy son 0.
    ['figura_rota', 'figura_huerfana', 'figura_invalida', 'figura_alternativa_incoherente']
      .forEach(function (codigo) {
        assert.equal(avisos.filter(function (a) { return a.codigo === codigo; }).length, 0, codigo);
      });

    // De los dos motivos de descarte de los que SÍ es dueña, el banco actual
    // solo tiene prueba_incompleta (42); esquema_invalido es 0 y no se emite.
    // El criterio dice "0 avisos de integridad" dando por hecho que los
    // descartes no producen ninguno; medido, los 42 de la prueba incompleta
    // existen y callarlos sería perder la fila de §7.15 que los declara.
    const integridad = avisos.filter(function (a) { return a.severidad === 'aviso'; });
    assert.deepEqual(integridad.map(function (a) { return a.codigo; }), ['prueba_incompleta']);
    assert.equal(integridad[0].conteo, 42);
    assert.equal(integridad[0].datos.ids.length, 42);
    assert.equal(avisos.length, 7);
  });

  it('criterio 57bis: pruebas_usadas con datos estructurado y suma exacta', function () {
    const delEnsayo = D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG, ENSAYO)
      .find(function (a) { return a.codigo === 'pruebas_usadas'; });

    const porPrueba = delEnsayo.datos.porPrueba;
    assert.equal(porPrueba.reduce(function (acc, f) { return acc + f.n; }, 0), 65);
    const presentes = new Set(ENSAYO.map(function (p) { return p.prueba_id; }));
    assert.deepEqual(new Set(porPrueba.map(function (f) { return f.prueba_id; })), presentes);
    porPrueba.forEach(function (f, i) {
      if (i > 0) assert.ok(porPrueba[i - 1].n >= f.n, 'orden descendente por n');
      assert.equal(f.verificada, D.PRUEBAS_VERIFICADAS_CIEGO.has(f.prueba_id));
    });
    assert.equal(delEnsayo.datos.ambito, 'ensayo');

    // Sin el quinto parámetro describe el POZO, con el mismo código.
    const delPozo = D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG)
      .find(function (a) { return a.codigo === 'pruebas_usadas'; });
    assert.equal(delPozo.datos.ambito, 'pozo');
    assert.equal(delPozo.datos.porPrueba.reduce(function (acc, f) { return acc + f.n; }, 0), 194);
    assert.notEqual(delPozo.texto, delEnsayo.texto, 'solo cambia el texto y el detalle');

    // Los 6 códigos fijos son los mismos con y sin ensayo.
    const codigos = function (lista) {
      return lista.filter(function (a) { return a.severidad === 'info'; })
        .map(function (a) { return a.codigo; });
    };
    assert.deepEqual(
      codigos(D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG, ENSAYO)),
      codigos(D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG))
    );
  });

  it('criterio 57ter: mezcla_habilidades trae los 4 conteos y los 4 rangos', function () {
    const conEnsayo = D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG, ENSAYO)
      .find(function (a) { return a.codigo === 'mezcla_habilidades'; });

    const suma = Object.keys(conEnsayo.datos.ensayo).reduce(function (acc, k) {
      return acc + conEnsayo.datos.ensayo[k];
    }, 0);
    assert.equal(suma, 65);
    assert.equal(Object.keys(conEnsayo.datos.ensayo).length, 4);
    assert.deepEqual(new Set(Object.keys(conEnsayo.datos.rangos)), D.HABILIDADES_M1);
    Object.keys(conEnsayo.datos.rangos).forEach(function (h) {
      assert.deepEqual(conEnsayo.datos.rangos[h], D.RANGOS_T24I[h]);
    });

    // Los conteos del pozo se LEEN del pozo recibido, no están en el texto.
    assert.equal(conEnsayo.datos.pozo.resolver_problemas, 137);
    assert.equal(conEnsayo.datos.pozo.representar, 16);
    assert.ok(conEnsayo.texto.indexOf('137 de 194') !== -1, 'derivado, no escrito a mano');

    // Con preguntasEnsayo === null el aviso existe igual, con los del pozo.
    const soloPozo = D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG)
      .find(function (a) { return a.codigo === 'mezcla_habilidades'; });
    assert.equal(soloPozo.datos.ensayo, null);
    assert.deepEqual(soloPozo.datos.pozo, conEnsayo.datos.pozo);

    // Y el mismo mecanismo derivado en la quinta: la cuota de álgebra es la
    // única de las 4 fuera del rango de T24I.
    const cuotas = D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG)
      .find(function (a) { return a.codigo === 'desviacion_cuota_eje'; });
    assert.deepEqual(cuotas.datos.desviaciones, [
      { eje: 'algebra_y_funciones', cuota: 19, rango: [9, 18] },
    ]);
  });

  it('criterio 58: las cifras de sesgo_figuras salen de descartes y del pozo', function () {
    const antes = D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG)
      .find(function (a) { return a.codigo === 'sesgo_figuras'; });
    assert.equal(antes.datos.excluidas, POZO.descartes.figura_requerida);
    assert.equal(antes.datos.excluidas, 46);
    const geoAntes = antes.datos.porEje.find(function (f) { return f.eje === 'geometria'; });
    assert.deepEqual(geoAntes, { eje: 'geometria', enBanco: 46, utilizables: 32 });

    // Banco de prueba con las figuras de geometría ya extraídas: la cifra baja
    // sola, sin ningún número escrito a mano.
    const conImagenes = clonar(banco);
    const deGeometria = new Set(conImagenes.preguntas
      .filter(function (p) { return p.eje === 'geometria'; })
      .map(function (p) { return p.id; }));
    conImagenes.figuras.forEach(function (f) {
      if (deGeometria.has(f.pregunta_id)) {
        f.archivo = f.id + '.png';
        f.estado = 'extraida';
      }
    });

    const pozoNuevo = D.construirPozo(conImagenes, { soloVerificadas: false });
    const despues = D.construirAvisos(conImagenes, pozoNuevo.pozo, pozoNuevo.descartes, CONFIG)
      .find(function (a) { return a.codigo === 'sesgo_figuras'; });
    const geoDespues = despues.datos.porEje.find(function (f) { return f.eje === 'geometria'; });

    assert.ok(despues.datos.excluidas < antes.datos.excluidas, 'baja la cifra de excluidas');
    assert.equal(despues.datos.excluidas, pozoNuevo.descartes.figura_requerida);
    assert.ok(geoDespues.utilizables > geoAntes.utilizables, 'geometría gana utilizables');
    assert.equal(geoDespues.enBanco, 46, 'el banco no cambia de tamaño');
  });

  it('criterio 59: agregarAvisos agrupa por código con el conteo y el orden', function () {
    const malformados = [];
    for (let i = 0; i < 30; i += 1) {
      malformados.push({
        codigo: 'marcador_malformado',
        severidad: 'aviso',
        texto: 'Un marcador de figura mal formado se muestra literal.',
        detalle: 'p-' + i,
        datos: { ids: ['p-' + i] },
      });
    }
    const url = {
      codigo: 'url_invalida',
      severidad: 'aviso',
      texto: 'Se ignoró un parámetro de la URL.',
      datos: { parametro: 'tiempo' },
    };
    const fijos = D.construirAvisos(banco, POZO.pozo, POZO.descartes, CONFIG)
      .filter(function (a) { return a.severidad === 'info'; });

    const agregados = D.agregarAvisos(malformados.concat([url]).concat(fijos));

    assert.equal(agregados.length, 8);
    assert.deepEqual(agregados.map(function (a) { return a.codigo; }),
      ['marcador_malformado', 'url_invalida'].concat(FIJOS), 'orden de primera aparición');

    const grupo = agregados[0];
    assert.equal(grupo.conteo, 30);
    assert.equal(grupo.severidad, 'aviso', 'la severidad del primero del grupo');
    assert.ok(grupo.detalle.indexOf('p-0') !== -1 && grupo.detalle.indexOf('p-29') !== -1);
    assert.equal(grupo.datos.ids.length, 30);

    // Las 6 fijas quedan intactas, sin conteo añadido.
    assert.deepEqual(agregados.slice(2), fijos);
    agregados.forEach(function (a) {
      assert.equal(D.CODIGOS_AVISO.has(a.codigo), true, a.codigo);
    });

    // Mezcla de avisos individuales y ya agregados: conteo = Σ(conteo ?? 1).
    const yaAgregado = {
      codigo: 'marcador_malformado',
      severidad: 'aviso',
      texto: 'Un marcador de figura mal formado se muestra literal.',
      conteo: 4,
      datos: { ids: ['p-100'] },
    };
    const mezcla = D.agregarAvisos(malformados.concat([yaAgregado]));
    assert.equal(mezcla.length, 1);
    assert.equal(mezcla[0].conteo, 34);

    assert.deepEqual(D.agregarAvisos([]), []);
  });

  it('criterio 59bis: recolectarAvisosDeContenido da 1 aviso en el pozo de 194', function () {
    const avisos = D.recolectarAvisosDeContenido(POZO.pozo);

    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].codigo, 'tabla_sin_cabecera');
    assert.deepEqual(avisos[0].datos.ids, ['m1-reg24-059']);
    assert.equal(avisos[0].severidad, 'aviso');
    assert.equal(D.CODIGOS_AVISO.has(avisos[0].codigo), true);

    // Los otros cinco códigos del tokenizador tienen 0 casos medidos.
    ['dolar_impar', 'marcador_malformado', 'marcador_inline', 'tabla_sin_separadora',
      'tabla_fila_irregular'].forEach(function (codigo) {
      assert.equal(avisos.filter(function (a) { return a.codigo === codigo; }).length, 0, codigo);
    });

    // Y el barrido mira de verdad el contenido: con una pregunta sintética
    // rota, el aviso sale con el id de ESA pregunta.
    const rota = preguntaSintetica('p-rota', { enunciado: 'Cuesta $5 y sobra $x$.' });
    const conRota = D.recolectarAvisosDeContenido([rota]);
    assert.deepEqual(conRota.map(function (a) { return a.codigo; }), ['dolar_impar']);
    assert.deepEqual(conRota[0].datos.ids, ['p-rota']);
    assert.equal(conRota[0].datos.campo, 'enunciado');
  });
});

// ===========================================================================
describe('exportación', function () {
  it('dominio.js exporta por CommonJS y no usa el DOM para su lógica', function () {
    assert.equal(typeof D, 'object');
    ['motivosInvalidez', 'validarPreguntaM1', 'construirPozo', 'generarEnsayo', 'huellaPozo']
      .forEach(function (nombre) {
        assert.equal(typeof D[nombre], 'function', nombre);
      });

    const fuente = require('node:fs').readFileSync(require.resolve('./dominio.js'), 'utf8');
    const cuerpo = fuente.slice(0, fuente.indexOf('// ---- Exportación'));
    assert.equal(/\bdocument\b/.test(cuerpo), false, 'dominio.js no puede tocar el DOM');
    assert.equal(/\bwindow\b/.test(cuerpo), false, 'window solo en el bloque de export');
  });
});
