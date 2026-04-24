export interface LineItem {
  id: string;
  designation: string;
  quantity: number;
  unitPrice: number;
}

// Brouillon = unsaved draft in the form only; never persisted to DB.
// Générée   = saved with a number; this is the default on first save.
export type InvoiceStatus = 'Brouillon' | 'Générée' | 'Envoyée' | 'Payée' | 'Annulée';

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
  createdAt: string;
}

export type AppPage =
  | { name: 'list' }
  | { name: 'new'; invoiceNumber: string }
  | { name: 'edit'; invoiceId: string }
  | { name: 'view'; invoiceId: string; printOnLoad?: boolean };
