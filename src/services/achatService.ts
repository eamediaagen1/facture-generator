import { supabase } from './supabaseClient';
import type { Achat } from '../types';

const BUCKET = 'achats-files';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export async function getAchats(): Promise<Achat[]> {
  const { data, error } = await supabase
    .from('achats')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Achat[];
}

export async function getAchat(id: string): Promise<Achat | null> {
  const { data, error } = await supabase
    .from('achats')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as Achat;
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
        'Bucket de stockage introuvable. Créez le bucket "achats-files" (public) dans Supabase → Storage.',
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
