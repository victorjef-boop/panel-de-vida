import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export type EmailCategory = 'responder_hoy' | 'esperando_respuesta' | 'informativo'

export interface ClassifiedEmail {
  id: string
  subject: string
  from: string
  snippet: string
  categoria: EmailCategory
  resumen: string
}

export async function classifyEmails(
  emails: { id: string; subject: string; from: string; snippet: string }[]
): Promise<ClassifiedEmail[]> {
  if (emails.length === 0) return []

  const prompt = `Clasifica estos correos electrónicos en una de estas categorías:
- responder_hoy: pregunta directa, solicitud urgente o remitente importante
- esperando_respuesta: yo envié el último mensaje, estoy esperando respuesta
- informativo: boletines, notificaciones automáticas, publicidad

Para cada correo devuelve un JSON con: id, categoria, resumen (máximo 10 palabras).

Correos:
${emails.map((e) => `ID: ${e.id}\nDe: ${e.from}\nAsunto: ${e.subject}\nFragmento: ${e.snippet}`).join('\n---\n')}

Responde SOLO con un array JSON válido, sin texto adicional.`

  try {
    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return []

    const classifications = JSON.parse(content.text)

    return emails.map((email) => {
      const classification = classifications.find((c: { id: string }) => c.id === email.id)
      return {
        ...email,
        categoria: classification?.categoria ?? 'informativo',
        resumen: classification?.resumen ?? email.subject,
      }
    })
  } catch (error) {
    console.error('Error classifying emails:', error)
    return emails.map((e) => ({ ...e, categoria: 'informativo' as EmailCategory, resumen: e.subject }))
  }
}