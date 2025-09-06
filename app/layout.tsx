import './globals.css';

export const metadata = {
  title: 'Lottery Presenter',
  description: 'Lottery draw presenter application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
