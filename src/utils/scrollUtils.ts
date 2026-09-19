/**
 * Scrolls a target into view without any smooth scrolling animation,
 * while keeping the existing block/inline positioning behavior.
 */
export function revealElement(element: HTMLElement | null, block: ScrollLogicalPosition = 'center') {
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const visibleTop = 0;
  const visibleBottom = viewportHeight;

  if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;

  const distance = rect.bottom < visibleTop ? -rect.bottom : rect.top - visibleBottom;
  const nearby = Math.abs(distance) <= viewportHeight * 0.6;
  element.scrollIntoView({
    behavior: 'auto',
    block: nearby ? 'nearest' : block,
    inline: 'nearest',
  });
}
