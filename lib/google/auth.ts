import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export async function getGoogleTokens() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.provider_token) {
    return null
  }

  oauth2Client.setCredentials({
    access_token: session.provider_token,
    refresh_token: session.provider_refresh_token ?? undefined,
  })

  return oauth2Client
}