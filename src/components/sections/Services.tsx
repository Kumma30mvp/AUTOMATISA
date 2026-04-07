import Image from "next/image";
import {
  Cpu,
  Settings,
  ShieldCheck,
  Wrench,
  Package,
  CircleAlert,
  CheckCircle,
} from "lucide-react";
export default function Services() {
  return (
    <section id="servicios" className="bg-surface-100 py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* ====== DESKTOP LAYOUT ====== */}
        <div className="hidden lg:block">
          {/* Section Header */}
          <div className="mb-16 flex items-end justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[1.2px] text-blue-accent">
                Atelier de Servicios
              </span>
              <h2 className="font-heading text-[40px] font-extrabold leading-[1.2] text-navy-900">
                Soluciones Especializadas
              </h2>
            </div>
            <p className="max-w-md pb-2 text-base leading-relaxed text-body">
              Mantenimiento preventivo y correctivo ejecutado bajo estándares de
              fábrica.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-12 gap-6">
            {/* Diagnóstico Electrónico - Large Card (8 cols) */}
            <div className="col-span-8 rounded-2xl bg-white p-10">
              <div className="flex items-center gap-10">
                <div className="flex flex-1 flex-col gap-4 pb-8">
                  <Cpu className="size-7 text-navy-900" />
                  <h3 className="pt-2 font-heading text-2xl font-bold text-navy-900">
                    Diagnóstico Electrónico
                  </h3>
                  <p className="text-base leading-relaxed text-body">
                    Identificamos fallas con precisión quirúrgica utilizando
                    escáneres de última generación. Sin suposiciones, solo datos.
                  </p>
                  <div className="flex flex-col gap-3 pt-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="size-3 text-blue-accent" />
                      <span className="text-sm text-blue-accent">
                        Lectura de códigos de error
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="size-3 text-blue-accent" />
                      <span className="text-sm text-blue-accent">
                        Reprogramación de módulos
                      </span>
                    </div>
                  </div>
                </div>
                <div className="relative h-64 flex-1 overflow-hidden rounded-lg bg-surface-100">
                  <Image
                    src="/images/diagnostic.png"
                    alt="Diagnóstico electrónico automotriz"
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 33vw, 0px"
                  />
                </div>
              </div>
            </div>

            {/* Mantenimiento Completo - Dark Card (4 cols) */}
            <div className="col-span-4 flex flex-col gap-4 rounded-2xl bg-navy-900 p-10">
              <Settings className="size-7 text-white" />
              <h3 className="pt-2 font-heading text-2xl font-bold text-white">
                Mantenimiento Completo
              </h3>
              <p className="text-sm leading-relaxed text-blue-muted">
                Servicio integral que cubre motor, frenos, suspensión y fluidos
                para garantizar seguridad total.
              </p>
            </div>

            {/* Bottom Row: 3 cards x 4 cols */}
            <div className="col-span-4 rounded-2xl bg-white p-8 shadow-sm">
              <ShieldCheck className="mb-2 size-6 text-navy-900" />
              <h4 className="mb-2 pt-2 font-heading text-xl font-bold text-navy-900">
                Mantenimiento Preventivo
              </h4>
              <p className="text-sm leading-relaxed text-body">
                Evita costosas reparaciones a futuro con chequeos programados.
              </p>
            </div>

            <div className="col-span-4 rounded-2xl bg-white p-8 shadow-sm">
              <Wrench className="mb-2 size-6 text-navy-900" />
              <h4 className="mb-2 pt-2 font-heading text-xl font-bold text-navy-900">
                Mantenimiento Correctivo
              </h4>
              <p className="text-sm leading-relaxed text-body">
                Reparaciones de alta complejidad con garantía y repuestos
                originales.
              </p>
            </div>

            <div className="col-span-4 rounded-2xl bg-white p-8 shadow-sm">
              <Package className="mb-2 size-6 text-navy-900" />
              <h4 className="mb-2 pt-2 font-heading text-xl font-bold text-navy-900">
                Venta de Repuestos
              </h4>
              <p className="text-sm leading-relaxed text-body">
                Stock seleccionado de componentes originales y certificados.
              </p>
            </div>
          </div>
        </div>

        {/* ====== MOBILE LAYOUT ====== */}
        <div className="lg:hidden">
          {/* Section Header */}
          <div className="mb-12 flex flex-col items-center gap-3">
            <span className="text-center font-heading text-sm font-bold uppercase tracking-[2.8px] text-blue-accent">
              Experticia
            </span>
            <h2 className="text-center font-heading text-[30px] font-extrabold text-navy-900">
              Servicios de Élite
            </h2>
          </div>

          {/* Stacked Cards */}
          <div className="flex flex-col gap-4">
            {[
              {
                icon: Cpu,
                title: "Diagnóstico electrónico",
                desc: "Escaneo profundo y mapeo de sistemas.",
              },
              {
                icon: ShieldCheck,
                title: "Mantenimiento preventivo",
                desc: "Preservamos la vida útil de su motor.",
              },
              {
                icon: Wrench,
                title: "Mecánica Correctiva",
                desc: "Reparaciones de alta complejidad.",
              },
              {
                icon: Package,
                title: "Repuestos Originales",
                desc: "Componentes certificados de fábrica.",
              },
              {
                icon: CircleAlert,
                title: "Sistema de Frenos",
                desc: "Seguridad absoluta en cada frenada.",
              },
            ].map((service) => (
              <div
                key={service.title}
                className="flex items-center gap-5 rounded-lg bg-white p-6 shadow-sm"
              >
                <div className="flex size-14 shrink-0 items-center justify-center rounded bg-blue-accent/10">
                  <service.icon className="size-5 text-blue-accent" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-heading text-lg font-bold text-navy-900">
                    {service.title}
                  </h3>
                  <p className="text-xs text-body">{service.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
