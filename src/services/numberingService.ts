import { supabase } from './supabaseClient';

// Calls the Supabase stored procedure which atomically increments the counter
// for the current year and returns the next FAC-YYYY-NNNN string.
// Numbers are never reused — the counter only ever increments.
export async function nextInvoiceNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('next_facture_number');
  if (error) throw new Error(`Numbering failed: ${error.message}`);
  return data as string;
}
