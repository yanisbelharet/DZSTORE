import { useEffect, useRef } from 'react';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function matches(combo: string, event: KeyboardEvent): boolean {
  const parts = combo.toLowerCase().split('+');
  const key = parts.at(-1);
  const wantsMod = parts.includes('mod');
  const hasMod = event.ctrlKey || event.metaKey;
  return event.key.toLowerCase() === key && wantsMod === hasMod;
}

/**
 * Keyboard shortcut (`mod+k`, `?`, `/`…). Single-key shortcuts are ignored while typing in a
 * field; `mod` combinations always work.
 */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const listener = (event: KeyboardEvent) => {
      if (!combo.includes('mod') && isTyping(event.target)) return;
      if (!matches(combo, event)) return;
      event.preventDefault();
      handlerRef.current(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, [combo, enabled]);
}
