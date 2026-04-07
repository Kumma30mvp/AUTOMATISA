"use client";

import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import { BUSINESS } from "@/lib/constants";

export default function WhatsAppFAB() {
  return (
    <a
      href={`${BUSINESS.whatsappUrl}${BUSINESS.whatsappMessage}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-xl bg-whatsapp text-white shadow-[0px_8px_30px_0px_rgba(37,211,102,0.4)] transition-transform hover:scale-110 lg:hidden"
      aria-label="Contactar por WhatsApp"
    >
      <WhatsAppIcon className="size-6" />
    </a>
  );
}
