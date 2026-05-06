import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function errorResponse(status: number, message: string): Response {
  console.error(`[send-mail] Error: ${message}`)
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function successResponse(message: string): Response {
  console.log(`[send-mail] Success: ${message}`)
  return new Response(JSON.stringify({ success: true, message }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface SendMailRequest {
  invoiceId: string
  documentType: 'facture' | 'devis' | 'bon_livraison'
  documentNumber: string
  recipientEmail: string
  clientName: string
}

async function getPdfAsBuffer(supabaseClient: any, pdfPath: string): Promise<Uint8Array> {
  const { data, error } = await supabaseClient.storage
    .from('invoice-pdfs')
    .download(pdfPath)

  if (error || !data) {
    throw new Error(`PDF download failed: ${error?.message || 'No data'}`)
  }

  return new Uint8Array(await data.arrayBuffer())
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function sendEmailViaSMTP(
  to: string,
  subject: string,
  body: string,
  pdfBuffer: Uint8Array,
  attachmentFilename: string,
): Promise<void> {
  const smtpHost = Deno.env.get('SMTP_HOST')
  const smtpPort = Deno.env.get('SMTP_PORT')
  const smtpSecure = Deno.env.get('SMTP_SECURE') === 'true'
  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')
  const smtpFromEmail = Deno.env.get('SMTP_FROM_EMAIL')
  const smtpFromName = Deno.env.get('SMTP_FROM_NAME')

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFromEmail) {
    throw new Error('SMTP configuration incomplete: check all secrets are set')
  }

  const port = parseInt(smtpPort, 10)
  const fromAddress = smtpFromName ? `"${smtpFromName}" <${smtpFromEmail}>` : smtpFromEmail

  // Build MIME message with PDF attachment
  const boundary = `boundary_${Date.now()}`
  const pdfBase64 = btoa(String.fromCharCode(...pdfBuffer))

  const emailMessage = [
    `From: ${fromAddress}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${attachmentFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${attachmentFilename}"`,
    '',
    pdfBase64.replace(/(.{76})/g, '$1\n'),
    '',
    `--${boundary}--`,
  ].join('\r\n')

  console.log(`[send-mail] Connecting to ${smtpHost}:${port}`)

  // Connect to SMTP server
  const conn = await Deno.connect({
    hostname: smtpHost,
    port: port,
    transport: 'tcp',
  })

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const write = async (data: string) => {
    await conn.write(encoder.encode(data))
  }

  const readResponse = async (): Promise<string> => {
    const buffer = new Uint8Array(4096)
    const bytesRead = await conn.read(buffer)
    if (bytesRead === null) return ''
    return decoder.decode(buffer.subarray(0, bytesRead))
  }

  try {
    // Read banner
    let response = await readResponse()
    if (!response.includes('220')) {
      throw new Error(`SMTP banner error: ${response}`)
    }

    // EHLO
    await write('EHLO localhost\r\n')
    response = await readResponse()

    // STARTTLS if secure
    if (smtpSecure) {
      await write('STARTTLS\r\n')
      response = await readResponse()
      // Note: In a real production scenario, we'd upgrade to TLS here
      // For now, we assume port 465 has SSL from start
    }

    // AUTH LOGIN
    await write('AUTH LOGIN\r\n')
    response = await readResponse()
    if (!response.includes('334')) {
      throw new Error('SMTP AUTH not supported')
    }

    // Send username (base64)
    const userB64 = btoa(smtpUser)
    await write(`${userB64}\r\n`)
    response = await readResponse()

    // Send password (base64)
    const passB64 = btoa(smtpPass)
    await write(`${passB64}\r\n`)
    response = await readResponse()
    if (!response.includes('235')) {
      throw new Error(`SMTP authentication failed: ${response}`)
    }

    // MAIL FROM
    await write(`MAIL FROM:<${smtpFromEmail}>\r\n`)
    response = await readResponse()
    if (!response.includes('250')) {
      throw new Error(`MAIL FROM failed: ${response}`)
    }

    // RCPT TO
    await write(`RCPT TO:<${to}>\r\n`)
    response = await readResponse()
    if (!response.includes('250')) {
      throw new Error(`RCPT TO failed: ${response}`)
    }

    // DATA
    await write('DATA\r\n')
    response = await readResponse()
    if (!response.includes('354')) {
      throw new Error(`DATA failed: ${response}`)
    }

    // Send email
    await write(emailMessage)
    await write('\r\n.\r\n')
    response = await readResponse()
    if (!response.includes('250')) {
      throw new Error(`Send failed: ${response}`)
    }

    // QUIT
    await write('QUIT\r\n')
    conn.close()

    console.log(`[send-mail] Email sent successfully to ${to}`)
  } catch (err) {
    conn.close()
    throw err
  }
}

Deno.serve(async (req: Request) => {
  console.log(`[send-mail] ${req.method}`)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed')
  }

  try {
    const reqBody = await req.json() as SendMailRequest

    if (!reqBody.invoiceId || !reqBody.documentType || !reqBody.recipientEmail || !reqBody.documentNumber) {
      return errorResponse(400, 'Missing required fields')
    }

    if (!validateEmail(reqBody.recipientEmail)) {
      return errorResponse(400, 'Invalid email address')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse(500, 'Supabase not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('factures')
      .select('*')
      .eq('id', reqBody.invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return errorResponse(404, 'Invoice not found')
    }

    if (!invoice.pdf_path) {
      return errorResponse(400, 'No PDF available for this document')
    }

    // Get PDF
    const pdfBuffer = await getPdfAsBuffer(supabase, invoice.pdf_path)

    // Prepare email
    const docTypeLabel = {
      facture: 'Facture',
      devis: 'Devis',
      bon_livraison: 'Bon de livraison',
    }[reqBody.documentType] || reqBody.documentType

    const subject = `${docTypeLabel} ${reqBody.documentNumber} - AMOR AMENAGEMENT`
    const emailBody = `Bonjour ${reqBody.clientName},\n\nVeuillez trouver ci-joint votre ${reqBody.documentType === 'bon_livraison' ? 'bon de livraison' : reqBody.documentType} ${reqBody.documentNumber}.\n\nCordialement,\nAMOR AMENAGEMENT`
    const pdfFilename = `${reqBody.documentType}-${reqBody.documentNumber}.pdf`

    // Send email
    await sendEmailViaSMTP(reqBody.recipientEmail, subject, emailBody, pdfBuffer, pdfFilename)

    return successResponse(`Email sent to ${reqBody.recipientEmail}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[send-mail] ${message}`)
    return errorResponse(500, message)
  }
})
