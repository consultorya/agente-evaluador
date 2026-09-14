import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';

export async function POST() {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No se encontró la API Key en las variables de entorno.' },
        { status: 500 }
      );
    }

    // 1. Obtener el texto base almacenado en 'examenes'
    const { data: examen, error: fetchError } = await supabase
      .from('examenes')
      .select('texto_base, cantidad_preguntas')
      .limit(1)
      .single();

    if (fetchError || !examen || !examen.texto_base) {
      return NextResponse.json(
        { error: 'No hay ningún texto de PDF guardado previamente.' },
        { status: 400 }
      );
    }

    // 2. Obtener TODAS las secciones existentes en la base de datos
    const { data: secciones, error: errorSecciones } = await supabase
      .from('secciones')
      .select('id, nombre');

    if (errorSecciones || !secciones || secciones.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron secciones registradas.' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    // 3. Re-generar y guardar preguntas para cada sección
    const actualizaciones = secciones.map(async (sec) => {
      const promptSystem = `Eres un docente universitario experto. Basándote ÚNICAMENTE en el siguiente texto, genera un examen NUEVO de ${examen.cantidad_preguntas || 5} preguntas con opción múltiple para la sección ${sec.nombre}.

Texto:
"${examen.texto_base}"

Responde ÚNICAMENTE con un arreglo JSON válido con este formato estricto, sin bloques de código markdown:
[
  {
    "id": 1,
    "enunciado": "Texto de la pregunta",
    "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
    "respuestaCorrecta": "Opción exacta que es la correcta"
  }
]`;

      const result = await model.generateContent(promptSystem);
      const textResponse = result.response.text().trim();
      const cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const nuevasPreguntas = JSON.parse(cleanedJson);

      return supabase
        .from('secciones')
        .update({ preguntas: nuevasPreguntas })
        .eq('id', sec.id);
    });

    await Promise.all(actualizaciones);

    return NextResponse.json({
      mensaje: `¡Se re-generaron exitosamente las preguntas para las ${secciones.length} secciones!`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Error al re-generar preguntas globales con Gemini.' },
      { status: 500 }
    );
  }
}