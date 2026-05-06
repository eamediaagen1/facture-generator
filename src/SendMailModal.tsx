import { useState, useEffect } from 'react';
import { X, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DocumentType, Invoice, Client } from './types';
import { getFactures, getFacture } from './services/factureService';
import { getClient } from './services/clientService';
import { sendMailWithPdf } from './services/sendMailService';

type Stage = 'selectType' | 'selectDocument' | 'selectRecipient' | 'preview' | 'sending' | 'done' | 'error';

interface Props {
  onClose: () => void;
  initialDocType?: DocumentType;
  initialInvoiceId?: string;
}

export default function SendMailModal({ onClose, initialDocType, initialInvoiceId }: Props) {
  const [stage, setStage] = useState<Stage>(initialInvoiceId ? 'selectRecipient' : initialDocType ? 'selectDocument' : 'selectType');
  const [documentType, setDocumentType] = useState<DocumentType | null>(initialDocType || null);
  const [documents, setDocuments] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sendError, setSendError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load initial invoice if provided
  useEffect(() => {
    if (initialInvoiceId && !selectedInvoice) {
      (async () => {
        const inv = await getFacture(initialInvoiceId);
        if (inv) {
          setSelectedInvoice(inv);
          setDocumentType(inv.documentType);
        }
      })();
    }
  }, [initialInvoiceId]);

  useEffect(() => {
    if (documentType && stage === 'selectDocument') {
      loadDocuments(documentType);
    }
  }, [documentType, stage]);

  useEffect(() => {
    if (selectedInvoice?.clientId && stage === 'selectRecipient') {
      loadClient(selectedInvoice.clientId);
    }
  }, [selectedInvoice, stage]);

  async function loadDocuments(type: DocumentType) {
    try {
      const all = await getFactures();
      const filtered = all.filter(f => f.documentType === type);
      setDocuments(filtered);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setDocuments([]);
    }
  }

  async function loadClient(clientId: string) {
    try {
      const client = await getClient(clientId);
      if (client) {
        setSelectedClient(client);
        setRecipientEmail(client.email || '');
      }
    } catch (err) {
      console.error('Failed to load client:', err);
    }
  }

  function handleSelectType(type: DocumentType) {
    setDocumentType(type);
    setStage('selectDocument');
  }

  function handleSelectDocument(inv: Invoice) {
    setSelectedInvoice(inv);
    setStage('selectRecipient');
  }

  function handleContinueToPreview() {
    const email = recipientEmail.trim();
    if (!email) {
      setEmailError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Invalid email address');
      return;
    }
    setEmailError('');
    setStage('preview');
  }

  async function handleSend() {
    if (!selectedInvoice) return;
    setLoading(true);
    setSendError('');
    try {
      await sendMailWithPdf({
        invoiceId: selectedInvoice.id,
        documentType: selectedInvoice.documentType,
        documentNumber: selectedInvoice.number,
        recipientEmail: recipientEmail.trim(),
        clientName: selectedClient?.name || selectedInvoice.client.split('\n')[0],
      });
      setStage('done');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send email';
      setSendError(message);
      setStage('error');
    } finally {
      setLoading(false);
    }
  }

  const docTypeLabel = {
    facture: 'Facture',
    devis: 'Devis',
    bon_livraison: 'Bon de livraison',
  };

  const documentLabel = selectedInvoice
    ? `${docTypeLabel[selectedInvoice.documentType]} ${selectedInvoice.number}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-slate-800">Send Mail</h2>
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'sending'}
            className="text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {/* Step 1: Select Document Type */}
          {stage === 'selectType' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Select document type:</p>
              {(['facture', 'devis', 'bon_livraison'] as DocumentType[]).map(type => (
                <button
                  key={type}
                  onClick={() => handleSelectType(type)}
                  className="w-full text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
                >
                  <p className="font-medium text-slate-800">{docTypeLabel[type]}</p>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Select Document */}
          {stage === 'selectDocument' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStage('selectType')}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  ← Change type
                </button>
              </div>
              <p className="text-sm font-medium text-slate-700">
                Select {documentType ? docTypeLabel[documentType].toLowerCase() : 'document'}:
              </p>
              {documents.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <p className="text-sm">No {documentType ? docTypeLabel[documentType].toLowerCase() : 'documents'} found</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {documents.map(inv => (
                    <button
                      key={inv.id}
                      onClick={() => handleSelectDocument(inv)}
                      className="w-full text-left px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all"
                    >
                      <p className="font-mono text-sm font-bold text-slate-700">{inv.number}</p>
                      <p className="text-xs text-slate-500 truncate">{inv.client.split('\n')[0]}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Recipient Email */}
          {stage === 'selectRecipient' && selectedInvoice && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Document</p>
                <p className="text-sm font-semibold text-slate-800">{documentLabel}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Recipient email:</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={e => {
                    setRecipientEmail(e.target.value);
                    setEmailError('');
                  }}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {emailError && (
                  <div className="flex items-start gap-2 p-2 mt-2 bg-red-50 border border-red-200 rounded">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600">{emailError}</p>
                  </div>
                )}
              </div>

              {selectedClient && (
                <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded">
                  <p><span className="font-medium">{selectedClient.name}</span> from client contacts</p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Email Preview */}
          {stage === 'preview' && selectedInvoice && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 space-y-3">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">To</p>
                  <p className="text-sm font-semibold text-slate-800">{recipientEmail}</p>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Subject</p>
                  <p className="text-sm text-slate-800">
                    {docTypeLabel[selectedInvoice.documentType]} {selectedInvoice.number} - AMOR AMENAGEMENT
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Body</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {`Bonjour ${selectedClient?.name || 'Client'},\n\nVeuillez trouver ci-joint votre ${docTypeLabel[selectedInvoice.documentType].toLowerCase()} ${selectedInvoice.number}.\n\nCordialement,\nAMOR AMENAGEMENT`}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Attachment</p>
                  <p className="text-sm text-slate-800 font-mono">
                    {selectedInvoice.documentType}-{selectedInvoice.number}.pdf
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sending */}
          {stage === 'sending' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm text-blue-700 font-medium">Sending email…</p>
            </div>
          )}

          {/* Done */}
          {stage === 'done' && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-medium text-emerald-900">Email sent!</p>
                <p className="text-sm text-emerald-700 mt-0.5">The email has been sent successfully.</p>
              </div>
            </div>
          )}

          {/* Error */}
          {stage === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Failed to send email</p>
                <p className="text-xs text-red-700 mt-0.5">{sendError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0 bg-slate-50">
          {stage === 'done' && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          )}

          {(stage === 'selectType' || stage === 'selectDocument' || stage === 'selectRecipient' || stage === 'preview' || stage === 'error') && (
            <>
              <button
                onClick={() => {
                  if (stage === 'selectDocument') setStage('selectType');
                  else if (stage === 'selectRecipient') setStage('selectDocument');
                  else if (stage === 'preview') setStage('selectRecipient');
                  else if (stage === 'error') setStage('preview');
                  else onClose();
                }}
                disabled={stage === 'sending'}
                className="flex-1 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                {stage === 'selectType' ? 'Cancel' : 'Back'}
              </button>

              {stage === 'selectRecipient' && (
                <button
                  onClick={handleContinueToPreview}
                  disabled={!recipientEmail.trim() || loading}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors"
                >
                  Continue
                </button>
              )}

              {stage === 'preview' && (
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Sending…' : 'Send'}
                </button>
              )}

              {(stage === 'selectType' || stage === 'selectDocument') && (
                <button
                  onClick={() => {
                    if (stage === 'selectType') onClose();
                    else setStage('selectType');
                  }}
                  className="flex-1 px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-medium transition-colors"
                >
                  {stage === 'selectType' ? 'Cancel' : 'Back'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
