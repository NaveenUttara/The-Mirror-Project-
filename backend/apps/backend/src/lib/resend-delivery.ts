export type ResendAttachment = {
  filename: string
  content: string
}

export type ResendRecipientResult = {
  recipient: string
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendResendToEachRecipient(options: {
  apiKey: string
  from: string
  recipients: string[]
  subject: string
  html: string
  attachments?: ResendAttachment[]
}): Promise<{ results: ResendRecipientResult[]; acceptedCount: number }> {
  const unique = [...new Set(
    options.recipients
      .map((entry) => entry.trim())
      .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)),
  )]

  const results: ResendRecipientResult[] = []
  let acceptedCount = 0

  for (const recipient of unique) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [recipient],
          subject: options.subject,
          html: options.html,
          attachments: options.attachments,
        }),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => "")
        throw new Error(`Resend API ${response.status}: ${detail.slice(0, 500)}`)
      }

      const body = await response.json().catch(() => null) as { id?: string } | null
      results.push({ recipient, ok: true, messageId: body?.id })
      acceptedCount += 1
    } catch (error) {
      results.push({
        recipient,
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      })
    }
  }

  return { results, acceptedCount }
}
