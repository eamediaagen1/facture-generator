import { supabase } from './supabaseClient';
import type { Client, ClientDocument } from '../types';

const DOC_BUCKET = 'client-documents';
const MAX_SIZE   = 5 * 1024 * 1024;
const ALLOWED    = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

// ── Clients ───────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Client[];
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as Client;
}

export async function upsertClient(client: Client): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .upsert({ ...client, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function getClientDocuments(clientId: string): Promise<ClientDocument[]> {
  const { data, error } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClientDocument[];
}

export function validateClientFile(file: File): string | null {
  if (file.size > MAX_SIZE) return 'Fichier trop volumineux (max 5 MB)';
  if (!ALLOWED.includes(file.type)) return 'Format non supporté (PDF, PNG, JPG, WEBP)';
  return null;
}

export async function uploadClientDocument(clientId: string, file: File): Promise<ClientDocument> {
  const ext  = file.name.split('.').pop() ?? 'bin';
  const path = `${clientId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(DOC_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data: { publicUrl } } = supabase.storage.from(DOC_BUCKET).getPublicUrl(path);

  const doc: Omit<ClientDocument, 'created_at'> = {
    id:        crypto.randomUUID(),
    client_id: clientId,
    file_name: file.name,
    file_path: path,
    file_url:  publicUrl,
    file_type: file.type,
  };

  const { data, error: dbErr } = await supabase
    .from('client_documents')
    .insert(doc)
    .select()
    .single();
  if (dbErr) throw dbErr;
  return data as ClientDocument;
}

export async function deleteClientDocument(doc: ClientDocument): Promise<void> {
  await supabase.storage.from(DOC_BUCKET).remove([doc.file_path]);
  await supabase.from('client_documents').delete().eq('id', doc.id);
}
