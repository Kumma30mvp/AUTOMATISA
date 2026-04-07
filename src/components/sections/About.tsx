import Image from "next/image";
import { Target, Eye } from "lucide-react";

export default function About() {
  return (
    <section id="nosotros" className="bg-surface-50 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Desktop Layout: 2 columns */}
        <div className="hidden gap-16 lg:grid lg:grid-cols-2 lg:items-center">
          {/* Image Column */}
          <div className="relative h-[576px] overflow-hidden rounded-2xl bg-surface-200 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <Image
              src="/images/about.png"
              alt="Taller AUTOMATISA - servicio automotriz profesional"
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 50vw, 0px"
            />
          </div>

          {/* Text Column */}
          <div className="flex flex-col gap-8">
            <h2 className="font-heading text-[40px] font-extrabold leading-[1.2] tracking-[-1px] text-navy-900">
              Precisión que genera
              <br />
              Confianza
            </h2>
            <div className="flex flex-col gap-6">
              <p className="text-lg leading-[1.625] text-body">
                En{" "}
                <span className="font-semibold text-navy-900">AUTOMATISA</span>,
                no solo reparamos vehículos; gestionamos su rendimiento con la
                mentalidad de un taller de alta precisión. Ubicados en el corazón
                de Los Olivos, hemos transformado la experiencia mecánica
                convencional.
              </p>
              <p className="text-lg leading-[1.625] text-body">
                Nuestra metodología combina experiencia técnica avanzada con una
                atención transparente, asegurando que cada cliente entienda el
                estado real de su inversión automotriz.
              </p>
            </div>

            {/* Misión y Visión Cards - Desktop */}
            <div className="grid grid-cols-2 gap-8 pt-4">
              <div className="rounded-lg bg-surface-100 p-6">
                <h3 className="mb-2 font-heading text-base font-bold text-navy-900">
                  Nuestra Misión
                </h3>
                <p className="text-sm leading-relaxed text-body">
                  Proveer soluciones de diagnóstico confiables que prolonguen la
                  vida de su vehículo.
                </p>
              </div>
              <div className="rounded-lg bg-surface-100 p-6">
                <h3 className="mb-2 font-heading text-base font-bold text-navy-900">
                  Nuestra Visión
                </h3>
                <p className="text-sm leading-relaxed text-body">
                  Convertirnos en el referente de confianza y tecnología
                  automotriz en todo Lima.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Layout: single column */}
        <div className="flex flex-col gap-10 lg:hidden">
          <div className="flex flex-col gap-3">
            <span className="font-heading text-sm font-bold uppercase tracking-[2.8px] text-blue-accent">
              Quiénes somos
            </span>
            <h2 className="font-heading text-[30px] font-extrabold leading-[1.2] text-navy-900">
              Trasparencia asistida
              <br />
              por tecnología
            </h2>
            <div className="flex flex-col gap-4 pt-3">
              <p className="text-base leading-relaxed text-body">
                En AUTOMATISA, hemos redefinido el servicio automotriz en Los
                Olivos. No somos un taller convencional; somos un centro de
                ingeniería donde cada vehículo es tratado con la precisión de un
                relojero.
              </p>
              <p className="text-base leading-relaxed text-body">
                Nuestra metodología combina años de experiencia técnica con las
                herramientas de diagnóstico digital más avanzadas del mercado,
                garantizando que su inversión esté siempre protegida.
              </p>
            </div>
          </div>

          {/* Misión y Visión Cards - Mobile */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-[rgba(197,198,206,0.1)] bg-white p-8 shadow-sm">
              <div className="mb-3 flex size-12 items-center justify-center rounded bg-navy-800">
                <Target className="size-5 text-white" />
              </div>
              <h3 className="mb-3 pt-1 font-heading text-xl font-bold text-navy-900">
                Misión
              </h3>
              <p className="text-sm leading-relaxed text-body">
                Proveer soluciones automotrices de élite basadas en la integridad,
                la precisión técnica y el uso estratégico de la tecnología.
              </p>
            </div>
            <div className="rounded-lg border border-[rgba(197,198,206,0.1)] bg-white p-8 shadow-sm">
              <div className="mb-3 flex size-12 items-center justify-center rounded bg-navy-800">
                <Eye className="size-5 text-white" />
              </div>
              <h3 className="mb-3 pt-1 font-heading text-xl font-bold text-navy-900">
                Visión
              </h3>
              <p className="text-sm leading-relaxed text-body">
                Ser el referente indiscutible de ingeniería automotriz en Lima,
                reconocidos por nuestra ética y sofisticación técnica.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
