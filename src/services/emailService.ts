import type { DocumentType } from '../types';

/**
 * Placeholder — wire this up to Resend, SendGrid, or a Supabase Edge Function
 * to actually send emails. For now it logs the intent and resolves immediately.
 */
export async function sendConfirmationEmail(
  email: string,
  invoiceNum: string,
  totalTTC: number,
  docType: DocumentType,
): Promise<void> {
  const label = docType === 'devis' ? 'devis' : 'facture';
  const total = totalTTC.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  console.log(`[EMAIL] Sending ${label} ${invoiceNum} confirmation to ${email} — total ${total} DH`);
  // TODO: replace with real email API call
}
