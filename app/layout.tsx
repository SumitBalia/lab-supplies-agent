import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Bench · Lab Supplies Agent',
  description: 'A local lab supplies agent with visible tools and durable human approval.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
