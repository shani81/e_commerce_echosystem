import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: {
    default: 'AICOS — Film your shelves. Publish your store. In minutes.',
    template: '%s · AICOS',
  },
  description:
    'AICOS is the AI Commerce OS. Film your shelves, let AI build your catalog, review, and publish a complete online store in minutes — with a human always in control.',
  applicationName: 'AICOS',
  keywords: [
    'AICOS',
    'AI Commerce OS',
    'AI catalog extraction',
    'video to store',
    'e-commerce',
    'storefront',
  ],
  authors: [{ name: 'AICOS' }],
  openGraph: {
    title: 'AICOS — Film your shelves. Publish your store. In minutes.',
    description:
      'Film your shelves. AI builds your catalog. You review and publish a complete online store in minutes.',
    siteName: 'AICOS',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
