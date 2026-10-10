'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A modal built on the native <dialog> element: the browser traps focus, closes on Escape and
 * returns focus to the button that opened it.
 */
export function Dialog({ isOpen, title, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      {isOpen && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id="dialog-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
