import { supabase } from './supabaseClient';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { Achat } from '../types';

export async function extractAchatFromFile(file: File): Promise<Achat> {
  const body = new FormData();
  body.append('file', file);

  const { data, error } = await supabase.functions.invoke('extract-achat', { body });

  if (error) {
    // FunctionsHttpError wraps a non-2xx response — parse the JSON body for the real message
    if (error instanceof FunctionsHttpError) {
      let message = error.message;
      try {
        const json = await error.context.json() as { error?: string; details?: string };
        if (json.error) message = json.error;
      } catch { /* response body wasn't JSON, fall through */ }
      throw new Error(message);
    }
    throw new Error(error.message || "Erreur lors de l'extraction IA");
  }

  if (!data?.achat) throw new Error("Réponse invalide du service d'extraction");
  return data.achat as Achat;
}
