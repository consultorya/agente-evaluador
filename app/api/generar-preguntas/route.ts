export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
// @ts-ignore
import PDFParser from 'pdf2json';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Función auxiliar para extraer texto del PDF
function extraerTextoPDF(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, true);
    pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
    pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent()));
    pdfParser.parseBuffer(buffer);
  });
}

// POST: Procesa el PDF y actualiza la evaluación de la semana
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

    const { data, error } = await supabase
      .from('examenes')
      .upsert({
        id: 1,
        titulo,
        texto_base: textoLimpio,
        cantidad_preguntas: cantidadPreguntas,
        activo: false, // Por seguridad se sube apagado por defecto
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      return NextResponse.json({ error: `Error en la BD: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      mensaje: 'Examen guardado correctamente.',
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