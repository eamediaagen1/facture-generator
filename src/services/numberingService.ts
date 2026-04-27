import { supabase } from './supabaseClient';

// Atomically gets the next FAC-YYYY-NNNN number, skipping any that already
// exist in the factures table (can happen after a counter reset).
export async function nextInvoiceNumber(): Promise<string> {
  let number: string;
  let attempts = 0;
  do {
    const { data, error } = await supabase.rpc('next_facture_number');
    if (error) throw new Error(`Numbering failed: ${error.message}`);
    number = data as string;
    const { count } = await supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('number', number);
    if ((count ?? 0) === 0) break;
    if (++attempts > 20) throw new Error('Impossible de trouver un numéro libre — vérifiez le compteur');
  } while (true);
  return number;
}

// Same as above but for DEV-YYYY-NNNN devis numbers.
export async function nextDevisNumber(): Promise<string> {
  let number: string;
  let attempts = 0;
  do {
    const { data, error } = await supabase.rpc('next_devis_number');
    if (error) throw new Error(`Numbering failed: ${error.message}`);
    number = data as string;
    const { count } = await supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('number', number);
    if ((count ?? 0) === 0) break;
    if (++attempts > 20) throw new Error('Impossible de trouver un numéro libre — vérifiez le compteur');
  } while (true);
  return number;
}

// Sets the facture counter for the given year to startFrom.
// The next call to nextInvoiceNumber() will return FAC-year-(startFrom+1).
export async function resetFactureCounter(year: number, startFrom: number): Promise<void> {
  const { error } = await supabase.rpc('reset_facture_counter', {
    p_year: year,
    p_start_from: startFrom,
  });
  if (error) throw new Error(`Reset failed: ${error.message}`);
}

// Sets the devis counter for the given year to startFrom.
// The next call to nextDevisNumber() will return DEV-year-(startFrom+1).
export async function resetDevisCounter(year: number, startFrom: number): Promise<void> {
  const { error } = await supabase.rpc('reset_devis_counter', {
    p_year: year,
    p_start_from: startFrom,
  });
  if (error) throw new Error(`Reset failed: ${error.message}`);
}

// Atomically gets the next BL-YYYY-NNNN number, skipping any that already exist.
export async function nextBonLivraisonNumber(): Promise<string> {
  let number: string;
  let attempts = 0;
  do {
    const { data, error } = await supabase.rpc('next_bon_livraison_number');
    if (error) throw new Error(`Numbering failed: ${error.message}`);
    number = data as string;
    const { count } = await supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('number', number);
    if ((count ?? 0) === 0) break;
    if (++attempts > 20) throw new Error('Impossible de trouver un numéro libre — vérifiez le compteur');
  } while (true);
  return number;
}

// Sets the bon de livraison counter for the given year to startFrom.
export async function resetBonLivraisonCounter(year: number, startFrom: number): Promise<void> {
  const { error } = await supabase.rpc('reset_bon_livraison_counter', {
    p_year: year,
    p_start_from: startFrom,
  });
  if (error) throw new Error(`Reset failed: ${error.message}`);
}
