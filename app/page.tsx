

Page · TSX
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCalendarEvents } from '@/lib/google/calendar'
import { getUnreadThreads } from '@/lib/google/gmail'
import { classifyEmails } from '@/lib/anthropic'
import { revalidatePath } from 'next/cache'
import { connection } from 'next/server'
 
export const dynamic = 'force-dynamic'
 
export default async function Home() {
  await connection()
 
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
 
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .neq('estado', 'completada')
    .order('fecha_limite', { ascending: true, nullsFirst: false })
 
  const [events, threads] = await Promise.all([
    getCalendarEvents(7),
    getUnreadThreads(),
  ])
  const classified = await classifyEmails(threads)
  const responder = classified.filter((e) => e.categoria === 'responder_hoy')
  const esperando = classified.filter((e) => e.categoria === 'esperando_respuesta')
  const informativos = classified.filter((e) => e.categoria === 'informativo')
 
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
 
  const vencidas = tasks?.filter(t => t.fecha_limite && t.fecha_limite.slice(0, 10) < todayStr) ?? []
  const hoy = tasks?.filter(t => t.fecha_limite && t.fecha_limite.slice(0, 10) === todayStr) ?? []
  const proximas = tasks?.filter(t => !t.fecha_limite || t.fecha_limite.slice(0, 10) > todayStr) ?? []
 
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
 
  return (
    <div className="min-h-screen bg-background p-6 max-w-2xl mx-auto space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Panel de Vida</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
            Cerrar sesión
          </button>
        </form>
      </div>
 
      {/* AGENDA */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Agenda — próximos 7 días</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay eventos próximos.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const start = event.start?.dateTime
                ? new Date(event.start.dateTime)
                : event.start?.date ? new Date(event.start.date) : null
              const end = event.end?.dateTime ? new Date(event.end.dateTime) : null
              return (
                <div key={event.id} className="p-3 border border-border rounded-md space-y-1">
                  <p className="font-medium text-sm">{event.summary ?? '(Sin título)'}</p>
                  <p className="text-xs text-muted-foreground">
                    {start?.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {start?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    {end && ` → ${end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                  {event.hangoutLink && (
                    <a href={event.hangoutLink} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline">Unirse a videollamada</a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
 
      {/* TAREAS */}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Tareas</h2>
        <form action={createTask} className="flex gap-2 flex-wrap">
          <input name="titulo" placeholder="Nueva tarea..." required
            className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          <input name="fecha_limite" type="date"
            className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          <select name="prioridad"
            className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
          <button type="submit"
            className="px-4 py-2 text-sm bg-foreground text-background rounded-md hover:opacity-80">
            Añadir
          </button>
        </form>
 
        {vencidas.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-600">Vencidas ({vencidas.length})</p>
            {vencidas.map(t => <TaskRow key={t.id} task={t} completeTask={completeTask} />)}
          </div>
        )}
        {hoy.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-orange-600">Hoy ({hoy.length})</p>
            {hoy.map(t => <TaskRow key={t.id} task={t} completeTask={completeTask} />)}
          </div>
        )}
        {proximas.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Próximas ({proximas.length})</p>
            {proximas.map(t => <TaskRow key={t.id} task={t} completeTask={completeTask} />)}
          </div>
        )}
        {(tasks?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No hay tareas pendientes.</p>
        )}
      </section>
 
      {/* CORREOS */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Correos</h2>
        {responder.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-600">Responder hoy ({responder.length})</p>
            {responder.map((e) => (
              <a key={e.id} href={`https://mail.google.com/mail/#inbox/${e.id}`}
                target="_blank" rel="noopener noreferrer"
                className="block p-3 border border-red-200 rounded-md hover:bg-red-50 space-y-1">
                <p className="text-sm font-medium">{e.subject}</p>
                <p className="text-xs text-muted-foreground">{e.from}</p>
                <p className="text-xs text-muted-foreground">{e.resumen}</p>
              </a>
            ))}
          </div>
        )}
        {esperando.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-yellow-600">Esperando respuesta ({esperando.length})</p>
            {esperando.map((e) => (
              <a key={e.id} href={`https://mail.google.com/mail/#inbox/${e.id}`}
                target="_blank" rel="noopener noreferrer"
                className="block p-3 border border-yellow-200 rounded-md hover:bg-yellow-50 space-y-1">
                <p className="text-sm font-medium">{e.subject}</p>
                <p className="text-xs text-muted-foreground">{e.from}</p>
              </a>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground">{informativos.length} correos informativos</p>
      </section>
    </div>
  )
}
 
function TaskRow({ task, completeTask }: { task: any, completeTask: (fd: FormData) => Promise<void> }) {
  const prioColors: Record<string, string> = {
    alta: 'text-red-500',
    media: 'text-yellow-500',
    baja: 'text-green-500',
  }
  return (
    <div className="flex items-center gap-3 p-3 border border-border rounded-md">
      <form action={completeTask}>
        <input type="hidden" name="id" value={task.id} />
        <button type="submit"
          className="w-4 h-4 border border-border rounded-sm hover:bg-muted flex-shrink-0"
          title="Marcar completada" />
      </form>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{task.titulo}</p>
        {task.fecha_limite && (
          <p className="text-xs text-muted-foreground">
            {new Date(task.fecha_limite.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </p>
        )}
      </div>
      <span className={`text-xs ${prioColors[task.prioridad] ?? ''}`}>{task.prioridad}</span>
    </div>
  )
}
 
Claude ha terminado la respuesta

        