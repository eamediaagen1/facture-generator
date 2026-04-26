import { useState, useEffect, useRef, type ReactNode, type ChangeEvent } from 'react';
import {
  ArrowLeft, Save, LogOut, Upload, X, ExternalLink,
  Eye, Edit2, Download, FileText, TrendingUp, AlertCircle, Receipt,
} from 'lucide-react';
import type { Client, ClientDocument, Invoice } from './types';
import {
  getClient, upsertClient,
  getClientDocuments, uploadClientDocument, deleteClientDocument, validateClientFile,
} from './services/clientService';
import { getFacturesByClientId } from './services/factureService';
import { signOut } from './services/authService';

const INPUT = 'w-full px-3 py-2.5 sm:py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all';

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function dateFR(s: string) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_COLORS: Record<string, string> = {
  Générée: 'bg-violet-50 text-violet-700',
  Envoyée: 'bg-blue-50 text-blue-700',
  Payée:   'bg-emerald-50 text-emerald-700',
  Annulée: 'bg-red-50 text-red-600',
  Envoyé:  'bg-blue-50 text-blue-700',
  Accepté: 'bg-emerald-50 text-emerald-700',
  Refusé:  'bg-red-50 text-red-600',
};

interface Props {
  mode:      'new' | 'edit' | 'view';
  clientId?: string;
  onBack:    () => void;
  onSaved:   (id: string) => void;
  onView:    (id: string) => void;
  onEdit:    (id: string) => void;
}

