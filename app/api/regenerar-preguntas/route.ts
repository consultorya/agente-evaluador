import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai'; // 👈 Usa el paquete existente

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST() {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No se encontró la API Key en las variables de entorno.' },
        { status: 500 }
      );
    }

    const { data: examenes, error: fetchError } = await supabase
      .from('examenes')
      .select('id, titulo, texto_base, cantidad_preguntas');

    if (fetchError || !examenes || examenes.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron exámenes o lecturas guardadas.' },
        { status: 400 }
      );
    }

    // Instancia tradicional con la librería antigua
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    let totalActualizadas = 0;
    const errores: string[] = [];

    for (const ex of examenes) {
      if (!ex.texto_base || !ex.texto_base.trim()) continue;

      const cantidad = ex.cantidad_preguntas || 5;
      const promptSystem = `Eres un docente universitario experto. Basándote ÚNICAMENTE en el siguiente texto, genera un examen NUEVO de ${cantidad} preguntas con opción múltiple para la evaluación "${ex.titulo || 'General'}".

Texto:
"${ex.texto_base.trim()}"

Responde ÚNICAMENTE con un arreglo JSON válido con este formato estricto, sin bloques de código markdown:
[
  {
    "id": 1,
    "enunciado": "Texto de la pregunta",
    "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
    "respuestaCorrecta": "Opción exacta que es la correcta"
  }
]`;

      const maxIntentos = 3;
      for (let intento = 1; intento <= maxIntentos; intento++) {
        try {
          const result = await model.generateContent(promptSystem);
          const textResponse = result.response.text().trim();
          const cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
          const nuevasPreguntas = JSON.parse(cleanedJson);

          const nombreSeccion = ex.titulo;
          if (nombreSeccion) {
            const { error: errorUpdate } = await supabase
              .from('secciones')
              .update({ preguntas: nuevasPreguntas })
              .eq('nombre', nombreSeccion);

            if (!errorUpdate) {
              totalActualizadas++;
              break;
            }
          }
        } catch (err: any) {
          if (intento < maxIntentos) {
            await esperar(intento * 2000);
          } else {
            errores.push(`Examen ${ex.titulo}: ${err.message}`);
          }
        }
      }
      await esperar(1000);
    }

    return NextResponse.json({
      mensaje: `¡Se re-generaron exitosamente las preguntas para ${totalActualizadas} secciones!`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}