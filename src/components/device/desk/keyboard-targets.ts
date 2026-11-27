// Global keyboard shortcuts (amp screen, legacy keyboard -> channel mappings) must
// never fire while the user is typing. This decides what counts as "typing".

const TYPING_SELECTOR =
  'input, textarea, select, [role="combobox"], [role="searchbox"], [role="textbox"], [contenteditable=""], [contenteditable="true"]';

/** True when the element (or one of its ancestors) takes text or choice input. */
export function isTypingTarget(target: EventTarget | Element | null | undefined): boolean {
  const el = target as Element | null;
  if (!el || typeof (el as any).closest != "function") return false;
  if ((el as HTMLElement).isContentEditable) return true;
  return el.closest(TYPING_SELECTOR) != null;
}

/** Checks both the event target and the focused element, since keydown on window may target body. */
export function isTypingEvent(event: KeyboardEvent): boolean {
  return (
    isTypingTarget(event.target) ||
    (typeof document != "undefined" && isTypingTarget(document.activeElement))
  );
}
