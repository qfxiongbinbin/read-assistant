export const PANEL_CLASS = 'readassistant-panel';
export const TRIGGER_CLASS = 'readassistant-trigger';
const STYLE_ID = 'readassistant-style';

const CSS = `
/* Defensive: the host page's CSS must not be able to reveal our hidden controls. */
.${PANEL_CLASS}[hidden],
.${PANEL_CLASS} [hidden],
.${TRIGGER_CLASS}[hidden] {
  display: none !important;
}
.${PANEL_CLASS},
.${PANEL_CLASS} * {
  box-sizing: border-box;
}

[data-ra-ready='1'] {
  position: relative;
  transition: box-shadow 120ms ease, background-color 120ms ease;
}
[data-ra-ready='1']:hover {
  box-shadow: inset 3px 0 0 0 rgba(45, 110, 220, 0.45);
  background-color: rgba(45, 110, 220, 0.04);
}
[data-ra-ready='1'][data-ra-active='1'] {
  box-shadow: inset 3px 0 0 0 rgba(45, 110, 220, 0.9);
}

/* Small pill that appears after the reader selects a sentence. */
.${TRIGGER_CLASS} {
  position: fixed;
  z-index: 2147483601;
  padding: 5px 11px;
  margin: 0;
  border: 0;
  border-radius: 999px;
  background: #2d6edc;
  color: #ffffff;
  font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(16, 30, 54, 0.26);
}
.${TRIGGER_CLASS}:hover { background: #1f5bc4; }

.${PANEL_CLASS} {
  margin: 8px 0 16px;
  padding: 10px 12px 10px 14px;
  border-left: 3px solid #2d6edc;
  border-radius: 0 6px 6px 0;
  background: rgba(45, 110, 220, 0.07);
  font: 15px/1.62 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: inherit;
  text-align: left;
  letter-spacing: normal;
  text-transform: none;
}

/* Detached cards: they must not reflow the page and must stay legible on any site. */
.${PANEL_CLASS}--side,
.${PANEL_CLASS}--float {
  position: absolute;
  z-index: 2147483600;
  width: 360px;
  max-width: calc(100vw - 24px);
  max-height: 70vh;
  overflow: auto;
  overscroll-behavior: contain;
  background: #ffffff;
  color: #1b2432;
  border: 1px solid rgba(45, 110, 220, 0.3);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(16, 30, 54, 0.18);
}
.${PANEL_CLASS}--float {
  position: fixed;
  width: 340px;
  max-height: min(60vh, 460px);
}

.${PANEL_CLASS}__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5b6b82;
}
.${PANEL_CLASS}__badge {
  padding: 2px 6px;
  border-radius: 4px;
  background: #2d6edc;
  color: #fff;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.${PANEL_CLASS}__spacer { flex: 1; }
.${PANEL_CLASS}__btn {
  border: 0;
  background: none;
  padding: 2px 5px;
  margin: 0;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #5b6b82;
  cursor: pointer;
  border-radius: 4px;
}
.${PANEL_CLASS}__btn:hover { background: rgba(45, 110, 220, 0.12); color: #2d6edc; }
.${PANEL_CLASS}__btn--on { background: rgba(45, 110, 220, 0.16); color: #2d6edc; }

.${PANEL_CLASS}__body p { margin: 0 0 8px; }
.${PANEL_CLASS}__body p:last-child { margin-bottom: 0; }
.${PANEL_CLASS}__body--phonetics p { line-height: 2.05; }

.${PANEL_CLASS}__word { cursor: pointer; border-radius: 3px; }
.${PANEL_CLASS}__word:hover { background: rgba(45, 110, 220, 0.15); }
.${PANEL_CLASS}__word--speaking { background: #2d6edc; color: #ffffff; }
.${PANEL_CLASS} ruby { ruby-position: over; }
.${PANEL_CLASS} rt {
  font-size: 10px;
  line-height: 1.15;
  font-weight: 400;
  letter-spacing: 0;
  color: #6b7a91;
}

.${PANEL_CLASS}__section {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(45, 110, 220, 0.18);
}
.${PANEL_CLASS}__section-title {
  margin: 0 0 6px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5b6b82;
}
.${PANEL_CLASS}__entry { margin: 0 0 9px; }
.${PANEL_CLASS}__entry:last-child { margin-bottom: 0; }
.${PANEL_CLASS}__entry-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
}
.${PANEL_CLASS}__term { font-weight: 600; color: #2d6edc; }
.${PANEL_CLASS}__entry-actions { margin-left: auto; display: flex; gap: 2px; }
.${PANEL_CLASS}__ipa {
  margin: 2px 0 0;
  font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #5b6b82;
}
.${PANEL_CLASS}__meaning { margin: 2px 0 0; font-size: 13.5px; line-height: 1.5; }

.${PANEL_CLASS}__status { color: #5b6b82; font-size: 13.5px; }
.${PANEL_CLASS}__error { color: #b3261e; }
.${PANEL_CLASS}__dots::after {
  content: '';
  animation: ra-dots 1.2s steps(4, end) infinite;
}
@keyframes ra-dots {
  0% { content: ''; }
  25% { content: '.'; }
  50% { content: '..'; }
  75% { content: '...'; }
}
li.${PANEL_CLASS}__item { list-style: none; margin-left: 0; }
`;

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
