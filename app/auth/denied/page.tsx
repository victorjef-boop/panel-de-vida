export default function DeniedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 p-8 border border-border rounded-lg text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Acceso denegado</h1>
        <p className="text-sm text-muted-foreground">
          Esta aplicación es de uso personal. Tu cuenta no tiene acceso.
        </p>
        <a
          href="/auth/login"
          className="inline-block text-sm underline underline-offset-4 hover:text-foreground text-muted-foreground"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  )
}