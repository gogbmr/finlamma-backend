import { Circle, Document, G, Line, Page, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

// Server-rendered, no headless browser (Vercel-compatible) - see
// docs/DATA_MODEL.md's certificates entry and docs/ARCHITECTURE.md's
// Profile/report-card gap #9. A4 landscape, matching the prototype's
// "printable A4 certificate" framing (PRODUCT_SPEC.md §1).
//
// App asks batch, item A18: restyled to a parchment/gold look (background,
// double-line border frame, a gold seal, a signature line) to match the
// app's own certificate design - no schema change, same CertificatePdfData
// shape as before.
const GOLD = "#9C7A2E";
const GOLD_DARK = "#7A5E22";
const PARCHMENT = "#FBF2DE";
const INK = "#3C2F1E";

const styles = StyleSheet.create({
  page: {
    backgroundColor: PARCHMENT,
    padding: 0,
    fontFamily: "Helvetica",
  },
  borderOuter: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    border: `3pt solid ${GOLD}`,
  },
  borderInner: {
    position: "absolute",
    top: 28,
    left: 28,
    right: 28,
    bottom: 28,
    border: `1pt solid ${GOLD}`,
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 64,
    paddingVertical: 56,
  },
  brand: { fontSize: 15, color: GOLD_DARK, marginBottom: 20, letterSpacing: 3, fontWeight: 700 },
  headline: { fontSize: 12, color: INK, marginBottom: 10, letterSpacing: 1 },
  name: { fontSize: 34, fontWeight: 700, marginBottom: 16, color: INK },
  body: { fontSize: 14, color: INK, marginBottom: 28, textAlign: "center" },
  worldTitle: { fontWeight: 700, color: GOLD_DARK },
  statsRow: { flexDirection: "row", gap: 32, marginBottom: 20 },
  stat: { alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: 700, color: INK },
  statLabel: { fontSize: 9, color: GOLD_DARK, letterSpacing: 1 },
  footer: { fontSize: 9, color: "#8A7B5E", marginTop: 6 },
  signatureBlock: {
    position: "absolute",
    bottom: 56,
    left: 72,
    alignItems: "center",
  },
  signatureLabel: { fontSize: 9, color: GOLD_DARK, marginTop: 4, letterSpacing: 1 },
  sealBlock: {
    position: "absolute",
    bottom: 40,
    right: 80,
    alignItems: "center",
  },
  sealLabel: { fontSize: 7, color: GOLD_DARK, marginTop: 2, letterSpacing: 1 },
});

export type CertificatePdfData = {
  displayName: string; // kid-safe: firstName + lastInitial (CLAUDE.md rule 10)
  worldTitle: string;
  code: string;
  xpEarned: number;
  accuracyPct: number;
  issuedAt: Date;
};

// A simple gold seal - a circle-in-circle medallion with a short ribbon
// tail, drawn with react-pdf's SVG primitives (no external image asset).
function Seal() {
  return (
    <Svg width={72} height={88} viewBox="0 0 72 88">
      <G>
        <Line x1={28} y1={58} x2={20} y2={84} stroke={GOLD_DARK} strokeWidth={10} />
        <Line x1={44} y1={58} x2={52} y2={84} stroke={GOLD_DARK} strokeWidth={10} />
        <Circle cx={36} cy={34} r={30} fill={GOLD} stroke={GOLD_DARK} strokeWidth={2} />
        <Circle cx={36} cy={34} r={23} fill="none" stroke={PARCHMENT} strokeWidth={1.5} />
      </G>
    </Svg>
  );
}

function CertificateDocument({ data }: { data: CertificatePdfData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.borderOuter} />
        <View style={styles.borderInner} />
        <View style={styles.content}>
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
        </View>
        <View style={styles.signatureBlock}>
          <Svg width={140} height={1}>
            <Line x1={0} y1={0} x2={140} y2={0} stroke={GOLD_DARK} strokeWidth={1} />
          </Svg>
          <Text style={styles.signatureLabel}>FINLAMMA MENTOR</Text>
        </View>
        <View style={styles.sealBlock}>
          <Seal />
          <Text style={styles.sealLabel}>OFFICIAL SEAL</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  return renderToBuffer(<CertificateDocument data={data} />);
}
