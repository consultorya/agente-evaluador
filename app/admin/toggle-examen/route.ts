import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(req: Request) {
  try {
    const { id, activo } = await req.json();

    if (!id || activo === undefined) {
      return NextResponse.json(
        { error: 'El ID del examen y el estado activo son obligatorios.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('examenes')
      .update({ activo, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, examen: data[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}