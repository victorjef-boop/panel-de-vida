import { google } from 'googleapis'
import { getGoogleTokens } from './auth'

export async function getCalendarEvents(daysAhead = 1) {
  const auth = await getGoogleTokens()
  if (!auth) return []

  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const end = new Date()
  end.setDate(end.getDate() + daysAhead)

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })

    return response.data.items ?? []
  } catch (error) {
    console.error('Error fetching calendar events:', error)
    return []
  }
}