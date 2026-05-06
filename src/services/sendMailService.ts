import { supabase } from './supabaseClient';
import type { DocumentType } from '../types';

export interface SendMailRequest {
  invoiceId: string;
  documentType: DocumentType;
  documentNumber: string;
  recipientEmail: string;
  clientName: string;
}

export async function sendMailWithPdf(request: SendMailRequest): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-mail', {
    body: request,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send email');
  }

  if (data?.error) {
    throw new Error(data.error);
  }
}
