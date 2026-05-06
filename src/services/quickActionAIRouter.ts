export type QuickActionIntent = 'create_document' | 'import_achat' | 'convert_devis' | 'unknown';

export interface IntentDetectionResult {
  intent: QuickActionIntent;
  documentType?: 'facture' | 'devis' | 'bon_livraison';
  confidence: number; // 0.0 to 1.0
  reason: string;
  devisNumber?: string; // present when intent === 'convert_devis'
}

const DOCUMENT_KEYWORDS: Record<string, string[]> = {
  facture:      ['facture', 'invoice', 'fact'],
  devis:        ['devis', 'quote', 'quotation', 'estimate'],
  bon_livraison:['bon de livraison', 'bon livraison', 'delivery note', 'livraison'],
};

const ACHAT_KEYWORDS = ['achat', 'expense', 'dépense', 'receipt', 'facture fournisseur', 'supplier', 'invoice supplier', 'import'];

// Patterns that signal "convert devis X to facture"
// Matches: "convertir devis DEV-001", "devis DEV001 en facture", "transformer devis 12 en facture"
const CONVERT_PATTERNS = [
  /convertir\s+(?:le\s+)?devis\s+(\S+)/i,
  /transformer\s+(?:le\s+)?devis\s+(\S+)/i,
  /convert\s+(?:le\s+)?devis\s+(\S+)/i,
  /devis\s+(\S+)\s+en\s+facture/i,
  /devis\s+(\S+)\s+(?:->|=>|→)\s+facture/i,
];

export function detectIntent(prompt: string, fileName?: string): IntentDetectionResult {
  const promptLower = (prompt || '').toLowerCase();

  // No prompt + file → import achat
  if (!promptLower.trim() && fileName) {
    if (isAchatFile(fileName)) {
      return { intent: 'import_achat', confidence: 0.9, reason: 'File looks like an expense document, no prompt' };
    }
  }

  // Convert devis → facture (check before create_document so "devis X en facture" doesn't match create_document)
  for (const pattern of CONVERT_PATTERNS) {
    const match = prompt.match(pattern);
    if (match) {
      return {
        intent: 'convert_devis',
        devisNumber: match[1].toUpperCase(),
        confidence: 0.97,
        reason: `Detected conversion pattern, devis number: ${match[1]}`,
      };
    }
  }

  // Create document — check bon_livraison first (longer keyword wins)
  for (const docType of ['bon_livraison', 'facture', 'devis'] as const) {
    for (const keyword of DOCUMENT_KEYWORDS[docType]) {
      if (promptLower.includes(keyword)) {
        return {
          intent: 'create_document',
          documentType: docType,
          confidence: 0.95,
          reason: `Detected keyword: "${keyword}"`,
        };
      }
    }
  }

  // Achat / expense import
  for (const keyword of ACHAT_KEYWORDS) {
    if (promptLower.includes(keyword)) {
      return { intent: 'import_achat', confidence: 0.9, reason: `Detected keyword: "${keyword}"` };
    }
  }

  // File present with no matching prompt
  if (fileName && isAchatFile(fileName)) {
    return { intent: 'import_achat', confidence: 0.8, reason: 'File looks like an expense document' };
  }

  return { intent: 'unknown', confidence: 0, reason: 'Could not detect intent from prompt or file' };
}

function isAchatFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ['pdf', 'jpg', 'jpeg', 'png'].includes(ext);
}
