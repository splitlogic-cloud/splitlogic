import { NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabaseClient'

export async function GET() {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ data })
}
