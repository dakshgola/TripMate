/**
 * The Trip Mate plugin design kit (#plugins).
 *
 * A plugin's UI runs in a sandboxed, opaque-origin iframe — it can't load Trip Mate's
 * stylesheet, only postMessage. So instead of forcing every author to re-derive the
 * look, we ship it: a token-driven stylesheet (`TRIPMATE_UI_CSS`) plus a tiny bootstrap
 * (`TRIPMATE_THEME_JS`) that wires the frame to the host. Both are plain strings, meant
 * to be INLINED into the plugin's own `client/index.html` (the CSP forbids external
 * <link>/<script src> for an opaque frame). Authors opt in with a single
 * `<!-- tripmate:ui -->` marker; `dev`/`pack` expand it, and `create` seeds it.
 *
 * The kit carries its own default values, so a component looks right on first paint,
 * then the bootstrap overrides the live tokens the host sends (accent scheme, custom
 * accent, high-contrast, light/dark) so the plugin tracks the app exactly. The glassy
 * `.tripmate-dash` layer (the --glass, --r and --sh families) is scoped to the dashboard
 * in the host, so it can't be read over the bridge — those values are baked here
 * (they only change
 * with light/dark, keyed off `[data-theme="dark"]`, not with the accent).
 *
 * Nothing here is a security boundary: it is the plugin's own inlined CSS/JS talking
 * over the existing bridge. It grants no new capability — only a native look.
 */

/** Marker an author drops in `client/index.html`; `dev`/`pack` replace it with the kit. */
export const TRIPMATE_UI_MARKER = '<!-- tripmate:ui -->';

