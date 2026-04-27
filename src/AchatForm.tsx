import { useState, useEffect, type ReactNode } from 'react';
import { ArrowLeft, Save, Upload, X, ExternalLink, LogOut, Sparkles, CheckCircle } from 'lucide-react';
import type { Achat, AchatPaymentStatus, AchatStatus, PaymentMethod } from './types';
import {
  getAchat, upsertAchat, validateFile, uploadAchatFile, deleteAchatFile,
} from './services/achatService';
import { signOut } from './services/authService';

const CATEGORIES = [
  'Matériaux', 'Équipements', 'Services', 'Transport',
  'Sous-traitance', 'Fournitures de bureau', 'Autre',
];

const TVA_RATES = [0, 7, 10, 14, 20];

const INPUT = 'w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all';

function today() {
  return new Date().toISOString().split('T')[0];
}
function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  mode: 'new' | 'edit' | 'view';
  achatId?: string;
  onBack: () => void;
  onSaved: () => void;
}

export default function AchatForm({ mode, achatId, onBack, onSaved }: Props) {
  const readOnly = mode === 'view';

  const [loading,  setLoading]  = useState(mode !== 'new');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Form fields
  const [supplierName,           setSupplierName]           = useState('');
  const [invoiceDate,            setInvoiceDate]            = useState(today());
  const [supplierInvoiceNumber,  setSupplierInvoiceNumber]  = useState('');
  const [description,            setDescription]            = useState('');
  const [category,               setCategory]               = useState('');
  const [amountHT,               setAmountHT]               = useState<number | ''>('');
  const [tva,                    setTva]                    = useState<number | ''>('');
  const [paymentStatus,          setPaymentStatus]          = useState<AchatPaymentStatus>('Non payé');
  const [paymentMethod,          setPaymentMethod]          = useState<PaymentMethod>('Virement');
  const [notes,                  setNotes]                  = useState('');
  const [createdAt,              setCreatedAt]              = useState('');
  const [achatStatus,            setAchatStatus]            = useState<AchatStatus>('validated');
  const [aiConfidence,           setAiConfidence]           = useState<number | null>(null);

  // File state
  const [existingFileUrl,  setExistingFileUrl]  = useState<string | null>(null);
  const [existingFilePath, setExistingFilePath] = useState<string | null>(null);
  const [selectedFile,     setSelectedFile]     = useState<File | null>(null);
  const [removeFile,       setRemoveFile]       = useState(false);
  const [fileError,        setFileError]        = useState('');

  const amountTTC = (Number(amountHT) || 0) + (Number(tva) || 0);

  useEffect(() => {
    if (mode === 'new' || !achatId) return;
    setLoading(true);
    getAchat(achatId).then(a => {
      if (a) {
        setSupplierName(a.supplier_name);
        setInvoiceDate(a.invoice_date);
        setSupplierInvoiceNumber(a.supplier_invoice_number);
        setDescription(a.description);
        setCategory(a.category);
        setAmountHT(a.amount_ht);
        setTva(a.tva);
        setPaymentStatus(a.payment_status);
        setPaymentMethod(a.payment_method ?? 'Virement');
        setNotes(a.notes);
        setExistingFileUrl(a.file_url);
        setExistingFilePath(a.file_path);
        setCreatedAt(a.created_at);
        setAchatStatus(a.status ?? 'validated');
        setAiConfidence(a.ai_confidence ?? null);
      }
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyTvaRate(rate: number) {
    const ht = Number(amountHT) || 0;
    setTva(Number((ht * rate / 100).toFixed(2)));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { setFileError(err); e.target.value = ''; return; }
    setFileError('');
    setSelectedFile(file);
    setRemoveFile(false);
  }

  async function handleSave() {
    if (!supplierName.trim()) { setError('Fournisseur requis'); return; }
    if (!invoiceDate)         { setError('Date facture requise'); return; }
    setSaving(true);
    setError('');
    try {
      let fileUrl  = existingFileUrl;
      let filePath = existingFilePath;

      if (removeFile && existingFilePath) {
        await deleteAchatFile(existingFilePath);
        fileUrl = null; filePath = null;
      }
      if (selectedFile) {
        if (existingFilePath && !removeFile) await deleteAchatFile(existingFilePath);
        const res = await uploadAchatFile(selectedFile);
        fileUrl = res.url; filePath = res.path;
      }

      const achat: Achat = {
        id:                      achatId ?? crypto.randomUUID(),
        supplier_name:           supplierName.trim(),
        invoice_date:            invoiceDate,
        supplier_invoice_number: supplierInvoiceNumber.trim(),
        description:             description.trim(),
        category:                category.trim(),
        amount_ht:               Number(amountHT) || 0,
        tva:                     Number(tva) || 0,
        amount_ttc:              amountTTC,
        payment_status:          paymentStatus,
        payment_method:          paymentMethod,
        notes:                   notes.trim(),
        file_url:                fileUrl,
        file_path:               filePath,
        status:                  achatStatus,
        ai_confidence:           aiConfidence ?? undefined,
        created_at:              createdAt || new Date().toISOString(),
        updated_at:              new Date().toISOString(),
      };
      await upsertAchat(achat);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    setSaving(true);
    setError('');
    try {
      await upsertAchat({
        id:                      achatId ?? crypto.randomUUID(),
        supplier_name:           supplierName.trim(),
        invoice_date:            invoiceDate,
        supplier_invoice_number: supplierInvoiceNumber.trim(),
        description:             description.trim(),
        category:                category.trim(),
        amount_ht:               Number(amountHT) || 0,
        tva:                     Number(tva) || 0,
        amount_ttc:              amountTTC,
        payment_status:          paymentStatus,
        payment_method:          paymentMethod,
        notes:                   notes.trim(),
        file_url:                existingFileUrl,
        file_path:               existingFilePath,
        status:                  'validated',
        ai_confidence:           aiConfidence ?? undefined,
        created_at:              createdAt || new Date().toISOString(),
        updated_at:              new Date().toISOString(),
      });
      setAchatStatus('validated');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  const title =
    mode === 'new'  ? 'Nouvel Achat' :
    mode === 'edit' ? 'Modifier Achat' :
                      'Détail Achat';

  const hasExistingFile = existingFileUrl && !removeFile;

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <span className="text-sm font-semibold text-slate-800 uppercase tracking-wide">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Save className="w-4 h-4" />
                }
                Sauvegarder
              </button>
            )}
            <button
              onClick={() => signOut()}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {achatStatus === 'needs_review' && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-sm font-medium text-violet-700">Brouillon IA — vérifiez les champs avant de valider</span>
              {aiConfidence !== null && (
                <span className="text-xs text-violet-500 shrink-0">
                  Confiance : {Math.round(aiConfidence * 100)}%
                </span>
              )}
            </div>
            <button
              onClick={handleValidate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors shrink-0"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Valider
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Fournisseur */}
        <Card title="Informations fournisseur">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Fournisseur *">
              {readOnly
                ? <Val>{supplierName || '—'}</Val>
                : <input
                    type="text"
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    className={INPUT}
                    placeholder="Nom du fournisseur"
                  />
              }
            </Field>
            <Field label="Date facture *">
              {readOnly
                ? <Val>{dateFR(invoiceDate)}</Val>
                : <input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className={INPUT}
                  />
              }
            </Field>
            <Field label="N° facture fournisseur">
              {readOnly
                ? <Val>{supplierInvoiceNumber || '—'}</Val>
                : <input
                    type="text"
                    value={supplierInvoiceNumber}
                    onChange={e => setSupplierInvoiceNumber(e.target.value)}
                    className={INPUT}
                    placeholder="Ex: FAC-2024-001"
                  />
              }
            </Field>
            <Field label="Catégorie">
              {readOnly
                ? <Val>{category || '—'}</Val>
                : <>
                    <input
                      list="achat-categories"
                      type="text"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className={INPUT}
                      placeholder="Sélectionner ou saisir..."
                    />
                    <datalist id="achat-categories">
                      {CATEGORIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </>
              }
            </Field>
          </div>
          <Field label="Description">
            {readOnly
              ? <Val>{description || '—'}</Val>
              : <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className={INPUT + ' resize-none'}
                  placeholder="Description des biens ou services achetés"
                />
            }
          </Field>
        </Card>

        {/* Montants */}
        <Card title="Montants">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Montant HT (DH)">
              {readOnly
                ? <Val>{fmt(Number(amountHT) || 0)}</Val>
                : <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountHT === '' ? '' : amountHT}
                    onChange={e => setAmountHT(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                    className={INPUT}
                    placeholder="0.00"
                  />
              }
            </Field>
            <Field label="TVA (DH)">
              {readOnly
                ? <Val>{fmt(Number(tva) || 0)}</Val>
                : <div className="space-y-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tva === '' ? '' : tva}
                      onChange={e => setTva(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                      className={INPUT}
                      placeholder="0.00"
                    />
                    <div className="flex gap-1 flex-wrap">
                      {TVA_RATES.map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => applyTvaRate(r)}
                          className="px-2 py-0.5 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                  </div>
              }
            </Field>
            <Field label="Montant TTC (DH)">
              <div className="px-3 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800">
                {fmt(amountTTC)}
              </div>
            </Field>
          </div>
        </Card>

        {/* Paiement & Notes */}
        <Card title="Paiement & Notes">
          <Field label="Statut de paiement">
            {readOnly
              ? <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                  paymentStatus === 'Payé'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {paymentStatus}
                </span>
              : <div className="flex gap-4">
                  {(['Non payé', 'Payé'] as AchatPaymentStatus[]).map(s => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="payment_status"
                        value={s}
                        checked={paymentStatus === s}
                        onChange={() => setPaymentStatus(s)}
                        className="w-4 h-4 accent-slate-700"
                      />
                      <span className="text-sm text-slate-700">{s}</span>
                    </label>
                  ))}
                </div>
            }
          </Field>
          <Field label="Mode de paiement">
            {readOnly
              ? <PaymentMethodBadge value={paymentMethod} />
              : <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className={INPUT}
                >
                  <option value="Virement">Virement</option>
                  <option value="Espèce">Espèce</option>
                  <option value="Chèque">Chèque</option>
                  <option value="Carte">Carte</option>
                </select>
            }
          </Field>
          <Field label="Notes">
            {readOnly
              ? <Val>{notes || '—'}</Val>
              : <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className={INPUT + ' resize-none'}
                  placeholder="Notes internes, conditions de paiement..."
                />
            }
          </Field>
        </Card>

        {/* Fichier */}
        <Card title="Facture fournisseur (fichier)">
          {hasExistingFile && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 font-medium">Fichier attaché</p>
                <p className="text-xs text-slate-400 truncate">{existingFilePath}</p>
              </div>
              <a
                href={existingFileUrl!}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir le fichier"
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              {!readOnly && (
                <button
                  onClick={() => setRemoveFile(true)}
                  title="Supprimer le fichier"
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {selectedFile && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-emerald-700 font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-emerald-500">{(selectedFile.size / 1024).toFixed(0)} KB</p>
              </div>
              <button
                onClick={() => { setSelectedFile(null); setFileError(''); }}
                className="p-1.5 text-emerald-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {!readOnly && (
            <>
              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all">
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-sm text-slate-600 font-medium">
                  {hasExistingFile && !selectedFile ? 'Remplacer le fichier' : 'Joindre un fichier'}
                </span>
                <span className="text-xs text-slate-400">PDF, PNG, JPG, WEBP — max 5 MB</span>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              {fileError && (
                <p className="text-xs text-red-600 mt-2">{fileError}</p>
              )}
            </>
          )}

          {readOnly && !existingFileUrl && (
            <p className="text-sm text-slate-400 italic">Aucun fichier attaché</p>
          )}
        </Card>

      </div>
    </div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200">
        <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="px-4 sm:px-6 py-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Val({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-800 py-1.5">{children}</p>;
}

function PaymentMethodBadge({ value }: { value?: PaymentMethod }) {
  const styles: Record<string, string> = {
    'Virement': 'bg-blue-50 text-blue-700',
    'Espèce':   'bg-emerald-50 text-emerald-700',
    'Chèque':   'bg-violet-50 text-violet-700',
    'Carte':    'bg-pink-50 text-pink-700',
  };
  const label = value ?? 'Virement';
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${styles[label] ?? styles['Virement']}`}>
      {label}
    </span>
  );
}
