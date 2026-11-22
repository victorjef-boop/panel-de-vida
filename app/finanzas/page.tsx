import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function FinanzasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: inversiones },
    { data: cuentas },
    { data: gastos },
    { data: aportaciones },
  ] = await Promise.all([
    supabase.from('inversiones').select('*').eq('user_id', user.id).order('nombre'),
    supabase.from('cuentas_ahorro').select('*').eq('user_id', user.id).order('nombre'),
    supabase.from('gastos').select('*').eq('user_id', user.id).order('fecha', { ascending: false }).limit(20),
    supabase.from('aportaciones_inversiones').select('*').eq('user_id', user.id).order('fecha', { ascending: false }).limit(10),
  ])

  const totalInversiones = (inversiones ?? []).reduce((sum, inv) => sum + (inv.valor_actual ?? inv.coste ?? 0), 0)
  const totalCosteInversiones = (inversiones ?? []).reduce((sum, inv) => sum + (inv.coste ?? 0), 0)
  const rentabilidad = totalCosteInversiones > 0
    ? ((totalInversiones - totalCosteInversiones) / totalCosteInversiones) * 100
    : 0

  const totalAhorro = (cuentas ?? []).reduce((sum, c) => sum + (c.saldo ?? 0), 0)
  const totalPatrimonio = totalInversiones + totalAhorro

  const gastosEsteMes = (gastos ?? []).filter(g => {
    const fecha = new Date(g.fecha)
    const ahora = new Date()
    return fecha.getMonth() === ahora.getMonth() && fecha.getFullYear() === ahora.getFullYear()
  })
  const totalGastosMes = gastosEsteMes.reduce((sum, g) => sum + (g.importe ?? 0), 0)

  const gastosPorCategoria: Record<string, number> = {}
  for (const g of gastosEsteMes) {
    const cat = g.categoria ?? 'Sin categoría'
    gastosPorCategoria[cat] = (gastosPorCategoria[cat] ?? 0) + (g.importe ?? 0)
  }

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto space-y-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
          <h1 className="text-2xl font-semibold">Finanzas</h1>
        </div>
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
            <p className={`text-xs font-medium ${rentabilidad >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rentabilidad >= 0 ? '+' : ''}{rentabilidad.toFixed(2)}%
            </p>
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
              const rentInv = inv.coste > 0
                ? ((inv.valor_actual - inv.coste) / inv.coste) * 100
                : 0
              return (
                <div key={inv.id} className="p-3 border border-border rounded-md">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{inv.nombre}</p>
                      <p className="text-xs text-muted-foreground">{inv.tipo} · {inv.broker}</p>
                      {inv.isin && <p className="text-xs text-muted-foreground font-mono">{inv.isin}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{(inv.valor_actual ?? inv.coste ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                      {inv.valor_actual && inv.coste && (
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
        {(cuentas ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cuentas registradas.</p>
        ) : (
          <div className="space-y-2">
            {(cuentas ?? []).map((c) => (
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

      {/* GASTOS RECIENTES */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Gastos este mes
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {totalGastosMes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </span>
        </h2>

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

        {(gastos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay gastos registrados.</p>
        ) : (
          <div className="space-y-2">
            {(gastos ?? []).slice(0, 10).map((g) => (
              <div key={g.id} className="p-3 border border-border rounded-md flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm">{g.concepto}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(g.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {g.categoria && ` · ${g.categoria}`}
                    {g.cuenta && ` · ${g.cuenta}`}
                  </p>
                </div>
                <p className="text-sm font-medium text-red-600 flex-shrink-0">
                  -{(g.importe ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