/** Token-driven stylesheet. Inline as `<style>${TRIPMATE_UI_CSS}</style>`. */
export const TRIPMATE_UI_CSS = `/* Trip Mate plugin design kit — token-driven, matches the host in light + dark. */
:root {
  color-scheme: light;
  /* Live tokens (the host overrides these per theme/accent via the bridge). */
  --bg-primary: #ffffff; --bg-secondary: #f8fafc; --bg-tertiary: #f1f5f9;
  --bg-card: #ffffff; --bg-input: #ffffff; --bg-hover: rgba(0,0,0,.03); --bg-selected: #e2e8f0;
  --text-primary: #111827; --text-secondary: #374151; --text-muted: #6b7280; --text-faint: #9ca3af;
  --border-primary: #e5e7eb; --border-secondary: #f3f4f6; --border-faint: rgba(0,0,0,.06);
  --accent: #111827; --accent-text: #ffffff; --accent-hover: #1f2937; --accent-subtle: #f1f5f9;
  --success: #16a34a; --success-soft: #dcfce7; --danger: #dc2626; --danger-soft: #fef2f2;
  --warning: #d97706; --warning-soft: #fffbeb; --info: #2563eb; --info-soft: #eff6ff;
  --shadow-card: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.05); --shadow-md: 0 4px 12px rgba(0,0,0,.08);
  --shadow-lg: 0 12px 32px rgba(0,0,0,.12);
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px;
  --font-system: 'Poppins', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
  /* Baked glass layer (mirrors the host's .tripmate-dash; not sent over the bridge). */
  --glass-bg: linear-gradient(135deg, oklch(1 0 0 / .72) 0%, oklch(0.99 0.006 75 / .5) 100%);
  --glass-border: oklch(0.88 0.008 70 / .7);
  --glass-shadow: 0 1px 2px oklch(0.4 0.02 60 / .05), 0 12px 32px -14px oklch(0.3 0.02 60 / .2);
  --glass-shadow-hover: 0 2px 6px oklch(0.4 0.02 60 / .07), 0 26px 56px -20px oklch(0.25 0.04 60 / .32);
  --glass-highlight: inset 0 1px 0 oklch(1 0 0 / .8);
  --glass-blur: blur(22px) saturate(1.7);
  --r-sm: 14px; --r-md: 18px; --r-lg: 22px; --r-xl: 28px;
  /* The house easings: a punchy card curve and Trip Mate's ease-out-quint. */
  --tripmate-ease: cubic-bezier(.2,.7,.2,1);
  --tripmate-ease-quint: cubic-bezier(.23,1,.32,1);
}
[data-theme="dark"] {
  color-scheme: dark;
  --bg-primary: #121215; --bg-secondary: #1a1a1e; --bg-tertiary: #1c1c21;
  --bg-card: #131316; --bg-input: #1c1c21; --bg-hover: rgba(255,255,255,.06); --bg-selected: rgba(255,255,255,.1);
  --text-primary: #f4f4f5; --text-secondary: #d4d4d8; --text-muted: #a1a1aa; --text-faint: #71717a;
  --border-primary: #27272a; --border-secondary: #1c1c21; --border-faint: rgba(255,255,255,.07);
  --accent: #e4e4e7; --accent-text: #09090b; --accent-hover: #d4d4d8; --accent-subtle: rgba(255,255,255,.08);
  --success: #22c55e; --success-soft: rgba(34,197,94,.15); --danger: #ef4444; --danger-soft: rgba(239,68,68,.15);
  --warning: #f59e0b; --warning-soft: rgba(245,158,11,.15); --info: #3b82f6; --info-soft: rgba(59,130,246,.15);
  --shadow-card: 0 1px 3px rgba(0,0,0,.4), 0 1px 2px rgba(0,0,0,.3);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.3); --shadow-md: 0 4px 12px rgba(0,0,0,.4);
  --shadow-lg: 0 12px 32px rgba(0,0,0,.5);
  --glass-bg: linear-gradient(135deg, oklch(0.31 0 0 / .58) 0%, oklch(0.25 0 0 / .42) 100%);
  --glass-border: oklch(1 0 0 / .1);
  --glass-shadow: 0 1px 2px oklch(0 0 0 / .3), 0 12px 32px -14px oklch(0 0 0 / .55);
  --glass-shadow-hover: 0 2px 6px oklch(0 0 0 / .4), 0 26px 56px -20px oklch(0 0 0 / .72);
  --glass-highlight: inset 0 1px 0 oklch(1 0 0 / .09);
}

/* Base: a light reset + native type. The bootstrap adds \`tripmate-ui\` to <body>. */
*, *::before, *::after { box-sizing: border-box; }
body.tripmate-ui {
  margin: 0;
  font-family: var(--font-system);
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: transparent;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.tripmate-ui :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

/* Cards + panels ----------------------------------------------------------- */
.tripmate-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: 16px;
}
.tripmate-glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-xl);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  padding: 24px 26px;
}
/* Add to a card/glass to make it lift on hover, like a native tool tile. */
.tripmate-interactive {
  transition: transform .3s var(--tripmate-ease), box-shadow .3s, border-color .3s;
  cursor: pointer;
}
.tripmate-glass.tripmate-interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--glass-shadow-hover), var(--glass-highlight);
}
.tripmate-card.tripmate-interactive:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.tripmate-interactive:active { transform: translateY(0); }

/* Buttons ------------------------------------------------------------------ */
.tripmate-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 16px; border-radius: 12px;
  font: inherit; font-size: 14px; font-weight: 500; line-height: 1;
  border: 1px solid transparent; cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: transform .08s var(--tripmate-ease-quint), background .15s, box-shadow .15s, border-color .15s, color .15s;
}
.tripmate-btn:active { transform: scale(.97); }
.tripmate-btn:disabled { opacity: .5; cursor: not-allowed; }
.tripmate-btn--primary { background: var(--accent); color: var(--accent-text); box-shadow: var(--shadow-sm); }
.tripmate-btn--primary:hover:not(:disabled) { background: var(--accent-hover); }
.tripmate-btn--secondary { background: var(--bg-card); color: var(--text-primary); border-color: var(--border-primary); box-shadow: var(--shadow-sm); }
.tripmate-btn--secondary:hover:not(:disabled) { background: var(--bg-hover); }
.tripmate-btn--ghost { background: transparent; color: var(--text-secondary); }
.tripmate-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.tripmate-btn--danger { background: var(--danger); color: #fff; }
.tripmate-btn--danger:hover:not(:disabled) { filter: brightness(1.05); }

/* Form controls ------------------------------------------------------------ */
.tripmate-input, .tripmate-textarea, .tripmate-select {
  width: 100%; box-sizing: border-box;
  padding: 8px 14px; border-radius: 10px;
  border: 1px solid var(--border-primary); background: var(--bg-input); color: var(--text-primary);
  font: inherit; font-size: 13px; outline: none;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.tripmate-textarea { resize: vertical; min-height: 72px; }
.tripmate-input::placeholder, .tripmate-textarea::placeholder { color: var(--text-faint); }
.tripmate-input:focus, .tripmate-textarea:focus, .tripmate-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent);
}
.tripmate-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }

/* Enhanced select — the kit upgrades a native <select> into this listbox so the
   dropdown matches the host (a native popup is drawn by the OS and can't be
   themed). The real <select> stays in the DOM as the value source. */
.tripmate-select-wrap { position: relative; }
.tripmate-select-native-hidden {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0;
}
.tripmate-select-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  text-align: start; cursor: pointer;
}
.tripmate-select-trigger:disabled { opacity: .5; cursor: not-allowed; }
.tripmate-select-trigger[aria-expanded="true"] {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent);
}
.tripmate-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tripmate-select-caret { flex: none; display: inline-flex; color: var(--text-faint); transition: transform .15s; }
.tripmate-select-trigger[aria-expanded="true"] .tripmate-select-caret { transform: rotate(180deg); }
.tripmate-select-menu {
  position: absolute; left: 0; right: 0; top: 100%; z-index: 50;
  margin-top: 6px; padding: 4px;
  max-height: 260px; overflow-y: auto;
  background: var(--bg-card); color: var(--text-primary);
  border: 1px solid var(--border-primary); border-radius: 10px;
  box-shadow: var(--shadow-md);
}
.tripmate-select-menu[data-placement="top"] { top: auto; bottom: 100%; margin-top: 0; margin-bottom: 6px; }
.tripmate-select-option {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 7px; cursor: pointer;
  font-size: 13px; white-space: nowrap;
}
.tripmate-select-option.tripmate-active { background: var(--bg-hover); }
.tripmate-select-option[aria-selected="true"] { color: var(--accent); font-weight: 600; }
.tripmate-select-option[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }

/* Chips + badges ----------------------------------------------------------- */
.tripmate-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600; white-space: nowrap;
  color: var(--text-secondary); background: var(--accent-subtle);
}
.tripmate-chip--accent  { color: var(--accent);  background: color-mix(in oklch, var(--accent) 12%, transparent); }
.tripmate-chip--success { color: var(--success); background: var(--success-soft); }
.tripmate-chip--danger  { color: var(--danger);  background: var(--danger-soft); }
.tripmate-chip--warning { color: var(--warning); background: var(--warning-soft); }
.tripmate-chip--info    { color: var(--info);    background: var(--info-soft); }

/* Rows + text helpers ------------------------------------------------------ */
.tripmate-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 12px; cursor: pointer;
  transition: background .12s;
}
.tripmate-row:hover { background: var(--bg-hover); }
.tripmate-title { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: .14em; color: var(--text-muted); }
.tripmate-muted { color: var(--text-muted); }
.tripmate-faint { color: var(--text-faint); }

/* Layout helpers ----------------------------------------------------------- */
.tripmate-stack { display: flex; flex-direction: column; gap: 12px; }
.tripmate-cluster { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

/* Motion library — the host's animation vocabulary, mirrored 1:1 from
   index.css so plugin UI moves exactly like Trip Mate does. ---------------------- */
@keyframes tripmate-menu-enter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes tripmate-popover-enter {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes tripmate-modal-enter {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes tripmate-backdrop-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes tripmate-toast-enter {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tripmate-progress-fill {
  from { width: 0%; }
  to   { width: var(--tripmate-progress-to, 0%); }
}
@keyframes tripmate-pie-reveal {
  from { opacity: 0; transform: rotate(-90deg) scale(0.85); }
  to   { opacity: 1; transform: rotate(0deg) scale(1); }
}
@keyframes tripmate-bar-fill {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes tripmate-page-enter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes tripmate-shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
@keyframes tripmate-drawer-enter {
  from { opacity: 0; transform: translateY(100%); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes tripmate-fade-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.tripmate-menu-enter {
  animation: tripmate-menu-enter 200ms var(--tripmate-ease-quint);
  transform-origin: top right; will-change: transform, opacity;
}
.tripmate-menu-enter-left {
  animation: tripmate-menu-enter 200ms var(--tripmate-ease-quint);
  transform-origin: top left; will-change: transform, opacity;
}
.tripmate-popover-enter { animation: tripmate-popover-enter 180ms var(--tripmate-ease-quint); will-change: transform, opacity; }
.tripmate-modal-enter { animation: tripmate-modal-enter 220ms var(--tripmate-ease-quint); will-change: transform, opacity; }
@media (max-width: 639px) {
  .tripmate-modal-enter { animation: tripmate-drawer-enter 320ms cubic-bezier(0.32, 0.72, 0, 1); }
}

/* Mobile layer ------------------------------------------------------------- *
 * Trip Mate 4 gives the phone its own design: a translucent, border-led surface over
 * a gradient, no drop shadows, and touch feedback rather than hover. The host
 * hands the mobile palette (--m-*) down with the rest of the tokens whenever a
 * frame is mounted inside the mobile shell, so these rules only restate the
 * SHAPE — the colours come from the same variables the native screens use.
 *
 * Everything here is keyed on [data-form-factor="phone"], which the host sets
 * from the viewport it reports. On desktop not a single rule below applies. */

[data-form-factor="phone"] .tripmate-ui,
[data-form-factor="phone"] body.tripmate-ui { font-size: 15px; }

/* The card is the workhorse. On the phone it is a translucent tile with a hairline
   border and no shadow — a drop shadow over the gradient reads as a sticker. */
[data-form-factor="phone"] .tripmate-card {
  background: var(--m-card, var(--bg-card));
  border: 1px solid var(--m-cbr, var(--border-primary));
  border-radius: 16px;
  box-shadow: none;
  padding: 14px;
  -webkit-backdrop-filter: blur(30px) saturate(1.8);
  backdrop-filter: blur(30px) saturate(1.8);
}
[data-form-factor="phone"] .tripmate-glass {
  background: var(--m-glass, var(--glass-bg));
  border-color: var(--m-gbr, var(--glass-border));
  border-radius: 20px;
  box-shadow: none;
  padding: 16px;
}

/* Touch has no hover. The lift on hover never fires on a phone and the pressed
   state never existed, so a tap gave no feedback at all. */
[data-form-factor="phone"] .tripmate-card.tripmate-interactive:hover,
[data-form-factor="phone"] .tripmate-glass.tripmate-interactive:hover { transform: none; box-shadow: none; }
[data-form-factor="phone"] .tripmate-interactive:active,
[data-form-factor="phone"] .tripmate-btn:active,
[data-form-factor="phone"] .tripmate-row:active { transform: scale(.985); opacity: .9; }
[data-form-factor="phone"] .tripmate-btn:hover { filter: none; }

/* 44px is the smallest target that reliably hits on a phone. */
[data-form-factor="phone"] .tripmate-btn { min-height: 44px; border-radius: 12px; }
[data-form-factor="phone"] .tripmate-row { min-height: 48px; }

/* An input below 16px makes iOS Safari zoom the page on focus, and the zoom does
   not come back. This is the single most common mobile bug in embedded UI. */
[data-form-factor="phone"] .tripmate-input,
[data-form-factor="phone"] .tripmate-select,
[data-form-factor="phone"] .tripmate-textarea { font-size: 16px; min-height: 44px; border-radius: 12px; }

/* Ink follows the mobile palette where it exists. */
[data-form-factor="phone"] .tripmate-title { color: var(--m-ink, var(--text-primary)); }
[data-form-factor="phone"] .tripmate-sub,
[data-form-factor="phone"] .tripmate-muted { color: var(--m-muted, var(--text-muted)); }

/* A filling surface owns its own scrolling: the host will not scroll for it, and
   a height report is discarded. Anchor the body and scroll the content. */
[data-fill] .tripmate-ui, [data-fill] body.tripmate-ui { height: 100%; overflow: hidden; }
[data-fill] .tripmate-scroll {
  height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

/* Building blocks the native mobile screens are made of, so a plugin does not
   have to reverse-engineer them from screenshots. */
.tripmate-eyebrow {
  font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  color: var(--m-faint, var(--text-faint));
}
.tripmate-countpill {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
  background: var(--m-ic, var(--bg-tertiary)); color: var(--m-muted, var(--text-muted));
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.tripmate-sectionhead {
  display: flex; align-items: center; gap: 7px; width: 100%;
  margin: 15px 0 2px; padding: 0 2px; background: none; border: 0;
  font: inherit; text-align: left; cursor: pointer;
}
.tripmate-statusdot { width: 8px; height: 8px; border-radius: 999px; flex: none; background: var(--m-st-neutral, var(--text-faint)); }
.tripmate-statusdot[data-status="confirmed"] { background: var(--m-st-confirmed, var(--success)); }
.tripmate-statusdot[data-status="pending"] { background: var(--m-st-pending, var(--warning)); }
.tripmate-statusdot[data-status="info"] { background: var(--m-st-info, var(--info)); }
.tripmate-statusdot[data-status="danger"] { background: var(--m-st-danger, var(--danger)); }
.tripmate-iconbtn {
  display: inline-grid; place-items: center; flex: none;
  width: 38px; height: 38px; border-radius: 999px; cursor: pointer;
  background: var(--m-ic, var(--bg-tertiary));
  border: 1px solid var(--m-gbr, var(--border-primary));
  color: var(--m-ink, var(--text-primary));
}
.tripmate-iconbtn:active { transform: scale(.94); }
.tripmate-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tripmate-field > .tripmate-field-label {
  font-size: 9px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--m-faint, var(--text-faint));
}
.tripmate-field > .tripmate-field-value {
  font-size: 13px; font-weight: 600; color: var(--m-ink, var(--text-primary));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tripmate-segmented {
  display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px;
  background: var(--m-glass, var(--bg-tertiary));
  border: 1px solid var(--m-gbr, var(--border-primary));
}
.tripmate-segmented > button {
  border: 0; background: none; cursor: pointer; font: inherit;
  padding: 8px 16px; border-radius: 999px; white-space: nowrap;
  font-size: 13px; font-weight: 500; color: var(--m-ink, var(--text-primary));
}
.tripmate-segmented > button[aria-pressed="true"],
.tripmate-segmented > button.on {
  background: var(--m-act, var(--accent)); color: var(--m-actfg, var(--accent-text)); font-weight: 600;
}

.tripmate-backdrop-enter { animation: tripmate-backdrop-enter 180ms var(--tripmate-ease-quint); }
.tripmate-toast-enter { animation: tripmate-toast-enter 260ms var(--tripmate-ease-quint); will-change: transform, opacity; }
.tripmate-pie-reveal {
  animation: tripmate-pie-reveal 900ms var(--tripmate-ease-quint) both;
  transform-origin: center; will-change: transform, opacity;
}
.tripmate-bar-fill {
  animation: tripmate-bar-fill 700ms var(--tripmate-ease-quint) both;
  transform-origin: left center; will-change: transform;
}
.tripmate-page-enter { animation: tripmate-page-enter 220ms var(--tripmate-ease-quint) both; }
.tripmate-skeleton {
  background: linear-gradient(90deg, var(--bg-tertiary) 0%, var(--bg-hover) 50%, var(--bg-tertiary) 100%);
  background-size: 200% 100%;
  animation: tripmate-shimmer 1.6s linear infinite;
  border-radius: 8px; color: transparent; user-select: none;
}
[data-theme="dark"] .tripmate-skeleton {
  background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%);
  background-size: 200% 100%;
}
.tripmate-stagger > * { animation: tripmate-fade-up 280ms var(--tripmate-ease-quint) both; }
.tripmate-stagger > *:nth-child(1) { animation-delay: 0ms; }
.tripmate-stagger > *:nth-child(2) { animation-delay: 40ms; }
.tripmate-stagger > *:nth-child(3) { animation-delay: 80ms; }
.tripmate-stagger > *:nth-child(4) { animation-delay: 120ms; }
.tripmate-stagger > *:nth-child(5) { animation-delay: 160ms; }
.tripmate-stagger > *:nth-child(6) { animation-delay: 200ms; }
.tripmate-stagger > *:nth-child(7) { animation-delay: 240ms; }
.tripmate-stagger > *:nth-child(8) { animation-delay: 280ms; }
.tripmate-stagger > *:nth-child(n+9) { animation-delay: 320ms; }

/* Accessibility: mirror the host's own graceful-degrade rules. -------------- */
[data-no-transparency] .tripmate-glass {
  background: var(--bg-card); border-color: var(--border-primary);
  box-shadow: var(--shadow-card);
  -webkit-backdrop-filter: none; backdrop-filter: none;
}
[data-reduce-motion] .tripmate-interactive,
[data-reduce-motion] .tripmate-btn,
[data-reduce-motion] .tripmate-row { transition: none; }
[data-reduce-motion] .tripmate-interactive:hover,
[data-reduce-motion] .tripmate-btn:active { transform: none; }
[data-reduce-motion] .tripmate-menu-enter, [data-reduce-motion] .tripmate-menu-enter-left,
[data-reduce-motion] .tripmate-popover-enter, [data-reduce-motion] .tripmate-modal-enter,
[data-reduce-motion] .tripmate-toast-enter, [data-reduce-motion] .tripmate-stagger > *,
[data-reduce-motion] .tripmate-page-enter {
  animation: tripmate-backdrop-enter 120ms ease-out;
}
[data-reduce-motion] .tripmate-pie-reveal, [data-reduce-motion] .tripmate-bar-fill {
  animation: tripmate-backdrop-enter 120ms ease-out both;
}
[data-reduce-motion] .tripmate-skeleton { animation: none; background: var(--bg-tertiary); }
[data-reduce-motion] .tripmate-select-caret { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .tripmate-interactive, .tripmate-btn, .tripmate-row, .tripmate-input, .tripmate-textarea, .tripmate-select, .tripmate-select-caret { transition: none; }
  .tripmate-interactive:hover, .tripmate-btn:active { transform: none; }
  .tripmate-menu-enter, .tripmate-menu-enter-left, .tripmate-popover-enter,
  .tripmate-modal-enter, .tripmate-toast-enter, .tripmate-stagger > *, .tripmate-page-enter {
    animation: tripmate-backdrop-enter 120ms ease-out;
  }
  .tripmate-pie-reveal, .tripmate-bar-fill { animation: tripmate-backdrop-enter 120ms ease-out both; }
  .tripmate-skeleton { animation: none; background: var(--bg-tertiary); }
}`;

