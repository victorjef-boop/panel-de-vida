import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getFacturasLuz } from '@/lib/google/drive-luz'

export const dynamic = 'force-dynamic'

type PrecioMes = {
  mes: string
  precio_medio: number
  precio_min: number
  precio_max: number
}

async function getPVPC(): Promise<PrecioMes[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/luz/pvpc`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return json.precios ?? []
  } catch {
    return []
  }
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
}

function formatEur(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

export default async function LuzPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ facturas, archivos, error }, pvpcMeses] = await Promise.all([
    getFacturasLuz(),
    getPVPC(),
  ])

  // Factura más reciente con datos completos
  const ultimaFactura = facturas.find(f => f.kwh_total > 0)
  const pvpcActual = pvpcMeses.at(-1)

  // Comparativa: precio que pagas vs PVPC
  const diferencia = ultimaFactura && pvpcActual
    ? ultimaFactura.precio_kwh - pvpcActual.precio_medio
    : null

  // Ahorro/coste estimado mensual
  const ahorroEstimado = diferencia !== null && ultimaFactura
    ? diferencia * ultimaFactura.kwh_total
    : null

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto space-y-10">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-2xl font-semibold">Luz</h1>
      </div>

      {/* RESUMEN ÚLTIMO MES */}
      {ultimaFactura && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Última factura</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 border border-border rounded-xl space-y-1">
              <p className="text-xs text-muted-foreground">Importe</p>
              <p className="text-2xl font-semibold">{formatEur(ultimaFactura.importe_total)}</p>
              <p className="text-xs text-muted-foreground">{formatMes(ultimaFactura.periodo_desde.slice(0,7))}</p>
            </div>
            <div className="p-4 border border-border rounded-xl space-y-1">
              <p className="text-xs text-muted-foreground">Consumo</p>
              <p className="text-2xl font-semibold">{ultimaFactura.kwh_total} <span className="text-sm font-normal">kWh</span></p>
              <p className="text-xs text-muted-foreground">
                {ultimaFactura.potencia_contratada ? `${ultimaFactura.potencia_contratada} kW contratados` : 'Iberdrola'}
              </p>
            </div>
            <div className="p-4 border border-border rounded-xl space-y-1">
              <p className="text-xs text-muted-foreground">Precio medio</p>
              <p className="text-2xl font-semibold">
                {(ultimaFactura.precio_kwh * 100).toFixed(3)} <span className="text-sm font-normal">c€/kWh</span>
              </p>
              {pvpcActual && (
                <p className={`text-xs font-medium ${diferencia && diferencia > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  PVPC: {(pvpcActual.precio_medio * 100).toFixed(3)} c€/kWh
                </p>
              )}
            </div>
          </div>

          {/* Comparativa PVPC */}
          {diferencia !== null && ahorroEstimado !== null && (
            <div className={`p-4 border rounded-xl space-y-1 ${diferencia > 0 ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
              <p className={`text-sm font-medium ${diferencia > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {diferencia > 0
                  ? `Pagas ${(diferencia * 100).toFixed(3)} c€/kWh más que el PVPC`
                  : `Pagas ${(Math.abs(diferencia) * 100).toFixed(3)} c€/kWh menos que el PVPC`}
              </p>
              <p className={`text-xs ${diferencia > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {diferencia > 0
                  ? `Con PVPC habrías pagado ${formatEur(Math.abs(ahorroEstimado))} menos este mes`
                  : `Tu tarifa fija te ahorró ${formatEur(Math.abs(ahorroEstimado))} respecto al PVPC`}
              </p>
            </div>
          )}
        </section>
      )}

      {/* COMPARATIVA PVPC */}
      {pvpcMeses.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Precio PVPC — últimos meses</h2>
          <p className="text-xs text-muted-foreground">Fuente: Red Eléctrica de España (REE). Precio medio horario peninsular.</p>
          <div className="space-y-2">
            {pvpcMeses.slice().reverse().map(p => {
              const tuFactura = facturas.find(f => f.periodo_desde.startsWith(p.mes) || f.periodo_hasta.startsWith(p.mes))
              return (
                <div key={p.mes} className="p-3 border border-border rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{formatMes(p.mes)}</p>
                    <p className="text-xs text-muted-foreground">
                      Min {(p.precio_min * 100).toFixed(3)} · Max {(p.precio_max * 100).toFixed(3)} c€/kWh
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{(p.precio_medio * 100).toFixed(3)} c€/kWh</p>
                    {tuFactura && tuFactura.kwh_total > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Tu factura: {(tuFactura.precio_kwh * 100).toFixed(3)} c€/kWh
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* HISTORIAL FACTURAS */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Historial de facturas</h2>

        {error ? (
          <div className="p-4 border border-orange-200 rounded-xl bg-orange-50 space-y-1">
            <p className="text-sm text-orange-700">{error}</p>
            <p className="text-xs text-orange-600">
              Sube tus facturas PDF de Iberdrola a Drive en la carpeta{' '}
              <code className="font-mono">Panel de Vida/facturas-luz</code>
            </p>
          </div>
        ) : facturas.length === 0 ? (
          <div className="p-4 border border-dashed border-border rounded-xl space-y-1">
            <p className="text-sm text-muted-foreground">No hay facturas todavía.</p>
            <p className="text-xs text-muted-foreground">
              Sube tus PDF de Iberdrola a Drive en{' '}
              <code className="font-mono">Panel de Vida/facturas-luz</code>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {facturas.map((f, i) => (
              <div key={i} className="p-4 border border-border rounded-xl">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {f.periodo_desde && f.periodo_hasta
                        ? `${new Date(f.periodo_desde+'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${new Date(f.periodo_hasta+'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : f.archivo}
                    </p>
                    {f.numero_factura && (
                      <p className="text-xs text-muted-foreground font-mono">Nº {f.numero_factura}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold flex-shrink-0">{formatEur(f.importe_total)}</p>
                </div>
                {f.kwh_total > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{f.kwh_total} kWh</span>
                    <span>{(f.precio_kwh * 100).toFixed(3)} c€/kWh</span>
                    {f.importe_energia && <span>Energía: {formatEur(f.importe_energia)}</span>}
                    {f.importe_potencia && <span>Potencia: {formatEur(f.importe_potencia)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {archivos.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {archivos.length} archivo{archivos.length > 1 ? 's' : ''} en Drive: {archivos.join(', ')}
          </p>
        )}
      </section>
    </div>
  )
}
