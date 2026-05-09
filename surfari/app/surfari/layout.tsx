import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Surfari — Own the City' };

export default function SurfariLayout({ children }: { children: React.ReactNode }) {
  return children;
}
