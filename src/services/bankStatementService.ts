import { supabase } from './supabaseClient';
import type { BankStatement } from '../types';

const BUCKET = 'bank-statements';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

function toRow(s: Partial<BankStatement> & { id: string }) {
  return {
    id:              s.id,
    month:           s.month,
    year:            s.year,
    opening_balance: s.opening_balance ?? 0,
    total_credit:    s.total_credit    ?? 0,
    total_debit:     s.total_debit     ?? 0,
    closing_balance: s.closing_balance ?? 0,
    notes:           s.notes           ?? '',
    file_url:        s.file_url        ?? null,
    file_path:       s.file_path       ?? null,
    updated_at:      new Date().toISOString(),
  };
}

export async function getBankStatements(): Promise<BankStatement[]> {
  const { data, error } = await supabase
    .from('bank_statements')
    .select('*')
    .order('year',  { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BankStatement[];
}

export async function upsertBankStatement(
  stmt: Partial<BankStatement> & { id: string },
): Promise<BankStatement> {
  const { data, error } = await supabase
    .from('bank_statements')
    .upsert(toRow(stmt), { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as BankStatement;
}

export async function deleteBankStatement(id: string): Promise<void> {
  const { error } = await supabase.from('bank_statements').delete().eq('id', id);
  if (error) throw error;
}

export function validateStatementFile(file: File): string | null {
  if (file.size > MAX_SIZE) return 'Fichier trop volumineux (max 10 MB)';
  if (!ALLOWED.includes(file.type)) return 'Format non supporté (PDF, PNG, JPG, WEBP)';
  return null;
}

export async function uploadStatementFile(
  stmtId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const ext  = file.name.split('.').pop() ?? 'bin';
  const path = `${stmtId}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) {
    if (error.message.toLowerCase().includes('bucket') || error.message.toLowerCase().includes('not found')) {
      throw new Error(
        'Bucket introuvable. Créez le bucket "bank-statements" (public) dans Supabase → Storage.',
      );
    }
    throw error;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function deleteStatementFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
