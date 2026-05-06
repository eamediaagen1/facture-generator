import { useState, useRef } from 'react';
import { X, Sparkles, AlertTriangle, Upload } from 'lucide-react';
import { extractInvoiceDraftWithAI, extractAchatFromFile } from './services/achatAIService';
import { detectIntent } from './services/quickActionAIRouter';
import type { InvoiceDraftPrefill } from './types';

type Stage = 'input' | 'processing' | 'done' | 'error';

interface Props {
  onClose: () => void;
  onCreateDocument?: (prefill: InvoiceDraftPrefill) => void;
  onImportAchat?: () => void;
}

export default function QuickActionAIModal({ onClose, onCreateDocument, onImportAchat }: Props) {
  const [stage, setStage] = useState<Stage>('input');
  const [prompt, setPrompt] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    const fileName = selectedFile?.name || '';
    const intent = detectIntent(prompt, fileName);

    if (intent.intent === 'unknown') {
      setError("I couldn't understand the action. Try: Create facture for client…, Import achat, Upload receipt…");
      return;
    }

    setError('');
    setStage('processing');

    try {
      if (intent.intent === 'create_document') {
        // Route to document creation
        const prefill = await extractInvoiceDraftWithAI({
          docType: 'facture',
          text: prompt,
        });
        setStage('done');
        if (onCreateDocument) {
          onCreateDocument(prefill);
        }
      } else if (intent.intent === 'import_achat') {
        if (!selectedFile) {
          setError('Please upload a file or provide more details about the expense.');
          setStage('input');
          return;
        }

        // Route to achat import
        await extractAchatFromFile(selectedFile);
        setStage('done');
        if (onImportAchat) {
          onImportAchat();
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Error processing request';
      console.error('Quick Action AI error:', errorMessage, e);
      setError(errorMessage || 'Unable to process. Please try again.');
      setStage('error');
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <h2 className="font-semibold text-slate-800">Quick Action AI</h2>
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

          {(stage === 'input' || stage === 'error') && (
            <div className="space-y-4">
              {/* Textarea */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  What do you want to do?
                </label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Example:
Create facture today for GRF Immobilier, travaux de revêtement, 1 qty PU 34500

Or:
Import this achat and generate the table

Or:
Create bon de livraison for GRF Immobilier

Or:
Add expense: ciment 1200 MAD today`}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none text-sm text-slate-700"
                  rows={5}
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Or upload a document
                </label>
                <div className="space-y-2">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:border-slate-400 hover:bg-slate-100 cursor-pointer transition-all"
                  >
                    <Upload className="w-6 h-6 text-slate-400" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-slate-700">
                        {selectedFile ? selectedFile.name : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        PDF, JPG, PNG — expense invoice, receipt, or bank statement
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                    className="sr-only"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Processing */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
              <p className="text-sm text-violet-700 font-medium">Processing…</p>
            </div>
          )}

          {/* Done */}
          {stage === 'done' && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-medium text-emerald-900">Done!</p>
                <p className="text-sm text-emerald-700 mt-0.5">Redirecting you now…</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0 bg-slate-50">
          {stage !== 'done' && (
            <>
              <button
                onClick={onClose}
                disabled={stage === 'processing'}
                className="flex-1 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={stage === 'processing' || (!prompt.trim() && !selectedFile)}
                className="flex-1 px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors"
              >
                {stage === 'processing' ? 'Processing…' : 'Submit'}
              </button>
            </>
          )}
          {stage === 'done' && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
