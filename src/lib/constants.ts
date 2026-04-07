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
  mobileOnly?: boolean;
}

export const SERVICES: Service[] = [
  {
    title: "Diagnóstico Electrónico",
    description:
      "Identificamos fallas con precisión quirúrgica utilizando escáneres de última generación. Sin suposiciones, solo datos.",
    icon: "Cpu",
  },
  {
    title: "Mantenimiento Completo",
    description:
      "Servicio integral que cubre motor, frenos, suspensión y fluidos para garantizar seguridad total.",
    icon: "Settings",
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
  {
    title: "Sistema de Frenos",
    description: "Seguridad absoluta en cada frenada.",
    icon: "CircleAlert",
    mobileOnly: true,
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
