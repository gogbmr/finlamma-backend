// Static UI copy for the public consent/withdraw pages, in the same three
// languages as legal_documents.content - a parent should be able to read
// this page in their own language, not just the language the child's app
// happens to be set to (this page is reached by email, independent of the
// child's account settings). Keep in sync with src/db/schema/users.ts's
// languageEnum if a language is ever added/removed there.
export type ConsentLang = "en" | "hi" | "hx";

export const LANGUAGE_LABELS: Record<ConsentLang, string> = {
  en: "English",
  hi: "हिंदी",
  hx: "Hinglish",
};

type ConfirmCopy = {
  pageTitle: string;
  intro: (childFirstName: string) => string;
  whatWeCollectTitle: string;
  whatWeCollectBody: string;
  consentButton: string;
  declineButton: string;
  declineHelp: string;
  consentSuccess: (childFirstName: string) => string;
  declineSuccess: (childFirstName: string) => string;
  missingTitle: string;
  missingBody: string;
  invalidTitle: string;
  invalidBody: string;
  expiredTitle: string;
  expiredBody: string;
  resolvedTitle: string;
  resolvedBody: string;
};

export const CONFIRM_COPY: Record<ConsentLang, ConfirmCopy> = {
  en: {
    pageTitle: "Parental consent for Finlamma",
    intro: (name) =>
      `${name} wants to use Finlamma, a financial-literacy app for students. Because they're under 18, we need your consent before they get full access.`,
    whatWeCollectTitle: "What we collect",
    whatWeCollectBody:
      'Date of birth, your name and email (as their parent/guardian), and normal app-usage data (lessons completed, virtual "V Money" earned - never real money). See the full policies below.',
    consentButton: "I consent",
    declineButton: "I do not consent",
    declineHelp: "Choosing this keeps the account limited - it does not delete anything.",
    consentSuccess: (name) => `Thank you - your consent for ${name} has been recorded.`,
    declineSuccess: (name) =>
      `Understood - we've recorded that you do not consent. ${name}'s account will stay limited.`,
    missingTitle: "Missing link",
    missingBody: "This page needs a valid consent link from your email.",
    invalidTitle: "Invalid link",
    invalidBody:
      "This consent link doesn't match any request. Ask your child to send a new one from the app.",
    expiredTitle: "Link expired",
    expiredBody:
      "This consent link has expired (links are valid for 7 days). Ask your child to request a new one from the app.",
    resolvedTitle: "Already handled",
    resolvedBody: "This request has already been responded to. No further action is needed.",
  },
  hi: {
    pageTitle: "Finlamma ke liye माता-पिता/अभिभावक सहमति",
    intro: (name) =>
      `${name} Finlamma use karna chahte hain, jo students ke liye ek financial-literacy app hai. Kyonki ve 18 saal se kam umra ke hain, unhe poori access milne se pehle hume aapki sahamati chahiye.`,
    whatWeCollectTitle: "Hum kya ekatrit karte hain",
    whatWeCollectBody:
      'Janm tithi, aapka naam aur email (unke parent/guardian ke roop mein), aur samanya app-upyog data (poori ki gayi lessons, virtual "V Money" - kabhi asli paisa nahi). Neeche poori policies dekhein.',
    consentButton: "Main sahamat hoon",
    declineButton: "Main sahamat nahi hoon",
    declineHelp: "Yeh chunne se account seemित rahega - kuch bhi delete nahi hota.",
    consentSuccess: (name) => `Dhanyavaad - ${name} ke liye aapki sahamati darj ho gayi hai.`,
    declineSuccess: (name) =>
      `Samajh gaye - humne darj kar liya hai ki aap sahamat nahi hain. ${name} ka account seemित rahega.`,
    missingTitle: "Link gayab hai",
    missingBody: "Is page ke liye aapke email se ek valid consent link chahiye.",
    invalidTitle: "Amany link",
    invalidBody:
      "Yeh consent link kisi bhi request se mel nahi khata. Apne bachche se app se naya link bhejne ko kahein.",
    expiredTitle: "Link samay-samapt ho gaya",
    expiredBody:
      "Yeh consent link samay-samapt ho gaya hai (link 7 dinon ke liye valid hote hain). Apne bachche se naya link request karne ko kahein.",
    resolvedTitle: "Pehle se hal ho chuka hai",
    resolvedBody: "Is request ka jawab pehle hi diya ja chuka hai. Kisi aur karyavahi ki zaroorat nahi hai.",
  },
  hx: {
    pageTitle: "Finlamma ke liye parent consent",
    intro: (name) =>
      `${name} Finlamma use karna chahte hain - students ke liye ek financial-literacy app. Kyunki woh under 18 hain, unhe full access milne se pehle humein aapki consent chahiye.`,
    whatWeCollectTitle: "Hum kya collect karte hain",
    whatWeCollectBody:
      'Date of birth, aapka naam aur email (parent/guardian ke roop mein), aur normal app-usage data (completed lessons, virtual "V Money" - kabhi real paisa nahi). Poori policies neeche dekhein.',
    consentButton: "I consent",
    declineButton: "I do not consent",
    declineHelp: "Yeh choose karne se account limited rahega - kuch delete nahi hota.",
    consentSuccess: (name) => `Thanks - ${name} ke liye aapki consent record ho gayi hai.`,
    declineSuccess: (name) =>
      `Samajh gaye - hum ne record kar liya hai ki aap consent nahi de rahe. ${name} ka account limited rahega.`,
    missingTitle: "Link missing hai",
    missingBody: "Is page ke liye aapke email wala valid consent link chahiye.",
    invalidTitle: "Invalid link",
    invalidBody: "Yeh consent link kisi request se match nahi karta. Apne child se naya link bhejne ko kahein.",
    expiredTitle: "Link expire ho gaya",
    expiredBody: "Yeh consent link expire ho gaya hai (7 din valid hota hai). Child se naya link request karne ko kahein.",
    resolvedTitle: "Already handled",
    resolvedBody: "Is request ka jawab pehle hi mil chuka hai. Kuch aur karne ki zaroorat nahi.",
  },
};

