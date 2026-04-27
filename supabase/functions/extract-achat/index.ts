import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_SIZE = 5 * 1024 * 1024

// MIME type by extension — covers empty type, application/octet-stream, and uppercase extensions (.JPG)
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
  // Ignore generic octet-stream — fall through to extension detection
  if (fromType && fromType !== 'application/octet-stream') return fromType
  return EXT_MIME[fileExt(file.name)] ?? ''
}

function errorResponse(status: number, message: string, details?: string): Response {
  return new Response(JSON.stringify({ error: message, ...(details ? { details } : {}) }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function mapPaymentStatus(raw: string): string {
  const s = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (s === 'paid' || s === 'paye') return 'Payé'
  return 'Non payé'
}

function mapPaymentMethod(raw: string): string {
  const s = raw.toLowerCase()
  if (s === 'bank_transfer' || s === 'direct_debit' || s === 'virement') return 'Virement'
  if (s === 'cash' || s === 'espece' || s === 'espèce') return 'Espèce'
  if (s === 'check' || s === 'cheque' || s === 'chèque') return 'Chèque'
  if (s === 'card' || s === 'carte') return 'Carte'
  return 'Virement'
}

function mapCategory(raw: string): string {
  const s = raw.toLowerCase()
  const MAP: Record<string, string> = {
    materials:            'Matériaux',
    materiaux:            'Matériaux',
    'matériaux':          'Matériaux',
    equipments:           'Équipements',
    equipements:          'Équipements',
    'équipements':        'Équipements',
    rent:                 'Loyer',
    loyer:                'Loyer',
    utilities:            'Services',
    services:             'Services',
    transport:            'Transport',
    subcontractor:        'Sous-traitance',
    'sous-traitance':     'Sous-traitance',
    office:               'Fournitures de bureau',
    'fournitures de bureau': 'Fournitures de bureau',
    insurance:            'Assurance',
    assurance:            'Assurance',
    software:             'Logiciels',
    logiciels:            'Logiciels',
    taxes:                'Taxes',
    taxe:                 'Taxes',
    other:                'Autre',
    autre:                'Autre',
  }
  return MAP[s] ?? (raw.trim() || 'Autre')
}

const PROMPT = `You are an expert at extracting structured data from supplier invoices written in any language (French, Arabic, English, etc.).
Analyze this document carefully and extract all invoice information.

Return ONLY a valid JSON object with exactly these fields:
{
  "supplier_name": "string — supplier/vendor company or person name",
  "invoice_date": "string — date in YYYY-MM-DD format; use today's date if not found",
  "supplier_invoice_number": "string — invoice reference number, empty string if not found",
  "category": "string — one of exactly: materials, rent, utilities, transport, subcontractor, office, insurance, software, taxes, other",
  "description": "string — concise description of goods or services (max 200 chars)",
  "amount_ht": "number — amount excluding tax (HT), 0 if not applicable",
  "tva": "number — tax amount in currency units (not percentage), 0 if not applicable",
  "amount_ttc": "number — total amount including tax (TTC)",
  "payment_status": "string — one of exactly: paid, unpaid",
  "payment_method": "string — one of exactly: bank_transfer, cash, check, card",
  "notes": "string — payment terms, due date, or any other relevant notes",
  "confidence": "number — your confidence 0.0 to 1.0 in the extraction accuracy"
}

Rules:
- All monetary values must be actual numbers, never strings
- If amount_ttc is missing, compute it as amount_ht + tva
- If amount_ht is missing but amount_ttc and tva are present, compute amount_ht = amount_ttc - tva
- Dates must be in YYYY-MM-DD format; convert any other format
- Do not wrap the JSON in markdown code blocks
- Return only the JSON object, no other text`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed')

  try {
    // 1. Authenticate user
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

    // 3. Resolve MIME type and determine branch — both MIME and extension are checked
    const mimeType = resolvedMime(file)
    const ext      = fileExt(file.name)

    // Derive branch explicitly from MIME AND extension so uppercase/octet-stream can't sneak through
    let branch: 'pdf' | 'image' | null = null
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      branch = 'pdf'
    } else if (['image/jpeg', 'image/png'].includes(mimeType) || ['jpg', 'jpeg', 'png'].includes(ext)) {
      branch = 'image'
    }

    console.log(`[extract-achat] file="${file.name}" rawType="${file.type}" mime="${mimeType}" ext="${ext}" branch="${branch ?? 'unsupported'}"`)

    if (!branch) {
      return errorResponse(400, `Type de fichier non supporté: "${mimeType || ext || file.name}". Acceptés: PDF, JPG, PNG`)
    }
    if (file.size > MAX_SIZE) {
      return errorResponse(400, `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} MB, max 5 MB)`)
    }

    const fileBytes = await file.arrayBuffer()

    // 4. Upload to Supabase Storage (best-effort — don't block on failure)
    const timestamp = Date.now()
    const storagePath = `${user.id}/achats/${timestamp}.${ext || 'bin'}`

    let fileUrl: string | null = null
    let filePath: string | null = null

    const { error: storageError } = await supabase.storage
      .from('achats-files')
      .upload(storagePath, fileBytes, { contentType: mimeType, upsert: false })

    if (!storageError) {
      const { data } = supabase.storage.from('achats-files').getPublicUrl(storagePath)
      fileUrl = data.publicUrl
      filePath = storagePath
    }

    // 5. Check OpenAI key
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) return errorResponse(500, 'OPENAI_API_KEY non configurée dans les secrets de la fonction')

    // 6. Build OpenAI input content — PDFs via Files API, images via base64 (never via Files API)
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
      // JPG / PNG — encode as base64 data URL, no Files API upload needed
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
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: [{ role: 'user', content: inputContent }],
        text: { format: { type: 'json_object' } },
      }),
    })

    // Cleanup OpenAI file if one was uploaded (PDFs only)
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

    // 9. Build and insert achat record
    const now = new Date().toISOString()
    const amountHt  = Number(parsed.amount_ht)  || 0
    const tva       = Number(parsed.tva)         || 0
    let   amountTtc = Number(parsed.amount_ttc)  || 0
    if (!amountTtc) amountTtc = amountHt + tva

    const achat = {
      id:                      crypto.randomUUID(),
      user_id:                 user.id,
      supplier_name:           String(parsed.supplier_name    ?? '').trim(),
      invoice_date:            String(parsed.invoice_date     ?? '').trim(),
      supplier_invoice_number: String(parsed.supplier_invoice_number ?? '').trim(),
      category:                mapCategory(String(parsed.category ?? '')),
      description:             String(parsed.description      ?? '').trim(),
      amount_ht:               amountHt,
      tva:                     tva,
      amount_ttc:              amountTtc,
      payment_status:          mapPaymentStatus(String(parsed.payment_status ?? '')),
      payment_method:          mapPaymentMethod(String(parsed.payment_method ?? '')),
      notes:                   String(parsed.notes ?? '').trim(),
      file_url:                fileUrl,
      file_path:               filePath,
      status:                  'needs_review',
      raw_json:                parsed,
      ai_confidence:           Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
      created_at:              now,
      updated_at:              now,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('achats')
      .insert(achat)
      .select()
      .single()

    if (insertError) throw insertError

    return new Response(JSON.stringify({ achat: inserted }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur interne du serveur'
    return errorResponse(500, msg)
  }
})
