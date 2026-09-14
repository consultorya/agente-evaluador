export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
// @ts-ignore
import PDFParser from 'pdf2json';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

// Función auxiliar para extraer texto del PDF
function extraerTextoPDF(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, true);
    pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
    pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent()));
    pdfParser.parseBuffer(buffer);
  });
}

// POST: Procesa el PDF, genera las preguntas con Gemini una sola vez y lo guarda todo en Supabase
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const titulo = (formData.get('titulo') as string) || 'Evaluación de Lectura Semanal';
    const cantidadPreguntas = parseInt((formData.get('cantidad_preguntas') as string) || '5', 10);

    if (!file) {
      return NextResponse.json({ error: 'No se subió ningún archivo PDF.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const textoPDF = await extraerTextoPDF(buffer);

    if (!textoPDF || textoPDF.trim().length === 0) {
      return NextResponse.json({ error: 'El PDF no contiene texto legible.' }, { status: 400 });
    }

    const textoLimpio = textoPDF.substring(0, 12000);

    // Generar las preguntas con Gemini una sola vez al subir el PDF
    let preguntasGeneradas: any[] = [];
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
      const promptSystem = `Eres un docente universitario experto. Basándote ÚNICAMENTE en el siguiente texto, genera un examen de ${cantidadPreguntas} preguntas con opción múltiple.
Texto:
"${textoLimpio}"

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
      preguntasGeneradas = JSON.parse(cleanedJson);
    } catch (geminiError) {
      console.error('Error al generar preguntas con Gemini:', geminiError);
      // Continuará guardando el examen aun si falla Gemini para no bloquear el proceso
    }

    const { data, error } = await supabase
      .from('examenes')
      .upsert({
        id: 1,
        titulo,
        texto_base: textoLimpio,
        cantidad_preguntas: cantidadPreguntas,
        preguntas: preguntasGeneradas,
        activo: false, // Por seguridad se sube apagado por defecto
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      return NextResponse.json({ error: `Error en la BD: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      mensaje: 'Examen y preguntas guardados correctamente en la base de datos.',
      examen: data[0],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error al procesar el PDF.' }, { status: 500 });
  }
}

// PATCH: Cambiar estado (Activar / Desactivar Examen)
export async function PATCH(req: Request) {
  try {
    const { activo } = await req.json();

    const { data, error } = await supabase
      .from('examenes')
      .update({ activo })
      .eq('id', 1)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      mensaje: `Examen ${activo ? 'ACTIVADO' : 'DESACTIVADO'} correctamente.`,
      examen: data[0],
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al cambiar estado del examen.' }, { status: 500 });
  }
}