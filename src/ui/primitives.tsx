import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';
import { answerDialog, closeSheet, hideToast, useUI } from './uiStore';
import { canUndo, undo } from '../lib/store';

export function Sheet({ title, sub, children, footer, wide }: { title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <section className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <header className="sh-head">
        <div className="grow">
          <h2>{title}</h2>
          {sub ? <p className="sh-sub">{sub}</p> : null}
        </div>
        <button className="ibtn" onClick={() => closeSheet()} aria-label="סגירה"><Icon n="x" /></button>
      </header>
      <div className="sh-body">{children}</div>
      {footer ? <footer className="sh-foot">{footer}</footer> : null}
    </section>
  );
}

export function SheetHost() {
  const { sheets } = useUI();
  useEffect(() => {
    document.body.classList.toggle('locked', sheets.length > 0);
  }, [sheets.length]);
  if (!sheets.length) return null;
  return (
    <div className="sheet-host">
      <div className="scrim" onClick={() => closeSheet()} />
      {sheets.map((s, i) => (
        <div key={s.id} className="sheet-layer" hidden={i !== sheets.length - 1}>{s.render()}</div>
      ))}
    </div>
  );
}

export function DialogHost() {
  const { dialog } = useUI();
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (dialog) setTimeout(() => ok.current?.focus(), 30); }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="dialog-host">
      <div className="scrim" onClick={() => answerDialog(false)} />
      <section className="dialog" role="alertdialog" aria-modal="true" aria-label={dialog.title}>
        <h2>{dialog.title}</h2>
        {dialog.text ? <p>{dialog.text}</p> : null}
        {dialog.items?.length ? <ul className="notes">{dialog.items.map((it, i) => <li key={i} className={it.lv}>{it.text}</li>)}</ul> : null}
        <div className="dlg-actions">
          <button ref={ok} className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => answerDialog(true)}>{dialog.ok ?? 'אישור'}</button>
          <button className="btn btn-ghost" onClick={() => answerDialog(false)}>{dialog.cancel ?? 'ביטול'}</button>
        </div>
      </section>
    </div>
  );
}

export function ToastHost() {
  const { toast } = useUI();
  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite" key={toast.id}>
      <span>{toast.msg}</span>
      {toast.undo && canUndo() ? <button onClick={() => { undo(); hideToast(); }}><Icon n="undo" size={18} /> בטל</button> : null}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clamp(value + step))} aria-label={`הוסף ל${label}`}>+</button>
      <input inputMode="decimal" value={value} aria-label={label} onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(clamp(v)); }} />
      <button type="button" onClick={() => onChange(clamp(value - step))} aria-label={`הפחת מ${label}`}>−</button>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, full }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={`seg${full ? ' full' : ''}`} role="group">
      {options.map(([k, l]) => (
        <button key={k} type="button" className={`seg-b${value === k ? ' on' : ''}`} aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export function MenuItem({ icon, label, sub, onClick, danger, hero }: { icon: string; label: ReactNode; sub?: ReactNode; onClick: () => void; danger?: boolean; hero?: boolean }) {
  return (
    <button className={`mi${danger ? ' danger' : ''}${hero ? ' hero' : ''}`} onClick={onClick}>
      <span className="mi-ic"><Icon n={icon} /></span>
      <span className="grow">{label}{sub ? <small>{sub}</small> : null}</span>
    </button>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="fld">
      <span className="fld-l">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}
