import { MapPin, Phone, Clock } from "lucide-react";
import {
  BUSINESS,
  FOOTER_QUICK_LINKS,
  FOOTER_LEGAL_LINKS,
} from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-navy-900 text-muted">
      {/* Desktop Footer */}
      <div className="hidden lg:block">
        <div className="mx-auto max-w-7xl px-8 pb-8 pt-16">
          <div className="grid grid-cols-4 gap-12 border-t border-navy-700 pt-16">
            {/* Brand Column */}
            <div className="flex flex-col gap-6">
              <span className="font-body text-xl font-semibold text-white">
                AUTOMATISA
              </span>
              <p className="text-base leading-relaxed">
                Excelencia técnica y confianza en el corazón de Los Olivos. Tu
                vehículo en manos expertas.
              </p>
              <div className="flex gap-4">
                <a
                  href="#"
                  aria-label="Facebook"
                  className="flex size-10 items-center justify-center rounded bg-navy-700 text-muted transition-colors hover:text-white"
                >
                  <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
                  </svg>
                </a>
                <a
                  href="#"
                  aria-label="Instagram"
                  className="flex size-10 items-center justify-center rounded bg-navy-700 text-muted transition-colors hover:text-white"
                >
                  <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div className="flex flex-col gap-6">
              <h4 className="text-xs font-semibold uppercase tracking-[1.2px] text-footer">
                Enlaces Rápidos
              </h4>
              <ul className="flex flex-col gap-4">
                {FOOTER_QUICK_LINKS.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-base transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div className="flex flex-col gap-6">
              <h4 className="text-xs font-semibold uppercase tracking-[1.2px] text-footer">
                Legal
              </h4>
              <ul className="flex flex-col gap-4">
                {FOOTER_LEGAL_LINKS.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-base transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div className="flex flex-col gap-6">
              <h4 className="text-xs font-semibold uppercase tracking-[1.2px] text-footer">
                Contacto Directo
              </h4>
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span className="text-sm leading-snug">
                    {BUSINESS.addressShort}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="size-3.5 shrink-0" />
                  <a
                    href={`tel:${BUSINESS.phoneRaw}`}
                    className="text-sm transition-colors hover:text-white"
                  >
                    {BUSINESS.phone}
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="size-3.5 shrink-0" />
                  <span className="text-sm">{BUSINESS.hoursShort}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-16 border-t border-navy-700 pt-8">
            <p className="text-center text-xs uppercase tracking-[1.2px] text-footer">
              {BUSINESS.copyright}
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Footer */}
      <div className="border-t border-surface-200 bg-[#f8fafc] lg:hidden">
        <div className="flex flex-col items-center gap-8 px-6 py-12">
          <div className="flex flex-col items-center gap-2">
            <span className="font-body text-lg font-semibold text-navy-900">
              AUTOMATISA
            </span>
            <p className="text-center text-xs leading-relaxed text-footer">
              Ingeniería y precisión automotriz en el corazón de Los Olivos.
            </p>
          </div>
          <div className="flex gap-6">
            <a href="#servicios" className="text-sm text-footer hover:text-navy-900">
              Servicios
            </a>
            <a href="#" className="text-sm text-footer hover:text-navy-900">
              Soporte
            </a>
            <a href="#" className="text-sm text-footer hover:text-navy-900">
              Privacidad
            </a>
          </div>
          <div className="flex gap-6">
            <a href="#" aria-label="Facebook" className="text-footer hover:text-navy-900">
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
              </svg>
            </a>
            <a href="#" aria-label="Instagram" className="text-footer hover:text-navy-900">
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
              </svg>
            </a>
          </div>
          <p className="text-center text-[10px] uppercase tracking-[1px] text-footer">
            © {new Date().getFullYear()} AUTOMATISA. Los Olivos, Lima.
          </p>
        </div>
      </div>
    </footer>
  );
}