type ReapproveCopy = {
  pageTitle: string;
  intro: (childFirstName: string, documentLabel: string) => string;
  approveButton: string;
  declineButton: string;
  declineHelp: string;
  approveSuccess: (childFirstName: string) => string;
  declineSuccess: (childFirstName: string) => string;
  missingTitle: string;
  missingBody: string;
  invalidTitle: string;
  invalidBody: string;
  expiredTitle: string;
  expiredBody: string;
  resolvedTitle: string;
  resolvedBody: string;
};

const REAPPROVE_DOC_TYPE_LABEL: Record<ConsentLang, Record<string, string>> = {
  en: { terms: "Terms of use", privacy: "Privacy policy", risk_disclosure: "Risk disclosure" },
  hi: { terms: "Upyog ki sharten", privacy: "Gopniyata niti", risk_disclosure: "Jokhim prakatikaran" },
  hx: { terms: "Terms of use", privacy: "Privacy policy", risk_disclosure: "Risk disclosure" },
};

export function reapproveDocumentLabel(lang: ConsentLang, type: string): string {
  return REAPPROVE_DOC_TYPE_LABEL[lang][type] ?? type;
}

export const REAPPROVE_COPY: Record<ConsentLang, ReapproveCopy> = {
  en: {
    pageTitle: "Updated legal document - please review",
    intro: (name, label) =>
      `We've updated our ${label} since you last gave consent for ${name}. Please review the updated version below and let us know if you approve.`,
    approveButton: "I approve",
    declineButton: "I do not approve",
    declineHelp:
      "Choosing this withdraws your original consent entirely - the account returns to limited access, same as before you first consented.",
    approveSuccess: (name) => `Thank you - your approval for ${name} has been recorded.`,
    declineSuccess: (name) =>
      `Understood - your consent for ${name} has been withdrawn. Their account is now limited.`,
    missingTitle: "Missing link",
    missingBody: "This page needs a valid re-approval link from your email.",
    invalidTitle: "Invalid link",
    invalidBody:
      "This re-approval link doesn't match any request. Ask your child to request a new one from the app.",
    expiredTitle: "Link expired",
    expiredBody:
      "This re-approval link has expired (links are valid for 7 days). Ask your child to request a new one from the app.",
    resolvedTitle: "Already handled",
    resolvedBody: "This request has already been responded to. No further action is needed.",
  },
  hi: {
    pageTitle: "Updated legal document - kripya review karein",
    intro: (name, label) =>
      `${name} ke liye aapki pichli sahamati ke baad humne apni ${label} update ki hai. Kripya neeche updated version dekhein aur bataayein ki kya aap sahamat hain.`,
    approveButton: "Main sahamat hoon",
    declineButton: "Main sahamat nahi hoon",
    declineHelp:
      "Yeh chunne se aapki asal sahamati poori tarah vaapas le li jaati hai - account seemित ho jaata hai, jaisa pehli sahamati se pehle tha.",
    approveSuccess: (name) => `Dhanyavaad - ${name} ke liye aapki sahamati darj ho gayi hai.`,
    declineSuccess: (name) =>
      `Samajh gaye - ${name} ke liye aapki sahamati vaapas le li gayi hai. Unka account ab seemित hai.`,
    missingTitle: "Link gayab hai",
    missingBody: "Is page ke liye aapke email se ek valid re-approval link chahiye.",
    invalidTitle: "Amany link",
    invalidBody:
      "Yeh link kisi bhi request se mel nahi khata. Apne bachche se app se naya link bhejne ko kahein.",
    expiredTitle: "Link samay-samapt ho gaya",
    expiredBody:
      "Yeh link samay-samapt ho gaya hai (link 7 dinon ke liye valid hote hain). Apne bachche se naya link request karne ko kahein.",
    resolvedTitle: "Pehle se hal ho chuka hai",
    resolvedBody: "Is request ka jawab pehle hi diya ja chuka hai. Kisi aur karyavahi ki zaroorat nahi hai.",
  },
  hx: {
    pageTitle: "Updated legal document - please review karein",
    intro: (name, label) =>
      `${name} ke liye aapki pichli consent ke baad humne apni ${label} update ki hai. Neeche updated version dekhein aur bataayein ki aap approve karte hain ya nahi.`,
    approveButton: "I approve",
    declineButton: "I do not approve",
    declineHelp:
      "Yeh choose karne se aapki original consent poori tarah withdraw ho jaati hai - account limited ho jaata hai, jaise pehli consent se pehle tha.",
    approveSuccess: (name) => `Thanks - ${name} ke liye aapki approval record ho gayi hai.`,
    declineSuccess: (name) =>
      `Samajh gaye - ${name} ke liye aapki consent withdraw ho gayi hai. Unka account ab limited hai.`,
    missingTitle: "Link missing hai",
    missingBody: "Is page ke liye aapke email wala valid re-approval link chahiye.",
    invalidTitle: "Invalid link",
    invalidBody: "Yeh link kisi request se match nahi karta. Apne child se naya link bhejne ko kahein.",
    expiredTitle: "Link expire ho gaya",
    expiredBody:
      "Yeh link expire ho gaya hai (7 din valid hota hai). Child se naya link request karne ko kahein.",
    resolvedTitle: "Already handled",
    resolvedBody: "Is request ka jawab pehle hi mil chuka hai. Kuch aur karne ki zaroorat nahi.",
  },
};

