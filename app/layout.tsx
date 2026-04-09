import './globals.css';
import type { Metadata } from 'next';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: env.appName,
  description: 'Self-hosted multi-account Google Search Console dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
