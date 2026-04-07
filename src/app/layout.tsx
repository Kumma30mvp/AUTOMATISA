import type { Metadata } from "next";
import { manrope, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUTOMATISA | Diagnóstico Automotriz en Los Olivos, Lima",
  description:
    "Servicio automotriz profesional en Los Olivos, Lima. Diagnóstico electrónico, mantenimiento integral y repuestos de alta calidad. Agenda tu cita por WhatsApp.",
  openGraph: {
    title: "AUTOMATISA | Diagnóstico Automotriz Profesional",
    description:
      "Elevamos el estándar del cuidado automotriz con precisión técnica en Los Olivos, Lima.",
    locale: "es_PE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${manrope.variable} ${inter.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
