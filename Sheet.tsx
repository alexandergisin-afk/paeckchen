import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "./Icons";

/** Bottom-Sheet auf dem Handy, Dialog auf dem Desktop. Nutzt das native <dialog> (Esc, Fokus). */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      id="sheet"
      ref={ref}
      aria-label={label}
      onClose={onClose}
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
