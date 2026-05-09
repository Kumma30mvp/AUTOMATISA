import "server-only";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  ReportStatus,
  TechnicalReportFull,
} from "@/lib/types/reports";

/**
 * PDF generation for a TechnicalReportFull — Phase 10.
 *
 * Server-only: this file is imported only from API route handlers (the
 * `import "server-only"` directive at the top makes any client-component
 * import a build-time error).
 *
 * Routes that call this MUST set `export const runtime = "nodejs";` —
 * @react-pdf/renderer needs Node APIs (Buffer, streams, fontkit).
 *
 * Output stability:
 *   - All formatting is in Spanish (es-PE).
 *   - Default Helvetica font is used. PDF Type 1 fonts use WinAnsiEncoding,
 *     which covers Spanish accents and punctuation (á é í ó ú ñ ¿ ¡), so
 *     no font registration is needed for v1.
 *   - The current timestamp is embedded in the header ("Generado: …"). The
 *     same report rendered twice will produce different PDFs because of
 *     this — acceptable for v1; revisit if byte-identical reproduction is
 *     ever required.
 *
 * Out of scope (later steps):
 *   - Storage upload (Step 7 wiring).
 *   - Signed URL minting (Step 11 route).
 *   - Email delivery (Step 6).
 */

const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Borrador",
  ready_for_review: "Para revisión",
  approved_for_delivery: "Aprobado para entrega",
  sent: "Enviado",
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function fallback(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  return trimmed === "" ? "—" : trimmed;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#031633",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: "#39618c",
    borderBottomStyle: "solid",
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#031633",
  },
  brandSub: {
    fontSize: 9,
    color: "#475569",
    marginTop: 2,
  },
  reportMeta: {
    fontSize: 9,
    color: "#475569",
    textAlign: "right",
  },
  reportTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
    color: "#031633",
  },
  metaBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#f3f4f5",
    padding: 10,
    borderRadius: 6,
    marginBottom: 14,
  },
  metaCell: {
    width: "50%",
    paddingVertical: 3,
    paddingRight: 8,
  },
  metaLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    color: "#475569",
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 10,
    color: "#031633",
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#031633",
    backgroundColor: "#d2e4ff",
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: 10,
    marginBottom: 6,
  },
  fieldRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 4,
  },
  fieldCell: {
    width: "50%",
    paddingRight: 8,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    color: "#475569",
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 10,
    marginTop: 1,
  },
  narrativeBlock: {
    marginBottom: 10,
  },
  narrativeHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#031633",
    marginTop: 8,
    marginBottom: 3,
  },
  narrativeBody: {
    fontSize: 10,
    lineHeight: 1.4,
    color: "#031633",
  },
  signoff: {
    marginTop: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#edeeef",
    borderTopStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  signoffCell: {
    width: "48%",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#94a3b8",
  },
});

