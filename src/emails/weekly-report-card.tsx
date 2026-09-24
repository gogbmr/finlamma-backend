import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// Sent only to an already-consented, opted-in parent of a currently-under-18
// learner (docs/ARCHITECTURE.md D33) - re-checked fresh every week, never
// decided once. Content is strictly progress-only, against the child's own
// past weeks: no absolute XP/VM total framed as a rank, no percentile, no
// comparison to any other learner - see D33 and the D34 tone rule (this
// email's copy is not a coach-note template, but it follows the same
// "encouraging, never a judgement" spirit). Every email to an already-
// verified parent must also carry the current withdraw link (CLAUDE.md
// rule 13 / D15's follow-on rule), so this one does too - alongside a
// SEPARATE unsubscribe link that stops only these weekly emails, without
// touching consent at all (D33).
export type WeeklyReportCardEmailProps = {
  childFirstName: string;
  weekLabel: string;
  efficiencyScore: number;
  lessonsCompleted: number;
  streakDays: number;
  withdrawUrl: string;
  unsubscribeUrl: string;
};

export function WeeklyReportCardEmail({
  childFirstName,
  weekLabel,
  efficiencyScore,
  lessonsCompleted,
  streakDays,
  withdrawUrl,
  unsubscribeUrl,
}: WeeklyReportCardEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{childFirstName}&apos;s Finlamma progress this week</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{childFirstName}&apos;s week on Finlamma</Heading>
          <Text style={text}>
            Here&apos;s a quick look at {childFirstName}&apos;s progress for {weekLabel}:
          </Text>
          <Section style={statsSection}>
            <Text style={statLine}>📚 {lessonsCompleted} lesson{lessonsCompleted === 1 ? "" : "s"} completed</Text>
            <Text style={statLine}>🔥 {streakDays}-day learning streak</Text>
            <Text style={statLine}>⭐ Efficiency score: {efficiencyScore}/100</Text>
          </Section>
          <Text style={smallText}>
            This is a look at {childFirstName}&apos;s own progress over time, not a ranking against
            other learners. Nothing here involves real money - Finlamma is an educational app
            using virtual &quot;V Money&quot; only.
          </Text>
          <Hr style={hr} />
          <Text style={smallText}>
            You&apos;re receiving this because you opted in to weekly emails when you gave (or
            re-confirmed) consent for {childFirstName} to use Finlamma.
          </Text>
          <Text style={smallText}>
            <Link href={unsubscribeUrl} style={link}>
              Stop these weekly emails
            </Link>{" "}
            (keeps {childFirstName}&apos;s account and your consent unchanged)
          </Text>
          <Text style={smallText}>
            Or, you can withdraw your consent entirely at any time, which immediately returns the
            account to limited access:
          </Text>
          <Text style={smallText}>
            <Link href={withdrawUrl} style={link}>
              Withdraw consent
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WeeklyReportCardEmail;

const main = { backgroundColor: "#f6f6f6", fontFamily: "Arial, sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "480px",
};
const heading = { fontSize: "20px", fontWeight: 700 as const };
const text = { fontSize: "14px", lineHeight: "22px", color: "#333333" };
const statsSection = { margin: "20px 0" };
const statLine = { fontSize: "15px", lineHeight: "26px", color: "#333333", margin: "4px 0" };
const smallText = { fontSize: "12px", lineHeight: "18px", color: "#666666" };
const link = { color: "#5B4CFF" };
const hr = { borderColor: "#eeeeee", margin: "24px 0" };
