import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCalendarEvents } from '@/lib/google/calendar'
import { getUnreadThreads } from '@/lib/google/gmail'
import { classifyEmails } from '@/lib/anthropic'
import { revalidatePath } from 'next/cache'
import { connection } from 'next/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// ─── Iconos SVG inline ────────────────────────────────────────────────────────

function IconGastos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7h20M6 3h12l3 4v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
      <path d="M9 13h6M9 17h4"/>
    </svg>
  )
}
function IconInversiones() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  )
}
function IconSeguros() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  )
}
function IconDocumentos() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
      <line x1="9" y1="17" x2="13" y2="17"/>
    </svg>
  )
}
function IconLuz() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}
function IconAgenda() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Modulo = {
  href: string
  label: string
  descripcion: string
  icon: React.ReactNode
  color: string        // clase de color para el icono y acento
  stat?: string        // número grande opcional
  statLabel?: string
  alerta?: string      // badge de alerta opcional
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function ModuloCard({ m }: { m: Modulo }) {
  return (
    <Link
      href={m.href}
      className="group relative flex flex-col gap-3 p-5 border border-border rounded-2xl bg-card hover:shadow-sm transition-all hover:-translate-y-0.5"
    >
      {m.alerta && (
        <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">
          {m.alerta}
        </span>
      )}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.color}`}>
        {m.icon}
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-semibold">{m.label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{m.descripcion}</p>
      </div>
      {m.stat && (
        <div className="mt-auto pt-3 border-t border-border">
          <p className="text-xl font-bold tracking-tight">{m.stat}</p>
          {m.statLabel && <p className="text-xs text-muted-foreground">{m.statLabel}</p>}
        </div>
      )}
      <div className={`absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity ${m.color.replace('bg-','text-').replace('/15','')}`}>
        <IconChevronRight />
      </div>
    </Link>
  )
}

function TaskRow({ task, completeTask }: { task: any; completeTask: (fd: FormData) => Promise<void> }) {
  const prioColors: Record<string, string> = {
    alta: 'bg-red-100 text-red-700',
    media: 'bg-yellow-100 text-yellow-700',
    baja: 'bg-green-100 text-green-700',
  }
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors">
      <form action={completeTask}>
        <input type="hidden" name="id" value={task.id} />
        <button
          type="submit"
          className="w-5 h-5 border-2 border-border rounded-md hover:border-foreground hover:bg-foreground hover:text-background flex items-center justify-center transition-colors flex-shrink-0"
          title="Marcar completada"
        >
          <span className="opacity-0 hover:opacity-100"><IconCheck /></span>
        </button>
      </form>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{task.titulo}</p>
        {task.fecha_limite && (
          <p className="text-xs text-muted-foreground">
            {new Date(task.fecha_limite.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </p>
        )}
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${prioColors[task.prioridad] ?? 'bg-muted text-muted-foreground'}`}>
        {task.prioridad}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Home() {
  await connection()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Datos en paralelo
  const [
    { data: tasks },
    { data: seguros },
    { data: inversiones },
    { data: cuentas },
    { data: documentos },
    events,
    threads,
  ] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', user.id).neq('estado', 'completada').order('fecha_limite', { ascending: true, nullsFirst: false }),
    supabase.from('seguros').select('id,fecha_vencimiento,prima_anual').eq('user_id', user.id),
    supabase.from('inversiones').select('id,valor_actual,coste_total').eq('user_id', user.id),
    supabase.from('cuentas_ahorro').select('id,saldo,activa').eq('user_id', user.id),
    supabase.from('documentos').select('id,fecha_vencimiento').eq('user_id', user.id),
    getCalendarEvents(7),
    getUnreadThreads(),
  ])

  const classified = await classifyEmails(threads)
  const responder = classified.filter(e => e.categoria === 'responder_hoy')
  const esperando = classified.filter(e => e.categoria === 'esperando_respuesta')
  const informativos = classified.filter(e => e.categoria === 'informativo')

  // Stats rápidas para las cards
  const totalInversiones = (inversiones ?? []).reduce((s, i) => s + (i.valor_actual ?? i.coste_total ?? 0), 0)
  const totalAhorro = (cuentas ?? []).filter(c => c.activa).reduce((s, c) => s + (c.saldo ?? 0), 0)
  const totalPatrimonio = totalInversiones + totalAhorro

  const primaAnual = (seguros ?? []).reduce((s, seg) => s + (seg.prima_anual ?? 0), 0)

  // Alertas: seguros/documentos que vencen en <60 días
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  function diasHasta(f: string | null) {
    if (!f) return null
    const v = new Date(f); v.setHours(0, 0, 0, 0)
    return Math.round((v.getTime() - hoy.getTime()) / 86400000)
  }
  const segurosAlerta = (seguros ?? []).filter(s => {
    const d = diasHasta(s.fecha_vencimiento)
    return d !== null && d <= 60
  }).length
  const docAlerta = (documentos ?? []).filter(d => {
    const dias = diasHasta(d.fecha_vencimiento)
    return dias !== null && dias <= 60
  }).length

  // Tareas por urgencia
  const todayStr = hoy.toISOString().split('T')[0]
  const vencidas = tasks?.filter(t => t.fecha_limite && t.fecha_limite.slice(0,10) < todayStr) ?? []
  const hoyTasks = tasks?.filter(t => t.fecha_limite && t.fecha_limite.slice(0,10) === todayStr) ?? []
  const proximas = tasks?.filter(t => !t.fecha_limite || t.fecha_limite.slice(0,10) > todayStr) ?? []

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/auth/login')
  }

  async function createTask(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const titulo = formData.get('titulo') as string
    const fecha_limite = formData.get('fecha_limite') as string || null
    const prioridad = formData.get('prioridad') as string || 'media'
    if (!titulo?.trim()) return
    await supabase.from('tasks').insert({
      user_id: user.id,
      titulo: titulo.trim(),
      fecha_limite: fecha_limite || null,
      prioridad,
      estado: 'pendiente',
    })
    revalidatePath('/')
  }

  async function completeTask(formData: FormData) {
    'use server'
    const supabase = await createClient()
    const id = formData.get('id') as string
    await supabase.from('tasks').update({ estado: 'completada' }).eq('id', id)
    revalidatePath('/')
  }

  // Módulos
  const modulos: Modulo[] = [
    {
      href: '/finanzas',
      label: 'Gastos',
      descripcion: 'Extractos bancarios por mes',
      icon: <IconGastos />,
      color: 'bg-blue-100/60 text-blue-700',
    },
    {
      href: '/finanzas',
      label: 'Inversiones',
      descripcion: 'Fondos, ETFs y ahorro',
      icon: <IconInversiones />,
      color: 'bg-emerald-100/60 text-emerald-700',
      stat: totalPatrimonio > 0
        ? totalPatrimonio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
        : undefined,
      statLabel: totalPatrimonio > 0 ? 'patrimonio total' : undefined,
    },
    {
      href: '/seguros',
      label: 'Seguros',
      descripcion: 'Pólizas y renovaciones',
      icon: <IconSeguros />,
      color: 'bg-violet-100/60 text-violet-700',
      stat: primaAnual > 0
        ? primaAnual.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
        : undefined,
      statLabel: primaAnual > 0 ? 'al año en seguros' : undefined,
      alerta: segurosAlerta > 0 ? `${segurosAlerta} vence pronto` : undefined,
    },
    {
      href: '/luz',
      label: 'Luz',
      descripcion: 'Facturas e Iberdrola vs PVPC',
      icon: <IconLuz />,
      color: 'bg-amber-100/60 text-amber-700',
    },
    {
      href: '/documentos',
      label: 'Documentos',
      descripcion: 'ITV, recibos y contratos',
      icon: <IconDocumentos />,
      color: 'bg-slate-100/60 text-slate-700',
      alerta: docAlerta > 0 ? `${docAlerta} vence pronto` : undefined,
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between max-w-3xl mx-auto">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Panel de Vida</h1>
          <p className="text-xs text-muted-foreground">
            {hoy.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border rounded-lg transition-colors">
            Salir
          </button>
        </form>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-10">

        {/* MÓDULOS — grid 2-3 */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Áreas</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {modulos.map(m => <ModuloCard key={m.href + m.label} m={m} />)}
          </div>
        </section>

        {/* TAREAS */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Tareas</h2>

          {/* Formulario nueva tarea */}
          <form action={createTask} className="flex gap-2 flex-wrap">
            <input
              name="titulo"
              placeholder="Nueva tarea..."
              required
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              name="fecha_limite"
              type="date"
              className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              name="prioridad"
              className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-foreground text-background rounded-xl hover:opacity-80 transition-opacity"
            >
              Añadir
            </button>
          </form>

          {vencidas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Vencidas · {vencidas.length}</p>
              {vencidas.map(t => <TaskRow key={t.id} task={t} completeTask={completeTask} />)}
            </div>
          )}
          {hoyTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Hoy · {hoyTasks.length}</p>
              {hoyTasks.map(t => <TaskRow key={t.id} task={t} completeTask={completeTask} />)}
            </div>
          )}
          {proximas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Próximas · {proximas.length}</p>
              {proximas.map(t => <TaskRow key={t.id} task={t} completeTask={completeTask} />)}
            </div>
          )}
          {(tasks?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No hay tareas pendientes.</p>
          )}
        </section>

        {/* AGENDA */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <IconAgenda /> Agenda — próximos 7 días
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay eventos próximos.</p>
          ) : (
            <div className="space-y-2">
              {events.map(event => {
                const start = event.start?.dateTime
                  ? new Date(event.start.dateTime)
                  : event.start?.date ? new Date(event.start.date) : null
                const end = event.end?.dateTime ? new Date(event.end.dateTime) : null
                return (
                  <div key={event.id} className="p-3 rounded-xl border border-border flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 text-center pt-0.5">
                      <p className="text-lg font-bold leading-none">{start?.getDate()}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {start?.toLocaleDateString('es-ES', { month: 'short' })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{event.summary ?? '(Sin título)'}</p>
                      <p className="text-xs text-muted-foreground">
                        {start?.toLocaleDateString('es-ES', { weekday: 'short' })}
                        {start?.getHours() !== 0 && ` · ${start?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                        {end && ` → ${end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                      {event.hangoutLink && (
                        <a href={event.hangoutLink} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline">Unirse</a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* CORREOS */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <IconMail /> Correos
          </h2>

          {responder.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Responder hoy · {responder.length}</p>
              {responder.map(e => (
                <a key={e.id} href={`https://mail.google.com/mail/#inbox/${e.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.from}</p>
                    {e.resumen && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.resumen}</p>}
                  </div>
                  <IconChevronRight />
                </a>
              ))}
            </div>
          )}

          {esperando.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Esperando respuesta · {esperando.length}</p>
              {esperando.map(e => (
                <a key={e.id} href={`https://mail.google.com/mail/#inbox/${e.id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.from}</p>
                  </div>
                  <IconChevronRight />
                </a>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">{informativos.length} correos informativos</p>
        </section>

      </main>
    </div>
  )
}
