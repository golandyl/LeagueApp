// Root layout: exists only to satisfy the Next.js convention.
// The actual <html>/<body> shell — including fonts, lang, and dir — lives in
// src/app/[locale]/layout.tsx, which Next.js 16 allows as the effective root.
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
