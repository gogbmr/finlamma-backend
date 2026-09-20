import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

// Receipt sent right after a parent presses "I consent" on the public
// consent page. Every email sent to an already-verified parent carries this
// same withdraw-consent link (see docs/PRODUCT_SPEC.md's Onboarding &
// parental consent section) - opening it never withdraws anything by
// itself; it leads to the same GET-page/POST-action pattern as the original
// consent link.
export type ParentConsentConfirmedEmailProps = {
  childFirstName: string;
  withdrawUrl: string;
};

export function ParentConsentConfirmedEmail({
  childFirstName,
  withdrawUrl,
}: ParentConsentConfirmedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your consent for {childFirstName}’s Finlamma account is recorded</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Thanks - you’re all set</Heading>
          <Text style={text}>
            You’ve given consent for {childFirstName} to use Finlamma. We’ve recorded who
            consented, when, and which version of our Terms, Privacy and Risk-disclosure
            documents you saw.
          </Text>
          <Text style={text}>
            {childFirstName} still needs to accept our terms themselves in the app before their
            account is fully active.
          </Text>
          <Hr style={hr} />
          <Text style={smallText}>
            Changed your mind? You can withdraw your consent at any time, which immediately
            returns the account to limited access:
          </Text>
          <Text style={smallText}>
            <Link href={withdrawUrl} style={link}>
              Withdraw consent
            </Link>
          </Text>
          <Text style={footerText}>
            To request deletion of your child’s data, contact help@finlamma.in.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ParentConsentConfirmedEmail;

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
const link = { color: "#5B4CFF" };
const hr = { borderColor: "#eeeeee", margin: "24px 0" };
const footerText = { fontSize: "11px", color: "#999999", marginTop: "16px" };
