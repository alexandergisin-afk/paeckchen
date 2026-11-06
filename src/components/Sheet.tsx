import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./Icons";

/**
 * Bottom-Sheet auf dem Handy, Dialog auf dem Desktop. Nutzt das native <dialog> (Esc, Fokus).
 * onClose wird nur gemeldet, wenn die Person den Dialog selbst schließt (Esc, X, Tipp daneben),
 * nicht wenn die App ihn schließt, etwa beim Wechsel von einem Menü in einen anderen Dialog.
 */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closingByApp = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      closingByApp.current = true;
      d.close();
    }
  }, [open]);

  return (
    <dialog
      className="sheet"
      ref={ref}
      aria-label={label}
      onClose={() => {
        if (closingByApp.current) {
          closingByApp.current = false;
          return;
        }
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="sheet-in">
          <button className="icon-btn sheet-x" onClick={onClose} aria-label="Schließen">
            <IconX />
          </button>
          {children}
        </div>
      )}
    </dialog>
  );
}
