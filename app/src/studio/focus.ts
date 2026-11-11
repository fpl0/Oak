// Focus for a field inside a native <dialog>: showModal() runs after the field mounts and moves focus to the
// dialog's first control (its Close button), so the field takes focus one frame later.
export function focusOnOpen(el: HTMLInputElement | null): void {
  if (!el) return;
  requestAnimationFrame(() => {
    if (el.isConnected) {
      el.focus();
      el.select();
    }
  });
}
