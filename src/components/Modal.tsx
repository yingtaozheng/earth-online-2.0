import { useEffect, useRef, type ReactNode } from 'react';

/** Native <dialog>: Esc, the ✕ button or a click on the backdrop closes it. */
export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      // The dialog has no padding, so a click that lands on it (not its body) is a backdrop click.
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-body stack">
        <div className="spread" style={{ flexWrap: 'nowrap' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn small ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
