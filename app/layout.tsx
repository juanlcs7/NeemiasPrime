import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neemias Prime — Agendamento",
  description: "Agendamento da Barbearia Neemias Prime em Belford Roxo.",
  other: { "codex-preview": "development" },
  icons: { icon: "/logo-neemias-prime.png", shortcut: "/logo-neemias-prime.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
