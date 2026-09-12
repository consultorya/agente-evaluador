'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Pregunta {
  id: number;
  pregunta: string;
  opciones: string[];
  respuestaCorrecta: number;
  explicacion: string;
}

interface SeccionBD {
  id: number | string;
  nombre: string;
}

export default function StudentPage() {
  // Datos del alumno
  const [email, setEmail] = useState('');
  const [seccion, setSeccion] = useState('');
  const [listaSecciones, setListaSecciones] = useState<SeccionBD[]>([]);
  const [cargandoSecciones, setCargandoSecciones] = useState(true);

  // Estado del flujo
  const [paso, setPaso] = useState<'registro' | 'examen' | 'resultado'>('registro');
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Examen y respuestas
  const [tituloExamen, setTituloExamen] = useState('');
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [respuestasUsuario, setRespuestasUsuario] = useState<{ [key: number]: number }>({});

  // Calificación final y temporizador de salida
  const [notaFinal, setNotaFinal] = useState<number | null>(null);
  const [correctas, setCorrectas] = useState(0);
  const [tiempoRestante, setTiempoRestante] = useState(60);

  // Cargar lista de secciones desde la tabla 'secciones' de Supabase
  useEffect(() => {
    async function obtenerSecciones() {
      const { data, error } = await supabase
        .from('secciones')
        .select('*')
        .order('nombre', { ascending: true });

      if (!error && data && data.length > 0) {
        setListaSecciones(data);
        setSeccion(data[0].nombre); // Selecciona la primera sección por defecto
      }
      setCargandoSecciones(false);
    }
    obtenerSecciones();
  }, []);

  // Función para reiniciar la página al estado inicial
  const handleReiniciarInicio = () => {
    setEmail('');
    setRespuestasUsuario({});
    setNotaFinal(null);
    setCorrectas(0);
    setPreguntas([]);
    setTituloExamen('');
    setErrorMsg('');
    setTiempoRestante(60);
    setPaso('registro');
  };

  // Temporizador automático al llegar a la pantalla de resultados
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (paso === 'resultado') {
      setTiempoRestante(60); // Iniciar en 60 segundos
      timer = setInterval(() => {
        setTiempoRestante((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleReiniciarInicio();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [paso]);

  // Iniciar el examen
  const handleIniciarExamen = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const correoLimpio = email.trim().toLowerCase();

    if (!correoLimpio.endsWith('@ucvvirtual.edu.pe')) {
      alert('Debes ingresar un correo institucional válido de la UCV (@ucvvirtual.edu.pe).');
      return;
    }

    if (!seccion) {
      alert('Por favor selecciona una sección.');
      return;
    }

    setCargando(true);
    setErrorMsg('');

    try {
      // 1. NUEVA VALIDACIÓN: Verificar si el alumno está en la lista blanca (tabla estudiantes)
      const { data: estudianteValido, error: errEstudiante } = await supabase
        .from('estudiantes')
        .select('*')
        .eq('email', correoLimpio)
        .eq('seccion', seccion)
        .single();

      if (errEstudiante || !estudianteValido) {
        setErrorMsg('Tu correo no está registrado en el padrón o no pertenece a la sección seleccionada.');
        setCargando(false);
        return;
      }

      // 2. TU CÓDIGO ORIGINAL: Obtener el examen desde la API
      const res = await fetch('/api/obtener-examen-estudiante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estudiante_email: correoLimpio }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'No se pudo cargar la evaluación.');
        setCargando(false);
        return;
      }

      // 3. SE MANTIENEN TUS ESTADOS ORIGINALES
      setTituloExamen(data.titulo);
      setPreguntas(data.preguntas);
      setPaso('examen');
    } catch (err) {
      setErrorMsg('Error de conexión al obtener el examen.');
    } finally {
      setCargando(false);
    }
  };

  // Seleccionar opción
  const handleSeleccionarOpcion = (preguntaIndex: number, opcionIndex: number) => {
    setRespuestasUsuario((prev) => ({
      ...prev,
      [preguntaIndex]: opcionIndex,
    }));
  };

  // Enviar y Calificar
  const handleFinalizarExamen = async () => {
    if (Object.keys(respuestasUsuario).length < preguntas.length) {
      if (!confirm('Aún tienes preguntas sin responder. ¿Deseas enviar el examen de todos modos?')) {
        return;
      }
    }

    setCargando(true);

    let numCorrectas = 0;
    preguntas.forEach((q, index) => {
      if (respuestasUsuario[index] === q.respuestaCorrecta) {
        numCorrectas++;
      }
    });

    setCorrectas(numCorrectas);

    try {
      const res = await fetch('/api/guardar-resultado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estudiante_email: email,
          seccion,
          titulo_examen: tituloExamen,
          correctas: numCorrectas,
          total_preguntas: preguntas.length,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNotaFinal(data.resultado.nota);
        setPaso('resultado');
      } else {
        alert(`Error al guardar resultado: ${data.error}`);
      }
    } catch (err) {
      alert('Error de red al guardar tu calificación.');
    } finally {
      setCargando(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="text-3xl font-extrabold text-blue-900">UCV - Evaluación Académica</h1>
        <p className="mt-2 text-sm text-gray-600">Sistema Dinámico de Evaluación Individual</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-6 shadow-md rounded-lg sm:px-10 border border-gray-100">

          {/* PASO 1: REGISTRO DEL ESTUDIANTE */}
          {paso === 'registro' && (
            <form onSubmit={handleIniciarExamen} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Correo Institucional UCV</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@ucvvirtual.edu.pe"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-800"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Sección / Grupo</label>
                {cargandoSecciones ? (
                  <p className="mt-2 text-sm text-gray-500">Cargando secciones...</p>
                ) : (
                  <select
                    value={seccion}
                    onChange={(e) => setSeccion(e.target.value)}
                    className="mt-1 w-full p-3 border rounded-lg focus:ring-blue-500 focus:border-blue-500 text-gray-800 bg-white"
                  >
                    {listaSecciones.map((sec) => (
                      <option key={sec.id} value={sec.nombre}>
                        {sec.nombre}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {errorMsg && (
                <div className="p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={cargando || cargandoSecciones}
                className="w-full py-3 bg-blue-700 text-white font-bold rounded-lg hover:bg-blue-800 transition-colors disabled:bg-gray-400"
              >
                {cargando ? 'Generando tu examen...' : 'Comenzar Evaluación'}
              </button>
            </form>
          )}

          {/* PASO 2: DESARROLLO DEL EXAMEN */}
          {paso === 'examen' && (
            <div className="space-y-8">
              <div className="border-b pb-4">
                <h2 className="text-xl font-bold text-gray-800">{tituloExamen}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Estudiante: <span className="font-semibold">{email}</span> | Sección: {seccion}
                </p>
              </div>

              <div className="space-y-6">
                {preguntas.map((q, qIdx) => (
                  <div key={q.id || qIdx} className="p-4 bg-gray-50 rounded-lg border space-y-3">
                    <p className="font-semibold text-gray-800">
                      {qIdx + 1}. {q.pregunta}
                    </p>
                    <div className="space-y-2">
                      {q.opciones.map((op, opIdx) => {
                        const seleccionada = respuestasUsuario[qIdx] === opIdx;
                        return (
                          <button
                            key={opIdx}
                            type="button"
                            onClick={() => handleSeleccionarOpcion(qIdx, opIdx)}
                            className={`w-full text-left p-3 rounded-md border text-sm transition-all ${
                              seleccionada
                                ? 'bg-blue-100 border-blue-600 font-semibold text-blue-900'
                                : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            <span className="font-bold mr-2">{String.fromCharCode(65 + opIdx)})</span> {op}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleFinalizarExamen}
                disabled={cargando}
                className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
              >
                {cargando ? 'Guardando respuestas...' : 'Finalizar y Entregar Examen'}
              </button>
            </div>
          )}

          {/* PASO 3: CALIFICACIÓN Y RETROALIMENTACIÓN */}
          {paso === 'resultado' && (
            <div className="space-y-6 text-center">
              {/* Barra del temporizador de cierre de sesión */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex justify-between items-center text-amber-800 text-sm font-medium">
                <span>⏱️ Esta pantalla se cerrará automáticamente en: <strong>{tiempoRestante}s</strong></span>
                <button
                  type="button"
                  onClick={handleReiniciarInicio}
                  className="px-3 py-1 bg-amber-600 text-white text-xs font-bold rounded hover:bg-amber-700 transition-colors"
                >
                  Salir / Inicio
                </button>
              </div>

              <h2 className="text-2xl font-bold text-gray-800">Resultado de la Evaluación</h2>

              <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                <p className="text-sm text-blue-700 uppercase font-bold tracking-wide">Calificación Final</p>
                <div className="text-5xl font-extrabold text-blue-900">{notaFinal} / 20</div>
                <p className="text-sm text-gray-600">
                  Respondiste correctamente {correctas} de {preguntas.length} preguntas.
                </p>
              </div>

              <div className="text-left space-y-4 pt-4 border-t">
                <h3 className="font-bold text-gray-700">Retroalimentación:</h3>
                {preguntas.map((q, idx) => {
                  const esCorrecta = respuestasUsuario[idx] === q.respuestaCorrecta;
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        esCorrecta ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <p className="font-semibold text-sm text-gray-800">
                        {idx + 1}. {q.pregunta}
                      </p>
                      <p className="text-xs mt-1 text-gray-600">
                        Tu respuesta:{' '}
                        <span className={esCorrecta ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                          {respuestasUsuario[idx] !== undefined
                            ? q.opciones[respuestasUsuario[idx]]
                            : 'No respondida'}
                        </span>
                      </p>
                      {!esCorrecta && (
                        <p className="text-xs mt-1 text-green-800 font-medium">
                          Respuesta correcta: {q.opciones[q.respuestaCorrecta]}
                        </p>
                      )}
                      <p className="text-xs italic mt-2 text-gray-500 bg-white p-2 rounded border">
                        💡 {q.explicacion}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Botón inferior principal de salida */}
              <div className="pt-4 border-t">
                <button
                  type="button"
                  onClick={handleReiniciarInicio}
                  className="w-full py-3 bg-gray-800 text-white font-bold rounded-lg hover:bg-gray-900 transition-colors"
                >
                  Finalizar Revisión y Volver al Inicio
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}