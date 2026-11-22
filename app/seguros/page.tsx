import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function getAlertColor(diasRestantes: number | null): { badge: string; border: string } {
  if (diasRestantes === null) return { badge: 'bg-muted text-muted-foreground', border: 'border-border' }
  if (diasRestantes < 0) return { badge: 'bg-red-100 text-red-700', border: 'border-red-300' }
  if (diasRestantes <= 30) return { badge: 'bg-red-100 text-red-700', border: 'border-red-300' }
  if (diasRestantes <= 60) return { badge: 'bg-orange-100 text-orange-700', border: 'border-orange-300' }
  if (diasRestantes <= 90) return { badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-300' }
  return { badge: 'bg-green-100 text-green-700', border: 'border-border' }
}

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const venc = new Date(fecha)
  venc.setHours(0, 0, 0, 0)
  return Math.round((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function SegurosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: seguros } = await supabase
    .from('seguros')
    .select('*')
    .eq('user_id', user.id)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })

  const totalPrimas = (seguros ?? []).reduce((sum, s) => sum + (s.prima_anual ?? 0), 0)

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto space-y-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
          <h1 className="text-2xl font-semibold">Seguros</h1>
        </div>
        {totalPrimas > 0 && (
          <p className="text-sm text-muted-foreground">
            Total primas: {totalPrimas.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/año
          </p>
        )}
      </div>

      {(seguros ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay pólizas registradas.</p>
      ) : (
        <div className="space-y-3">
          {(seguros ?? []).map((s) => {
            const dias = diasHasta(s.fecha_vencimiento)
            const { badge, border } = getAlertColor(dias)
            return (
              <div key={s.id} className={`p-4 border rounded-md space-y-3 ${border}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{s.nombre}</p>
                    {s.aseguradora && <p className="text-xs text-muted-foreground">{s.aseguradora}</p>}
                    {s.numero_poliza && <p className="text-xs text-muted-foreground font-mono">{s.numero_poliza}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {s.prima_anual && (
                      <p className="text-sm font-medium">
                        {s.prima_anual.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}/año
                      </p>
                    )}
                    {s.fecha_vencimiento && (
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full font-medium ${badge}`}>
                        {dias === null ? '' :
                          dias < 0 ? `Vencido hace ${Math.abs(dias)} días` :
                          dias === 0 ? 'Vence hoy' :
                          dias <= 90 ? `Vence en ${dias} días` :
                          new Date(s.fecha_vencimiento).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                        }
                      </span>
                    )}
                  </div>
                </div>

                {s.cobertura && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2">{s.cobertura}</p>
                )}

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {s.tipo && <span className="capitalize">{s.tipo}</span>}
                  {s.fecha_inicio && (
                    <span>
                      Desde {new Date(s.fecha_inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
