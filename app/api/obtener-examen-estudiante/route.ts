import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Algoritmo Fisher-Yates para mezclar aleatoriamente arreglos
function mezclarArreglo<T>(array: T[]): T[] {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const estudiante_email = body.estudiante_email || body.email;
    const seccion = body.seccion || body.seccionSeleccionada;

    const emailLimpio = estudiante_email?.trim().toLowerCase();
    const seccionEntrante = seccion?.trim() || '';

    // Extraer solo la letra o identificador clave (ej: "Sección C" -> "c", "C" -> "c")
    const letraSeccion = seccionEntrante.toLowerCase().replace('sección', '').replace('seccion', '').trim();

    console.log('--- DIAGNÓSTICO INGRESO ESTUDIANTE ---');
    console.log('Email recibido:', emailLimpio);
    console.log('Sección recibida:', seccionEntrante);
    console.log('Letra de sección extraída:', letraSeccion);

    // Validar que ambos datos se hayan recibido
    if (!emailLimpio || !seccionEntrante) {
      return NextResponse.json(
        { error: 'Debes proporcionar tanto el correo como la sección.' },
        { status: 400 }
      );
    }

    // 1. Validar que el estudiante esté registrado (búsqueda flexible por correo y sección)
    const { data: todosEstudiantes, error: errorEstudiante } = await supabase
      .from('estudiantes')
      .select('*')
      .ilike('email', emailLimpio);

    if (errorEstudiante || !todosEstudiantes || todosEstudiantes.length === 0) {
      return NextResponse.json(
        { error: 'No estás registrado en el padrón de alumnos. Contacta al docente.' },
        { status: 403 }
      );
    }

    const estudiante = todosEstudiantes.find((e) => {
      if (!e.seccion) return false;
      const secEstudiante = e.seccion.toLowerCase().replace('sección', '').replace('seccion', '').trim();
      return secEstudiante === letraSeccion;
    });

    if (!estudiante) {
      return NextResponse.json(
        { error: `No estás registrado en la ${seccionEntrante}. Contacta al docente.` },
        { status: 403 }
      );
    }

    // 2. Obtener la configuración del examen de la sección para conocer el 'titulo' actual
    const { data: todosExamenes, error: errorExamen } = await supabase
      .from('examenes')
      .select('id, titulo, activo, seccion');

    if (errorExamen || !todosExamenes) {
      return NextResponse.json(
        { error: 'Error al consultar las configuraciones de examen.' },
        { status: 500 }
      );
    }

    const examen = todosExamenes.find((ex) => {
      if (!ex.seccion) return false;
      const secExamen = ex.seccion.toLowerCase().replace('sección', '').replace('seccion', '').trim();
      return secExamen === letraSeccion;
    });

    if (!examen) {
      return NextResponse.json(
        { error: `No se encontró la configuración de examen para la ${seccionEntrante}.` },
        { status: 404 }
      );
    }

    // 3. Validar si la sección está ACTIVA
    if (!examen.activo) {
      return NextResponse.json(
        { error: `La evaluación para la ${seccionEntrante} se encuentra desactivada en este momento.` },
        { status: 403 }
      );
    }

    const tituloExamenActual = examen.titulo?.trim() || `Evaluación - ${seccionEntrante}`;

    // 4. Validar si el estudiante ya rindió ESTA EVALUACIÓN ESPECÍFICA (por Título)
    const { data: resultadosAlumno, error: errorResultados } = await supabase
      .from('resultados')
      .select('id, titulo_examen')
      .ilike('estudiante_email', emailLimpio);

    if (!errorResultados && resultadosAlumno && resultadosAlumno.length > 0) {
      const yaRindioEsteExamen = resultadosAlumno.some((res) => {
        if (!res.titulo_examen) return false;
        return res.titulo_examen.trim().toLowerCase() === tituloExamenActual.toLowerCase();
      });

      if (yaRindioEsteExamen) {
        return NextResponse.json(
          { error: `Ya has registrado un intento para la evaluación "${tituloExamenActual}".` },
          { status: 400 }
        );
      }
    }

    // 5. Obtener las preguntas desde la tabla 'secciones'
    const { data: todasLasSecciones, error: errorSecciones } = await supabase
      .from('secciones')
      .select('nombre, preguntas');

    if (errorSecciones) {
      console.error('[ERROR SUPABASE SECCIONES]:', errorSecciones);
      return NextResponse.json(
        { error: `Error al obtener las preguntas: ${errorSecciones.message}` },
        { status: 500 }
      );
    }

    const datosSeccion = todasLasSecciones?.find((s) => {
      if (!s.nombre) return false;
      const secNombre = s.nombre.toLowerCase().replace('sección', '').replace('seccion', '').trim();
      return secNombre === letraSeccion;
    });

    if (!datosSeccion || !datosSeccion.preguntas || !Array.isArray(datosSeccion.preguntas) || datosSeccion.preguntas.length === 0) {
      return NextResponse.json(
        { error: 'Aún no hay preguntas configuradas para tu sección. Notifica al docente.' },
        { status: 400 }
      );
    }

    // 6. Aleatorizar el orden de las preguntas y opciones para este alumno
    const preguntasAleatorias = mezclarArreglo(datosSeccion.preguntas as any[]).map((p) => ({
      ...p,
      opciones: p.opciones ? mezclarArreglo(p.opciones) : [],
    }));

    return NextResponse.json({
      titulo: examen.titulo || `Evaluación - ${seccionEntrante}`,
      preguntas: preguntasAleatorias,
    });

  } catch (err: any) {
    return NextResponse.json(
      { error: 'Error interno al obtener la evaluación.' },
      { status: 500 }
    );
  }
}