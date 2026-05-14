import "server-only";

/**
 * Phase 10c — WhatsApp manual-handoff helpers.
 *
 * Pure string-building. No Meta Cloud API, no network calls. The admin
 * presses the returned wa.me link, WhatsApp Web/desktop/mobile opens
 * with the message pre-filled, and the admin manually sends it.
 *
 * Peru-specific: country prefix is `51`. The DB stores phones as the
 * raw 9-digit national number (migration 009); we prepend `51` here.
 */

const COUNTRY_CODE = "51";

export type WhatsAppMessageInput = {
  /** Customer's name, if known. Used for the greeting; falls back to
   *  a generic salutation when null/undefined. */
  customerName: string | null | undefined;
  /** Canonical plate (e.g. "ABC-123"). */
  carPlate: string;
  /** Signed PDF URL produced by signReportPdfUrl. Embedded verbatim
   *  in the message body; wa.me handles URL preview. */
  signedUrl: string;
  /** First 8 chars of the report uuid — short, customer-friendly id. */
  reportShortId: string;
};

/**
 * Build the prefilled Spanish message for the WhatsApp handoff.
 * Plain text, single newline separators. Encoding into the wa.me
 * URL happens in `buildWhatsAppLink`.
 */
export function buildWhatsAppMessage(input: WhatsAppMessageInput): string {
  const greeting = input.customerName
    ? `Hola ${input.customerName.trim()}`
    : "Hola";

  return [
    `${greeting}, le compartimos el informe técnico de su vehículo (placa ${input.carPlate}) realizado por AUTOMATISA.`,
    ``,
    `Puede descargarlo en el siguiente enlace:`,
    input.signedUrl,
    ``,
    `Número de informe: ${input.reportShortId}`,
    ``,
    `Gracias por preferir AUTOMATISA.`,
  ].join("\n");
}

/**
 * Build the wa.me deep-link. `phoneNineDigits` must be exactly 9 digits
 * (no +51, no spaces). Throws when the format is wrong — the route
 * should have already verified appointment.phone matches `^\d{9}$`.
 */
export function buildWhatsAppLink(
  phoneNineDigits: string,
  message: string
): string {
  if (!/^\d{9}$/.test(phoneNineDigits)) {
    throw new Error(
      `Invalid phone for wa.me link: expected 9 digits, got "${phoneNineDigits}"`
    );
  }
  return `https://wa.me/${COUNTRY_CODE}${phoneNineDigits}?text=${encodeURIComponent(message)}`;
}
