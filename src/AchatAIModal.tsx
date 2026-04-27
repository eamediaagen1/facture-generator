import { useState, useRef, useCallback } from 'react';
import { X, Sparkles, AlertTriangle, CheckCircle } from 'lucide-react';
import { extractAchatFromFile } from './services/achatAIService';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE = 5 * 1024 * 1024;

type Stage = 'idle' | 'processing' | 'done';

interface FileResult {
  fileName: string;
  success:  boolean;
  error?:   string;
}

interface Props {
  onClose: () => void;
  onDone:  () => void;
}

export default function AchatAIModal({ onClose, onDone }: Props) {
  const [stage,           setStage]           = useState<Stage>('idle');
  const [current,         setCurrent]         = useState(0);
  const [total,           setTotal]           = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [results,         setResults]         = useState<FileResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const acc: FileResult[] = [];
    setTotal(files.length);
    setResults([]);
    setStage('processing');

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setCurrent(i + 1);
      setCurrentFileName(f.name);

      if (!ALLOWED_TYPES.includes(f.type)) {
        acc.push({ fileName: f.name, success: false, error: 'Type non supporté' });
        setResults([...acc]);
        continue;
      }
      if (f.size > MAX_SIZE) {
        acc.push({ fileName: f.name, success: false, error: 'Fichier trop volumineux (max 5 MB)' });
        setResults([...acc]);
        continue;
      }

      try {
        await extractAchatFromFile(f);
        acc.push({ fileName: f.name, success: true });
      } catch (e: unknown) {
        acc.push({
          fileName: f.name,
          success:  false,
          error:    e instanceof Error ? e.message : "Erreur d'extraction",
        });
      }
      setResults([...acc]);
    }

    setStage('done');
  }, []);

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }

  const successCount = results.filter(r =>  r.success).length;
  const failedCount  = results.filter(r => !r.success).length;
  const processing   = stage === 'processing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <h2 className="font-semibold text-slate-800">Importer avec l'IA</h2>
          </div>
          <button
            onClick={onClose}
            disabled={processing}
            className="text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">

          {/* ── Idle ── */}
          {stage === 'idle' && (
            <div
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center gap-4 p-10 border-2 border-dashed border-violet-200 rounded-xl bg-violet-50 cursor-pointer hover:border-violet-400 hover:bg-violet-100 transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-violet-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Glisser-déposer ou cliquer pour choisir</p>
                <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG — max 5 MB par fichier — sélection multiple</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={onFileInput}
              />
            </div>
          )}

          {/* ── Processing ── */}
          {stage === 'processing' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  Traitement {current} / {total}…
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-[240px] truncate">{currentFileName}</p>
              </div>
              {results.length > 0 && (
                <div className="w-full space-y-1.5">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
                        r.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                      }`}
                    >
                      {r.success
                        ? <CheckCircle className="w-3 h-3 shrink-0" />
                        : <AlertTriangle className="w-3 h-3 shrink-0" />
                      }
                      <span className="truncate flex-1">{r.fileName}</span>
                      {r.error && <span className="shrink-0 opacity-70">— {r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {stage === 'done' && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-3 justify-center flex-wrap">
                {successCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    {successCount} importé{successCount > 1 ? 's' : ''}
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {failedCount} erreur{failedCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {failedCount > 0 && (
                <div className="space-y-1.5">
                  {results.filter(r => !r.success).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span className="truncate flex-1">{r.fileName}</span>
                      {r.error && <span className="shrink-0 opacity-70">— {r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {stage === 'idle' && (
          <div className="px-6 pb-5">
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              L'IA analysera chaque facture et créera un brouillon à valider.
            </p>
          </div>
        )}
        {stage === 'done' && (
          <div className="px-6 pb-5">
            <button
              onClick={onDone}
              className="w-full px-4 py-2.5 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
