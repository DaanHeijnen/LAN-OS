// Small building blocks shared by the player dashboard and the admin page,
// using the design's markup and class names.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initial } from '../format.ts';
import { Icon } from './Icon.tsx';

export function Avatar({ nickname, tone, url, offline, className = '' }:
  { nickname: string; tone: number; url?: string | null; offline?: boolean; className?: string }) {
  return (
    <span className={`avatar tone-${tone} ${offline ? 'offline-avatar' : ''} ${className}`}>
      {url ? <img src={url} alt="" /> : initial(nickname)}
    </span>
  );
}

// --- Toasts ---

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3800);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {message && <div className="toast"><Icon name="check" /><span>{message}</span></div>}
      </div>
    </ToastContext.Provider>
  );
}

/** Runs an API call and shows its error as a toast instead of failing silently. */
export function useAction() {
  const toast = useToast();
  return useCallback(async (run: () => Promise<unknown>, success?: string) => {
    try {
      await run();
      if (success) toast(success);
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [toast]);
}

// --- Modal ---

export function Modal({ title, label, onClose, children, footer }:
  { title: string; label: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="modal-layer" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div><div className="section-overline">{label}</div><h2>{title}</h2></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ checked, label, onChange, disabled }:
  { checked: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className="switch" role="switch" aria-label={label} aria-checked={checked}
      disabled={disabled} onClick={() => onChange(!checked)}><span /></button>
  );
}

export function StatusDot({ level }: { level: 'ok' | 'warning' | 'off' }) {
  return <span className={`status-dot ${level === 'ok' ? 'green' : level === 'warning' ? 'amber' : 'grey'}`} />;
}

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>;
}
