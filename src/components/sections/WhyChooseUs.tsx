import {
  UserCheck,
  ScanSearch,
  Handshake,
  HeartHandshake,
  ShieldCheck,
  Zap,
  Award,
  Crown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Feature {
  title: string;
  description: string;
  Icon: LucideIcon;
}

const desktopFeatures: Feature[] = [
  {
    title: "Atención Profesional",
    description:
      "Equipo certificado con años de experiencia en marcas premium y comerciales.",
    Icon: UserCheck,
  },
  {
    title: "Diagnóstico Preciso",
    description:
      "Tecnología de vanguardia para detectar el origen real de cualquier anomalía.",
    Icon: ScanSearch,
  },
  {
    title: "Servicio Confiable",
    description:
      "Transparencia total en presupuestos y procesos. Sin sorpresas inesperadas.",
    Icon: Handshake,
  },
  {
    title: "Atención Personalizada",
    description:
      "Trato directo y explicaciones claras sobre el mantenimiento de su vehículo.",
    Icon: HeartHandshake,
  },
];

const mobileFeatures: Feature[] = [
  {
    title: "Ética Profesional",
    description:
      "Sin costos ocultos ni reparaciones innecesarias. Transparencia total.",
    Icon: ShieldCheck,
  },
  {
    title: "Alta Tecnología",
    description:
      "Utilizamos equipos de nivel concesionario para precisión absoluta.",
    Icon: Zap,
  },
  {
    title: "Garantía Real",
    description:
      "Respaldamos cada trabajo con una garantía escrita de satisfacción.",
    Icon: Award,
  },
  {
    title: "Atención VIP",
    description:
      "Gestión personalizada y seguimiento detallado de su caso.",
    Icon: Crown,
  },
];

export default function WhyChooseUs() {
  return (
    <>
      {/* ====== DESKTOP ====== */}
      <section className="hidden bg-surface-50 py-24 lg:block">
        <div className="mx-auto max-w-7xl px-8">
          <h2 className="mb-16 text-center font-heading text-[40px] font-extrabold text-navy-900">
            El Estándar AUTOMATISA
          </h2>
          <div className="grid grid-cols-4 gap-12">
            {desktopFeatures.map((feature) => (
              <div key={feature.title} className="flex flex-col items-center text-center">
                <div className="mb-6 flex size-16 items-center justify-center rounded-xl bg-surface-200">
                  <feature.Icon className="size-6 text-navy-900" />
                </div>
                <h3 className="mb-3 font-heading text-base font-bold text-navy-900">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-body">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== MOBILE ====== */}
      <section className="bg-navy-900 px-6 py-16 lg:hidden">
        <h2 className="mb-12 font-heading text-[30px] font-extrabold leading-[1.2] text-white">
          ¿Por qué confiar en
          <br />
          nosotros?
        </h2>
        <div className="flex flex-col gap-10">
          {mobileFeatures.map((feature) => (
            <div key={feature.title} className="flex items-start gap-6">
              <feature.Icon className="mt-1 size-6 shrink-0 text-blue-muted" />
              <div className="flex flex-col gap-1.5">
                <h3 className="font-heading text-xl font-bold text-white">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-blue-muted">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
