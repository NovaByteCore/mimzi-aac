import { useEffect, useRef } from 'react';

/** Open dialogs, topmost last. Escape and the focus trap only act for the topmost one. */
const stack: symbol[] = [];
/** When one dialog replaces another (PIN → editor), the new one inherits where focus returns. */
let handOff: { el: HTMLElement; at: number } | null = null;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.offsetParent !== null && !el.closest('[inert]'));
}

/**
 * Accessible modal behaviour:
 *  - focus moves into the dialog when it opens (an element marked `data-autofocus`, else the
 *    dialog itself, so screen readers announce its title),
 *  - Tab / Shift+Tab stay inside the dialog,
 *  - Escape runs `onEscape` for the topmost dialog only (so a confirmation on top of the
 *    editor closes first, and the editor's own unsaved-changes check still runs),
 *  - focus returns to the control that opened it when it closes.
 */
export function useDialogFocus(ref: { readonly current: HTMLElement | null }, onEscape?: () => void) {
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    const id = Symbol('dialog');
    stack.push(id);
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener =
      active && active !== document.body && active.isConnected ? active : handOff && Date.now() - handOff.at < 1000 ? handOff.el : null;
    const root = ref.current;
    if (root) {
      if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
      const auto = root.querySelector<HTMLElement>('[data-autofocus]');
      (auto ?? root).focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || !ref.current) return;
      if (e.key === 'Escape' && escape.current) {
        e.preventDefault();
        e.stopPropagation();
        escape.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables(ref.current);
      if (!list.length) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && ref.current.contains(active);
      if (e.shiftKey && (active === first || active === ref.current || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    // Focus that lands outside the topmost dialog (e.g. a click on the page behind) comes back.
    const onFocusIn = (e: FocusEvent) => {
      if (stack[stack.length - 1] !== id || !ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) ref.current.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (opener) handOff = { el: opener, at: Date.now() };
      // Return focus to the opener if it's still on the page (after the dialog is gone).
      setTimeout(() => {
        if (opener && opener.isConnected && (document.activeElement === document.body || document.activeElement === null || !document.activeElement.isConnected)) {
          opener.focus({ preventScroll: true });
        }
      }, 0);
    };
  }, [ref]);
}
