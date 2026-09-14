import { PANEL_CLASS } from './style';
import type { PanelMode } from './types';

const SIDE_GAP = 12;
const EDGE = 12;
const CURSOR_OFFSET = 16;
const BELOW_GAP = 8;

export interface PointerPoint {
  x: number;
  y: number;
}

export interface PanelPlacement {
  /** Element that was inserted into the document; remove it to close the panel. */
  host: HTMLElement;
  mode: PanelMode;
  /** Float mode only: move the card next to a viewport point. */
  moveTo?: (clientX: number, clientY: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mount(root: HTMLElement): void {
  (document.documentElement ?? document.body).appendChild(root);
}

export function placePanel(
  mode: PanelMode,
  block: HTMLElement,
  root: HTMLElement,
  point: PointerPoint,
): PanelPlacement {
  if (mode === 'below') {
    if (block.tagName === 'LI' || block.tagName === 'TD') {
      const wrapper = document.createElement(block.tagName.toLowerCase());
      wrapper.className = PANEL_CLASS + '__item';
      wrapper.setAttribute('data-ra-skip', '1');
      wrapper.appendChild(root);
      block.insertAdjacentElement('afterend', wrapper);
      return { host: wrapper, mode };
    }
    block.insertAdjacentElement('afterend', root);
    return { host: root, mode };
  }

  if (mode === 'side') {
    root.classList.add(PANEL_CLASS + '--side');
    root.style.visibility = 'hidden';
    mount(root);

    const rect = block.getBoundingClientRect();
    const width = root.offsetWidth;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const fitsRight = rect.right + SIDE_GAP + width <= window.innerWidth - EDGE;
    const fitsLeft = rect.left - SIDE_GAP - width >= EDGE;

    let left: number;
    let top: number;
    if (fitsRight) {
      left = rect.right + scrollX + SIDE_GAP;
      top = rect.top + scrollY;
    } else if (fitsLeft) {
      left = rect.left + scrollX - width - SIDE_GAP;
      top = rect.top + scrollY;
    } else {
      left = rect.left + scrollX;
      top = rect.bottom + scrollY + BELOW_GAP;
    }

    root.style.left = Math.round(left) + 'px';
    root.style.top = Math.round(Math.max(top, scrollY + EDGE)) + 'px';
    root.style.visibility = '';
    return { host: root, mode };
  }

  root.classList.add(PANEL_CLASS + '--float');
  root.style.visibility = 'hidden';
  mount(root);

  const moveTo = (clientX: number, clientY: number): void => {
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    let left = clientX + CURSOR_OFFSET;
    let top = clientY + CURSOR_OFFSET;
    if (left + width > window.innerWidth - EDGE) left = clientX - width - CURSOR_OFFSET;
    if (top + height > window.innerHeight - EDGE) top = clientY - height - CURSOR_OFFSET;
    root.style.left =
      Math.round(clamp(left, EDGE, Math.max(EDGE, window.innerWidth - width - EDGE))) + 'px';
    root.style.top =
      Math.round(clamp(top, EDGE, Math.max(EDGE, window.innerHeight - height - EDGE))) + 'px';
  };

  moveTo(point.x, point.y);
  root.style.visibility = '';
  return { host: root, mode, moveTo };
}
