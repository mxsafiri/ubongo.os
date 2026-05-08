import type { Metadata, Viewport } from 'next';
import '../styles/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Surfari',
  description: 'Own the city. Ride every zone.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Surfari',
  },
};

export const viewport: Viewport = {
  themeColor: '#060810',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className="h-full overflow-hidden"
        style={{
          background: '#060810',
          fontFamily: 'var(--font-body)',
          color: 'var(--text-primary)',
        }}
      >
        {children}
      </body>
    </html>
  );
}
