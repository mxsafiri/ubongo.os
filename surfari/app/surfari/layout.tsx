import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Surfari — Own the City',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Surfari' },
};

export const viewport: Viewport = {
  themeColor: '#060810',
};

export default function SurfariLayout({ children }: { children: React.ReactNode }) {
  return children;
}
