import Image from "next/image";
import { MapPin, Clock } from "lucide-react";
import { BUSINESS } from "@/lib/constants";

export default function Location() {
  return (
    <>
      {/* ====== DESKTOP ====== */}
      <section
        id="ubicacion"
        className="hidden bg-surface-100 py-24 lg:block"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-12 px-8">
          {/* Info Column */}
          <div className="flex flex-col justify-center py-16">
            <div className="flex flex-col gap-4">
              <h2 className="font-heading text-[40px] font-extrabold leading-[1.2] text-navy-900">
                Visítenos en Los Olivos
              </h2>
              <p className="text-lg leading-7 text-body">
                Estamos estratégicamente ubicados para brindarle el mejor
                servicio.
              </p>
            </div>

            <div id="horarios" className="mt-8 flex flex-col gap-6">
              {/* Address */}
              <div className="flex items-start gap-6">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-navy-900">
                  <MapPin className="size-5 text-white" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-navy-900">
                    Dirección
                  </h3>
                  <p className="text-base leading-relaxed text-body">
                    {BUSINESS.address}
                  </p>
                </div>
              </div>

              {/* Hours */}
              <div className="flex items-start gap-6">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-blue-accent">
                  <Clock className="size-5 text-white" />
                </div>
                <div>
                  <h3 className="font-heading text-lg font-bold text-navy-900">
                    Horario de Atención
                  </h3>
                  <p className="text-base text-body">{BUSINESS.hours}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Map Column */}
          <a
            href={BUSINESS.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative h-[400px] overflow-hidden rounded-2xl bg-surface-200 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] transition-transform hover:scale-[1.01]"
          >
            <Image
              src="/images/map-placeholder.png"
              alt="Ubicación de AUTOMATISA en Los Olivos, Lima"
              fill
              className="object-cover grayscale"
              sizes="(min-width: 1024px) 50vw, 0px"
            />
            <div className="absolute inset-0 bg-navy-900/10" />
          </a>
        </div>
      </section>

      {/* ====== MOBILE ====== */}
      <section className="bg-surface-50 px-6 py-16 lg:hidden">
        <div className="rounded-lg bg-surface-200 p-8">
          <h2 className="mb-6 font-heading text-2xl font-extrabold text-navy-900">
            Ubicación y Horario
          </h2>

          <div className="flex flex-col gap-6">
            {/* Address */}
            <div className="flex items-start gap-4">
              <MapPin className="mt-0.5 size-4 shrink-0 text-navy-900" />
              <div>
                <h3 className="font-body text-base font-semibold text-navy-900">
                  Los Olivos, Lima
                </h3>
                <p className="text-sm text-body">
                  Avenida Los Alisos con Próceres de Huandoy
                </p>
              </div>
            </div>

            {/* Hours */}
            <div className="flex items-start gap-4">
              <Clock className="mt-0.5 size-5 shrink-0 text-navy-900" />
              <div>
                <h3 className="font-body text-base font-semibold text-navy-900">
                  Horario de Atención
                </h3>
                <p className="text-sm text-body">
                  Lunes a Sábado: 10:00 AM - 6:00 PM
                </p>
              </div>
            </div>
          </div>

          {/* Mini Map */}
          <a
            href={BUSINESS.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative mt-6 block h-[168px] overflow-hidden rounded bg-[#e1e3e4]"
          >
            <Image
              src="/images/map-placeholder.png"
              alt="Ubicación de AUTOMATISA"
              fill
              className="object-cover opacity-50 grayscale"
              sizes="(max-width: 1023px) 100vw, 0px"
            />
            {/* Pin icon */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="rounded-xl bg-navy-900 p-2 shadow-lg">
                <MapPin className="size-4 text-white" />
              </div>
            </div>
          </a>
        </div>
      </section>
    </>
  );
}
