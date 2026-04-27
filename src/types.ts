export interface LineItem {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
}

// Brouillon = unsaved draft; never persisted.
// Générée = first facture save. Envoyé = first devis save.
export type InvoiceStatus =
  | 'Brouillon'
  | 'Générée' | 'Envoyée' | 'Payée' | 'Annulée'
  | 'Envoyé'  | 'Accepté' | 'Refusé';

export type DocumentType = 'facture' | 'devis';

export interface Invoice {
  id: string;
  number: string;
  client: string;
  date: string;
  items: LineItem[];
  tvaRate: number;
  totalHT: number;
  tvaAmount: number;
  totalTTC: number;
  status: InvoiceStatus;
  documentType: DocumentType;
  createdAt: string;
  originDevisId?: string;
  clientId?: string;
  stampPos?: { x: number; y: number };
  signaturePos?: { x: number; y: number };
  signatureData?: string;
}

export interface Client {
  id: string;
  name: string;
  ice: string;
  if_number: string;
  rc: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  contact_person: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ClientDocument {
  id: string;
  client_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_type: string;
  created_at: string;
}

export type AchatPaymentStatus = 'Non payé' | 'Payé';
export type PaymentMethod = 'Virement' | 'Espèce' | 'Chèque';

export interface Achat {
  id: string;
  supplier_name: string;
  invoice_date: string;
  supplier_invoice_number: string;
  description: string;
  category: string;
  amount_ht: number;
  tva: number;
  amount_ttc: number;
  payment_status: AchatPaymentStatus;
  payment_method?: PaymentMethod;
  notes: string;
  file_url: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

export type AppPage =
  | { name: 'list' }
  | { name: 'new'; invoiceNumber: string; docType: DocumentType }
  | { name: 'edit'; invoiceId: string }
  | { name: 'view'; invoiceId: string; printOnLoad?: boolean }
  | { name: 'settings' }
  | { name: 'achats' }
  | { name: 'achat-new' }
  | { name: 'achat-edit'; achatId: string }
  | { name: 'achat-view'; achatId: string }
  | { name: 'clients' }
  | { name: 'client-new' }
  | { name: 'client-edit'; clientId: string }
  | { name: 'client-view'; clientId: string };
