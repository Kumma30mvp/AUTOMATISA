import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import { BUSINESS } from "@/lib/constants";

interface WhatsAppButtonProps {
  variant?: "primary" | "white" | "outline";
  fullWidth?: boolean;
  size?: "default" | "lg";
  children?: React.ReactNode;
  className?: string;
}

export default function WhatsAppButton({
  variant = "primary",
  fullWidth = false,
  size = "default",
  children = "Agendar cita por WhatsApp",
  className = "",
}: WhatsAppButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-3 font-heading font-bold rounded-lg transition-all duration-200 relative";

  const variants = {
    primary:
      "bg-gradient-to-br from-navy-900 to-navy-800 text-white shadow-[0px_25px_50px_-12px_rgba(3,22,51,0.4)] hover:shadow-[0px_25px_50px_-12px_rgba(3,22,51,0.6)]",
    white:
      "bg-white text-navy-900 shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.2)] hover:shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.3)]",
    outline:
      "backdrop-blur-md bg-white/10 border border-white/20 text-white hover:bg-white/20",
  };

  const sizes = {
    default: "px-8 py-4 text-base",
    lg: "px-10 py-5 text-lg",
  };

  return (
    <a
      href={`${BUSINESS.whatsappUrl}${BUSINESS.whatsappMessage}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      aria-label="Agendar cita por WhatsApp"
    >
      <WhatsAppIcon className={size === "lg" ? "size-5" : "size-4"} />
      <span>{children}</span>
    </a>
  );
}
