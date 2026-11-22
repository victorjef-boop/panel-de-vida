import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const venc = new Date(fecha)
  venc.setHours(0, 0, 0, 0)
  return Math.round((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
}

function getAlertStyle(dias: number | null): { badge: string; border: string } {
  if (dias === null) return { badge: 'bg-muted text-muted-foreground', border: 'border-border' }
  if (dias < 0) return { badge: 'bg-red-100 text-red-700', border: 'border-red-300' }
  if (dias <= 30) return { badge: 'bg-red-100 text-red-700', border: 'border-red-300' }
  if (dias <= 60) return { badge: 'bg-orange-100 text-orange-700', border: 'border-orange-300' }
  if (dias <= 90) return { badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-300' }
  return { badge: 'bg-muted text-muted-foreground', border: 'border-border' }
}

function formatDias(dias: number | null, fecha: string | null): string {
  if (dias === null || fecha === null) return 'Sin fecha'
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} días`
  if (dias === 0) return 'Vence hoy'
  if (dias <= 90) return `Vence en ${dias} días`
  return new Date(fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Documento = {
  id: string
  nombre: string
  tipo: string
  descripcion?: string | null
  fecha_vencimiento?: string | null
  fecha_emision?: string | null
  url?: string | null
  notas?: string | null
}

function DocumentoCard({ doc }: { doc: Documento }) {
  const dias = diasHasta(doc.fecha_vencimiento ?? null)
  const { badge, border } = getAlertStyle(dias)

  return (
    <div className={`p-4 border rounded-md space-y-2 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm">{doc.nombre}</p>
          {doc.descripcion && <p className="text-xs text-muted-foreground">{doc.descripcion}</p>}
        </div>
        {doc.fecha_vencimiento && (
          <span className={`flex-shrink-0 inline-block px-2 py-0.5 text-xs rounded-full font-medium ${badge}`}>
            {formatDias(dias, doc.fecha_vencimiento)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {doc.fecha_emision && (
          <span>
            Emitido: {new Date(doc.fecha_emision).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
        {doc.notas && <span>{doc.notas}</span>}
      </div>
      {doc.url && (
        <a href={doc.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline">Ver documento</a>
      )}
    </div>
  )
}

export default async function DocumentosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: documentos } = await supabase
    .from('documentos')
    .select('*')
    .eq('user_id', user.id)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })

  const itvs = (documentos ?? []).filter(d => d.tipo === 'itv')
  const recibos = (documentos ?? []).filter(d => d.tipo === 'recibo')
  const contratos = (documentos ?? []).filter(d => d.tipo === 'contrato')
  const otros = (documentos ?? []).filter(d => !['itv', 'recibo', 'contrato'].includes(d.tipo))

  const alertas = (documentos ?? []).filter(d => {
    const dias = diasHasta(d.fecha_vencimiento ?? null)
    return dias !== null && dias <= 60
  })

  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto space-y-10">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Inicio</Link>
        <h1 className="text-2xl font-semibold">Documentos</h1>
      </div>

      {alertas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-medium text-orange-700">⚠ Próximos vencimientos</h2>
          <div className="space-y-2">
            {alertas.map(d => <DocumentoCard key={d.id} doc={d} />)}
          </div>
        </section>
      )}

      {itvs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">ITV</h2>
          <div className="space-y-2">
            {itvs.map(d => <DocumentoCard key={d.id} doc={d} />)}
          </div>
        </section>
      )}

      {recibos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Recibos</h2>
          <div className="space-y-2">
            {recibos.map(d => <DocumentoCard key={d.id} doc={d} />)}
          </div>
        </section>
      )}

      {contratos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Contratos</h2>
          <div className="space-y-2">
            {contratos.map(d => <DocumentoCard key={d.id} doc={d} />)}
          </div>
        </section>
      )}

      {otros.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Otros</h2>
          <div className="space-y-2">
            {otros.map(d => <DocumentoCard key={d.id} doc={d} />)}
          </div>
        </section>
      )}

      {(documentos ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No hay documentos registrados.</p>
      )}
    </div>
  )
}
