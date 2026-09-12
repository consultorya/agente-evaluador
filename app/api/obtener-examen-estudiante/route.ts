export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(req: Request) {
  try {
    const { estudiante_email } = await req.json();

    if (!estudiante_email) {
      return NextResponse.json(
        { error: 'Por favor ingresa un correo institucional válido.' },
        { status: 400 }
      );
    }

    // 1. Obtener la configuración del examen actual
    const { data: examen, error } = await supabase
      .from('examenes')
      .select('*')
      .eq('id', 1)
      .single();

    if (error || !examen) {
      return NextResponse.json(
        { error: 'No hay ninguna evaluación configurada en el sistema.' },
        { status: 404 }
      );
    }

    // 2. Comprobar si la evaluación está ACTIVA
    if (!examen.activo) {
      return NextResponse.json(
        { error: 'La evaluación no está disponible en este momento. Consulta con tu docente.' },
        { status: 403 }
      );
    }

    // 3. VALIDACIÓN ANTI-DUPLICADOS: Verificar si el alumno ya rindiaciones para este título
    const { data: resultadoExistente } = await supabase
      .from('resultados')
      .select('id')
      .eq('estudiante_email', estudiante_email)
      .eq('titulo_examen', examen.titulo)
      .maybeSingle();

    if (resultadoExistente) {
      return NextResponse.json(
        {
          error:
            '¡Hola! Ya hemos registrado tu evaluación para este examen. Solo está permitido un intento por lectura. Si consideras que hay un error, comunícate con tu docente.',
        },
        { status: 403 }
      );
    }

    const cantidad = examen.cantidad_preguntas || 5;

    // 4. Prompt para Gemini 3.6 Flash
    const prompt = `
    Eres un evaluador académico universitario. Analiza el siguiente texto y genera exactamente ${cantidad} preguntas de opción múltiple.

    CONTENIDO DEL TEXTO/DOCUMENTO:
    """
    ${examen.texto_base}
    """

    INSTRUCCIONES DE EVALUACIÓN Y DETECCIÓN:
    1. Revisa el documento. Si ya contiene un listado o banco de preguntas explícitas, extrae exactamente ${cantidad} de esas preguntas, varía el orden entre ellas y desordena sus opciones de respuesta.
    2. Si el contenido es un texto académico continuo o lectura, redacta ${cantidad} preguntas nuevas de opción múltiple con nivel de razonamiento crítico.
    3. Cada pregunta debe contener exactamente 4 opciones de respuesta (A, B, C, D).
    4. 'respuestaCorrecta' debe ser un índice entero entre 0 y 3 (0=A, 1=B, 2=C, 3=D).
    5. Proporciona una explicación breve para la respuesta correcta.
    6. Devuelve ÚNICAMENTE un formato JSON estricto sin bloques de markdown o texto adicional, respetando esta estructura:

    {
      "preguntas": [
        {
          "id": 1,
          "pregunta": "Texto de la pregunta...",
          "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
          "respuestaCorrecta": 0,
          "explicacion": "Explicación breve..."
        }
      ]
    }
    `;

    // 5. Llamada a Gemini
    const { text } = await generateText({
      model: google('gemini-3.6-flash'),
      prompt,
    });

    if (!text) {
      return NextResponse.json(
        { error: 'No se pudo generar el cuestionario dinámico.' },
        { status: 500 }
      );
    }

    const jsonLimpio = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const datosParsed = JSON.parse(jsonLimpio);

    return NextResponse.json({
      titulo: examen.titulo,
      cantidad_preguntas: cantidad,
      preguntas: datosParsed.preguntas,
    });
  } catch (error: any) {
    console.error('Error en obtener-examen-estudiante:', error);
    return NextResponse.json(
      { error: error.message || 'Error al generar el examen personalizado.' },
      { status: 500 }
    );
  }
}