/**
 * The bridge bootstrap. Inline as `<script>${TRIPMATE_THEME_JS}</script>` (typically via
 * the `<!-- tripmate:ui -->` marker). It: announces readiness; applies the host's theme
 * tokens, theme name and appearance flags to the document; auto-reports its height so
 * a widget/page self-sizes; and installs a small `window.tripmate` helper over the same
 * bridge messages the host already understands — it adds no new capability.
 */
export const TRIPMATE_THEME_JS = `(function () {
  'use strict';
  var docEl = document.documentElement;
  var ctxHandlers = [];
  var evtHandlers = [];
  var lastCtx = null;
  var pending = {};
  var pendingConfirms = {};
  var pendingGeo = {};
  var geoWatchers = [];
  var seq = 0;
  var lastH = -1;

  function send(msg) { try { window.parent.postMessage(msg, '*'); return true; } catch (e) { return false; } }
  // postMessage throws synchronously on a value structured clone cannot carry (a
  // function, a DOM node, a Proxy). Swallowing that left the request registered and
  // the promise pending forever, so the same call rejects under the mock host and
  // hangs in the real one. Drop the entry and reject with the host's own code.
  function unsendable(bucket, id, code, message) { delete bucket[id]; var e = new Error(message); e.code = code; return e; }
  function setFlag(name, on) { if (on) { docEl.setAttribute(name, ''); } else { docEl.removeAttribute(name); } }

  function applyContext(m) {
    if (m.theme) { docEl.setAttribute('data-theme', m.theme); }
    if (m.locale) { docEl.setAttribute('lang', m.locale); }
    docEl.setAttribute('dir', m.dir === 'rtl' ? 'rtl' : 'ltr');
    // Where this frame sits, and in what shape. data-form-factor drives the
    // mobile layer of this stylesheet; data-surface lets a plugin tell a
    // full-height tab from a widget that reports its height. The insets are the
    // space the HOST already keeps clear — exposed so a plugin can align its own
    // sticky chrome with the host's, not so it adds padding on top.
    var vp = m.viewport || {};
    if (vp.formFactor) { docEl.setAttribute('data-form-factor', vp.formFactor); }
    if (vp.surface) { docEl.setAttribute('data-surface', vp.surface); }
    setFlag('data-fill', vp.fill);
    var ins = vp.insets || {};
    docEl.style.setProperty('--tripmate-inset-top', (ins.top || 0) + 'px');
    docEl.style.setProperty('--tripmate-inset-bottom', (ins.bottom || 0) + 'px');
    var t = m.tokens || {};
    for (var k in t) {
      if (Object.prototype.hasOwnProperty.call(t, k) && t[k]) { docEl.style.setProperty(k, t[k]); }
    }
    var a = m.appearance || {};
    setFlag('data-reduce-motion', a.reducedMotion);
    setFlag('data-no-transparency', a.noTransparency);
    if (a.density) { docEl.setAttribute('data-density', a.density); }
    if (a.scheme) { docEl.setAttribute('data-scheme', a.scheme); }
    if (document.body) { document.body.classList.add('tripmate-ui'); }
  }

  function reportHeight() {
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (h > 0 && h !== lastH) { lastH = h; send({ type: 'tripmate:resize', height: h }); }
  }

  window.addEventListener('message', function (ev) {
    // Opaque frame: origin serialises to 'null', so trust the SENDER — only our real
    // parent window. Never act on a claimed id or on origin.
    if (ev.source !== window.parent) { return; }
    var m = ev.data;
    if (!m || typeof m !== 'object') { return; }
    if (m.type === 'tripmate:context') {
      lastCtx = m; api.context = m;
      applyContext(m);
      for (var i = 0; i < ctxHandlers.length; i++) { try { ctxHandlers[i](m); } catch (e) {} }
      reportHeight();
    } else if (m.type === 'tripmate:response') {
      var p = pending[m.requestId];
      if (p) { delete pending[m.requestId]; p.resolve(m.data); }
    } else if (m.type === 'tripmate:error') {
      var q = pending[m.requestId];
      if (q) { delete pending[m.requestId]; var err = new Error(m.message || 'invoke failed'); err.code = m.code; q.reject(err); }
    } else if (m.type === 'tripmate:confirm:result') {
      var c = pendingConfirms[m.requestId];
      if (c) { delete pendingConfirms[m.requestId]; c(!!m.confirmed); }
    } else if (m.type === 'tripmate:geolocation:result') {
      var g = pendingGeo[m.requestId];
      if (g) {
        delete pendingGeo[m.requestId];
        if (m.error) { var gerr = new Error('geolocation: ' + m.error); gerr.code = m.error; g.reject(gerr); }
        else { g.resolve(m.position || m); }
      }
    } else if (m.type === 'tripmate:geolocation:update') {
      for (var w = 0; w < geoWatchers.length; w++) { try { geoWatchers[w](m.position || null, m.error || null); } catch (e) {} }
    } else if (m.type === 'tripmate:event') {
      for (var j = 0; j < evtHandlers.length; j++) { try { evtHandlers[j](m.event, m.tripId); } catch (e) {} }
    }
  });

  // Native DOM helpers so a widget can build kit-styled UI with no bundler and no
  // hand-written CSS — every element carries the same tripmate-* classes the kit ships.
  function mkEl(tag, props, children) {
    var node = document.createElement(tag);
    props = props || {};
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) { continue; }
      var v = props[k];
      if (v == null) { continue; }
      if (k === 'class' || k === 'className') { node.className = v; }
      else if (k === 'text') { node.textContent = v; }
      else if (k === 'html') { node.innerHTML = v; }
      else if (k === 'on') { for (var ev in v) { if (Object.prototype.hasOwnProperty.call(v, ev)) { node.addEventListener(ev, v[ev]); } } }
      else { node.setAttribute(k, v); }
    }
    var kids = children == null ? [] : (typeof children === 'string' || children.nodeType ? [children] : children);
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c == null) { continue; }
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  var ui = {
    el: mkEl,
    button: function (label, opts) {
      opts = opts || {};
      return mkEl('button', { class: 'tripmate-btn' + (opts.variant ? ' tripmate-btn--' + opts.variant : ''), type: 'button', text: label, on: opts.onClick ? { click: opts.onClick } : null }, null);
    },
    card: function (children) { return mkEl('div', { class: 'tripmate-card' }, children); },
    chip: function (text, variant) { return mkEl('span', { class: 'tripmate-chip' + (variant ? ' tripmate-chip--' + variant : ''), text: text }, null); },
    input: function (opts) { opts = opts || {}; return mkEl('input', { class: 'tripmate-input', type: opts.type || 'text', placeholder: opts.placeholder || '', value: opts.value || '' }, null); },
    mount: function (node, target) { (target || document.body).appendChild(node); return node; }
  };

  var session = {
    get: function (key, opts) {
      var id = 's' + (++seq);
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        if (!send({ type: 'tripmate:session:get', requestId: id, key: key, scope: opts && opts.scope })) { reject(unsendable(pending, id, 'SESSION_INVALID_VALUE', 'session value must be JSON-serialisable')); }
      });
    },
    set: function (key, value, opts) {
      var id = 's' + (++seq);
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        if (!send({ type: 'tripmate:session:set', requestId: id, key: key, value: value, scope: opts && opts.scope })) { reject(unsendable(pending, id, 'SESSION_INVALID_VALUE', 'session value must be JSON-serialisable')); }
      });
    },
    remove: function (key, opts) {
      var id = 's' + (++seq);
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        if (!send({ type: 'tripmate:session:remove', requestId: id, key: key, scope: opts && opts.scope })) { reject(unsendable(pending, id, 'SESSION_INVALID_VALUE', 'session value must be JSON-serialisable')); }
      });
    },
    clear: function (opts) {
      var id = 's' + (++seq);
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        if (!send({ type: 'tripmate:session:clear', requestId: id, scope: opts && opts.scope })) { reject(unsendable(pending, id, 'SESSION_INVALID_VALUE', 'session value must be JSON-serialisable')); }
      });
    }
  };

  var api = {
    context: null,
    ui: ui,
    session: session,
    ready: function () { send({ type: 'tripmate:ready' }); },
    requestContext: function () { send({ type: 'tripmate:context:request' }); },
    onContext: function (cb) {
      ctxHandlers.push(cb);
      if (lastCtx) { try { cb(lastCtx); } catch (e) {} }
      return function () { var i = ctxHandlers.indexOf(cb); if (i >= 0) { ctxHandlers.splice(i, 1); } };
    },
    notify: function (level, message, duration) { send({ type: 'tripmate:notify', level: level, message: message, duration: duration }); },
    navigate: function (to) { send({ type: 'tripmate:navigate', to: to }); },
    openExternal: function (url) { send({ type: 'tripmate:openExternal', url: url }); },
    resize: function (px) { var h = px | 0; if (h > 0) { lastH = h; send({ type: 'tripmate:resize', height: h }); } },
    // Host-rendered native confirm dialog; resolves true/false. The host shows one
    // at a time — a second concurrent request resolves false immediately.
    confirm: function (opts) {
      opts = typeof opts === 'string' ? { message: opts } : (opts || {});
      var id = 'c' + (++seq);
      return new Promise(function (resolve) {
        pendingConfirms[id] = resolve;
        if (!send({ type: 'tripmate:confirm', requestId: id, title: opts.title, message: opts.message, confirmLabel: opts.confirmLabel, cancelLabel: opts.cancelLabel, danger: opts.danger })) { delete pendingConfirms[id]; resolve(false); }
      });
    },
    // Core-event names for the trip in view ({ event, tripId } only, no payloads) —
    // refetch via invoke() when something relevant fires instead of polling.
    onEvent: function (cb) {
      evtHandlers.push(cb);
      return function () { var i = evtHandlers.indexOf(cb); if (i >= 0) { evtHandlers.splice(i, 1); } };
    },
    invoke: function (sub, opts) {
      opts = opts || {};
      var id = 'r' + (++seq);
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        if (!send({ type: 'tripmate:invoke', requestId: id, sub: sub, method: opts.method, body: opts.body })) { reject(unsendable(pending, id, 'error', 'invoke body must be JSON-serialisable')); }
      });
    },
    // Host-brokered browser position (needs the geolocation:read grant; the
    // browser's own site prompt still applies). get() resolves one position;
    // watch(cb) streams updates — cb(position, error) — until every returned
    // unsubscribe ran, which also releases the host's GPS watch.
    geolocation: {
      get: function () {
        var id = 'g' + (++seq);
        return new Promise(function (resolve, reject) {
          pendingGeo[id] = { resolve: resolve, reject: reject };
          send({ type: 'tripmate:geolocation', requestId: id, action: 'get' });
        });
      },
      watch: function (cb) {
        geoWatchers.push(cb);
        if (geoWatchers.length === 1) {
          var id = 'g' + (++seq);
          // The start ack resolves silently; a start error (e.g. forbidden) is
          // surfaced through the callback so watch() itself never throws.
          pendingGeo[id] = { resolve: function () {}, reject: function (e) { try { cb(null, e && e.code ? e.code : 'unavailable'); } catch (x) {} } };
          send({ type: 'tripmate:geolocation', requestId: id, action: 'watch' });
        }
        return function () {
          var i = geoWatchers.indexOf(cb);
          if (i >= 0) { geoWatchers.splice(i, 1); }
          if (geoWatchers.length === 0) {
            var cid = 'g' + (++seq);
            pendingGeo[cid] = { resolve: function () {}, reject: function () {} };
            send({ type: 'tripmate:geolocation', requestId: cid, action: 'clear' });
          }
        };
      }
    }
  };
  window.tripmate = api;

  // --- Native <select> -> host-styled listbox ---------------------------------
  // A native select's popup is drawn by the OS and can't match Trip Mate. Upgrade each
  // one to a keyboard-accessible listbox that uses the kit tokens, while the real
  // <select> stays in the DOM as the value/form source (kept in sync both ways).
  // Opt out per field with data-tripmate-native; multi/size selects are left alone.
  function dispatch(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true }); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent(type, true, false); }
    el.dispatchEvent(ev);
  }
  function enhanceSelect(sel) {
    if (!sel || sel.__trekSelect || sel.hasAttribute('data-tripmate-native')) { return; }
    if (sel.multiple || sel.size > 1 || !sel.parentNode) { return; }
    sel.__trekSelect = true;

    var wrap = document.createElement('div');
    wrap.className = 'tripmate-select-wrap';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('tripmate-select-native-hidden');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tripmate-select tripmate-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (sel.disabled) { trigger.disabled = true; }
    var valueEl = document.createElement('span');
    valueEl.className = 'tripmate-select-value';
    var caret = document.createElement('span');
    caret.className = 'tripmate-select-caret';
    caret.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    trigger.appendChild(valueEl);
    trigger.appendChild(caret);
    wrap.appendChild(trigger);

    var menu = document.createElement('div');
    menu.className = 'tripmate-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    wrap.appendChild(menu);

    var activeIdx = -1;

    function syncTrigger() {
      var o = sel.options[sel.selectedIndex];
      valueEl.textContent = o ? o.text : '';
    }
    function buildMenu() {
      menu.innerHTML = '';
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i];
        var item = document.createElement('div');
        item.className = 'tripmate-select-option';
        item.setAttribute('role', 'option');
        item.setAttribute('data-idx', String(i));
        item.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
        if (o.disabled) { item.setAttribute('aria-disabled', 'true'); }
        item.textContent = o.text;
        menu.appendChild(item);
      }
    }
    function highlight(idx) {
      var opts = menu.children;
      for (var i = 0; i < opts.length; i++) {
        opts[i].className = i === idx ? 'tripmate-select-option tripmate-active' : 'tripmate-select-option';
      }
      if (idx >= 0 && opts[idx] && opts[idx].scrollIntoView) { opts[idx].scrollIntoView({ block: 'nearest' }); }
      activeIdx = idx;
    }
    function onDocDown(e) { if (!wrap.contains(e.target)) { closeMenu(); } }
    function openMenu() {
      if (trigger.disabled || !menu.hidden) { return; }
      buildMenu();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      // Flip above the trigger when there isn't room below in the frame viewport.
      var r = trigger.getBoundingClientRect();
      var below = window.innerHeight - r.bottom;
      if (below < Math.min(260, menu.scrollHeight + 12) && r.top > below) { menu.setAttribute('data-placement', 'top'); }
      else { menu.removeAttribute('data-placement'); }
      highlight(sel.selectedIndex);
      reportHeight();
      document.addEventListener('mousedown', onDocDown, true);
    }
    function closeMenu() {
      if (menu.hidden) { return; }
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onDocDown, true);
      reportHeight();
    }
    function nextEnabled(from, dir) {
      var i = from;
      for (var n = 0; n < sel.options.length; n++) {
        i += dir;
        if (i < 0) { i = sel.options.length - 1; }
        if (i >= sel.options.length) { i = 0; }
        if (!sel.options[i].disabled) { return i; }
      }
      return from;
    }
    function commit(idx) {
      if (idx < 0 || idx >= sel.options.length || sel.options[idx].disabled) { return; }
      if (sel.selectedIndex !== idx) { sel.selectedIndex = idx; dispatch(sel, 'input'); dispatch(sel, 'change'); }
      syncTrigger();
      closeMenu();
      trigger.focus();
    }

    trigger.addEventListener('click', function () { if (menu.hidden) { openMenu(); } else { closeMenu(); } });
    trigger.addEventListener('keydown', function (e) {
      var k = e.key;
      if (menu.hidden) {
        if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); openMenu(); }
        return;
      }
      if (k === 'Escape') { e.preventDefault(); closeMenu(); trigger.focus(); }
      else if (k === 'ArrowDown') { e.preventDefault(); highlight(nextEnabled(activeIdx, 1)); }
      else if (k === 'ArrowUp') { e.preventDefault(); highlight(nextEnabled(activeIdx, -1)); }
      else if (k === 'Home') { e.preventDefault(); highlight(nextEnabled(-1, 1)); }
      else if (k === 'End') { e.preventDefault(); highlight(nextEnabled(0, -1)); }
      else if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); commit(activeIdx); }
      else if (k === 'Tab') { closeMenu(); }
    });
    menu.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus on the trigger
    menu.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== menu && !(t.getAttribute && t.hasAttribute('data-idx'))) { t = t.parentNode; }
      if (t && t.getAttribute && t.hasAttribute('data-idx')) { commit(parseInt(t.getAttribute('data-idx'), 10)); }
    });
    menu.addEventListener('mousemove', function (e) {
      var t = e.target;
      while (t && t !== menu && !(t.getAttribute && t.hasAttribute('data-idx'))) { t = t.parentNode; }
      if (t && t.getAttribute && t.hasAttribute('data-idx')) { highlight(parseInt(t.getAttribute('data-idx'), 10)); }
    });
    // The plugin may set select.value itself — mirror it back to the trigger.
    sel.addEventListener('change', syncTrigger);
    syncTrigger();
  }
  function enhanceAllSelects(root) {
    var live = (root || document).getElementsByTagName('select');
    var arr = [];
    for (var i = 0; i < live.length; i++) { arr.push(live[i]); }
    for (var j = 0; j < arr.length; j++) { enhanceSelect(arr[j]); }
  }

  function boot() {
    if (document.body) { document.body.classList.add('tripmate-ui'); }
    enhanceAllSelects(document);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (!n || n.nodeType !== 1) { continue; }
            if (n.tagName === 'SELECT') { enhanceSelect(n); }
            else if (n.getElementsByTagName) { enhanceAllSelects(n); }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
    api.ready();
    reportHeight();
    if (typeof ResizeObserver !== 'undefined' && document.body) {
      new ResizeObserver(reportHeight).observe(document.body);
    }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();`;

/**
 * Replace the `<!-- tripmate:ui -->` marker in a plugin's HTML with the inlined kit
 * (style + bootstrap). A no-op when the marker is absent, so it is safe to run over
 * any HTML. The source file on disk is never touched — the expansion happens at
 * dev-serve / pack time, so an author's `client/index.html` stays a one-line opt-in.
 */
export function injectTrekUi(html: string): string {
  if (!html.includes(TRIPMATE_UI_MARKER)) return html;
  const block = `<style data-tripmate-ui>\n${TRIPMATE_UI_CSS}\n</style>\n<script data-tripmate-ui>\n${TRIPMATE_THEME_JS}\n</script>`;
  return html.split(TRIPMATE_UI_MARKER).join(block);
}
