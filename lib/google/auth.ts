import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

/**
 * Devuelve un oauth2Client con credenciales válidas.
 * Si el access_token ha expirado (o expira en menos de 5 min),
 * usa el refresh_token para obtener uno nuevo.
 */
export async function getGoogleTokens() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.provider_token) {
    return null
  }

  // expires_at está en segundos (Unix timestamp)
  const expiresAt = session.expires_at ?? 0
  const ahoraEnSegundos = Math.floor(Date.now() / 1000)
  const margenSegundos = 5 * 60 // 5 minutos de margen

  const tokenCaducado = expiresAt - ahoraEnSegundos < margenSegundos

  if (tokenCaducado && session.provider_refresh_token) {
    // Renovar usando el refresh token
    oauth2Client.setCredentials({
      refresh_token: session.provider_refresh_token,
    })

    try {
      const { credentials } = await oauth2Client.refreshAccessToken()

      // Actualizar la sesión en Supabase con el nuevo access_token
      // Supabase no expone directamente setSession con provider_token,
      // pero podemos actualizar el cliente OAuth2 con las nuevas credenciales
      oauth2Client.setCredentials({
        access_token: credentials.access_token ?? undefined,
        refresh_token: session.provider_refresh_token,
        expiry_date: credentials.expiry_date ?? undefined,
      })

      return oauth2Client
    } catch {
      // Si falla el refresh (token revocado, etc.), devolvemos null
      // para que la app redirija al login
      return null
    }
  }

  // Token todavía válido
  oauth2Client.setCredentials({
    access_token: session.provider_token,
    refresh_token: session.provider_refresh_token ?? undefined,
  })

  return oauth2Client
}
