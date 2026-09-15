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

// POST: Procesa la lectura/PDF y genera preguntas con Gemini
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('pdf')) as File | null;
    const textoBaseInput = (formData.get('textoBase') as string) || '';
    const cantidadPreguntas = parseInt((formData.get('cantidad_preguntas') as string) || (formData.get('cantidadPreguntas') as string) || '5', 10);

    // 1. Iniciamos tomando el textoBase enviado desde el textarea de la sección
    let textoLimpio = textoBaseInput.trim();

    // 2. Solo si enviaron un PDF REAL (y no un archivo .txt sintético), extraemos del PDF
    if (file && file.size > 0 && file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const textoPDF = await extraerTextoPDF(buffer);
        if (textoPDF && textoPDF.trim().length > 0) {
          textoLimpio = textoPDF.trim();
        }
      } catch (pdfErr) {
        console.error('Error al procesar PDF:', pdfErr);
      }
    }

    if (!textoLimpio) {
      return NextResponse.json({ error: 'No se recibió texto legible ni archivo PDF para esta sección.' }, { status: 400 });
    }

    // Recortar a 12,000 caracteres como máximo para el prompt
    textoLimpio = textoLimpio.substring(0, 12000);

    // 3. Generar las preguntas con Gemini basadas EXCLUSIVAMENTE en este texto
    let preguntasGeneradas: any[] = [];
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
      const promptSystem = `Eres un docente universitario experto. Basándote ÚNICAMENTE en el siguiente texto, genera un examen de ${cantidadPreguntas} preguntas con opción múltiple.

Texto:
"${textoLimpio}"

Responde ÚNICAMENTE con un arreglo JSON válido con este formato estricto, sin explicaciones ni bloques de código markdown:
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
    } catch (geminiError: any) {
      console.error('Error al generar preguntas con Gemini:', geminiError);
      return NextResponse.json({ error: 'Error al interpretar la respuesta de la IA: ' + geminiError.message }, { status: 500 });
    }

    // Devuelve las preguntas generadas correspondientes a ESTE texto
    return NextResponse.json({
      mensaje: 'Preguntas generadas correctamente.',
      preguntas: preguntasGeneradas,
      textoBase: textoLimpio,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error al procesar la solicitud.' }, { status: 500 });
  }
}

// PATCH: Cambiar estado (Activar / Desactivar Examen)
export async function PATCH(req: Request) {
  try {
    const { activo, id } = await req.json();

    const { data, error } = await supabase
      .from('examenes')
      .update({ activo })
      .eq('id', id || 1)
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