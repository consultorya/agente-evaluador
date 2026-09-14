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
    const seccionLimpia = seccion?.trim();

    //const { estudiante_email, seccion } = await req.json();
    //const emailLimpio = estudiante_email?.trim().toLowerCase();

    console.log('--- DIAGNÓSTICO INGRESO ESTUDIANTE ---');
    console.log('Email recibido:', emailLimpio);
    console.log('Sección recibida:', seccionLimpia);

    // Validar que ambos datos se hayan recibido antes de consultar Supabase
    if (!emailLimpio || !seccionLimpia) {
      return NextResponse.json(
        { error: 'Debes proporcionar tanto el correo como la sección.' },
        { status: 400 }
      );
    }

    //1. Validar que el estudiante esté registrado en la sección correspondiente
    const { data: estudiante, error: errorEstudiante } = await supabase
      .from('estudiantes')
      .select('*')
      .ilike('email', emailLimpio)
      .eq('seccion', seccionLimpia)
      .maybeSingle();

    if (errorEstudiante || !estudiante) {
      return NextResponse.json(
        { error: 'No estás registrado en el padrón de esta sección. Contacta al docente.' },
        { status: 403 }
      );
    }
    
    // 2. Verificar si el estudiante ya rindió la evaluación
    const { data: yaRindio } = await supabase
      .from('resultados')
      .select('id')
      .eq('estudiante_email', emailLimpio)
      .single();

    if (yaRindio) {
      return NextResponse.json({ error: 'Ya has registrado un intento para esta evaluación.' }, { status: 400 });
    }

    // 3. Verificar que el examen global esté activo
    const { data: examen, error: errorExamen } = await supabase
      .from('examenes')
      .select('titulo, activo')
      .eq('id', 1)
      .single();

    if (errorExamen || !examen || !examen.activo) {
      return NextResponse.json(
        { error: 'En este momento no hay ninguna evaluación activa.' },
        { status: 404 }
      );
    }

    // 4. Obtener las preguntas asignadas específicamente a la SECCIÓN del alumno
    const { data: datosSeccion, error: errorSeccion } = await supabase
      .from('secciones')
      .select('preguntas')
      .eq('nombre', seccion)
      .single();

    if (errorSeccion || !datosSeccion || !datosSeccion.preguntas || !Array.isArray(datosSeccion.preguntas) || datosSeccion.preguntas.length === 0) {
      return NextResponse.json({
        error: 'No hay preguntas asignadas para tu sección. Notifica al docente.',
      }, { status: 400 });
    }

    // 5. Aleatorizar el orden de las preguntas y de las opciones para este alumno
    const preguntasAleatorias = mezclarArreglo(datosSeccion.preguntas as any[]).map((p) => ({
      ...p,
      opciones: p.opciones ? mezclarArreglo(p.opciones) : [],
    }));

    return NextResponse.json({
      titulo: examen.titulo || 'Evaluación de Clase',
      preguntas: preguntasAleatorias,
    });

  } catch (err: any) {
    return NextResponse.json({ error: 'Error interno al obtener la evaluación.' }, { status: 500 });
  }
}