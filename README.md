# MoneyGuard

Mobile-first personal expense tracker built with Next.js 16, React 19, and TypeScript.
Styling uses Tailwind CSS 4 through its PostCSS integration, with small custom CSS details for gradients and chart rendering.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in a browser. Use the bottom navigation to switch between Analyze, Add, and Account.

## Current frontend phase

- Add, edit, and delete expense records.
- Review daily, weekly, and monthly spending with USD and KHR kept separate.
- View spending in a bar chart and category pie chart.
- Expense records and the last-used currency are stored in this browser's local storage as a temporary frontend preview.
- A PWA manifest, icon, and service worker are included for Android and desktop installation support.

Supabase authentication and database persistence are not connected yet. The local browser storage is not shared between browsers or devices and is not a substitute for the planned Supabase-backed account storage.
