import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_SIZE = 5 * 1024 * 1024

const EXT_MIME: Record<string, string> = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
}

function fileExt(filename: string): string {
  return (filename.split('.').pop() ?? '').trim().toLowerCase()
}

function resolvedMime(file: File): string {
  const fromType = (file.type ?? '').trim().toLowerCase()
  if (fromType && fromType !== 'application/octet-stream') return fromType
  return EXT_MIME[fileExt(file.name)] ?? ''
}

function errorResponse(status: number, message: string, details?: string): Response {
  return new Response(JSON.stringify({ error: message, ...(details ? { details } : {}) }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const PROMPT = `You are an expert at extracting structured financial data from bank statements in any language (French, Arabic, English, Spanish).

Analyze this bank statement document carefully.

Return ONLY a valid JSON object with exactly these fields:
{
  "month": <integer — month of the statement period, 1-12>,
  "year": <integer — 4-digit year of the statement period>,
  "opening_balance": <number — opening/starting balance at the beginning of the period, or null if not found>,
  "total_credit": <number — total sum of all credit/incoming/deposit transactions>,
  "total_debit": <number — total sum of all debit/outgoing/withdrawal transactions, expressed as a positive number>,
  "closing_balance": <number — closing/ending balance at the end of the period, or null if not found>,
  "notes": "<string — brief summary: account holder name and/or account number if visible, max 150 chars, empty string if nothing to report>",
  "confidence": <number — your confidence from 0.0 to 1.0 in the accuracy of the extraction>
}

Rules:
- All monetary values must be actual numbers, never strings
- If a value cannot be determined, use null
- month must be an integer between 1 and 12
- year must be a 4-digit integer
- Debit/withdrawal amounts must be expressed as POSITIVE numbers
- If only individual transactions are listed (no pre-computed totals):
  * Sum all credit/incoming/deposit entries for total_credit
  * Sum all debit/outgoing/withdrawal entries for total_debit
  * Use the first balance row as opening_balance, the last balance row as closing_balance
- Handle French labels: Solde, Solde d'ouverture, Crédit, Débit, Versement, Retrait, Virement
- Handle English labels: Balance, Opening Balance, Closing Balance, Credit, Debit, Deposit, Withdrawal
- Handle Arabic labels appropriately
- Do not wrap the JSON in markdown code blocks
- Return only the JSON object, no other text`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed')

  try {
    // 1. Authenticate
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse(401, 'En-tête Authorization manquant')
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return errorResponse(401, 'Token invalide ou expiré')

    // 2. Parse FormData
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return errorResponse(400, 'Corps de la requête invalide (FormData attendu)')
    }

    const file = form.get('file') as File | null
    if (!file) return errorResponse(400, 'Aucun fichier fourni (champ "file" manquant)')

    // 3. Validate file type and size
    const mimeType = resolvedMime(file)
    const ext      = fileExt(file.name)

    let branch: 'pdf' | 'image' | null = null
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      branch = 'pdf'
    } else if (['image/jpeg', 'image/png'].includes(mimeType) || ['jpg', 'jpeg', 'png'].includes(ext)) {
      branch = 'image'
    }

    console.log(`[extract-bank-statement] file="${file.name}" mime="${mimeType}" ext="${ext}" branch="${branch ?? 'unsupported'}"`)

    if (!branch) {
      return errorResponse(400, `Type de fichier non supporté: "${mimeType || ext || file.name}". Acceptés: PDF, JPG, PNG`)
    }
    if (file.size > MAX_SIZE) {
      return errorResponse(400, `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} MB, max 5 MB)`)
    }

    const fileBytes = await file.arrayBuffer()

    // 4. Upload to storage (best-effort)
    const timestamp   = Date.now()
    const storagePath = `${user.id}/${timestamp}.${ext || 'bin'}`

    let fileUrl: string | null  = null
    let filePath: string | null = null

    const { error: storageError } = await supabase.storage
      .from('bank-statements')
      .upload(storagePath, fileBytes, { contentType: mimeType, upsert: false })

    if (!storageError) {
      const { data } = supabase.storage.from('bank-statements').getPublicUrl(storagePath)
      fileUrl  = data.publicUrl
      filePath = storagePath
    } else {
      console.warn('[extract-bank-statement] Storage upload failed:', storageError.message)
    }

    // 5. Check OpenAI key
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return errorResponse(500, 'OPENAI_API_KEY non configurée dans les secrets de la fonction')

    // 6. Build OpenAI input
    let inputContent: unknown[]
    let fileIdToCleanup: string | null = null

    if (branch === 'pdf') {
      const oaForm = new FormData()
      oaForm.append('file', new Blob([fileBytes], { type: mimeType }), file.name)
      oaForm.append('purpose', 'user_data')

      const uploadRes = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: oaForm,
      })

      if (!uploadRes.ok) {
        const errText = await uploadRes.text()
        return errorResponse(502, "Échec de l'envoi du fichier à OpenAI", errText)
      }

      const uploadJson = await uploadRes.json()
      const fileId: string = uploadJson.id
      if (!fileId) return errorResponse(502, "OpenAI Files API n'a pas retourné d'ID de fichier")
      fileIdToCleanup = fileId

      inputContent = [
        { type: 'input_file', file_id: fileId },
        { type: 'input_text', text: PROMPT },
      ]
    } else {
      const uint8 = new Uint8Array(fileBytes)
      let binary = ''
      for (let i = 0; i < uint8.length; i += 8192) {
        binary += String.fromCharCode(...uint8.subarray(i, i + 8192))
      }
      const base64 = btoa(binary)

      inputContent = [
        { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` },
        { type: 'input_text', text: PROMPT },
      ]
    }

    // 7. Call OpenAI Responses API
    const respRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: [{ role: 'user', content: inputContent }],
        text:  { format: { type: 'json_object' } },
      }),
    })

    // Cleanup OpenAI file (PDFs only)
    if (fileIdToCleanup) {
      fetch(`https://api.openai.com/v1/files/${fileIdToCleanup}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${openaiKey}` },
      }).catch(() => { /* ignore */ })
    }

    if (!respRes.ok) {
      const errText = await respRes.text()
      return errorResponse(502, "Échec de l'analyse IA", errText)
    }

    const respJson = await respRes.json()
    const rawText: string = respJson?.output?.[0]?.content?.[0]?.text ?? ''
    if (!rawText) throw new Error('Réponse IA vide ou format inattendu')

    // 8. Parse AI response
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawText)
    } catch {
      throw new Error(`Réponse IA non parsable: ${rawText.slice(0, 200)}`)
    }

    // 9. Build and insert bank_statement record
    const now = new Date().toISOString()

    const month          = Math.min(12, Math.max(1, Math.round(Number(parsed.month)  || new Date().getMonth() + 1)))
    const year           = Number(parsed.year)            || new Date().getFullYear()
    const openingBalance = Number(parsed.opening_balance) || 0
    const totalCredit    = Number(parsed.total_credit)    || 0
    const totalDebit     = Number(parsed.total_debit)     || 0
    let   closingBalance = Number(parsed.closing_balance) || 0
    if (!closingBalance) closingBalance = openingBalance + totalCredit - totalDebit

    const statement = {
      id:              crypto.randomUUID(),
      user_id:         user.id,
      month,
      year,
      opening_balance: openingBalance,
      total_credit:    totalCredit,
      total_debit:     totalDebit,
      closing_balance: closingBalance,
      notes:           String(parsed.notes ?? '').trim().slice(0, 200),
      file_url:        fileUrl,
      file_path:       filePath,
      status:          'needs_review',
      raw_json:        parsed,
      created_at:      now,
      updated_at:      now,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('bank_statements')
      .insert(statement)
      .select()
      .single()

    if (insertError) throw insertError

    return new Response(JSON.stringify({ statement: inserted }), {
      status:  200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur interne du serveur'
    return errorResponse(500, msg)
  }
})
