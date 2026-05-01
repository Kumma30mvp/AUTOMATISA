import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import About from "@/components/sections/About";
import Services from "@/components/sections/Services";
import WhyChooseUs from "@/components/sections/WhyChooseUs";
import Location from "@/components/sections/Location";
import AppointmentForm from "@/components/sections/AppointmentForm";
import FinalCTA from "@/components/sections/FinalCTA";
import WhatsAppFAB from "@/components/ui/WhatsAppFAB";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoRepair",
  name: "AUTOMATISA",
  description:
    "Servicio automotriz profesional en Los Olivos, Lima. Diagnóstico electrónico, mantenimiento integral y repuestos de alta calidad.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Avenida Los Alisos con Próceres de Huandoy",
    addressLocality: "Los Olivos",
    addressRegion: "Lima",
    addressCountry: "PE",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: -11.9636,
    longitude: -77.0711,
  },
  telephone: "+51946653405",
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ],
    opens: "10:00",
    closes: "18:00",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Servicios Automotrices",
    itemListElement: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Diagnóstico Electrónico" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mantenimiento Completo" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mantenimiento Preventivo" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mantenimiento Correctivo" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Venta de Repuestos" } },
    ],
  },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main>
        <Hero />
        <About />
        <Services />
        <WhyChooseUs />
        <Location />
        <AppointmentForm />
        <FinalCTA />
      </main>
      <Footer />
      <WhatsAppFAB />
    </>
  );
}