function Narrative({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) {
  const trimmed = body.trim();
  return (
    <View style={styles.narrativeBlock}>
      <Text style={styles.narrativeHeading}>{heading}</Text>
      <Text style={styles.narrativeBody}>{trimmed === "" ? "—" : trimmed}</Text>
    </View>
  );
}

function ReportPdfDocument({ report }: { report: TechnicalReportFull }) {
  const { appointment } = report;
  const reportShortId = report.id.slice(0, 8);
  const generatedAt = new Date().toISOString();

  const vehicleParts = [appointment.vehicle_brand, appointment.vehicle_model]
    .filter((v): v is string => Boolean(v && v.trim() !== ""));
  const vehicleLabel = vehicleParts.length > 0 ? vehicleParts.join(" ") : "—";

  return (
    <Document
      title={`Informe técnico ${reportShortId}`}
      author="AUTOMATISA"
      subject="Informe técnico de servicio"
      language="es-PE"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* Header — fixed = repeats on every page */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>AUTOMATISA</Text>
            <Text style={styles.brandSub}>Servicio técnico automotriz</Text>
          </View>
          <View>
            <Text style={styles.reportMeta}>
              Informe N.° {reportShortId}
            </Text>
            <Text style={styles.reportMeta}>
              Generado: {formatDateTime(generatedAt)}
            </Text>
          </View>
        </View>

        <Text style={styles.reportTitle}>Informe técnico de servicio</Text>

        {/* Meta box — status, technician, approver, sent_at, edits */}
        <View style={styles.metaBox}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Estado del informe</Text>
            <Text style={styles.metaValue}>
              {REPORT_STATUS_LABELS[report.report_status] ??
                report.report_status}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Técnico responsable</Text>
            <Text style={styles.metaValue}>
              {fallback(report.technician?.full_name)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Aprobado por</Text>
            <Text style={styles.metaValue}>
              {fallback(report.approved_by_admin?.full_name)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Fecha de envío</Text>
            <Text style={styles.metaValue}>
              {formatDateTime(report.sent_at)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Última edición</Text>
            <Text style={styles.metaValue}>
              {formatDateTime(report.updated_at)}
              {report.last_editor?.full_name
                ? ` · ${report.last_editor.full_name}`
                : ""}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Creado</Text>
            <Text style={styles.metaValue}>
              {formatDateTime(report.created_at)}
            </Text>
          </View>
        </View>

        {/* Customer */}
        <Text style={styles.sectionHeading}>Cliente</Text>
        <View style={styles.fieldRow}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>Nombre</Text>
            <Text style={styles.fieldValue}>
              {fallback(appointment.full_name)}
            </Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>DNI</Text>
            <Text style={styles.fieldValue}>{appointment.dni}</Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>Teléfono</Text>
            <Text style={styles.fieldValue}>{appointment.phone}</Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>Correo</Text>
            <Text style={styles.fieldValue}>{appointment.email}</Text>
          </View>
        </View>

        {/* Vehicle */}
        <Text style={styles.sectionHeading}>Vehículo</Text>
        <View style={styles.fieldRow}>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>Placa</Text>
            <Text style={styles.fieldValue}>{appointment.car_plate}</Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>Marca y modelo</Text>
            <Text style={styles.fieldValue}>{vehicleLabel}</Text>
          </View>
          <View style={styles.fieldCell}>
            <Text style={styles.fieldLabel}>Año del vehículo</Text>
            <Text style={styles.fieldValue}>
              {report.vehicle_year !== null
                ? String(report.vehicle_year)
                : "—"}
            </Text>
          </View>
        </View>

        {/* Narratives */}
        <Text style={styles.sectionHeading}>Detalle del servicio</Text>
        <Narrative
          heading="Síntomas iniciales"
          body={report.initial_symptoms}
        />
        <Narrative
          heading="Diagnóstico y trabajos realizados"
          body={report.diagnosis_work_performed}
        />
        <Narrative
          heading="Repuestos reemplazados"
          body={report.replaced_parts}
        />
        <Narrative
          heading="Observaciones finales"
          body={report.final_observations}
        />
        <Narrative heading="Conclusiones" body={report.conclusions} />

        {/* Sign-off block */}
        <View style={styles.signoff} wrap={false}>
          <View style={styles.signoffCell}>
            <Text style={styles.fieldLabel}>Técnico</Text>
            <Text style={styles.fieldValue}>
              {fallback(report.technician?.full_name)}
            </Text>
          </View>
          <View style={styles.signoffCell}>
            <Text style={styles.fieldLabel}>Aprobado por</Text>
            <Text style={styles.fieldValue}>
              {fallback(report.approved_by_admin?.full_name)}
            </Text>
          </View>
        </View>

        {/* Footer — fixed = repeats on every page */}
        <View style={styles.footer} fixed>
          <Text>AUTOMATISA · Informe técnico {reportShortId}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Public entry point. Returns a Buffer with the rendered PDF bytes.
 *
 * @param report  The full joined report shape used by the editor.
 * @returns       Promise<Buffer> ready for upload to storage or attaching
 *                to an email. Caller owns the buffer (no internal cache).
 */
export async function generateReportPdf(
  report: TechnicalReportFull
): Promise<Buffer> {
  return await renderToBuffer(<ReportPdfDocument report={report} />);
}
