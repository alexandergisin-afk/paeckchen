import { useEffect, useRef, type ReactNode } from "react";

/**
 * Formular als eigene Seite: auf dem Handy bildschirmfüllend, am Computer als Dialog.
 * Oben eine feste Leiste mit „Abbrechen“ und „Speichern“, die immer sichtbar bleibt,
 * auch wenn der Browser seine Leisten einblendet oder die Tastatur offen ist.
 * „Speichern“ schickt das Formular mit der id formId ab.
 */
export function FormSheet({ open, onClose, title, formId, submitLabel = "Speichern", busy = false, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  formId: string;
  submitLabel?: string;
  busy?: boolean;
  children: ReactNode;
}) {
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
      className="fsheet"
      ref={ref}
      aria-label={title}
      onClose={() => {
        if (closingByApp.current) {
          closingByApp.current = false;
          return;
        }
        onClose();
      }}
    >
      {open && (
        <>
          <header className="fs-bar">
            <button type="button" className="fs-cancel" onClick={onClose}>Abbrechen</button>
            <h2>{title}</h2>
            <button type="submit" form={formId} className="fs-save" disabled={busy}>{busy ? "Speichert …" : submitLabel}</button>
          </header>
          <div className="fs-body">
            {/* Auf schmalen Bildschirmen steht der Titel hier statt in der Leiste */}
            <h2 className="fs-title-inline" aria-hidden="true">{title}</h2>
            {children}
          </div>
        </>
      )}
    </dialog>
  );
}
