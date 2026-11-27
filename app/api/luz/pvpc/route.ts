import { NextResponse } from 'next/server'

/**
 * Proxy a la API pública de REE (Red Eléctrica de España)
 * para obtener el precio PVPC del mes actual y los últimos meses.
 *
 * API REE: https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real
 * Endpoint de precios PVPC: /es/datos/mercados/precios-mercados-tiempo-real
 *
 * Parámetros:
 *   ?mes=YYYY-MM  → precio medio de ese mes
 *   (sin params)  → precio medio de los últimos 6 meses
 */

type PrecioMes = {
  mes: string        // YYYY-MM
  precio_medio: number  // €/kWh
  precio_min: number
  precio_max: number
}

async function getPVPCMes(desde: string, hasta: string): Promise<PrecioMes[]> {
  // API REE: datos horarios de PVPC
  const url = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${desde}T00:00&end_date=${hasta}T23:59&time_trunc=hour&geo_trunc=electric_system&geo_limit=peninsular&geo_ids=8741`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 }, // cache 1 hora
  })

  if (!res.ok) throw new Error(`REE API error: ${res.status}`)

  const json = await res.json()

  // La API devuelve included[] con distintos tipos de precio
  // Buscamos PVPC (id: 1001 o descripción "PVPC")
  const included = json.included ?? []
  const pvpc = included.find((d: any) =>
    d.id === '1001' || d.attributes?.title?.toLowerCase().includes('pvpc')
  ) ?? included[0]

  if (!pvpc?.attributes?.values) return []

  // Agrupar por mes y calcular media/min/max
  const porMes: Record<string, number[]> = {}
  for (const v of pvpc.attributes.values) {
    const mes = v.datetime?.slice(0, 7) // YYYY-MM
    if (!mes) continue
    const precio = v.value / 1000 // La API da €/MWh, convertimos a €/kWh
    if (!porMes[mes]) porMes[mes] = []
    porMes[mes].push(precio)
  }

  return Object.entries(porMes).map(([mes, precios]) => ({
    mes,
    precio_medio: Math.round((precios.reduce((a, b) => a + b, 0) / precios.length) * 100000) / 100000,
    precio_min: Math.round(Math.min(...precios) * 100000) / 100000,
    precio_max: Math.round(Math.max(...precios) * 100000) / 100000,
  })).sort((a, b) => a.mes.localeCompare(b.mes))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mes = searchParams.get('mes') // YYYY-MM

  try {
    let desde: string
    let hasta: string

    if (mes) {
      // Mes específico
      const [year, month] = mes.split('-').map(Number)
      const ultimoDia = new Date(year, month, 0).getDate()
      desde = `${mes}-01`
      hasta = `${mes}-${String(ultimoDia).padStart(2, '0')}`
    } else {
      // Últimos 6 meses
      const hoy = new Date()
      hasta = hoy.toISOString().slice(0, 10)
      const hace6Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1)
      desde = hace6Meses.toISOString().slice(0, 10)
    }

    const precios = await getPVPCMes(desde, hasta)

    return NextResponse.json({ precios, actualizado: new Date().toISOString() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
