import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// Sent when a minor's account requests parental consent (see
// src/server/compliance). Opening this email or its link never enrolls the
// child in anything - only pressing "I consent" or "I do not consent" on
// the public consent page it links to does (see docs/PRODUCT_SPEC.md's
// Onboarding & parental consent section: GET must be side-effect-free,
// since email security scanners prefetch links).
export type ParentConsentRequestEmailProps = {
  childFirstName: string;
  consentUrl: string;
};

export function ParentConsentRequestEmail({
  childFirstName,
  consentUrl,
}: ParentConsentRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{childFirstName} wants to use Finlamma - we need your OK first</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Finlamma needs your OK</Heading>
          <Text style={text}>
            {childFirstName} has started signing up for Finlamma, a financial-literacy app for
            students. Because they’re under 18, we need a parent or guardian’s verifiable consent
            before they can use it fully.
          </Text>
          <Text style={text}>
            Nothing on Finlamma involves real money - students learn through lessons and practise
            trading with virtual “V Money” only. Educational, never investment advice.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={consentUrl}>
              Review and decide
            </Button>
          </Section>
          <Text style={smallText}>
            That link opens a page showing what data we collect and our Terms, Privacy and
            Risk-disclosure summaries, where you can choose “I consent” or “I do not consent.”
            Simply opening this email or the link doesn’t enroll {childFirstName} in anything.
          </Text>
          <Hr style={hr} />
          <Text style={footerText}>
            This link expires in 7 days and can only be used once. If you weren’t expecting this
            email, you can safely ignore it - {childFirstName}’s account stays limited until
            consent is given.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ParentConsentRequestEmail;

const main = { backgroundColor: "#f6f6f6", fontFamily: "Arial, sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "480px",
};
const heading = { fontSize: "20px", fontWeight: 700 as const };
const text = { fontSize: "14px", lineHeight: "22px", color: "#333333" };
const smallText = { fontSize: "12px", lineHeight: "18px", color: "#666666" };
const buttonSection = { textAlign: "center" as const, margin: "24px 0" };
const button = {
  backgroundColor: "#5B4CFF",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "8px",
  fontSize: "14px",
  textDecoration: "none",
};
const hr = { borderColor: "#eeeeee", margin: "24px 0" };
const footerText = { fontSize: "11px", color: "#999999" };
