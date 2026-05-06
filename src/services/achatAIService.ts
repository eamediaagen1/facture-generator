import { supabase } from './supabaseClient';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { Achat, InvoiceAIDocType, InvoiceDraftPrefill } from '../types';

async function parseFunctionError(error: unknown, fallback: string): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    let message = error.message;
    try {
      const json = await error.context.json() as { error?: string; details?: string };
      if (json.error) message = json.error;
    } catch { /* response body wasn't JSON, fall through */ }
    return new Error(message);
  }
  return new Error(error instanceof Error ? error.message : fallback);
}

export async function extractAchatFromFile(file: File): Promise<Achat> {
  const body = new FormData();
  body.append('file', file);

  const { data, error } = await supabase.functions.invoke('extract-achat', { body });

  if (error) {
    throw await parseFunctionError(error, "Erreur lors de l'extraction IA");
  }

  if (!data?.achat) throw new Error("Réponse invalide du service d'extraction");
  return data.achat as Achat;
}

type RawInvoiceDraft = {
  client?: unknown;
  document_type?: unknown;
  notes?: unknown;
  confidence?: unknown;
  items?: Array<{
    designation?: unknown;
    quantity?: unknown;
    unit_price?: unknown;
    unitPrice?: unknown;
  }>;
};

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : fallback;
}

export async function extractInvoiceDraftWithAI({
  docType,
  text,
  file,
}: {
  docType: InvoiceAIDocType;
  text: string;
  file?: File | null;
}): Promise<InvoiceDraftPrefill> {
  // Use supabase.functions.invoke - it handles auth & CORS
  const body = new FormData();
  body.append('intent', 'invoice_draft');
  body.append('doc_type', docType);
  body.append('prompt', text);
  if (file) body.append('file', file);

  console.log('[extractInvoiceDraftWithAI] Invoking extract-achat function');
  console.log('[extractInvoiceDraftWithAI] FormData:', { intent: 'invoice_draft', doc_type: docType, prompt: text.substring(0, 50), hasFile: !!file });

  try {
    const { data, error } = await supabase.functions.invoke('extract-achat', {
      body,
    });

    console.log('[extractInvoiceDraftWithAI] Response:', { data, error });

    if (error) {
      console.error('[extractInvoiceDraftWithAI] Function error:', error);
      throw await parseFunctionError(error, "Erreur lors de l'analyse IA");
    }

    const draft = data?.draft as RawInvoiceDraft | undefined;
    if (!draft?.items || !Array.isArray(draft.items)) {
      throw new Error("Réponse IA invalide : aucune ligne article détectée");
    }

    const items = draft.items
      .map(item => ({
        id: crypto.randomUUID(),
        designation: String(item.designation ?? '').trim(),
        quantity: Math.max(0, toNumber(item.quantity, 1)),
        unitPrice: Math.max(0, toNumber(item.unit_price ?? item.unitPrice, 0)),
      }))
      .filter(item => item.designation && item.quantity > 0);

    if (items.length === 0) {
      throw new Error("Aucune ligne article exploitable détectée. Ajoutez plus de détails dans votre prompt.");
    }

    const notes = String(draft.notes ?? '').trim();
    const confidence = toNumber(draft.confidence, 0);
    const documentType = String(draft.document_type ?? 'facture').toLowerCase();
    const validDocTypes = ['facture', 'devis', 'bon_livraison'];
    const docType = validDocTypes.includes(documentType) ? documentType : 'facture';

    return {
      client: String(draft.client ?? '').trim(),
      items,
      documentType: docType as any,
      aiDraft: true,
      aiNotes: [
        notes ? `Notes IA : ${notes}` : '',
        confidence ? `Confiance IA : ${Math.round(confidence * 100)}%` : '',
      ].filter(Boolean).join(' · ') || 'Brouillon généré par IA. Aucun enregistrement automatique.',
    };
  } catch (err) {
    console.error('[extractInvoiceDraftWithAI] Caught error:', err);
    throw err;
  }
}
