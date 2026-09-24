import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";

// Server-rendered, no headless browser (Vercel-compatible) - see
// docs/DATA_MODEL.md's certificates entry and docs/ARCHITECTURE.md's
// Profile/report-card gap #9. A4 landscape, matching the prototype's
// "printable A4 certificate" framing (PRODUCT_SPEC.md §1).
const styles = StyleSheet.create({
  page: {
    padding: 48,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Helvetica",
  },
  brand: { fontSize: 14, color: "#7C3AED", marginBottom: 24, letterSpacing: 2 },
  headline: { fontSize: 12, color: "#666666", marginBottom: 8 },
  name: { fontSize: 32, fontWeight: 700, marginBottom: 16 },
  body: { fontSize: 14, color: "#333333", marginBottom: 24, textAlign: "center" },
  worldTitle: { fontWeight: 700, color: "#7C3AED" },
  statsRow: { flexDirection: "row", gap: 32, marginBottom: 32 },
  stat: { alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: 700 },
  statLabel: { fontSize: 10, color: "#666666" },
  footer: { fontSize: 9, color: "#999999", marginTop: 24 },
});

export type CertificatePdfData = {
  displayName: string; // kid-safe: firstName + lastInitial (CLAUDE.md rule 10)
  worldTitle: string;
  code: string;
  xpEarned: number;
  accuracyPct: number;
  issuedAt: Date;
};

function CertificateDocument({ data }: { data: CertificatePdfData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.brand}>FINLAMMA</Text>
        <Text style={styles.headline}>Certificate of Completion</Text>
        <Text style={styles.name}>{data.displayName}</Text>
        <Text style={styles.body}>
          has completed <Text style={styles.worldTitle}>{data.worldTitle}</Text>
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{data.xpEarned}</Text>
            <Text style={styles.statLabel}>TOTAL XP</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{data.accuracyPct}%</Text>
            <Text style={styles.statLabel}>BOSS QUIZ SCORE</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{data.issuedAt.toISOString().slice(0, 10)}</Text>
            <Text style={styles.statLabel}>DATE</Text>
          </View>
        </View>
        <Text style={styles.footer}>Certificate ID: {data.code}</Text>
        <Text style={styles.footer}>
          Educational simulation only - V Money is virtual, not real currency.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  return renderToBuffer(<CertificateDocument data={data} />);
}
