export const BUSINESS = {
  name: "AUTOMATISA",
  phone: "+51 946653405",
  phoneRaw: "51946653405",
  whatsappUrl: "https://wa.me/51946653405",
  whatsappMessage: "?text=Hola%2C%20quiero%20agendar%20una%20cita%20en%20AUTOMATISA",
  address: "Avenida Los Alisos con Próceres de Huandoy, Los Olivos, Lima, Perú",
  addressShort: "Av. Los Alisos con Huandoy, Los Olivos",
  hours: "Lunes a Sábado: 10:00 AM - 6:00 PM",
  hoursShort: "Lun - Sáb: 10AM - 6PM",
  mapsUrl:
    "https://www.google.com/maps/search/Avenida+Los+Alisos+con+Pr%C3%B3ceres+de+Huandoy,+Los+Olivos,+Lima",
  copyright: `© ${new Date().getFullYear()} AUTOMATISA Los Olivos. Todos los derechos reservados.`,
  /**
   * Phase 10d — public social profiles.
   * URLs are stored exactly as supplied (including tracking params).
   * Do not canonicalize, shorten, or clean them without explicit approval.
   */
  socials: {
    instagram: "https://www.instagram.com/automatisa.sac/",
    tiktok:
      "https://www.tiktok.com/@automatisa.sac?_t=ZS-90Botwf2u8t&_r=1&fbclid=PAZXh0bgNhZW0CMTEAc3J0YwZhcHBfaWQPOTM2NjE5NzQzMzkyNDU5AAGnKa-Z88KwgDw_p6276N5H8JgNEn1zw8cPtgPqzbZhHaYRi3WE9Q5KyMWbmrE_aem_-DhI69lMjJRn_AskIKtH0w",
    facebook:
      "https://www.facebook.com/people/AutoMatisa/61578049494815/?mibextid=wwXIfr&rdid=0utfS24QlCUpzl5s&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1BF8KNAegx%2F%3Fmibextid%3DwwXIfr%26utm_source%3Dig%26utm_medium%3Dsocial%26utm_content%3Dlink_in_bio",
  },
} as const;

export const NAV_LINKS = [
  { label: "Servicios", href: "#servicios" },
  { label: "Nosotros", href: "#nosotros" },
  { label: "Ubicación", href: "#ubicacion" },
  { label: "Horarios", href: "#horarios" },
] as const;

export interface Service {
  title: string;
  description: string;
  icon: string;
}

/**
 * Phase 10d — canonical AUTOMATISA service catalog (frontend mirror).
 * Exactly four services, in the order they render on the public site.
 * Migration 010 enforces the same allow-list at the DB level by setting
 * `is_active = false` on every other historical row.
 */
export const SERVICES: Service[] = [
  {
    title: "Diagnóstico Electrónico",
    description:
      "Identificamos fallas con precisión quirúrgica utilizando escáneres de última generación. Sin suposiciones, solo datos.",
    icon: "Cpu",
  },
  {
    title: "Mantenimiento Preventivo",
    description:
      "Evita costosas reparaciones a futuro con chequeos programados.",
    icon: "ShieldCheck",
  },
  {
    title: "Mantenimiento Correctivo",
    description:
      "Reparaciones de alta complejidad con garantía y repuestos originales.",
    icon: "Wrench",
  },
  {
    title: "Venta de Repuestos",
    description: "Stock seleccionado de componentes originales y certificados.",
    icon: "Package",
  },
];

export const WHY_CHOOSE_US_DESKTOP = [
  {
    title: "Atención Profesional",
    description:
      "Equipo certificado con años de experiencia en marcas premium y comerciales.",
    icon: "UserCheck",
  },
  {
    title: "Diagnóstico Preciso",
    description:
      "Tecnología de vanguardia para detectar el origen real de cualquier anomalía.",
    icon: "ScanSearch",
  },
  {
    title: "Servicio Confiable",
    description:
      "Transparencia total en presupuestos y procesos. Sin sorpresas inesperadas.",
    icon: "HandshakeIcon",
  },
  {
    title: "Atención Personalizada",
    description:
      "Trato directo y explicaciones claras sobre el mantenimiento de su vehículo.",
    icon: "HeartHandshake",
  },
] as const;

export const WHY_CHOOSE_US_MOBILE = [
  {
    title: "Ética Profesional",
    description:
      "Sin costos ocultos ni reparaciones innecesarias. Transparencia total.",
    icon: "ShieldCheck",
  },
  {
    title: "Alta Tecnología",
    description:
      "Utilizamos equipos de nivel concesionario para precisión absoluta.",
    icon: "Zap",
  },
  {
    title: "Garantía Real",
    description:
      "Respaldamos cada trabajo con una garantía escrita de satisfacción.",
    icon: "Award",
  },
  {
    title: "Atención VIP",
    description:
      "Gestión personalizada y seguimiento detallado de su caso.",
    icon: "Crown",
  },
] as const;

export const FOOTER_QUICK_LINKS = [
  { label: "Servicios", href: "#servicios" },
  { label: "Nosotros", href: "#nosotros" },
  { label: "Ubicación", href: "#ubicacion" },
  { label: "Preguntas Frecuentes", href: "#" },
] as const;

export const FOOTER_LEGAL_LINKS = [
  { label: "Privacidad", href: "#" },
  { label: "Términos", href: "#" },
  { label: "Contacto", href: "#" },
] as const;