type WithdrawCopy = {
  pageTitle: string;
  intro: (childFirstName: string) => string;
  withdrawButton: string;
  success: (childFirstName: string) => string;
  alreadyWithdrawn: (childFirstName: string) => string;
  invalidTitle: string;
  invalidBody: string;
  notApplicableTitle: string;
  notApplicableBody: string;
};

export const WITHDRAW_COPY: Record<ConsentLang, WithdrawCopy> = {
  en: {
    pageTitle: "Withdraw your consent",
    intro: (name) =>
      `You previously gave consent for ${name} to use Finlamma. Withdrawing immediately returns their account to limited access.`,
    withdrawButton: "Withdraw consent",
    success: (name) => `Done - your consent for ${name} has been withdrawn. Their account is now limited.`,
    alreadyWithdrawn: (name) => `Your consent for ${name} was already withdrawn - nothing more to do.`,
    invalidTitle: "Invalid link",
    invalidBody: "This withdrawal link doesn't match any record.",
    notApplicableTitle: "Nothing to withdraw",
    notApplicableBody: "There's no active consent on this request to withdraw.",
  },
  hi: {
    pageTitle: "Apni sahamati vaapas lein",
    intro: (name) =>
      `Aapne pehle ${name} ko Finlamma use karne ki sahamati di thi. Vaapas lene se unka account turant seemित ho jaayega.`,
    withdrawButton: "Sahamati vaapas lein",
    success: (name) => `Ho gaya - ${name} ke liye aapki sahamati vaapas le li gayi hai. Unka account ab seemित hai.`,
    alreadyWithdrawn: (name) => `${name} ke liye aapki sahamati pehle se hi vaapas li ja chuki hai - kuch aur karne ki zaroorat nahi.`,
    invalidTitle: "Amany link",
    invalidBody: "Yeh withdrawal link kisi bhi record se mel nahi khata.",
    notApplicableTitle: "Vaapas lene ke liye kuch nahi",
    notApplicableBody: "Is request par vaapas lene ke liye koi saqriya sahamati nahi hai.",
  },
  hx: {
    pageTitle: "Apni consent withdraw karein",
    intro: (name) =>
      `Aapne pehle ${name} ko Finlamma use karne ki consent di thi. Withdraw karne se unka account turant limited ho jaayega.`,
    withdrawButton: "Consent withdraw karein",
    success: (name) => `Done - ${name} ke liye aapki consent withdraw ho gayi hai. Unka account ab limited hai.`,
    alreadyWithdrawn: (name) => `${name} ke liye aapki consent pehle se hi withdraw ho chuki hai - kuch aur karne ki zaroorat nahi.`,
    invalidTitle: "Invalid link",
    invalidBody: "Yeh withdrawal link kisi record se match nahi karta.",
    notApplicableTitle: "Withdraw karne ke liye kuch nahi",
    notApplicableBody: "Is request par withdraw karne ke liye koi active consent nahi hai.",
  },
};
