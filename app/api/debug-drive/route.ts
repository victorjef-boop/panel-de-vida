import { NextResponse } from 'next/server'
import { getMovimientosDrive } from '@/lib/google/drive'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { movimientos, archivos, error } = await getMovimientosDrive()
  return NextResponse.json({
    error,
    archivos,
    total: movimientos.length,
    primeros10: movimientos.slice(0, 10),
    ultimosMeses: [...new Set(movimientos.map(m => m.fecha.slice(0, 7)))].sort().reverse().slice(0, 6),
  })
}
