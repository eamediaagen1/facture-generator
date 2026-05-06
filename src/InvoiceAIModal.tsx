import { useState, useEffect } from 'react';
import { X, Sparkles, AlertTriangle, Check } from 'lucide-react';
import { extractInvoiceDraftWithAI } from './services/achatAIService';
import { getClients } from './services/clientService';
import type { InvoiceDraftPrefill, Client, DocumentType } from './types';

type Stage = 'idle' | 'processing' | 'client-select' | 'done';

interface Props {
  onClose: () => void;
  onSuccess: (prefill: InvoiceDraftPrefill) => void;
}

export default function InvoiceAIModal({ onClose, onSuccess }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [prefill, setPrefill] = useState<InvoiceDraftPrefill | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showClientDrop, setShowClientDrop] = useState(false);

  useEffect(() => {
    getClients().then(setClients).catch(() => setClients([]));
  }, []);

  const matchingClients = clientSearch
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 8)
    : clients.slice(0, 8);

  const selectedClient = selectedClientId ? clients.find(c => c.id === selectedClientId) : null;

  async function handleGenerate() {
    if (!prompt.trim()) {
      setError('Veuillez entrer une description');
      return;
    }

    setError('');
    setStage('processing');

    try {
      const result = await extractInvoiceDraftWithAI({
        docType: 'facture',
        text: prompt,
      });
      setPrefill(result);
      setStage('client-select');
      setClientSearch(result.client);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Erreur lors de la création";
      console.error('AI invoice creation error:', errorMessage, e);
      setError(errorMessage);
      setStage('idle');
    }
  }

  function selectClient(c: Client) {
    setSelectedClientId(c.id);
    setClientSearch(c.name);
    setShowClientDrop(false);
  }

  function handleConfirm() {
    if (!prefill) return;

    // Build client display text with linked client data
    let clientText = prefill.client;
    if (selectedClient) {
      const lines = [
        selectedClient.name,
        [selectedClient.address, selectedClient.city].filter(Boolean).join(', '),
        selectedClient.ice ? `ICE : ${selectedClient.ice}` : '',
      ].filter(Boolean);
      clientText = lines.join('\n');
    }

    const finalPrefill: InvoiceDraftPrefill = {
      ...prefill,
      client: clientText,
      clientId: selectedClientId ?? undefined,
    };

    setStage('done');
    onSuccess(finalPrefill);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && stage === 'idle') {
      handleGenerate();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <h2 className="font-semibold text-slate-800">Créer avec l'IA</h2>
          </div>
          <button
            onClick={onClose}
            disabled={stage === 'processing'}
            className="text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">

          {/* Stage: Idle - Input prompt */}
          {stage === 'idle' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Décrivez votre document
                </label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={"Exemple:\nCréer facture aujourd'hui pour GRF Immobilier, travaux de revêtement, 1 qty PU 34500\n\nOu:\nCréer devis pour Acme Corp, consultation IT, 2 jours PU 2000\n\nOu:\nBon de livraison pour GRF, matériaux"}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none text-sm text-slate-700"
                  rows={5}
                />
              </div>
              <p className="text-xs text-slate-500">
                Vous pouvez créer une facture, devis, ou bon de livraison.
              </p>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Stage: Processing */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
              <p className="text-sm text-violet-700 font-medium">Génération en cours…</p>
            </div>
          )}

          {/* Stage: Client Selection */}
          {stage === 'client-select' && prefill && (
            <div className="space-y-4">
              {/* Document Type Display */}
              <div className="bg-violet-50 border border-violet-200 rounded-lg px-6 py-6">
                <p className="text-xs font-medium text-violet-700 uppercase tracking-wide">Document détecté</p>
                <p className="text-2xl font-bold text-violet-900 capitalize mt-2">
                  {prefill.documentType === 'bon_livraison' ? 'Bon de livraison' : prefill.documentType === 'devis' ? 'Devis' : 'Facture'}
                </p>
              </div>

              {/* Client Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Sélectionner le client
                </label>
                {selectedClient ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-900">{selectedClient.name}</p>
                      {selectedClient.city && (
                        <p className="text-xs text-emerald-700">{selectedClient.city}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClientId(null);
                        setClientSearch('');
                      }}
                      className="text-emerald-500 hover:text-emerald-800 transition-colors"
                      title="Changer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Chercher un client…"
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setShowClientDrop(true);
                      }}
                      onFocus={() => setShowClientDrop(true)}
                      onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-slate-50 focus:bg-white transition-all"
                    />
                    {showClientDrop && matchingClients.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                        {matchingClients.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              selectClient(c);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-baseline gap-2 border-b border-slate-100 last:border-b-0"
                          >
                            <span className="font-medium">{c.name}</span>
                            {c.city && <span className="text-xs text-slate-400">{c.city}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI Notes */}
              {prefill.aiNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">{prefill.aiNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Stage: Done */}
          {stage === 'done' && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-medium text-emerald-900">Document créé !</p>
                <p className="text-sm text-emerald-700 mt-0.5">Redirection en cours…</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0 bg-slate-50">
          {stage === 'idle' && (
            <>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="flex-1 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors"
              >
                Générer
              </button>
            </>
          )}
          {stage === 'client-select' && (
            <>
              <button
                onClick={() => {
                  setStage('idle');
                  setPrefill(null);
                  setSelectedClientId(null);
                  setClientSearch('');
                }}
                className="flex-1 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Retour
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedClientId}
                className="flex-1 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors"
              >
                Créer
              </button>
            </>
          )}
          {stage === 'done' && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
