import './globals.css';

export const metadata = {
  title: 'Zoheir Bilverkstad — AI-diagnostik',
  description: 'Ange registreringsnummer eller VIN och få en AI-driven felkodsdiagnos med reservdelar, reparationsguide och kostnadsuppskattning.',
  viewport: 'width=device-width, initial-scale=1',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><rect width="30" height="30" rx="7" fill="%230057FF"/><path d="M8 10H16L18 14H10L8 10Z" fill="white"/><path d="M10 16H20L22 20H12L10 16Z" fill="white" opacity=".6"/></svg>',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="sv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
