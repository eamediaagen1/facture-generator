import { supabase } from './supabaseClient';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { BankStatement } from '../types';

export async function extractBankStatementFromFile(file: File): Promise<BankStatement> {
  const body = new FormData();
  body.append('file', file);

  const { data, error } = await supabase.functions.invoke('extract-bank-statement', { body });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      let message = error.message;
      try {
        const json = await error.context.json() as { error?: string };
        if (json.error) message = json.error;
      } catch { /* response body wasn't JSON */ }
      throw new Error(message);
    }
    throw new Error(error.message || "Erreur lors de l'extraction IA");
  }

  if (!data?.statement) throw new Error("Réponse invalide du service d'extraction");
  return data.statement as BankStatement;
}
