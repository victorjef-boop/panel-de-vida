import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMovimientosDrive } from '@/lib/google/drive'

export const dynamic = 'force-dynamic'

export default async function FinanzasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: inversiones },
    { data: cuentas },
    { movimientos, archivos, error: errorDrive },
  ] = await Promise.all([
    supabase.from('inversiones').select('*').eq('user_id', user.id).order('nombre'),
    supabase.from('cuentas_ahorro').select('*').eq('user_id', user.id).order('nombre'),
    getMovimientosDrive(),
  ])

  // Resumen patrimonial
  const totalInversiones = (inversiones ?? []).reduce((sum, inv) => sum + (inv.valor_actual ?? inv.coste_total ?? 0), 0)
  const totalCoste = (inversiones ?? []).reduce((sum, inv) => sum + (inv.coste_total ?? 0), 0)
  const rentabilidad = totalCoste > 0 ? ((totalInversiones - totalCoste) / totalCoste) * 100 : 0
  const totalAhorro = (cuentas ?? []).filter(c => c.activa).reduce((sum, c) => sum + (c.saldo ?? 0), 0)
  const totalPatrimonio = totalInversiones + totalAhorro

  // Gastos del mes actual desde Drive
  const ahora = new Date()
  const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const gastosMes = movimientos.filter(m => m.tipo === 'gasto' && m.fecha.startsWith(mesActual))
  const totalGastosMes = gastosMes.reduce((sum, m) => sum + Math.abs(m.importe), 0)

  // Categorización automática por concepto
  function categorizarConcepto(concepto: string): string {
    const c = concepto.toUpperCase()
    if (c.includes('MERCADONA') || c.includes('LIDL') || c.includes('CARREF') || c.includes('ALDI') || c.includes('CORTE INGLES')) return 'Supermercado'
    if (c.includes('UBER') || c.includes('EATS') || c.includes('PIZZER') || c.includes('ASIA') || c.includes('RESTAUR')) return 'Restaurantes'
    if (c.includes('SHELL') || c.includes('GALP') || c.includes('BALLENOIL') || c.includes('E.S.')) return 'Gasolina'
    if (c.includes('ZARA') || c.includes('STRADIVARIUS') || c.includes('DECATHLON') || c.includes('JYSK')) return 'Ropa y hogar'
    if (c.includes('AMORT') || c.includes('PRESTAMO')) return 'Préstamo'
    if (c.includes('TARJETA') || c.includes('LIQUID') || c.includes('CONSUMER')) return 'Tarjeta crédito'
    if (c.includes('TRANS') || c.includes('TRANSF')) return 'Transferencia'
    if (c.includes('CAJERO') || c.includes('REINT')) return 'Efectivo'
    if (c.includes('FARMACIA')) return 'Salud'
    if (c.includes('IMPUESTO') || c.includes('TRIBUT')) return 'Impuestos'
    if (c.includes('AUTOESCUEL')) return 'Autoescuela'
    if (c.includes('PARKING') || c.includes('TELPARK') || c.includes('INDIGO')) return 'Parking'
    return 'Otros'
  }

  const gastosPorCategoria: Record<string, number> = {}
  for (const m of gastosMes) {
    const cat = categorizarConcepto(m.concepto)
    gastosPorCategoria[cat] = (gastosPorCategoria[cat] ?? 0) + Math.abs(m.importe)
  }

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto space-y-10">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-2xl font-semibold">Finanzas</h1>
      </div>

      {/* RESUMEN PATRIMONIO */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Resumen patrimonial</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 border border-border rounded-md space-y-1">
            <p className="text-xs text-muted-foreground">Patrimonio total</p>
            <p className="text-xl font-semibold">{totalPatrimonio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          </div>
          <div className="p-4 border border-border rounded-md space-y-1">
            <p className="text-xs text-muted-foreground">Inversiones</p>
            <p className="text-xl font-semibold">{totalInversiones.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
            {totalCoste > 0 && (
              <p className={`text-xs font-medium ${rentabilidad >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {rentabilidad >= 0 ? '+' : ''}{rentabilidad.toFixed(2)}%
              </p>
            )}
          </div>
          <div className="p-4 border border-border rounded-md space-y-1">
            <p className="text-xs text-muted-foreground">Ahorro</p>
            <p className="text-xl font-semibold">{totalAhorro.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          </div>
        </div>
      </section>

      {/* INVERSIONES */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Inversiones</h2>
        {(inversiones ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay inversiones registradas.</p>
        ) : (
          <div className="space-y-2">
            {(inversiones ?? []).map((inv) => {
              const rentInv = inv.coste_total > 0 && inv.valor_actual
                ? ((inv.valor_actual - inv.coste_total) / inv.coste_total) * 100
                : inv.rentabilidad_pct ?? null
              return (
                <div key={inv.id} className="p-3 border border-border rounded-md">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{inv.nombre}</p>
                      <p className="text-xs text-muted-foreground">{inv.tipo} · {inv.broker}</p>
                      {inv.isin && <p className="text-xs text-muted-foreground font-mono">{inv.isin}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {(inv.valor_actual ?? inv.coste_total ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </p>
                      {rentInv !== null && (
                        <p className={`text-xs font-medium ${rentInv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {rentInv >= 0 ? '+' : ''}{rentInv.toFixed(2)}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* CUENTAS DE AHORRO */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Cuentas remuneradas</h2>
        {(cuentas ?? []).filter(c => c.activa).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cuentas registradas.</p>
        ) : (
          <div className="space-y-2">
            {(cuentas ?? []).filter(c => c.activa).map((c) => (
              <div key={c.id} className="p-3 border border-border rounded-md flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{c.nombre}</p>
                  {c.entidad && <p className="text-xs text-muted-foreground">{c.entidad}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{(c.saldo ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                  {c.tae && <p className="text-xs text-green-600">{c.tae}% TAE</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* GASTOS DESDE DRIVE */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Gastos este mes
          {totalGastosMes > 0 && (
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {totalGastosMes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
          )}
        </h2>

        {errorDrive ? (
          <div className="p-3 border border-orange-200 rounded-md bg-orange-50 space-y-1">
            <p className="text-sm text-orange-700">{errorDrive}</p>
            <p className="text-xs text-orange-600">
              Sube los XLS del banco a Google Drive en la carpeta <code className="font-mono">Panel de Vida/extractos</code>
            </p>
          </div>
        ) : (
          <>
            {archivos.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {archivos.length} archivo{archivos.length > 1 ? 's' : ''}: {archivos.join(', ')}
              </p>
            )}

            {Object.keys(gastosPorCategoria).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(gastosPorCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, total]) => (
                    <span key={cat} className="px-2 py-1 text-xs border border-border rounded-full">
                      {cat}: {total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </span>
                  ))}
              </div>
            )}

            {gastosMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay gastos este mes.</p>
            ) : (
              <div className="space-y-2">
                {gastosMes.slice(0, 15).map((m, i) => (
                  <div key={i} className="p-3 border border-border rounded-md flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm">{m.concepto}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {' · '}{categorizarConcepto(m.concepto)}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-red-600 flex-shrink-0">
                      -{Math.abs(m.importe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
