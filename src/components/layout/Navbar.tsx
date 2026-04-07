"use client";

import { useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import Logo from "@/components/icons/Logo";
import { NAV_LINKS, BUSINESS } from "@/lib/constants";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 backdrop-blur-xl bg-white/80 shadow-[0px_20px_25px_-5px_rgba(30,58,138,0.05),0px_8px_10px_-6px_rgba(30,58,138,0.05)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-3">
          <Logo className="size-10" />
          <span className="font-heading text-2xl font-extrabold tracking-tight text-navy-900 lg:tracking-[-1.2px]">
            AUTOMATISA
          </span>
        </a>

        {/* Desktop Nav Links */}
        <div className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm font-body tracking-wide transition-colors ${
                i === 0
                  ? "border-b-2 border-blue-accent pb-1.5 font-semibold text-navy-900"
                  : "text-nav hover:text-navy-900"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-6 lg:flex">
          <a
            href={`tel:${BUSINESS.phoneRaw}`}
            aria-label="Llamar por teléfono"
            className="text-navy-900 transition-colors hover:text-blue-accent"
          >
            <Phone className="size-5" />
          </a>
          <a
            href={`${BUSINESS.whatsappUrl}${BUSINESS.whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-navy-900 px-6 py-2.5 font-heading text-sm font-bold text-white transition-colors hover:bg-navy-800"
          >
            Agendar cita
          </a>
        </div>

        {/* Mobile: WhatsApp link + hamburger */}
        <div className="flex items-center gap-4 lg:hidden">
          <a
            href={`${BUSINESS.whatsappUrl}${BUSINESS.whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-blue-accent"
          >
            WhatsApp
          </a>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-navy-900"
            aria-label={isOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {isOpen ? <X className="size-6" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="border-t border-surface-200 bg-white/95 backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-4 py-3 text-sm font-medium text-nav transition-colors hover:bg-surface-100 hover:text-navy-900"
              >
                {link.label}
              </a>
            ))}
            <a
              href={`${BUSINESS.whatsappUrl}${BUSINESS.whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 rounded-lg bg-navy-900 px-4 py-3 text-center text-sm font-bold text-white"
            >
              Agendar cita por WhatsApp
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
