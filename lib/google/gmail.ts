import { google } from 'googleapis'
import { getGoogleTokens } from './auth'

export async function getUnreadThreads() {
  const auth = await getGoogleTokens()
  if (!auth) return []

  const gmail = google.gmail({ version: 'v1', auth })

  try {
    const response = await gmail.users.threads.list({
      userId: 'me',
      q: 'is:unread newer_than:2d',
      maxResults: 20,
    })

    const threads = response.data.threads ?? []

    const detailed = await Promise.all(
      threads.map(async (thread) => {
        const detail = await gmail.users.threads.get({
          userId: 'me',
          id: thread.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        })

        const msg = detail.data.messages?.[0]
        const headers = msg?.payload?.headers ?? []
        const get = (name: string) =>
          headers.find((h) => h.name === name)?.value ?? ''

        return {
          id: thread.id!,
          subject: get('Subject'),
          from: get('From'),
          date: get('Date'),
          snippet: msg?.snippet ?? '',
        }
      })
    )

    return detailed
  } catch (error) {
    console.error('Error fetching Gmail threads:', error)
    return []
  }
}