export default function ClientForm({ mode, clientId, onBack, onSaved, onView, onEdit }: Props) {
  const readOnly  = mode === 'view';
  const isNew     = mode === 'new';
  const idRef     = useRef<string>(clientId ?? crypto.randomUUID());

  const [loading,   setLoading]   = useState(mode !== 'new');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  // Fields
  const [name,           setName]           = useState('');
  const [ice,            setIce]            = useState('');
  const [ifNumber,       setIfNumber]       = useState('');
  const [rc,             setRc]             = useState('');
  const [address,        setAddress]        = useState('');
  const [city,           setCity]           = useState('');
  const [phone,          setPhone]          = useState('');
  const [email,          setEmail]          = useState('');
  const [contactPerson,  setContactPerson]  = useState('');
  const [notes,          setNotes]          = useState('');
  const [createdAt,      setCreatedAt]      = useState('');

  // Documents
  const [docs,        setDocs]        = useState<ClientDocument[]>([]);
  const [uploading,   setUploading]   = useState(false);
  const [fileError,   setFileError]   = useState('');

  // Factures (view mode only)
  const [factures,    setFactures]    = useState<Invoice[]>([]);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    const id = idRef.current;
    const promises: Promise<unknown>[] = [
      getClient(id).then(c => {
        if (c) {
          setName(c.name); setIce(c.ice); setIfNumber(c.if_number);
          setRc(c.rc); setAddress(c.address); setCity(c.city);
          setPhone(c.phone); setEmail(c.email);
          setContactPerson(c.contact_person); setNotes(c.notes);
          setCreatedAt(c.created_at);
        }
      }),
      getClientDocuments(id).then(setDocs),
    ];
    if (readOnly) promises.push(getFacturesByClientId(id).then(setFactures));
    Promise.all(promises).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!name.trim()) { setError('Nom du client requis'); return; }
    setSaving(true);
    setError('');
    try {
      const client: Client = {
        id: idRef.current, name: name.trim(),
        ice: ice.trim(), if_number: ifNumber.trim(), rc: rc.trim(),
        address: address.trim(), city: city.trim(),
        phone: phone.trim(), email: email.trim(),
        contact_person: contactPerson.trim(), notes: notes.trim(),
        created_at: createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await upsertClient(client);
      onSaved(idRef.current);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateClientFile(file);
    if (err) { setFileError(err); e.target.value = ''; return; }
    setFileError('');
    setUploading(true);
    try {
      const doc = await uploadClientDocument(idRef.current, file);
      setDocs(prev => [...prev, doc]);
    } catch (e: unknown) {
      setFileError(e instanceof Error ? e.message : 'Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDeleteDoc(doc: ClientDocument) {
    if (!window.confirm(`Supprimer "${doc.file_name}" ?`)) return;
    await deleteClientDocument(doc);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  }

  // ── View mode metrics ────────────────────────────────────────────────────
  const metrics = {
    revenue:   factures.filter(f => f.documentType === 'facture' && f.status === 'Payée').reduce((s, f) => s + f.totalTTC, 0),
    unpaid:    factures.filter(f => f.documentType === 'facture' && (f.status === 'Générée' || f.status === 'Envoyée')).reduce((s, f) => s + f.totalTTC, 0),
    factures:  factures.filter(f => f.documentType === 'facture').length,
    devis:     factures.filter(f => f.documentType === 'devis').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  const title = isNew ? 'Nouveau client' : readOnly ? name || 'Profil client' : 'Modifier client';

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all shrink-0">
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
            <div className="h-5 w-px bg-slate-200 shrink-0" />
            <span className="text-sm font-semibold text-slate-800 uppercase tracking-wide truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {readOnly && clientId && (
              <button onClick={() => onEdit(clientId)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-all">
                <Edit2 className="w-4 h-4" />
                <span className="hidden sm:inline">Modifier</span>
              </button>
            )}
            {!readOnly && (
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-all shadow-sm">
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Sauvegarder
              </button>
            )}
            <button onClick={() => signOut()} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* ── View mode metrics ── */}
        {readOnly && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} label="CA encaissé"   value={`${fmt(metrics.revenue)} DH`} vc="text-emerald-700" />
            <MCard icon={<AlertCircle className="w-5 h-5 text-amber-500" />}  label="Impayé"        value={`${fmt(metrics.unpaid)} DH`}  vc="text-amber-700" />
            <MCard icon={<Receipt className="w-5 h-5 text-violet-500" />}     label="Factures"      value={String(metrics.factures)}     vc="text-violet-700" />
            <MCard icon={<FileText className="w-5 h-5 text-blue-500" />}      label="Devis"         value={String(metrics.devis)}        vc="text-blue-700" />
          </div>
        )}

        {/* ── Contact info ── */}
        <Card title="Informations client">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom du client *">
              {readOnly ? <Val>{name || '—'}</Val>
                : <input type="text" value={name} onChange={e => setName(e.target.value)} className={INPUT} placeholder="Nom de la société ou personne" />}
            </Field>
            <Field label="ICE">
              {readOnly ? <Val>{ice || '—'}</Val>
                : <input type="text" value={ice} onChange={e => setIce(e.target.value)} className={INPUT} placeholder="Identifiant commun de l'entreprise" />}
            </Field>
            <Field label="IF">
              {readOnly ? <Val>{ifNumber || '—'}</Val>
                : <input type="text" value={ifNumber} onChange={e => setIfNumber(e.target.value)} className={INPUT} placeholder="Identifiant fiscal" />}
            </Field>
            <Field label="RC">
              {readOnly ? <Val>{rc || '—'}</Val>
                : <input type="text" value={rc} onChange={e => setRc(e.target.value)} className={INPUT} placeholder="Registre de commerce" />}
            </Field>
            <Field label="Adresse">
              {readOnly ? <Val>{address || '—'}</Val>
                : <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={INPUT} placeholder="Adresse" />}
            </Field>
            <Field label="Ville">
              {readOnly ? <Val>{city || '—'}</Val>
                : <input type="text" value={city} onChange={e => setCity(e.target.value)} className={INPUT} placeholder="Ville" />}
            </Field>
            <Field label="Téléphone">
              {readOnly ? <Val>{phone || '—'}</Val>
                : <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={INPUT} placeholder="0600 000 000" />}
            </Field>
            <Field label="Email">
              {readOnly ? <Val>{email || '—'}</Val>
                : <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} placeholder="email@example.com" />}
            </Field>
            <Field label="Personne de contact">
              {readOnly ? <Val>{contactPerson || '—'}</Val>
                : <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} className={INPUT} placeholder="Nom du contact" />}
            </Field>
          </div>
          <Field label="Notes">
            {readOnly ? <Val>{notes || '—'}</Val>
              : <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={INPUT + ' resize-none'} placeholder="Notes internes..." />}
          </Field>
        </Card>

        {/* ── Documents ── (not shown in new mode — save first) */}
        {!isNew && (
          <Card title="Documents attachés">
            {docs.length > 0 ? (
              <ul className="space-y-2">
                {docs.map(d => (
                  <li key={d.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="flex-1 text-sm text-slate-700 truncate">{d.file_name}</span>
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer" title="Ouvrir"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-all">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {!readOnly && (
                      <button onClick={() => handleDeleteDoc(d)} title="Supprimer"
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400 italic">Aucun document attaché</p>
            )}

            {!readOnly && (
              <div className="mt-3">
                <label className={`flex flex-col items-center gap-2 p-5 border-2 border-dashed rounded-lg transition-all ${
                  uploading ? 'border-slate-200 opacity-60' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50 cursor-pointer'
                }`}>
                  {uploading
                    ? <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    : <Upload className="w-5 h-5 text-slate-400" />
                  }
                  <span className="text-sm text-slate-600 font-medium">{uploading ? 'Envoi en cours…' : 'Ajouter un document'}</span>
                  <span className="text-xs text-slate-400">PDF, PNG, JPG, WEBP — max 5 MB</span>
                  <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload} disabled={uploading} className="sr-only" />
                </label>
                {fileError && <p className="text-xs text-red-600 mt-2">{fileError}</p>}
              </div>
            )}
          </Card>
        )}

        {isNew && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
            Sauvegardez le client pour pouvoir attacher des documents.
          </div>
        )}

        {/* ── Related factures/devis (view mode only) ── */}
        {readOnly && (
          <Card title="Historique factures &amp; devis">
            {factures.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Aucune facture ou devis lié à ce client</p>
            ) : (
              <>
                {/* Desktop */}
                <div className="hidden sm:block -mx-6 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-y border-slate-200">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-2.5">N°</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-28">Date</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-24">Type</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 w-36">Total TTC</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-2.5 w-28">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {factures.map(f => (
                        <tr key={f.id} className="hover:bg-slate-50/60">
                          <td className="px-6 py-3 font-mono text-sm font-semibold text-slate-800">{f.number}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{dateFR(f.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              f.documentType === 'facture' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'
                            }`}>
                              {f.documentType === 'facture' ? 'Facture' : 'Devis'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800">{fmt(f.totalTTC)} DH</td>
                          <td className="px-6 py-3">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[f.status] ?? 'bg-slate-100 text-slate-500'}`}>
                              {f.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile */}
                <div className="sm:hidden space-y-2">
                  {factures.map(f => (
                    <div key={f.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <p className="text-sm font-semibold font-mono text-slate-800">{f.number}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{dateFR(f.date)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-800">{fmt(f.totalTTC)} DH</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {f.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200">
        <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-wider" dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      <div className="px-4 sm:px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Val({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-800 py-1.5">{children}</p>;
}

function MCard({ icon, label, value, vc }: { icon: ReactNode; label: string; value: string; vc?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4 flex items-center gap-3">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className={`text-base font-bold tracking-tight mt-0.5 truncate ${vc ?? 'text-slate-800'}`}>{value}</p>
      </div>
    </div>
  );
}
