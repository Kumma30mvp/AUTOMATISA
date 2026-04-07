import WhatsAppButton from "@/components/ui/WhatsAppButton";

export default function FinalCTA() {
  return (
    <>
      {/* ====== DESKTOP ====== */}
      <section className="hidden bg-navy-900 py-24 lg:block">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-8">
          <h2 className="text-center font-heading text-[56px] font-extrabold leading-[1.1] tracking-[-1.12px] text-white">
            ¿Listo para elevar el rendimiento de
            <br />
            tu vehículo?
          </h2>
          <p className="max-w-2xl pb-4 text-center text-xl leading-7 text-blue-muted">
            Nuestro equipo de expertos está listo para brindarte el diagnóstico
            más preciso de Los Olivos.
          </p>
          <WhatsAppButton variant="white" size="lg">
            Agendar ahora vía WhatsApp
          </WhatsAppButton>
        </div>
      </section>

      {/* ====== MOBILE ====== */}
      <section className="px-6 pb-8 lg:hidden">
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-navy-900 to-navy-800 p-10 shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.1)]">
          <h2 className="text-center font-heading text-[30px] font-extrabold leading-[1.2] text-white">
            ¿Listo para elevar
            <br />
            el nivel de su
            <br />
            vehículo?
          </h2>
          <p className="pb-4 text-center text-base leading-relaxed text-blue-muted">
            Experimente la diferencia de un servicio técnico de precisión.
          </p>
          <WhatsAppButton variant="white" fullWidth>
            Agendar ahora vía WhatsApp
          </WhatsAppButton>
        </div>
      </section>
    </>
  );
}
