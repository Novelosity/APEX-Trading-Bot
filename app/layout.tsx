import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'APEX Trading Bot',
  description: 'Institutional-grade AI trading, for everyone. Multi-exchange, AI-powered signals, automated risk management.',
  keywords: ['trading', 'crypto', 'bot', 'AI', 'signals', 'APEX'],
  authors: [{ name: 'APEX' }],
  robots: 'noindex, nofollow',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>",
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0d0d0f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0d0d0f] text-[#e8e8f0] antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  )
}
