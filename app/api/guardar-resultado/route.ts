import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(req: Request) {
  try {
    const { estudiante_email, seccion, titulo_examen, correctas, total_preguntas } = await req.json();

    // Validar datos de entrada obligatorios
    if (!estudiante_email || !seccion || correctas === undefined || !total_preguntas) {
      return NextResponse.json(
        { error: 'Faltan datos obligatorios del estudiante o de la evaluación.' },
        { status: 400 }
      );
    }

    // Cálculo matemático estricto de la nota en escala de 0 a 20
    const notaCalculada = (correctas / total_preguntas) * 20;
    const notaFinal = parseFloat(notaCalculada.toFixed(2));

    // Guardar el historial en la tabla 'resultados'
    const { data, error } = await supabase.from('resultados').insert([
      {
        estudiante_email,
        seccion,
        titulo_examen,
        nota: notaFinal,
      },
    ]).select();

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
        estudiante: estudiante_email,
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