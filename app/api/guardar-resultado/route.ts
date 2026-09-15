import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(req: Request) {
  try {
    const { estudiante_email, seccion, titulo_examen, correctas, total_preguntas } = await req.json();

    // 1. Validar datos de entrada obligatorios (incluyendo titulo_examen)
    if (!estudiante_email || !seccion || !titulo_examen || correctas === undefined || !total_preguntas) {
      return NextResponse.json(
        { error: 'Faltan datos obligatorios del estudiante, sección, título o evaluación.' },
        { status: 400 }
      );
    }

    // 2. Normalización de cadenas para consistencia en la BD
    const emailLimpio = estudiante_email.trim().toLowerCase();
    const seccionLimpia = seccion.trim();
    const tituloLimpio = titulo_examen.trim();

    // 3. Cálculo matemático de la nota en escala de 0 a 20
    const notaCalculada = (correctas / total_preguntas) * 20;
    const notaFinal = parseFloat(notaCalculada.toFixed(2));

    // 4. Guardar el historial en la tabla 'resultados'
    const { data, error } = await supabase
      .from('resultados')
      .insert([
        {
          estudiante_email: emailLimpio,
          seccion: seccionLimpia,
          titulo_examen: tituloLimpio, // Guarda "CONTROL 1", "CONTROL 2", etc.
          nota: notaFinal,
        },
      ])
      .select();

    if (error) {
      console.error('Error al insertar resultado en Supabase:', error);
      return NextResponse.json(
        { error: `Error en la base de datos: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      mensaje: 'Evaluación registrada correctamente.',
      resultado: {
        estudiante: emailLimpio,
        seccion: seccionLimpia,
        titulo_examen: tituloLimpio,
        nota: notaFinal,
        correctas,
        total: total_preguntas,
      },
    });
  } catch (error: any) {
    console.error('Error en guardar-resultado:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar la calificación.' },
      { status: 500 }
    );
  }
}