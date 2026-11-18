import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-code",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://agenda.portalmilano.com"
  ),
  title: {
    default: "Agenda de Áreas Comuns | Milano Condomínio Club",
    template: "%s | Milano Condomínio Club",
  },
  description:
    "Sistema oficial de agendamento do Salão de Festas e Quiosques do Milano Condomínio Club.",
  icons: {
    icon: [
      { url: "/brand/logo-icon.svg", type: "image/svg+xml" },
      { url: "/brand/icon-127.png", type: "image/png" },
    ],
    apple: "/brand/icon-127.png",
  },
  openGraph: {
    title: "Agenda de Áreas Comuns | Milano Condomínio Club",
    description:
      "Consulte disponibilidade e reserve o Salão de Festas e Quiosques do Milano Condomínio Club.",
    images: ["/brand/og-milano.webp"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0C0C0D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakarta.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased selection:bg-[#CCB285]/30 selection:text-[#0C0C0D]">
        {children}
      </body>
    </html>
  );
}
