import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

// Sent right after a parent's withdrawal is actually recorded (never on
// the idempotent "already withdrawn" path, to avoid re-sending this on
// every repeat click of an old link). No link back to re-consent - that
// requires the child to send a fresh request from the app, same as any
// first-time request.
export type ParentConsentWithdrawnEmailProps = {
  childFirstName: string;
};

export function ParentConsentWithdrawnEmail({ childFirstName }: ParentConsentWithdrawnEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your consent for {childFirstName}’s Finlamma account has been withdrawn</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Consent withdrawn</Heading>
          <Text style={text}>
            We’ve recorded that you withdrew consent for {childFirstName} to use Finlamma.
            Their account has immediately returned to limited access.
          </Text>
          <Text style={text}>
            If this was a mistake, {childFirstName} can send you a new consent request from the
            app at any time.
          </Text>
          <Text style={footerText}>Questions? Contact help@finlamma.in.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ParentConsentWithdrawnEmail;

const main = { backgroundColor: "#f6f6f6", fontFamily: "Arial, sans-serif" };
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px",
  maxWidth: "480px",
};
const heading = { fontSize: "20px", fontWeight: 700 as const };
const text = { fontSize: "14px", lineHeight: "22px", color: "#333333" };
const footerText = { fontSize: "11px", color: "#999999", marginTop: "16px" };
