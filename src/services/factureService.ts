import { supabase } from './supabaseClient';
import type { Invoice, InvoiceStatus, DocumentType } from '../types';

// ── Mappers ──────────────────────────────────────────────────────────────────

type OverlaysJson = {
  stampPos?: { x: number; y: number };
  signaturePos?: { x: number; y: number };
  signatureData?: string;
};

function toInvoice(row: Record<string, unknown>): Invoice {
  const ov = (row.overlays ?? {}) as OverlaysJson;
  return {
    id:        row.id        as string,
    number:    row.number    as string,
    client:    row.client    as string,
    date:      row.date      as string,
    items:     row.items     as Invoice['items'],
    tvaRate:   row.tva_rate  as number,
    totalHT:   row.total_ht  as number,
    tvaAmount: row.tva_amount as number,
    totalTTC:  row.total_ttc as number,
    status:        row.status         as InvoiceStatus,
    documentType:  (row.document_type as DocumentType | undefined) ?? 'facture',
    createdAt:     row.created_at     as string,
    originDevisId: row.origin_devis_id as string | undefined,
    clientId:      row.client_id       as string | undefined,
    stampPos:      ov.stampPos,
    signaturePos:  ov.signaturePos,
    signatureData: ov.signatureData,
  };
}

function toRow(inv: Invoice) {
  const overlays: OverlaysJson = {};
  if (inv.stampPos)     overlays.stampPos     = inv.stampPos;
  if (inv.signaturePos) overlays.signaturePos = inv.signaturePos;
  if (inv.signatureData) overlays.signatureData = inv.signatureData;
  return {
    id:         inv.id,
    number:     inv.number,
    client:     inv.client,
    date:       inv.date,
    items:      inv.items,
    tva_rate:   inv.tvaRate,
    total_ht:   inv.totalHT,
    tva_amount: inv.tvaAmount,
    total_ttc:  inv.totalTTC,
    status:          inv.status,
    document_type:   inv.documentType,
    origin_devis_id: inv.originDevisId,
    client_id:       inv.clientId ?? null,
    overlays,
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function getFactures(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('factures')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toInvoice);
}

export async function getFacture(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('factures')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return toInvoice(data);
}

// Upserts by id — inserts on first save, updates on subsequent saves.
export async function upsertFacture(invoice: Invoice): Promise<Invoice> {
  const { data, error } = await supabase
    .from('factures')
    .upsert(toRow(invoice), { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return toInvoice(data);
}

export async function updateStatus(id: string, status: InvoiceStatus): Promise<void> {
  const { error } = await supabase
    .from('factures')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteFacture(id: string): Promise<void> {
  const { error } = await supabase.from('factures').delete().eq('id', id);
  if (error) throw error;
}

export async function getFacturesByClientId(clientId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('factures')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toInvoice);
}

export async function factureExistsForDevis(devisId: string): Promise<boolean> {
  const { count } = await supabase
    .from('factures')
    .select('id', { count: 'exact', head: true })
    .eq('origin_devis_id', devisId);
  return (count ?? 0) > 0;
}
