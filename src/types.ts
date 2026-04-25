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
}

export type AppPage =
  | { name: 'list' }
  | { name: 'new'; invoiceNumber: string; docType: DocumentType }
  | { name: 'edit'; invoiceId: string }
  | { name: 'view'; invoiceId: string; printOnLoad?: boolean }
  | { name: 'settings' };
