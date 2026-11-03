import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Airlock — Financial AI Safety & Outcome Verification',
  description: 'Safety layer between financial AI agents and payment rails (PayPal Sandbox).',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

