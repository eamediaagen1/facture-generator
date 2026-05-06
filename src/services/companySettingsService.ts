const STORAGE_KEY = 'invoicer_company_settings';

interface CompanySettings {
  stampSize: number;     // scale factor: 0.5 – 4.0, default 1.0
  quickAIEnabled: boolean; // show inline AI bar on dashboard, default true
}

function load(): CompanySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { stampSize: 1.0, quickAIEnabled: true, ...JSON.parse(raw) };
  } catch { /* ignore corrupt data */ }
  return { stampSize: 1.0, quickAIEnabled: true };
}

function save(s: CompanySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function getStampSize(): number {
  const raw = load().stampSize;
  return Math.min(4.0, Math.max(0.5, raw));
}

export function setStampSize(scale: number): void {
  save({ ...load(), stampSize: Math.min(4.0, Math.max(0.5, scale)) });
}

export function getQuickAIEnabled(): boolean {
  return load().quickAIEnabled;
}

export function setQuickAIEnabled(enabled: boolean): void {
  save({ ...load(), quickAIEnabled: enabled });
}
