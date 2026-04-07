import Image from "next/image";
import WhatsAppButton from "@/components/ui/WhatsAppButton";

export default function Hero() {
  return (
    <section className="relative flex min-h-[600px] items-center overflow-hidden bg-navy-900 pt-[72px] lg:min-h-[870px]">
      {/* Background Image */}
      <div className="absolute inset-0 bg-navy-900">
        <Image
          src="/images/hero-bg.png"
          alt=""
          fill
          className="object-cover opacity-40"
          priority
          sizes="100vw"
        />
      </div>

      {/* Gradient Overlay - Desktop: left to right, Mobile: top to bottom */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/90 via-navy-900/70 to-navy-900/40 lg:bg-gradient-to-r lg:from-navy-900 lg:via-navy-900/80 lg:to-transparent" />

      {/* Content */}
      <div className="relative mx-auto w-full max-w-7xl px-6 lg:px-8">
        <div className="max-w-2xl">
          {/* Badge */}
          <div className="mb-6">
            <span className="inline-block rounded-xl bg-blue-accent/20 px-4 py-1.5 text-xs font-normal uppercase tracking-[1.2px] text-blue-light">
              Excelencia en Los Olivos
            </span>
          </div>

          {/* Heading */}
          <h1 className="mb-6 font-heading text-[56px] font-extrabold leading-[1.1] tracking-[-1.12px] text-white">
            Servicio Automotriz
            <br />
            Profesional en Los Olivos
          </h1>

          {/* Subtext */}
          <p className="mb-8 max-w-xl text-base leading-relaxed text-blue-muted">
            Diagnóstico electrónico, mantenimiento integral y repuestos de alta
            calidad para tu vehículo. Elevamos el estándar del cuidado automotriz
            con precisión técnica.
          </p>

          {/* CTAs */}
          <div className="flex gap-4">
            <WhatsAppButton variant="primary" />
            <a
              href="#servicios"
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-8 py-4 font-heading text-base font-bold text-white backdrop-blur-md transition-all hover:bg-white/20"
            >
              Ver Servicios
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
