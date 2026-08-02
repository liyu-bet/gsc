import './globals.css';
import type { Metadata } from 'next';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: env.appName,
  description: 'Собственная панель Google Search Console для нескольких аккаунтов',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
