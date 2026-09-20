import {
  Body,
  Button,
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

// Sent when staff publish a legal-document version that materially changes
// terms a minor's parent already agreed to (requires_parent_reapproval -
// see src/server/legal/service.ts publishLegalDocument). Same GET-must-be-
// side-effect-free rule as the original consent email: opening this email
// or the reapproval link never records anything by itself. Every email to
// an already-verified parent must also carry the current withdraw link
// (CLAUDE.md rule 13), so this one does too.
export type ParentReapprovalRequestEmailProps = {
  childFirstName: string;
  documentLabel: string;
  reapprovalUrl: string;
  withdrawUrl: string;
};

export function ParentReapprovalRequestEmail({
  childFirstName,
  documentLabel,
  reapprovalUrl,
  withdrawUrl,
}: ParentReapprovalRequestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>We updated our {documentLabel} - please review it for {childFirstName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>We’ve updated our {documentLabel}</Heading>
          <Text style={text}>
            You previously gave consent for {childFirstName} to use Finlamma. We’ve since made a
            material change to our {documentLabel}, so we need you to review and re-approve it
            before {childFirstName} can keep using the app.
          </Text>
          <Text style={text}>
            Until you do, {childFirstName}’s account will have limited access - same as before
            your original consent.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={reapprovalUrl}>
              Review and decide
            </Button>
          </Section>
          <Text style={smallText}>
            That link opens a page showing the updated {documentLabel}, where you can choose “I
            approve” or “I do not approve.” Simply opening this email or the link doesn’t change
            anything.
          </Text>
          <Hr style={hr} />
          <Text style={smallText}>
            This link expires in 7 days and can only be used once. You can also withdraw your
            original consent entirely at any time, which immediately returns the account to
            limited access:
          </Text>
          <Text style={smallText}>
            <Link href={withdrawUrl} style={link}>
              Withdraw consent
            </Link>
          </Text>
          <Text style={footerText}>
            If you weren’t expecting this email, you can safely ignore it -{" "}
            {childFirstName}’s account stays limited until you act.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default ParentReapprovalRequestEmail;

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
