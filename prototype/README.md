# Prototype

This folder is the original CDN-React/Babel prototype — a single static
`index.html` plus a few `.jsx` files loaded via `@babel/standalone`.

It is kept for reference only:

- The visual design (colours, type, layout) is the source of truth for the
  Next.js port. See `styles.css`.
- The mock data in `data.jsx` mirrors the field shapes the production app
  will eventually surface from Orah.
- The component breakdown in `app.jsx` (Masthead, AlertSummary, four
  sections, Launchpad, AddResourceDialog, Toast) maps 1:1 onto the
  components under `src/components/dashboard/` in the Next.js app.

To preview the prototype, open `index.html` directly in a browser, or
serve the folder with any static file server.

The production application lives at the repo root (Next.js + Vercel).
