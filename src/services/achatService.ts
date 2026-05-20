import { supabase } from './supabaseClient';
import type { Achat } from '../types';

const BUCKET = 'achat-files';
const LEGACY_BUCKET = 'achats-files';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export async function getAchats(): Promise<Achat[]> {
  const { data, error } = await supabase
    .from('achats')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Achat[]).map(normalizeAchatFileUrl);
}

export async function getAchat(id: string): Promise<Achat | null> {
  const { data, error } = await supabase
    .from('achats')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return normalizeAchatFileUrl(data as Achat);
}

function normalizeAchatFileUrl(achat: Achat): Achat {
  if (!achat.file_url) return achat;
  return {
    ...achat,
    file_url: achat.file_url.replace(`/object/public/${LEGACY_BUCKET}/`, `/object/public/${BUCKET}/`),
  };
}

function normalizeAchatFilePath(pathOrUrl: string): string {
  const markers = [
    `/object/public/${BUCKET}/`,
    `/object/public/${LEGACY_BUCKET}/`,
    `/object/sign/${BUCKET}/`,
    `/object/sign/${LEGACY_BUCKET}/`,
  ];
  for (const marker of markers) {
    if (pathOrUrl.includes(marker)) return pathOrUrl.split(marker)[1].split('?')[0];
  }
  return pathOrUrl.replace(`${BUCKET}/`, '').replace(`${LEGACY_BUCKET}/`, '').replace(/^\/+/, '');
}

export async function getAchatFileUrl(pathOrUrl: string): Promise<string> {
  const path = normalizeAchatFilePath(pathOrUrl);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (!error && data?.signedUrl) return data.signedUrl;
  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return publicData.publicUrl;
}

export async function upsertAchat(achat: Achat): Promise<Achat> {
  const { data, error } = await supabase
    .from('achats')
    .upsert({ ...achat, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as Achat;
}

export async function bulkInsertAchats(rows: Omit<Achat, 'id' | 'created_at' | 'updated_at'>[]): Promise<number> {
  const now = new Date().toISOString();
  const insert = rows.map(r => ({
    ...r,
    id:         crypto.randomUUID(),
    file_url:   null,
    file_path:  null,
    created_at: now,
    updated_at: now,
  }));
  const { error } = await supabase.from('achats').insert(insert);
  if (error) throw error;
  return insert.length;
}

export async function patchAchat(id: string, patch: Partial<Achat>): Promise<void> {
  const { error } = await supabase
    .from('achats')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAchat(id: string): Promise<void> {
  const { error } = await supabase.from('achats').delete().eq('id', id);
  if (error) throw error;
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE) return 'Fichier trop volumineux (max 5 MB)';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Format non supporté (PDF, PNG, JPG, WEBP)';
  return null;
}

export async function uploadAchatFile(file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    if (error.message.toLowerCase().includes('bucket') || error.message.toLowerCase().includes('not found')) {
      throw new Error(
        'Bucket de stockage introuvable. Créez le bucket "achat-files" (public) dans Supabase → Storage.',
      );
    }
    throw error;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function deleteAchatFile(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
