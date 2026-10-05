// Seeds version 1 of each legal document (terms, privacy, risk_disclosure)
// as PUBLISHED, so the app and the parental-consent flow have something
// real to show and record acceptance against end-to-end. The content
// itself is a clearly marked DRAFT - written to be a genuinely useful
// starting point for outside counsel (proper structure, accurate against
// what the app actually does), but NOT reviewed by counsel and NOT final
// legal text. See docs/PRODUCT_SPEC.md's Onboarding & parental consent
// section and docs/ROADMAP.md's pre-launch checklist: the real text comes
// after an outside legal review, at which point staff drafts and publishes
// a real version 2+ through the admin Legal document editor (never by
// re-running this script).
//
// Every [TO BE CONFIRMED] marker below is a genuinely undecided fact (legal
// entity name, grievance officer, retention periods, jurisdiction, legal
// basis under the DPDP Act) - deliberately left blank rather than guessed,
// per the founder's standing rule that a confident wrong answer in a legal
// document is worse than a visible gap. Do not fill these in without the
// founder's and counsel's sign-off.
//
// The hi/hx content is a real translation of the legal meaning (not a
// transliteration of the English), but is itself an unreviewed draft - see
// the pre-launch checklist's "Native-speaker review of all Hindi and
// Hinglish content" item, which now explicitly covers this file.
//
// Refuses to touch a type that already has a published version, so this is
// safe to run again (e.g. against a fresh database) without ever
// overwriting real legal text with the placeholder. Run via `pnpm seed:legal`.
import "../envConfig";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { legalDocuments } from "../src/db/schema";
import { logActivity } from "../src/lib/activity-log";

const PLACEHOLDER_NOTICE =
  "[PLACEHOLDER — NOT FOR LAUNCH. Not reviewed by counsel. Do not treat as final legal text.]\n\n";

const TRANSLATION_NOTE_HI =
  "\n\n[यह हिंदी अनुवाद कानूनी अर्थ के अनुसार तैयार किया गया एक आरंभिक मसौदा है, शब्द-दर-शब्द अनुवाद नहीं। लॉन्च से पहले इसकी एक मातृभाषा-हिंदी व्यक्ति द्वारा कानूनी समीक्षा ज़रूरी है (देखें docs/ROADMAP.md का पूर्व-लॉन्च चेकलिस्ट)।]";

const TRANSLATION_NOTE_HX =
  "\n\n[Yeh Hinglish translation legal meaning ke hisaab se banaya gaya ek starting draft hai, word-for-word translation nahi. Launch se pehle isse ek native Hindi-speaking reviewer se legal review karana zaroori hai (dekhein docs/ROADMAP.md ka pre-launch checklist).]";

const TERMS_EN = `${PLACEHOLDER_NOTICE}TERMS OF USE

1. Introduction and acceptance
Welcome to Finlamma ("Finlamma," "we," "us," or "our"), a gamified financial-literacy app built for Indian students and young earners. These Terms of Use ("Terms") govern your access to and use of the Finlamma mobile app, this website, and related services (together, the "Service"). By creating an account or using the Service, you agree to these Terms. If you are under 18, your parent or guardian must also give verifiable consent before you can use most of the Service, as described in Section 6 and in our Privacy Policy.

2. Definitions
"User," "you," or "learner" means anyone who uses the Service. "Minor" means a user who is under 18 years of age. "Parent/Guardian" means the parent or legal guardian who provides consent for a Minor's use of the Service. "V Money" means Finlamma's virtual, in-app currency, described in Section 8. "Simulated trading" means the paper-trading features of the Service, where no real money, securities, or orders are involved. "Content" means lessons, quizzes, news summaries, mentor commentary, Doubt Zone answers, and any other material made available through the Service.

3. Eligibility and age
The Service is intended for students and young earners in India. There is no minimum age to use Finlamma, but any user under 18 may only access the full Service after the parental consent process described in Section 6 is complete. We rely on the date of birth you provide at onboarding to determine your age. You may not provide a false date of birth, and once set, only our staff can correct it, for a documented reason.

4. Description of the Service
Finlamma teaches financial literacy through a map of "worlds," lessons, quizzes, a simulated trading feature ("Trade"), a social/competitive feature ("Arena"), simplified news, and an AI-assisted question feature ("Doubt Zone"). The Service is educational only. No feature of the Service involves real money, a real brokerage or demat account, or a real financial transaction of any kind — see Section 9 and our separate Risk Disclosure for details.

5. Accounts and security
You need an account, authenticated through our identity provider, to use most of the Service. You are responsible for keeping your login credentials confidential and for all activity under your account. Tell us immediately, via our Contact page, if you believe your account has been accessed without your permission.

6. Parental consent
If you are under 18, a parent or guardian must consent to your use of the Service before you get full access, following an email-link process described in full in our Privacy Policy. Until that consent — and your own separate, in-app acceptance of these Terms — is complete, your access is limited to onboarding, account settings, and these legal pages. A parent or guardian may withdraw consent at any time using the withdraw-consent link included in every email we send them; withdrawing immediately returns the account to limited access.

7. User conduct
You agree to use the Service respectfully and only for its intended educational purpose. Finlamma does not provide messaging or chat between learners, and does not show one learner's free-text writing to another learner. Doubt Zone, our AI question-and-answer feature, is for genuine learning questions; a message that our automated safety check flags, or that a learner reports, may be reviewed by trained staff, as described in our Privacy Policy.

8. Virtual currency and rewards
"V Money" is a virtual, in-app currency you earn by learning and simulated trading. V Money, badges, titles, and cosmetic rewards have no real-world or cash value; cannot be purchased with real money, withdrawn, transferred, sold, or exchanged for anything outside the Service; and may be adjusted, reset, or corrected by us (for example, to fix an error) without compensation.

9. Simulated trading and market data
All "trading" inside Finlamma — buying or selling a stock, mutual fund, or any other instrument — is simulated and uses V Money only. No real order is ever placed with any exchange, broker, or fund house on your behalf. Prices and other market data shown in the Service are sourced from third-party providers and may be delayed, shown as the last available real price when a market is closed, incomplete, or occasionally inaccurate. We do not guarantee the accuracy or timeliness of any price or market data shown, and nothing displayed in the Service is a real trade or a real, actionable market price.

10. Arena and competitions
Arena leaderboards, leagues, and competitions award only virtual prizes — V Money, badges, titles, and similar in-app rewards. No competition, leaderboard, or Arena feature ever awards cash or anything of real-world value, regardless of how it is described in-app.

11. Subscriptions and ads
Free accounts may see advertisements once a learner reaches a certain point in the app. Ads are shown in a non-personalised, child-directed way to any account under 18, or to any account where we cannot confirm the user is an adult. An optional, paid ad-free subscription removes ads; it is billed and managed entirely through Apple's or Google's in-app purchase system, not directly by Finlamma, and renews automatically until cancelled through that store.

12. Refunds
All payments for subscriptions are processed by Apple or Google, not by Finlamma. Refunds, cancellations, and billing disputes are handled entirely under Apple's or Google's own refund policies — contact the relevant app store directly to request a refund. If we determine that a purchase was made on, or an ad-free entitlement would otherwise apply to, a Minor's account, we will refuse or remove that entitlement and reach out to the Minor's parent or guardian to resolve the purchase [the exact refund-coordination process is still being defined — see our pre-launch checklist]. We cannot ourselves reverse a charge made at the app-store level; any refund for the charge itself must come from Apple or Google.

13. Intellectual property
All content, branding, characters, and software in the Service belong to Finlamma or its licensors. You may use the Service for your own personal, non-commercial, educational use, and may not copy, redistribute, or create derivative works from it without our permission.

14. Third-party services
The Service uses third-party providers for things like authentication, hosting, market data, AI-assisted content, and payments, listed in full in our Privacy Policy. We do not control, and are not responsible for, those providers' own services, except as described in our Privacy Policy.

15. Disclaimers and limitation of liability
The Service is provided "as is" for educational purposes, without warranties of any kind, express or implied. To the fullest extent permitted by law, Finlamma is not liable for indirect, incidental, or consequential damages arising from your use of the Service, including any real-world financial decision made in connection with it. Nothing in this section limits liability that cannot be limited under Indian law.

16. Suspension and termination
We may suspend or terminate an account that violates these Terms, that we reasonably believe poses a safety risk (particularly to a Minor), or where parental consent is withdrawn or never completed. You may stop using the Service, or request account deletion, at any time.

17. Account deletion
You — or, for a Minor, their parent or guardian, through our support contact — can request full account deletion. Our Privacy Policy describes exactly what is deleted, anonymised, or retained, and why.

18. Changes to these Terms
We may update these Terms as the Service changes. A new version is published with a version number and date. If a change is material, we will ask you — and, for a Minor whose parent has already consented, their parent — to re-accept it before you can continue using the Service.

19. Governing law and dispute resolution
These Terms are governed by the laws of India. [The specific courts/jurisdiction and dispute-resolution process are TO BE CONFIRMED.]

20. Grievance officer and contact
Questions about these Terms, or complaints about the Service, can be sent to us using the details on our Contact page, including our grievance officer's contact information [TO BE CONFIRMED].

21. Miscellaneous
If any part of these Terms is found unenforceable, the rest remains in effect. These Terms, together with our Privacy Policy and Risk Disclosure, are the entire agreement between you and Finlamma regarding the Service.`;

const TERMS_HI = `${PLACEHOLDER_NOTICE}उपयोग की शर्तें

1. परिचय और स्वीकृति
Finlamma ("हम," "हमारा") में आपका स्वागत है — भारतीय छात्रों और युवा कामगारों के लिए बनाया गया एक गेमिफाइड वित्तीय-साक्षरता ऐप। ये उपयोग की शर्तें ("शर्तें") Finlamma मोबाइल ऐप, इस वेबसाइट और संबंधित सेवाओं (सामूहिक रूप से "सेवा") के आपके उपयोग को नियंत्रित करती हैं। खाता बनाकर या सेवा का उपयोग करके, आप इन शर्तों से सहमत होते हैं। यदि आपकी उम्र 18 वर्ष से कम है, तो सेवा का अधिकांश भाग उपयोग करने से पहले आपके माता-पिता/अभिभावक की सत्यापित सहमति भी आवश्यक है (देखें खंड 6 और हमारी गोपनीयता नीति)।

2. परिभाषाएं
"उपयोगकर्ता" या "आप" का अर्थ है सेवा का उपयोग करने वाला कोई भी व्यक्ति। "नाबालिग" का अर्थ है 18 वर्ष से कम उम्र का उपयोगकर्ता। "माता-पिता/अभिभावक" का अर्थ है वह व्यक्ति जो नाबालिग के सेवा-उपयोग के लिए सहमति देता है। "V Money" Finlamma की वर्चुअल, इन-ऐप करेंसी है (खंड 8 देखें)। "सिम्युलेटेड ट्रेडिंग" सेवा की वह पेपर-ट्रेडिंग सुविधा है जिसमें कोई असली पैसा, सिक्योरिटी या ऑर्डर शामिल नहीं होता। "कंटेंट" का अर्थ है पाठ, क्विज़, न्यूज़ सारांश, मेंटर की टिप्पणियां, Doubt Zone के उत्तर, और सेवा के माध्यम से उपलब्ध अन्य सामग्री।

3. पात्रता और उम्र
यह सेवा भारत के छात्रों और युवा कामगारों के लिए है। Finlamma उपयोग करने की कोई न्यूनतम उम्र नहीं है, लेकिन 18 वर्ष से कम उम्र का कोई भी उपयोगकर्ता खंड 6 में बताई गई माता-पिता की सहमति प्रक्रिया पूरी होने के बाद ही पूरी सेवा का उपयोग कर सकता है। आपकी उम्र तय करने के लिए हम ऑनबोर्डिंग के समय आपके द्वारा दी गई जन्मतिथि पर निर्भर करते हैं। आप गलत जन्मतिथि नहीं दे सकते, और एक बार सेट होने के बाद, केवल हमारा स्टाफ ही एक दर्ज किए गए कारण के साथ उसे ठीक कर सकता है।

4. सेवा का विवरण
Finlamma "worlds" के नक्शे, पाठों, क्विज़, एक सिम्युलेटेड ट्रेडिंग सुविधा ("Trade"), एक सामाजिक/प्रतिस्पर्धी सुविधा ("Arena"), सरल की गई न्यूज़, और एक AI-सहायता प्राप्त प्रश्न सुविधा ("Doubt Zone") के माध्यम से वित्तीय साक्षरता सिखाता है। यह सेवा केवल शैक्षिक है। सेवा की कोई भी सुविधा असली पैसे, असली ब्रोकरेज/डीमैट खाते, या किसी भी प्रकार के असली वित्तीय लेनदेन से जुड़ी नहीं है — विवरण के लिए खंड 9 और हमारा अलग जोखिम प्रकटीकरण देखें।

5. खाता और सुरक्षा
सेवा के अधिकांश भाग का उपयोग करने के लिए आपको हमारे पहचान प्रदाता के माध्यम से प्रमाणित एक खाते की आवश्यकता है। अपने लॉगिन विवरण को गोपनीय रखना और अपने खाते के अंतर्गत होने वाली सभी गतिविधि की जिम्मेदारी आपकी है। यदि आपको लगता है कि आपके खाते तक बिना अनुमति पहुंच बनाई गई है, तो हमारे Contact पेज के माध्यम से हमें तुरंत बताएं।

6. माता-पिता की सहमति
यदि आपकी उम्र 18 वर्ष से कम है, तो पूरी सेवा का उपयोग करने से पहले माता-पिता/अभिभावक को एक ईमेल-लिंक प्रक्रिया द्वारा सहमति देनी होगी (पूरा विवरण हमारी गोपनीयता नीति में है)। जब तक यह सहमति — और इन शर्तों की आपकी अपनी, अलग, इन-ऐप स्वीकृति — पूरी नहीं हो जाती, तब तक आपकी पहुंच केवल ऑनबोर्डिंग, खाता सेटिंग्स और इन कानूनी पृष्ठों तक सीमित है। माता-पिता/अभिभावक हमारे द्वारा भेजे गए हर ईमेल में शामिल withdraw-consent लिंक से किसी भी समय सहमति वापस ले सकते हैं; सहमति वापस लेने पर खाता तुरंत सीमित पहुंच पर लौट आता है।

7. उपयोगकर्ता का व्यवहार
आप सेवा का उपयोग सम्मानपूर्वक और केवल उसके शैक्षिक उद्देश्य के लिए करने के लिए सहमत हैं। Finlamma सीखने वालों के बीच मैसेजिंग या चैट की सुविधा नहीं देता, और किसी एक सीखने वाले का फ्री-टेक्स्ट लेखन किसी दूसरे सीखने वाले को नहीं दिखाता। Doubt Zone, हमारी AI प्रश्न-उत्तर सुविधा, असली सीखने के सवालों के लिए है; जिस संदेश को हमारी स्वचालित सुरक्षा जांच फ्लैग करे, या जिसे कोई सीखने वाला रिपोर्ट करे, उसकी समीक्षा प्रशिक्षित स्टाफ द्वारा की जा सकती है (हमारी गोपनीयता नीति में विवरण)।

8. वर्चुअल करेंसी और रिवॉर्ड
"V Money" एक वर्चुअल, इन-ऐप करेंसी है जो आप सीखने और सिम्युलेटेड ट्रेडिंग से कमाते हैं। V Money, बैज, टाइटल और कॉस्मेटिक रिवॉर्ड का कोई असली-दुनिया या नकद मूल्य नहीं है; इन्हें असली पैसे से खरीदा नहीं जा सकता, निकाला, ट्रांसफर, बेचा या सेवा के बाहर किसी भी चीज़ से बदला नहीं जा सकता; और हम इन्हें बिना किसी मुआवज़े के समायोजित, रीसेट या ठीक कर सकते हैं (उदाहरण के लिए किसी गलती को सुधारने के लिए)।

9. सिम्युलेटेड ट्रेडिंग और मार्केट डेटा
Finlamma के भीतर सभी "ट्रेडिंग" — कोई स्टॉक, म्यूचुअल फंड, या कोई अन्य इंस्ट्रूमेंट खरीदना या बेचना — सिम्युलेटेड है और केवल V Money का उपयोग करती है। आपकी ओर से किसी भी एक्सचेंज, ब्रोकर, या फंड हाउस के पास कभी कोई असली ऑर्डर नहीं रखा जाता। सेवा में दिखाई गई कीमतें और अन्य मार्केट डेटा तीसरे पक्ष के प्रदाताओं से ली जाती हैं और विलंबित हो सकती हैं, बाज़ार बंद होने पर अंतिम उपलब्ध असली कीमत दिखाई जा सकती है, अधूरी हो सकती हैं, या कभी-कभी गलत हो सकती हैं। हम दिखाई गई किसी भी कीमत या मार्केट डेटा की सटीकता या समयबद्धता की गारंटी नहीं देते, और सेवा में दिखाई गई कोई भी चीज़ एक असली ट्रेड या असली, एक्शन-योग्य मार्केट कीमत नहीं है।

10. Arena और प्रतियोगिताएं
Arena की लीडरबोर्ड, लीग और प्रतियोगिताएं केवल वर्चुअल पुरस्कार देती हैं — V Money, बैज, टाइटल और इसी तरह के इन-ऐप रिवॉर्ड। कोई भी प्रतियोगिता, लीडरबोर्ड, या Arena सुविधा कभी भी नकद या किसी असली-दुनिया मूल्य वाली चीज़ नहीं देती, भले ही ऐप के भीतर इसे कैसे भी बताया गया हो।

11. सब्सक्रिप्शन और विज्ञापन
फ्री खाते किसी निश्चित बिंदु तक पहुंचने के बाद विज्ञापन देख सकते हैं। 18 वर्ष से कम उम्र के किसी भी खाते, या जिस खाते के लिए हम उपयोगकर्ता के वयस्क होने की पुष्टि नहीं कर सकते, उसे विज्ञापन गैर-व्यक्तिगत (non-personalised), बाल-निर्देशित तरीके से दिखाए जाते हैं। एक वैकल्पिक, सशुल्क ad-free सब्सक्रिप्शन विज्ञापनों को हटाता है; इसका बिलिंग और प्रबंधन पूरी तरह से Apple या Google की इन-ऐप खरीद प्रणाली के माध्यम से होता है, Finlamma द्वारा सीधे नहीं, और उस स्टोर के माध्यम से रद्द न किए जाने तक यह स्वचालित रूप से रिन्यू होता है।

12. रिफंड
सभी सब्सक्रिप्शन भुगतान Apple या Google द्वारा प्रोसेस किए जाते हैं, Finlamma द्वारा नहीं। रिफंड, रद्दीकरण और बिलिंग विवाद पूरी तरह से Apple या Google की अपनी रिफंड नीतियों के अंतर्गत संभाले जाते हैं — रिफंड के लिए सीधे संबंधित ऐप स्टोर से संपर्क करें। यदि हम यह पाते हैं कि कोई खरीद किसी नाबालिग के खाते पर की गई है, या ad-free सुविधा किसी नाबालिग के खाते पर लागू होती, तो हम वह सुविधा अस्वीकार या हटा देंगे और खरीद को सुलझाने के लिए नाबालिग के माता-पिता/अभिभावक से संपर्क करेंगे [सटीक रिफंड-समन्वय प्रक्रिया अभी तय की जा रही है — देखें हमारी पूर्व-लॉन्च चेकलिस्ट]। हम स्वयं ऐप-स्टोर स्तर पर किए गए किसी चार्ज को वापस नहीं कर सकते; चार्ज का कोई भी रिफंड Apple या Google से ही आना चाहिए।

13. बौद्धिक संपदा
सेवा में सभी कंटेंट, ब्रांडिंग, कैरेक्टर और सॉफ़्टवेयर Finlamma या उसके लाइसेंसकर्ताओं के हैं। आप सेवा का उपयोग केवल अपने व्यक्तिगत, गैर-व्यावसायिक, शैक्षिक उपयोग के लिए कर सकते हैं, और हमारी अनुमति के बिना इसे कॉपी, पुनर्वितरित, या इससे व्युत्पन्न कार्य नहीं बना सकते।

14. तीसरे पक्ष की सेवाएं
सेवा प्रमाणीकरण, होस्टिंग, मार्केट डेटा, AI-सहायता प्राप्त कंटेंट, और भुगतान जैसी चीज़ों के लिए तीसरे पक्ष के प्रदाताओं का उपयोग करती है, जिनकी पूरी सूची हमारी गोपनीयता नीति में है। हम उन प्रदाताओं की अपनी सेवाओं को नियंत्रित नहीं करते और उनके लिए ज़िम्मेदार नहीं हैं, सिवाय उस सीमा तक जो हमारी गोपनीयता नीति में बताई गई है।

15. अस्वीकरण और दायित्व की सीमा
सेवा शैक्षिक उद्देश्यों के लिए "जैसी है" आधार पर, बिना किसी प्रकार की स्पष्ट या अंतर्निहित वारंटी के प्रदान की जाती है। कानून द्वारा अनुमत पूरी सीमा तक, Finlamma आपके सेवा-उपयोग से उत्पन्न किसी भी अप्रत्यक्ष, आकस्मिक, या परिणामी क्षति के लिए उत्तरदायी नहीं है, जिसमें इससे जुड़ा कोई भी असली-दुनिया का वित्तीय निर्णय शामिल है। इस खंड की कोई भी बात भारतीय कानून के अंतर्गत सीमित न की जा सकने वाली देयता को सीमित नहीं करती।

16. निलंबन और समापन
हम किसी ऐसे खाते को निलंबित या समाप्त कर सकते हैं जो इन शर्तों का उल्लंघन करता है, जिसके बारे में हमें उचित रूप से लगता है कि वह किसी सुरक्षा जोखिम (विशेष रूप से किसी नाबालिग के लिए) का कारण बन सकता है, या जिसकी माता-पिता की सहमति वापस ले ली गई है या कभी पूरी नहीं हुई। आप किसी भी समय सेवा का उपयोग बंद कर सकते हैं या खाता हटाने का अनुरोध कर सकते हैं।

17. खाता हटाना
आप — या, नाबालिग के मामले में, उनके माता-पिता/अभिभावक, हमारे सपोर्ट संपर्क के माध्यम से — पूरे खाते को हटाने का अनुरोध कर सकते हैं। हमारी गोपनीयता नीति में बताया गया है कि क्या हटाया जाता है, क्या गुमनाम किया जाता है, और क्या बरकरार रखा जाता है, और क्यों।

18. इन शर्तों में बदलाव
सेवा के बदलने के साथ हम इन शर्तों को अपडेट कर सकते हैं। एक नया वर्शन एक वर्शन नंबर और तारीख़ के साथ प्रकाशित किया जाता है। यदि कोई बदलाव महत्वपूर्ण है, तो सेवा जारी रखने से पहले हम आपसे — और, जिस नाबालिग के माता-पिता पहले ही सहमति दे चुके हैं, उनके माता-पिता से — फिर से स्वीकृति मांगेंगे।

19. शासकीय कानून और विवाद समाधान
ये शर्तें भारत के कानूनों द्वारा शासित हैं। [विशिष्ट न्यायालय/क्षेत्राधिकार और विवाद-समाधान प्रक्रिया अभी पुष्टि की जानी है — TO BE CONFIRMED।]

20. शिकायत अधिकारी और संपर्क
इन शर्तों के बारे में सवाल, या सेवा के बारे में शिकायतें, हमारे Contact पेज पर दिए गए विवरण का उपयोग करके हमें भेजी जा सकती हैं, जिसमें हमारे शिकायत अधिकारी का संपर्क विवरण शामिल है [TO BE CONFIRMED]।

21. विविध
यदि इन शर्तों का कोई भाग अप्रवर्तनीय पाया जाता है, तो बाकी शर्तें प्रभावी रहती हैं। ये शर्तें, हमारी गोपनीयता नीति और जोखिम प्रकटीकरण के साथ, सेवा के संबंध में आपके और Finlamma के बीच संपूर्ण समझौता हैं।${TRANSLATION_NOTE_HI}`;

const TERMS_HX = `${PLACEHOLDER_NOTICE}TERMS OF USE (Upyog ki Sharten)

1. Introduction aur acceptance
Finlamma ("hum," "hamara") mein aapka welcome hai — Indian students aur young earners ke liye banaya gaya ek gamified financial-literacy app. Yeh Terms of Use ("Sharten") Finlamma mobile app, is website, aur related services (sab mila kar "Service") ke aapke use ko govern karti hain. Account banaake ya Service use karke, aap in Sharten se agree karte hain. Agar aapki age 18 saal se kam hai, to Service ka zyadatar hissa use karne se pehle aapke parent/guardian ki verifiable consent bhi zaroori hai (dekhein Section 6 aur hamari Privacy Policy).

2. Definitions
"User" ya "aap" ka matlab hai Service use karne wala koi bhi insaan. "Minor" ka matlab hai 18 saal se kam age ka user. "Parent/Guardian" ka matlab hai woh insaan jo minor ke Service-use ke liye consent deta hai. "V Money" Finlamma ki virtual, in-app currency hai (Section 8 dekhein). "Simulated trading" Service ki woh paper-trading feature hai jisme koi real paisa, security, ya order involve nahi hota. "Content" ka matlab hai lessons, quizzes, news summaries, mentor commentary, Doubt Zone ke answers, aur Service ke through available koi bhi aur material.

3. Eligibility aur age
Yeh Service India ke students aur young earners ke liye hai. Finlamma use karne ki koi minimum age nahi hai, lekin 18 saal se kam age ka koi bhi user Section 6 mein bataya gaya parental consent process complete hone ke baad hi full Service access kar sakta hai. Aapki age decide karne ke liye hum onboarding ke time aapki di hui date of birth par depend karte hain. Aap galat date of birth nahi de sakte, aur ek baar set hone ke baad, sirf hamara staff hi ek documented reason ke saath use correct kar sakta hai.

4. Service ka description
Finlamma financial literacy "worlds" ke map, lessons, quizzes, ek simulated trading feature ("Trade"), ek social/competitive feature ("Arena"), simplified news, aur ek AI-assisted question feature ("Doubt Zone") ke through sikhaata hai. Yeh Service sirf educational hai. Service ka koi bhi feature real paisa, real brokerage/demat account, ya kisi bhi tarah ke real financial transaction se involve nahi hai — details ke liye Section 9 aur hamara separate Risk Disclosure dekhein.

5. Account aur security
Service ka zyadatar hissa use karne ke liye aapko hamare identity provider ke through authenticate kiya gaya ek account chahiye. Apne login credentials ko confidential rakhna aur apne account ke under hone wali saari activity ki responsibility aapki hai. Agar aapko lagta hai ki aapke account tak bina permission access hua hai, to hamare Contact page ke through humein turant batayein.

6. Parental consent
Agar aapki age 18 saal se kam hai, to full access milne se pehle aapke parent/guardian ko ek email-link process ke through consent dena hoga (poora detail hamari Privacy Policy mein hai). Jab tak yeh consent — aur in Sharten ki aapki apni, separate, in-app acceptance — complete nahi ho jaati, tab tak aapka access sirf onboarding, account settings, aur in legal pages tak limited hai. Parent/guardian hamare bheje har email mein shaamil withdraw-consent link se kisi bhi time consent withdraw kar sakte hain; withdraw karne par account turant limited access par wapas chala jaata hai.

7. User conduct
Aap Service ko respectfully aur sirf uske intended educational purpose ke liye use karne ke liye agree karte hain. Finlamma learners ke beech messaging ya chat ki facility nahi deta, aur ek learner ka free-text likha hua kabhi doosre learner ko nahi dikhata. Doubt Zone, hamara AI question-answer feature, genuine learning questions ke liye hai; jis message ko hamari automated safety check flag kare, ya jise koi learner report kare, uski review trained staff kar sakta hai (details hamari Privacy Policy mein).

8. Virtual currency aur rewards
"V Money" ek virtual, in-app currency hai jo aap learning aur simulated trading se earn karte hain. V Money, badges, titles, aur cosmetic rewards ki koi real-world ya cash value nahi hai; inhe real paise se khareeda nahi ja sakta, withdraw, transfer, sell, ya Service ke bahar kisi bhi cheez se exchange nahi kiya ja sakta; aur hum inhe bina kisi compensation ke adjust, reset, ya correct kar sakte hain (jaise kisi error ko fix karne ke liye).

9. Simulated trading aur market data
Finlamma ke andar saari "trading" — koi stock, mutual fund, ya koi aur instrument buy ya sell karna — simulated hai aur sirf V Money use karti hai. Aapki taraf se kisi bhi exchange, broker, ya fund house ke paas kabhi koi real order nahi rakha jaata. Service mein dikhayi gayi prices aur dusra market data third-party providers se liya jaata hai aur delayed ho sakta hai, market band hone par aakhri available real price dikhayi ja sakti hai, incomplete ho sakta hai, ya kabhi-kabhi galat ho sakta hai. Hum dikhayi gayi kisi bhi price ya market data ki accuracy ya timeliness ki guarantee nahi dete, aur Service mein dikhayi gayi koi bhi cheez ek real trade ya real, action-layak market price nahi hai.

10. Arena aur competitions
Arena ke leaderboards, leagues, aur competitions sirf virtual prizes dete hain — V Money, badges, titles, aur isi tarah ke in-app rewards. Koi bhi competition, leaderboard, ya Arena feature kabhi bhi cash ya kisi real-world value wali cheez nahi deta, chahe app ke andar use kaise bhi describe kiya gaya ho.

11. Subscriptions aur ads
Free accounts ek certain point tak pahunchne ke baad ads dekh sakte hain. 18 saal se kam age ke kisi bhi account ko, ya jis account ke liye hum user ke adult hone ki confirm nahi kar sakte, usse ads non-personalised, child-directed tarike se dikhaye jaate hain. Ek optional, paid ad-free subscription ads ko hata deta hai; iska billing aur management poori tarah Apple ya Google ke in-app purchase system ke through hota hai, Finlamma dwara directly nahi, aur us store ke through cancel na kiye jaane tak yeh automatically renew hota hai.

12. Refunds
Saare subscription payments Apple ya Google dwara process kiye jaate hain, Finlamma dwara nahi. Refunds, cancellations, aur billing disputes poori tarah Apple ya Google ki apni refund policies ke under handle kiye jaate hain — refund ke liye seedhe related app store se contact karein. Agar hum yeh pate hain ki koi purchase kisi minor ke account par hui hai, ya ad-free entitlement kisi minor ke account par apply hoti, to hum woh entitlement refuse ya remove kar denge aur purchase sort karne ke liye minor ke parent/guardian se contact karenge [exact refund-coordination process abhi decide ho rahi hai — dekhein hamari pre-launch checklist]. Hum khud app-store level par hui koi charge reverse nahi kar sakte; charge ka koi bhi refund Apple ya Google se hi aana chahiye.

13. Intellectual property
Service mein saara content, branding, characters, aur software Finlamma ya uske licensors ke hain. Aap Service ko sirf apne personal, non-commercial, educational use ke liye use kar sakte hain, aur hamari permission ke bina ise copy, redistribute, ya isse derivative work nahi bana sakte.

14. Third-party services
Service authentication, hosting, market data, AI-assisted content, aur payments jaisi cheezon ke liye third-party providers use karti hai, jinki poori list hamari Privacy Policy mein hai. Hum un providers ki apni services ko control nahi karte aur unke liye responsible nahi hain, sivaay us extent ke jo hamari Privacy Policy mein bataya gaya hai.

15. Disclaimers aur limitation of liability
Service educational purposes ke liye "as is" basis par, kisi bhi tarah ki express ya implied warranty ke bina provide ki jaati hai. Kanoon dwara allowed poori extent tak, Finlamma aapke Service-use se hone wali kisi bhi indirect, incidental, ya consequential damage ke liye liable nahi hai, jisme isse juda koi bhi real-world financial decision shaamil hai. Is section ki koi bhi baat Indian law ke under limit na ki ja sakne wali liability ko limit nahi karti.

16. Suspension aur termination
Hum kisi aise account ko suspend ya terminate kar sakte hain jo in Sharten ka violation karta hai, jisse hamein reasonably lagta hai ki woh koi safety risk (khaaskar kisi minor ke liye) paida kar sakta hai, ya jiski parental consent withdraw ho gayi hai ya kabhi complete nahi hui. Aap kisi bhi time Service ka use band kar sakte hain ya account delete karne ki request kar sakte hain.

17. Account delete karna
Aap — ya, minor ke case mein, unke parent/guardian, hamare support contact ke through — poore account ko delete karne ki request kar sakte hain. Hamari Privacy Policy mein bataya gaya hai ki kya delete hota hai, kya anonymise hota hai, aur kya retain kiya jaata hai, aur kyun.

18. In Sharton mein changes
Service ke badalte rehne ke saath hum in Sharton ko update kar sakte hain. Ek naya version ek version number aur date ke saath publish kiya jaata hai. Agar koi change material hai, to Service continue karne se pehle hum aapse — aur, jis minor ke parent pehle hi consent de chuke hain, unke parent se — phir se acceptance maangenge.

19. Governing law aur dispute resolution
Yeh Sharten India ke kanoon dwara governed hain. [Specific court/jurisdiction aur dispute-resolution process abhi confirm hona hai — TO BE CONFIRMED.]

20. Grievance officer aur contact
In Sharton ke baare mein sawaal, ya Service ke baare mein complaints, hamare Contact page par diye gaye details use karke humein bheji ja sakti hain, jisme hamare grievance officer ka contact detail shaamil hai [TO BE CONFIRMED]।

21. Miscellaneous
Agar in Sharton ka koi hissa unenforceable paya jaata hai, to baaki Sharten effective rehti hain. Yeh Sharten, hamari Privacy Policy aur Risk Disclosure ke saath, Service ke regarding aapke aur Finlamma ke beech poora agreement hain.${TRANSLATION_NOTE_HX}`;

const PRIVACY_EN = `${PLACEHOLDER_NOTICE}PRIVACY POLICY

1. Introduction and scope
This Privacy Policy explains what personal data Finlamma collects, why, and what rights you — and, for a Minor, their parent or guardian — have over it. It covers the Finlamma mobile app, this website, and related services.

2. Who we are
Finlamma is operated by [legal entity name — TO BE CONFIRMED], acting as the "Data Fiduciary" under India's Digital Personal Data Protection Act, 2023 ("DPDP Act") for the personal data described below.

3. Information we collect
We collect: account information (your first name and last initial, email and/or phone number via our authentication provider, date of birth, and optionally your state, used only for an Arena leaderboard grouping and never shown on any public profile); for a Minor, your parent or guardian's email address and the record of their consent; learning and activity data (lessons and quizzes completed, XP and V Money earned, simulated trades and holdings, badges and streaks); your Doubt Zone questions and the AI-generated answers you receive; your device's push-notification token, if you enable notifications; and the usage/analytics events described in Section 8. We never ask for or collect payment card details ourselves — see Section 4.

4. What we do NOT collect
To be direct about this, because we know it matters to parents: Finlamma does not collect or store photos of you. We do not offer messaging or chat between learners, and do not show one learner's free-text writing to another learner. We do not record your screen or session activity. We do not collect your precise (GPS) location. And we do not collect or store your payment card or bank details — all payments are handled entirely by Apple or Google, and we never see your card number.

5. Doubt Zone: how your questions are handled
Your Doubt Zone conversations are private by default — visible only to you and to the AI system that answers them. However, every message is automatically screened by a safety check for signs of serious concern, such as anything suggesting self-harm or abuse or neglect, and a learner may also report a message. A message that is flagged this way, or reported, can be read by a small number of specifically trained staff with permission to moderate Doubt Zone content, so that a real safety concern can reach a human being. This is the only circumstance in which staff can read your Doubt Zone content, and every time a staff member does, that access is itself logged.

6. How we use your information
We use your information to provide and improve the Service — running lessons, trading simulations, Arena, and Doubt Zone; to operate the parental consent process; to send you, and where applicable your parent or guardian, required or opted-in communications; to keep the Service safe, including the safety check described above; and to understand, in aggregate, how the Service is used, as described in Section 8.

7. Legal basis for processing
[The specific legal basis for each kind of processing under the DPDP Act is TO BE CONFIRMED by legal review. In general, we intend to rely on consent — yours, and your parent/guardian's where you are a Minor — as our primary basis for processing, but this section will be completed, not assumed, before launch.]

8. Analytics, including before parental consent is complete
We use a product-analytics tool (PostHog, hosted in the EU) to understand, in aggregate, how people use Finlamma. These events are tied to an internal, randomly generated identifier, never your name, email, or date of birth, and are never used to target advertising at you.
This includes a small amount of tracking during onboarding, before a Minor's parental consent process is complete — specifically, which step of the sign-up/consent process was reached (for example, "date of birth entered" or "parent consent requested"), using the same internal-ID-only, no-personal-detail approach described above. We are telling you this plainly because we think you should know: this is the one piece of data processing that happens about a Minor before their parent has consented to anything else. It exists only to help us see where families drop out of sign-up, and is never used to advertise to or profile a child.

9. Push notifications
If you enable push notifications, we may send you a notification about things like a learning streak at risk of breaking, a lesson or "boss battle" reminder, a daily session goal, a cheer received from another learner, a league rank change (only when you move up, never down or sideways), or relevant market news. A notification never contains another learner's personal information, and you can turn notifications off entirely, or mute specific categories, in Settings.

10. Where your data is stored
Your data is stored in a Postgres database hosted by Supabase, in Supabase's Mumbai (India) region.

11. Who processes your data
We share data with the following service providers, each for a specific purpose, and only to the extent needed for that purpose: Clerk (authentication — sign-in and account identity); Anthropic (powers Doubt Zone's AI answers, and drafts AI-assisted news summaries and quiz questions that staff review before publishing, except Doubt Zone's own replies); PostHog, EU-hosted (anonymous, aggregate product analytics — Section 8); Upstash (caching, rate-limiting, and live-price delivery; does not store your personal profile data); Resend (sends transactional emails such as parental-consent and account notices); Vercel (hosts the Service); Twelve Data (supplies market price data; never receives your personal information); RevenueCat (manages subscription purchases made through Apple/Google; receives store purchase identifiers, never your payment card details); Expo (delivers push notifications to your device); and Sentry (error monitoring, to help us fix bugs; configured to avoid capturing personal content).

12. International data transfers
Some of the providers above — including Anthropic, PostHog, and RevenueCat — are located outside India, so using the Service involves transferring some data internationally to those providers, solely to provide the Service. [The specific cross-border-transfer disclosure required under the DPDP Act is TO BE CONFIRMED by legal review.]

13. Cookies and device identifiers
The Finlamma website and app do not use third-party advertising cookies. We use only what is necessary to keep you signed in and to generate the anonymous analytics identifiers described in Section 8.

14. Data retention
[How long we keep each category of data — account data, learning history, Doubt Zone messages, consent records, analytics events — is TO BE CONFIRMED by legal review. We will state specific retention periods here once they are actually decided; we are not guessing at them in the meantime.]

15. Data security
We take reasonable technical and organisational measures to protect your data, including storing sensitive tokens (such as consent links) in hashed form rather than in plain text, logging staff access to sensitive records, and applying database-level access controls. No system is completely secure, and we encourage you to keep your own account credentials confidential.

16. Your rights under the DPDP Act
Subject to the DPDP Act, you — or your parent/guardian on your behalf, if you are a Minor — have rights that are expected to include the right to access a summary of your personal data, to correct or update it, to withdraw consent, and to request erasure of your account. [The specific grievance-redressal process and response timelines required under the DPDP Act are TO BE CONFIRMED by legal review.] You can exercise these rights using the details on our Contact page.

17. Children's data and parental rights
If you are under 18, we require your parent or guardian's verifiable consent — given by clicking a confirmation link in an email we send them — before you get full access to the Service. They can withdraw that consent at any time using the withdraw-consent link in any email we send them; this works without needing to contact us, and immediately limits your account's access. A parent or guardian who wants their child's account deleted can request this through our support contact today; a fully self-service parental deletion flow is planned but not yet built.

18. Account deletion and anonymisation
When an account is deleted, we clear personal fields — name, email, phone, date of birth, bio — rather than deleting the row outright, so that ledger, trading, and leaderboard history relied on by other parts of the Service stays accurate for everyone else. We keep a minimal, non-identifying record that consent was once given, so we can prove it was without keeping the parent's actual email address. See Section 14 for how long.

19. Changes to this policy
We may update this Privacy Policy as the Service changes. A new version is published with a version number and date, and we will ask you — and, for a Minor whose parent has already consented, their parent — to re-accept it if a change is material.

20. Grievance officer and contact
Questions, concerns, or complaints about how we handle your data can be sent to our grievance/privacy contact listed on our Contact page [name and contact details TO BE CONFIRMED].

21. Governing law
This Policy is governed by the laws of India, including the DPDP Act. [The specific jurisdiction is TO BE CONFIRMED.]`;

const PRIVACY_HI = `${PLACEHOLDER_NOTICE}गोपनीयता नीति

1. परिचय और दायरा
यह गोपनीयता नीति बताती है कि Finlamma कौन सा व्यक्तिगत डेटा एकत्र करता है, क्यों, और उस पर आपके — और नाबालिग के मामले में, उनके माता-पिता/अभिभावक के — क्या अधिकार हैं। यह Finlamma मोबाइल ऐप, इस वेबसाइट, और संबंधित सेवाओं को कवर करती है।

2. हम कौन हैं
Finlamma का संचालन [कानूनी संस्था का नाम — TO BE CONFIRMED] द्वारा किया जाता है, जो नीचे बताए गए व्यक्तिगत डेटा के लिए भारत के डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 ("DPDP अधिनियम") के अंतर्गत "डेटा फिड्यूशियरी" के रूप में कार्य करता है।

3. हम कौन सी जानकारी एकत्र करते हैं
हम एकत्र करते हैं: खाता जानकारी (आपका पहला नाम और अंतिम अक्षर, हमारे प्रमाणीकरण प्रदाता के माध्यम से ईमेल और/या फोन नंबर, जन्मतिथि, और वैकल्पिक रूप से आपका राज्य — केवल Arena लीडरबोर्ड ग्रुपिंग के लिए उपयोग होता है, कभी किसी सार्वजनिक प्रोफ़ाइल पर नहीं दिखाया जाता); नाबालिग के मामले में, आपके माता-पिता/अभिभावक का ईमेल पता और उनकी सहमति का रिकॉर्ड; सीखने और गतिविधि का डेटा (पूरे किए गए पाठ और क्विज़, अर्जित XP और V Money, सिम्युलेटेड ट्रेड और होल्डिंग्स, बैज और स्ट्रीक); आपके Doubt Zone के सवाल और उन पर मिले AI-जनित उत्तर; यदि आप नोटिफिकेशन सक्षम करते हैं तो आपके डिवाइस का पुश-नोटिफिकेशन टोकन; और खंड 8 में बताई गई उपयोग/एनालिटिक्स इवेंट्स। हम कभी भी स्वयं आपके पेमेंट कार्ड की जानकारी नहीं मांगते या एकत्र नहीं करते — देखें खंड 4।

4. हम क्या नहीं एकत्र करते
इस बारे में साफ़ रहने के लिए, क्योंकि हम जानते हैं कि यह माता-पिता के लिए महत्वपूर्ण है: Finlamma आपकी तस्वीरें एकत्र या संग्रहित नहीं करता। हम सीखने वालों के बीच मैसेजिंग या चैट की सुविधा नहीं देते, और किसी एक सीखने वाले का फ्री-टेक्स्ट लेखन किसी दूसरे सीखने वाले को नहीं दिखाते। हम आपकी स्क्रीन या सेशन गतिविधि रिकॉर्ड नहीं करते। हम आपका सटीक (GPS) लोकेशन एकत्र नहीं करते। और हम आपके पेमेंट कार्ड या बैंक विवरण एकत्र या संग्रहित नहीं करते — सभी भुगतान पूरी तरह से Apple या Google द्वारा संभाले जाते हैं, और हम कभी आपका कार्ड नंबर नहीं देखते।

5. Doubt Zone: आपके सवालों को कैसे संभाला जाता है
आपकी Doubt Zone बातचीत डिफ़ॉल्ट रूप से निजी होती है — केवल आपको और उत्तर देने वाले AI सिस्टम को दिखाई देती है। हालांकि, हर संदेश की स्वचालित रूप से एक सुरक्षा जांच होती है, जो गंभीर चिंता के संकेतों — जैसे आत्म-हानि, दुर्व्यवहार या उपेक्षा का कोई संकेत — की जांच करती है, और कोई सीखने वाला किसी संदेश की रिपोर्ट भी कर सकता है। इस तरह फ्लैग किया गया, या रिपोर्ट किया गया संदेश, Doubt Zone कंटेंट की मॉडरेशन की विशेष अनुमति रखने वाले कुछ प्रशिक्षित स्टाफ सदस्यों द्वारा पढ़ा जा सकता है, ताकि कोई असली सुरक्षा चिंता किसी इंसान तक पहुंच सके। यह एकमात्र स्थिति है जिसमें स्टाफ आपका Doubt Zone कंटेंट पढ़ सकता है, और जब भी कोई स्टाफ सदस्य ऐसा करता है, वह एक्सेस स्वयं दर्ज (लॉग) किया जाता है।

6. हम आपकी जानकारी का उपयोग कैसे करते हैं
हम आपकी जानकारी का उपयोग सेवा — पाठ, ट्रेडिंग सिमुलेशन, Arena, और Doubt Zone — को चलाने और बेहतर बनाने के लिए करते हैं; माता-पिता की सहमति प्रक्रिया चलाने के लिए; आपको, और लागू होने पर आपके माता-पिता/अभिभावक को, आवश्यक या ऑप्ट-इन संचार भेजने के लिए; सेवा को सुरक्षित रखने के लिए, जिसमें ऊपर बताई गई सुरक्षा जांच शामिल है; और समग्र रूप से यह समझने के लिए कि सेवा का उपयोग कैसे किया जाता है (खंड 8 देखें)।

7. प्रक्रिया के लिए कानूनी आधार
[DPDP अधिनियम के अंतर्गत प्रत्येक प्रकार की प्रक्रिया के लिए विशिष्ट कानूनी आधार कानूनी समीक्षा द्वारा TO BE CONFIRMED है। सामान्यतः, हमारा इरादा सहमति — आपकी, और नाबालिग होने पर आपके माता-पिता/अभिभावक की — को प्रक्रिया के लिए हमारा प्राथमिक आधार मानने का है, लेकिन लॉन्च से पहले इस खंड को मान लेने के बजाय पूरी तरह तय किया जाएगा।]

8. एनालिटिक्स, जिसमें माता-पिता की सहमति पूरी होने से पहले का डेटा भी शामिल है
हम यह समझने के लिए कि लोग Finlamma का उपयोग कैसे करते हैं, एक प्रोडक्ट-एनालिटिक्स टूल (PostHog, EU में होस्ट किया गया) का उपयोग करते हैं, केवल समग्र रूप से। ये इवेंट्स एक इंटरनल, रैंडम रूप से जनरेट की गई आईडी से जुड़े होते हैं, कभी भी आपके नाम, ईमेल, या जन्मतिथि से नहीं, और कभी भी आप पर विज्ञापन लक्षित करने के लिए उपयोग नहीं किए जाते।
इसमें ऑनबोर्डिंग के दौरान, नाबालिग की माता-पिता सहमति प्रक्रिया पूरी होने से पहले की थोड़ी मात्रा में ट्रैकिंग भी शामिल है — विशेष रूप से, साइन-अप/सहमति प्रक्रिया का कौन सा चरण पूरा हुआ (उदाहरण के लिए "जन्मतिथि दर्ज की गई" या "माता-पिता की सहमति मांगी गई"), ऊपर बताए गए उसी इंटरनल-आईडी-केवल, कोई व्यक्तिगत विवरण नहीं वाले तरीके से। हम यह स्पष्ट रूप से आपको बता रहे हैं क्योंकि हमें लगता है कि आपको यह जानना चाहिए: यह एकमात्र डेटा प्रोसेसिंग है जो किसी नाबालिग के बारे में उनके माता-पिता की किसी भी अन्य चीज़ के लिए सहमति देने से पहले होती है। यह केवल यह देखने में हमारी मदद करने के लिए है कि परिवार साइन-अप प्रक्रिया में कहां छोड़ते हैं, और इसका उपयोग कभी भी किसी बच्चे को विज्ञापन दिखाने या उसकी प्रोफाइलिंग करने के लिए नहीं किया जाता।

9. पुश नोटिफिकेशन
यदि आप पुश नोटिफिकेशन सक्षम करते हैं, तो हम आपको ऐसी चीज़ों के बारे में नोटिफिकेशन भेज सकते हैं जैसे टूटने के जोखिम में एक लर्निंग स्ट्रीक, कोई पाठ या "बॉस बैटल" रिमाइंडर, एक दैनिक सेशन लक्ष्य, किसी अन्य सीखने वाले से मिला चीयर, एक लीग रैंक परिवर्तन (केवल जब आप ऊपर जाते हैं, कभी नीचे या बराबर नहीं), या संबंधित मार्केट न्यूज़। किसी नोटिफिकेशन में कभी भी किसी अन्य सीखने वाले की व्यक्तिगत जानकारी नहीं होती, और आप सेटिंग्स में नोटिफिकेशन पूरी तरह बंद कर सकते हैं, या विशेष श्रेणियों को म्यूट कर सकते हैं।

10. आपका डेटा कहां संग्रहित है
आपका डेटा Supabase द्वारा होस्ट किए गए एक Postgres डेटाबेस में, Supabase के मुंबई (भारत) क्षेत्र में संग्रहित है।

11. आपके डेटा को कौन प्रोसेस करता है
हम निम्नलिखित सेवा प्रदाताओं के साथ डेटा साझा करते हैं, प्रत्येक एक विशिष्ट उद्देश्य के लिए, और केवल उस उद्देश्य के लिए आवश्यक सीमा तक: Clerk (प्रमाणीकरण — साइन-इन और खाता पहचान); Anthropic (Doubt Zone के AI उत्तरों को शक्ति देता है, और AI-सहायता प्राप्त न्यूज़ सारांश तथा क्विज़ प्रश्नों का मसौदा तैयार करता है जिनकी स्टाफ द्वारा प्रकाशन से पहले समीक्षा की जाती है, Doubt Zone के अपने उत्तरों को छोड़कर); PostHog, EU में होस्ट (गुमनाम, समग्र प्रोडक्ट एनालिटिक्स — खंड 8); Upstash (कैशिंग, रेट-लिमिटिंग, और लाइव-प्राइस डिलीवरी; आपका व्यक्तिगत प्रोफाइल डेटा संग्रहित नहीं करता); Resend (ट्रांजैक्शनल ईमेल भेजता है जैसे माता-पिता की सहमति और खाता सूचनाएं); Vercel (सेवा को होस्ट करता है); Twelve Data (मार्केट प्राइस डेटा प्रदान करता है; आपकी व्यक्तिगत जानकारी कभी नहीं प्राप्त करता); RevenueCat (Apple/Google के माध्यम से की गई सब्सक्रिप्शन खरीद का प्रबंधन करता है; स्टोर खरीद पहचानकर्ता प्राप्त करता है, आपके पेमेंट कार्ड विवरण कभी नहीं); Expo (आपके डिवाइस पर पुश नोटिफिकेशन डिलीवर करता है); और Sentry (एरर मॉनिटरिंग, बग ठीक करने में मदद के लिए; व्यक्तिगत कंटेंट कैप्चर न करने के लिए कॉन्फ़िगर किया गया)।

12. अंतरराष्ट्रीय डेटा स्थानांतरण
ऊपर बताए गए कुछ प्रदाता — जिनमें Anthropic, PostHog, और RevenueCat शामिल हैं — भारत के बाहर स्थित हैं, इसलिए सेवा का उपयोग करने में सेवा प्रदान करने के उद्देश्य से ही उन प्रदाताओं को कुछ डेटा अंतरराष्ट्रीय स्तर पर स्थानांतरित करना शामिल है। [DPDP अधिनियम के अंतर्गत आवश्यक विशिष्ट क्रॉस-बॉर्डर-ट्रांसफर प्रकटीकरण कानूनी समीक्षा द्वारा TO BE CONFIRMED है।]

13. कुकीज़ और डिवाइस पहचानकर्ता
Finlamma वेबसाइट और ऐप तीसरे पक्ष के विज्ञापन कुकीज़ का उपयोग नहीं करते। हम केवल वही उपयोग करते हैं जो आपको साइन-इन रखने और खंड 8 में बताए गए गुमनाम एनालिटिक्स पहचानकर्ता जनरेट करने के लिए आवश्यक है।

14. डेटा प्रतिधारण (Retention)
[हम डेटा की प्रत्येक श्रेणी — खाता डेटा, सीखने का इतिहास, Doubt Zone संदेश, सहमति रिकॉर्ड, एनालिटिक्स इवेंट्स — को कितने समय तक रखते हैं, यह कानूनी समीक्षा द्वारा TO BE CONFIRMED है। वास्तव में तय होने के बाद ही हम यहां विशिष्ट प्रतिधारण अवधि बताएंगे; इस बीच हम अनुमान नहीं लगा रहे हैं।]

15. डेटा सुरक्षा
हम आपके डेटा की सुरक्षा के लिए उचित तकनीकी और संगठनात्मक उपाय करते हैं, जिसमें संवेदनशील टोकन (जैसे सहमति लिंक) को प्लेन टेक्स्ट के बजाय हैश्ड रूप में संग्रहित करना, संवेदनशील रिकॉर्ड तक स्टाफ की पहुंच को लॉग करना, और डेटाबेस-स्तर की एक्सेस नियंत्रण लागू करना शामिल है। कोई भी सिस्टम पूरी तरह सुरक्षित नहीं होता, और हम आपको अपने खाते की जानकारी गोपनीय रखने के लिए प्रोत्साहित करते हैं।

16. DPDP अधिनियम के अंतर्गत आपके अधिकार
DPDP अधिनियम के अधीन, आपको — या, नाबालिग होने पर आपकी ओर से आपके माता-पिता/अभिभावक को — ऐसे अधिकार मिलने की उम्मीद है जिनमें आपके व्यक्तिगत डेटा का सारांश देखने, उसे सही या अपडेट करने, सहमति वापस लेने, और अपना खाता मिटाने का अनुरोध करने का अधिकार शामिल है। [DPDP अधिनियम के अंतर्गत आवश्यक विशिष्ट शिकायत-निवारण प्रक्रिया और प्रतिक्रिया समय-सीमा कानूनी समीक्षा द्वारा TO BE CONFIRMED है।] आप हमारे Contact पेज पर दिए गए विवरण का उपयोग करके इन अधिकारों का प्रयोग कर सकते हैं।

17. बच्चों का डेटा और माता-पिता के अधिकार
यदि आपकी उम्र 18 वर्ष से कम है, तो पूरी सेवा तक आपकी पहुंच से पहले हमें आपके माता-पिता/अभिभावक की सत्यापित सहमति चाहिए — जो हमारे भेजे ईमेल में एक पुष्टिकरण लिंक पर क्लिक करके दी जाती है। वे हमारे भेजे किसी भी ईमेल में दिए withdraw-consent लिंक से किसी भी समय वह सहमति वापस ले सकते हैं; यह हमसे संपर्क किए बिना काम करता है, और तुरंत आपके खाते की पहुंच को सीमित कर देता है। जो माता-पिता/अभिभावक अपने बच्चे का खाता हटाना चाहते हैं, वे आज हमारे सपोर्ट संपर्क के माध्यम से इसका अनुरोध कर सकते हैं; एक पूरी तरह सेल्फ-सर्विस पैरेंटल डिलीशन प्रक्रिया की योजना है लेकिन अभी बनाई नहीं गई है।

18. खाता हटाना और गुमनामीकरण
जब कोई खाता हटाया जाता है, तो हम व्यक्तिगत फ़ील्ड — नाम, ईमेल, फोन, जन्मतिथि, बायो — को साफ़ कर देते हैं, बजाय पूरी रो को हटाने के, ताकि लेज़र, ट्रेडिंग, और लीडरबोर्ड इतिहास, जिस पर सेवा के अन्य हिस्से निर्भर करते हैं, बाकी सभी के लिए सही बना रहे। हम एक न्यूनतम, गैर-पहचान योग्य रिकॉर्ड रखते हैं कि सहमति एक बार दी गई थी, ताकि हम माता-पिता का असली ईमेल पता रखे बिना यह साबित कर सकें कि यह दी गई थी। यह कितने समय के लिए है, देखें खंड 14।

19. इस नीति में बदलाव
सेवा के बदलने के साथ हम इस गोपनीयता नीति को अपडेट कर सकते हैं। एक नया वर्शन एक वर्शन नंबर और तारीख़ के साथ प्रकाशित किया जाता है, और यदि कोई बदलाव महत्वपूर्ण है, तो हम आपसे — और, जिस नाबालिग के माता-पिता पहले ही सहमति दे चुके हैं, उनके माता-पिता से — फिर से स्वीकृति मांगेंगे।

20. शिकायत अधिकारी और संपर्क
हम आपका डेटा कैसे संभालते हैं इस पर सवाल, चिंता, या शिकायतें हमारे Contact पेज पर सूचीबद्ध हमारे शिकायत/गोपनीयता संपर्क को भेजी जा सकती हैं [नाम और संपर्क विवरण TO BE CONFIRMED]।

21. शासकीय कानून
यह नीति भारत के कानूनों, जिनमें DPDP अधिनियम शामिल है, द्वारा शासित है। [विशिष्ट क्षेत्राधिकार TO BE CONFIRMED है।]${TRANSLATION_NOTE_HI}`;

const PRIVACY_HX = `${PLACEHOLDER_NOTICE}PRIVACY POLICY (Gopniyata Niti)

1. Introduction aur scope
Yeh Privacy Policy batati hai ki Finlamma kaunsa personal data collect karta hai, kyun, aur uspar aapke — aur, minor ke case mein, unke parent/guardian ke — kya rights hain. Yeh Finlamma mobile app, is website, aur related services ko cover karti hai.

2. Hum kaun hain
Finlamma ko [legal entity ka naam — TO BE CONFIRMED] operate karta hai, jo neeche bataye gaye personal data ke liye India ke Digital Personal Data Protection Act, 2023 ("DPDP Act") ke under "Data Fiduciary" ki tarah kaam karta hai.

3. Hum kaunsi information collect karte hain
Hum collect karte hain: account information (aapka first name aur last initial, hamare authentication provider ke through email aur/ya phone number, date of birth, aur optionally aapka state — sirf Arena leaderboard grouping ke liye use hota hai, kabhi kisi public profile par nahi dikhaya jaata); minor ke case mein, aapke parent/guardian ka email address aur unki consent ka record; learning aur activity data (complete kiye gaye lessons aur quizzes, earned XP aur V Money, simulated trades aur holdings, badges aur streaks); aapke Doubt Zone questions aur unpar mile AI-generated answers; agar aap notifications enable karte hain to aapke device ka push-notification token; aur Section 8 mein bataye gaye usage/analytics events. Hum kabhi khud aapke payment card ki details nahi maangte ya collect nahi karte — dekhein Section 4.

4. Hum kya NAHI collect karte
Iske baare mein direct rehne ke liye, kyunki hum jaante hain ki yeh parents ke liye matter karta hai: Finlamma aapki photos collect ya store nahi karta. Hum learners ke beech messaging ya chat ki facility nahi dete, aur ek learner ka free-text likha hua kabhi doosre learner ko nahi dikhate. Hum aapki screen ya session activity record nahi karte. Hum aapki precise (GPS) location collect nahi karte. Aur hum aapke payment card ya bank details collect ya store nahi karte — saare payments poori tarah Apple ya Google dwara handle kiye jaate hain, aur hum kabhi aapka card number nahi dekhte.

5. Doubt Zone: aapke questions kaise handle hote hain
Aapki Doubt Zone conversations default rup se private hoti hain — sirf aapko aur answer dene wale AI system ko dikhayi deti hain. Lekin, har message ki automatically ek safety check hoti hai, jo serious concern ke signs — jaise self-harm, abuse ya neglect ka koi signal — check karti hai, aur koi learner kisi message ko report bhi kar sakta hai. Is tarah flag kiya gaya, ya report kiya gaya message, Doubt Zone content moderate karne ki special permission rakhne wale kuch trained staff members dwara padha ja sakta hai, taaki koi real safety concern kisi insaan tak pahunch sake. Yeh ek hi situation hai jisme staff aapka Doubt Zone content padh sakta hai, aur jab bhi koi staff member aisa karta hai, woh access khud log kiya jaata hai.

6. Hum aapki information ka use kaise karte hain
Hum aapki information ka use Service — lessons, trading simulation, Arena, aur Doubt Zone — chalaane aur behtar banaane ke liye karte hain; parental consent process chalaane ke liye; aapko, aur applicable hone par aapke parent/guardian ko, zaroori ya opt-in communications bhejne ke liye; Service ko safe rakhne ke liye, jisme upar bataya gaya safety check shaamil hai; aur yeh samajhne ke liye ki Service ka use overall kaise hota hai (Section 8 dekhein).

7. Processing ke liye legal basis
[DPDP Act ke under har tarah ki processing ke liye specific legal basis legal review dwara TO BE CONFIRMED hai. General tarike se, hamara intention consent — aapki, aur minor hone par aapke parent/guardian ki — ko processing ke liye hamara primary basis maanne ka hai, lekin launch se pehle is section ko assume karne ke bajaay poori tarah decide kiya jaayega.]

8. Analytics, jisme parental consent complete hone se pehle ka data bhi shaamil hai
Yeh samajhne ke liye ki log Finlamma ka use kaise karte hain, hum ek product-analytics tool (PostHog, EU mein hosted) use karte hain, sirf overall/aggregate tarike se. Yeh events ek internal, randomly generate ki gayi ID se linked hote hain, kabhi aapke naam, email, ya date of birth se nahi, aur kabhi bhi aap par advertising target karne ke liye use nahi kiye jaate.
Isme onboarding ke time, minor ke parental consent process complete hone se pehle ki thodi tracking bhi shaamil hai — specifically, sign-up/consent process ka kaunsa step reach hua (jaise "date of birth entered" ya "parent consent requested"), upar bataye gaye usi internal-ID-only, no-personal-detail tarike se. Hum yeh clearly aapko bata rahe hain kyunki hamein lagta hai aapko yeh jaanna chahiye: yeh ek hi data processing hai jo kisi minor ke baare mein unke parent ki kisi aur cheez ke liye consent dene se pehle hoti hai. Yeh sirf yeh dekhne mein hamari help karne ke liye hai ki families sign-up process mein kahan drop karti hain, aur kisi bachche ko advertise karne ya uski profiling karne ke liye kabhi use nahi hota.

9. Push notifications
Agar aap push notifications enable karte hain, to hum aapko aisi cheezon ke baare mein notification bhej sakte hain jaise toot sakne ke risk mein ek learning streak, koi lesson ya "boss battle" reminder, ek daily session goal, kisi doosre learner se mila cheer, ek league rank change (sirf jab aap upar jaate hain, kabhi neeche ya same nahi), ya related market news. Kisi notification mein kabhi kisi doosre learner ki personal information nahi hoti, aur aap Settings mein notifications poori tarah band kar sakte hain, ya specific categories mute kar sakte hain.

10. Aapka data kahan store hai
Aapka data Supabase dwara hosted ek Postgres database mein, Supabase ke Mumbai (India) region mein store hai.

11. Aapka data kaun process karta hai
Hum neeche diye gaye service providers ke saath data share karte hain, har ek ek specific purpose ke liye, aur sirf us purpose ke liye zaroori extent tak: Clerk (authentication — sign-in aur account identity); Anthropic (Doubt Zone ke AI answers ko power deta hai, aur AI-assisted news summaries aur quiz questions ka draft banata hai jinki staff publish karne se pehle review karta hai, Doubt Zone ke apne replies ko chhod kar); PostHog, EU-hosted (anonymous, aggregate product analytics — Section 8); Upstash (caching, rate-limiting, aur live-price delivery; aapka personal profile data store nahi karta); Resend (transactional emails bhejta hai jaise parental-consent aur account notices); Vercel (Service ko host karta hai); Twelve Data (market price data supply karta hai; aapki personal information kabhi nahi paata); RevenueCat (Apple/Google ke through hui subscription purchases manage karta hai; store purchase identifiers paata hai, aapke payment card details kabhi nahi); Expo (aapke device par push notifications deliver karta hai); aur Sentry (error monitoring, bugs fix karne mein help ke liye; personal content capture na karne ke liye configured).

12. International data transfers
Upar bataye gaye kuch providers — jinme Anthropic, PostHog, aur RevenueCat shaamil hain — India ke bahar located hain, isliye Service use karne mein, sirf Service dene ke purpose se, kuch data un providers ko internationally transfer karna shaamil hai. [DPDP Act ke under zaroori specific cross-border-transfer disclosure legal review dwara TO BE CONFIRMED hai.]

13. Cookies aur device identifiers
Finlamma website aur app third-party advertising cookies use nahi karte. Hum sirf wahi use karte hain jo aapko signed-in rakhne aur Section 8 mein bataye gaye anonymous analytics identifiers generate karne ke liye zaroori hai.

14. Data retention
[Hum har category ke data — account data, learning history, Doubt Zone messages, consent records, analytics events — ko kitne time tak rakhte hain, yeh legal review dwara TO BE CONFIRMED hai. Jab yeh actually decide ho jaayega, tabhi hum yahan specific retention periods batayenge; is beech hum guess nahi kar rahe hain.]

15. Data security
Hum aapke data ki suraksha ke liye reasonable technical aur organisational measures lete hain, jisme sensitive tokens (jaise consent links) ko plain text ke bajaay hashed form mein store karna, sensitive records tak staff ki access ko log karna, aur database-level access controls lagaana shaamil hai. Koi bhi system poori tarah secure nahi hota, aur hum aapko apne account credentials confidential rakhne ke liye encourage karte hain.

16. DPDP Act ke under aapke rights
DPDP Act ke subject, aapko — ya, minor hone par aapki taraf se aapke parent/guardian ko — un rights milne ki expectation hai jinme aapke personal data ka summary dekhne, use correct ya update karne, consent withdraw karne, aur apna account erase karne ki request karne ka right shaamil hai. [DPDP Act ke under zaroori specific grievance-redressal process aur response timelines legal review dwara TO BE CONFIRMED hain.] Aap hamare Contact page par diye details use karke yeh rights exercise kar sakte hain.

17. Bachchon ka data aur parental rights
Agar aapki age 18 saal se kam hai, to full Service access milne se pehle humein aapke parent/guardian ki verifiable consent chahiye — jo hamare bheje email mein ek confirmation link par click karke di jaati hai. Woh hamare bheje kisi bhi email mein diye withdraw-consent link se kisi bhi time woh consent withdraw kar sakte hain; yeh humse contact kiye bina kaam karta hai, aur turant aapke account ki access limit kar deta hai. Jo parent/guardian apne bachche ka account delete karana chahte hain, woh aaj hamare support contact ke through iski request kar sakte hain; ek poori tarah self-service parental deletion flow plan mein hai lekin abhi banaya nahi gaya hai.

18. Account delete karna aur anonymisation
Jab koi account delete hota hai, to hum personal fields — naam, email, phone, date of birth, bio — ko clear kar dete hain, poori row delete karne ke bajaay, taaki ledger, trading, aur leaderboard history, jispar Service ke doosre hisse depend karte hain, baaki sabke liye accurate rahe. Hum ek minimal, non-identifying record rakhte hain ki consent ek baar di gayi thi, taaki hum parent ka actual email address rakhe bina yeh prove kar sakein ki yeh di gayi thi. Yeh kitne time ke liye hai, dekhein Section 14.

19. Is policy mein changes
Service ke badalte rehne ke saath hum is Privacy Policy ko update kar sakte hain. Ek naya version ek version number aur date ke saath publish kiya jaata hai, aur agar koi change material hai, to hum aapse — aur, jis minor ke parent pehle hi consent de chuke hain, unke parent se — phir se acceptance maangenge.

20. Grievance officer aur contact
Hum aapka data kaise handle karte hain, iske baare mein sawaal, concerns, ya complaints hamare Contact page par listed hamare grievance/privacy contact ko bheji ja sakti hain [naam aur contact details TO BE CONFIRMED].

21. Governing law
Yeh Policy India ke kanoon, jisme DPDP Act shaamil hai, dwara governed hai. [Specific jurisdiction TO BE CONFIRMED hai.]${TRANSLATION_NOTE_HX}`;

const RISK_EN = `${PLACEHOLDER_NOTICE}RISK DISCLOSURE

1. Purpose of this disclosure
This page explains, in plain language, what Finlamma is and is not. Please read it before you — or, if you are a parent or guardian, before your child — start using the app. If anything here is unclear, contact us using the details on our Contact page before relying on the app for anything financial.

2. All trading in Finlamma is simulated. No real money is ever involved.
Every "trade" you place in Finlamma — buying or selling a stock, investing in a mutual fund, running a SIP — is made with Finlamma's own virtual currency, "V Money." V Money is not real money. It cannot be deposited, withdrawn, converted to cash, transferred to a bank account, or exchanged for anything of real-world value, under any circumstances. No real brokerage account, demat account, or stock exchange order is ever created on your behalf. Nothing you do inside Finlamma results in a real purchase or sale of any real security.

3. Finlamma is not an investment adviser, and nothing in the app is investment advice.
Finlamma, and the entity that operates it, is not registered with the Securities and Exchange Board of India (SEBI) as an investment adviser, research analyst, or any other regulated market intermediary. Nothing in the app — including lesson content, quiz questions, news summaries, mentor commentary, Doubt Zone answers, or any other feature — is or should be understood as a personal recommendation to buy, sell, or hold any real security, mutual fund, or other financial product. Finlamma does not know your (or your child's) real financial circumstances and is not in a position to advise on them. Decisions about real money and real investments should be made with a qualified, SEBI-registered professional.

4. Some content is drafted or assisted by artificial intelligence.
Certain content in Finlamma — including simplified news summaries and some quiz questions — starts as a draft generated by an AI system and is reviewed by a staff member before it is shown to learners. Doubt Zone, the in-app question feature, uses an AI system to generate answers directly; these answers are designed to stay educational and are automatically screened to avoid anything that resembles personal investment advice, but AI-generated text can still be wrong, incomplete, or oddly phrased. Treat anything an AI-generated feature tells you as a starting point for learning, never as a final answer, and never as advice about a specific real-world financial decision.

5. Market data may be delayed, simulated, or limited, and is not guaranteed to be accurate.
Prices, charts, and other market information shown in Finlamma come from third-party data providers and may be delayed, incomplete, or occasionally wrong. When a market is closed, Finlamma shows the last available real closing price — it never invents or simulates price movement to make the app feel "live." Even so, nothing displayed in the app should be relied on as an accurate, real-time, or complete picture of any real market, and Finlamma is not responsible for decisions made outside the app based on what you saw inside it.

6. Performance inside Finlamma does not predict performance in real markets.
Doing well at simulated trading in Finlamma — making a profit in V Money, climbing a leaderboard, winning an Arena competition — does not mean a real investment would have performed the same way, and does not qualify anyone to trade or invest with real money. Real markets involve real risk, including the risk of losing money, that a simulation with no real money at stake cannot fully teach or replicate.

7. Virtual currency, badges, titles, and prizes have no real-world value.
V Money, badges, titles, and any prize awarded through Arena competitions or other in-app events are virtual, Finlamma-only rewards. They are not currency, securities, gift cards, or anything redeemable for cash, goods, or services outside the app, and never will be without a separate, clearly-announced change to these Terms.

8. A note on real investing risk.
Although nothing in Finlamma involves real money, part of its educational purpose is to help you understand that real investing carries real risk — including the risk of losing some or all of the money invested — and that past performance of any real investment is never a guarantee of future results. Nothing in the app should be read as minimizing that risk.

9. Limitation of liability
Finlamma is provided for educational purposes on an "as is" basis. To the fullest extent permitted by law, Finlamma and the entity that operates it are not liable for any loss or damage arising from reliance on content, market data, or AI-generated output within the app, or from any real-world financial decision made in connection with using the app.

10. Acknowledgement
By using Finlamma, you — or, for a Minor, their parent or guardian on their behalf, as part of parental consent — acknowledge that you have read and understood this Risk Disclosure, and in particular that all trading in the app is simulated, uses no real money, and is not investment advice.`;

const RISK_HI = `${PLACEHOLDER_NOTICE}जोखिम प्रकटीकरण

1. इस प्रकटीकरण का उद्देश्य
यह पृष्ठ सरल भाषा में बताता है कि Finlamma क्या है और क्या नहीं है। कृपया इसे पढ़ें इससे पहले कि आप — या, यदि आप माता-पिता/अभिभावक हैं, तो आपका बच्चा — ऐप का उपयोग शुरू करे। यदि यहां कुछ भी अस्पष्ट है, तो किसी भी वित्तीय मामले के लिए ऐप पर निर्भर होने से पहले हमारे Contact पेज पर दिए विवरण से हमसे संपर्क करें।

2. Finlamma में सभी ट्रेडिंग सिम्युलेटेड है। इसमें कभी असली पैसा शामिल नहीं होता।
Finlamma में आपके द्वारा किया गया हर "ट्रेड" — कोई स्टॉक खरीदना या बेचना, किसी म्यूचुअल फंड में निवेश करना, SIP चलाना — Finlamma की अपनी वर्चुअल करेंसी, "V Money" से किया जाता है। V Money असली पैसा नहीं है। इसे किसी भी परिस्थिति में जमा, निकाला, नकद में बदला, बैंक खाते में ट्रांसफर, या किसी असली-दुनिया मूल्य वाली चीज़ से नहीं बदला जा सकता। आपकी ओर से कभी कोई असली ब्रोकरेज खाता, डीमैट खाता, या स्टॉक एक्सचेंज ऑर्डर नहीं बनाया जाता। Finlamma के भीतर आप जो भी करते हैं, उसका परिणाम किसी असली सिक्योरिटी की असली खरीद या बिक्री नहीं होता।

3. Finlamma एक इन्वेस्टमेंट एडवाइज़र नहीं है, और ऐप में कुछ भी इन्वेस्टमेंट एडवाइस नहीं है।
Finlamma, और इसे संचालित करने वाली संस्था, भारतीय प्रतिभूति और विनिमय बोर्ड (SEBI) के पास इन्वेस्टमेंट एडवाइज़र, रिसर्च एनालिस्ट, या किसी अन्य रेगुलेटेड मार्केट इंटरमीडियरी के रूप में पंजीकृत नहीं है। ऐप में कुछ भी — पाठ सामग्री, क्विज़ प्रश्न, न्यूज़ सारांश, मेंटर की टिप्पणियां, Doubt Zone के उत्तर, या कोई अन्य सुविधा — किसी असली सिक्योरिटी, म्यूचुअल फंड, या अन्य वित्तीय उत्पाद को खरीदने, बेचने, या रखने की व्यक्तिगत सलाह नहीं है और न ही इसे ऐसा समझा जाना चाहिए। Finlamma आपकी (या आपके बच्चे की) असली वित्तीय स्थिति नहीं जानता और उस पर सलाह देने की स्थिति में नहीं है। असली पैसे और असली निवेश के फैसले एक योग्य, SEBI-पंजीकृत पेशेवर के साथ लिए जाने चाहिए।

4. कुछ कंटेंट आर्टिफिशियल इंटेलिजेंस द्वारा तैयार या सहायता प्राप्त है।
Finlamma में कुछ कंटेंट — सरल की गई न्यूज़ सारांश और कुछ क्विज़ प्रश्न शामिल — एक AI सिस्टम द्वारा जनरेट किए गए मसौदे के रूप में शुरू होता है और सीखने वालों को दिखाने से पहले स्टाफ सदस्य द्वारा समीक्षा की जाती है। Doubt Zone, इन-ऐप प्रश्न सुविधा, सीधे उत्तर जनरेट करने के लिए एक AI सिस्टम का उपयोग करती है; ये उत्तर शैक्षिक बने रहने के लिए डिज़ाइन किए गए हैं और व्यक्तिगत इन्वेस्टमेंट एडवाइस जैसी किसी भी चीज़ से बचने के लिए स्वचालित रूप से स्क्रीन किए जाते हैं, लेकिन AI-जनित टेक्स्ट फिर भी गलत, अधूरा, या अजीब तरह से लिखा जा सकता है। किसी भी AI-जनित सुविधा द्वारा बताई गई बात को सीखने की शुरुआत मानें, कभी अंतिम उत्तर नहीं, और कभी किसी विशेष असली-दुनिया के वित्तीय फैसले के बारे में सलाह नहीं।

5. मार्केट डेटा विलंबित, सिम्युलेटेड, या सीमित हो सकता है, और इसकी सटीकता की गारंटी नहीं है।
Finlamma में दिखाई गई कीमतें, चार्ट, और अन्य मार्केट जानकारी तीसरे पक्ष के डेटा प्रदाताओं से आती है और विलंबित, अधूरी, या कभी-कभी गलत हो सकती है। जब बाज़ार बंद होता है, तो Finlamma अंतिम उपलब्ध असली क्लोज़िंग कीमत दिखाता है — यह ऐप को "लाइव" महसूस कराने के लिए कभी भी कीमत की हलचल को नहीं बनाता या सिम्युलेट नहीं करता। फिर भी, ऐप में दिखाई गई किसी भी चीज़ को किसी असली बाज़ार की सटीक, रीयल-टाइम, या संपूर्ण तस्वीर के रूप में नहीं लिया जाना चाहिए, और ऐप के बाहर ऐप में देखी गई किसी बात के आधार पर लिए गए फैसलों के लिए Finlamma ज़िम्मेदार नहीं है।

6. Finlamma के भीतर प्रदर्शन असली बाज़ारों में प्रदर्शन की भविष्यवाणी नहीं करता।
Finlamma में सिम्युलेटेड ट्रेडिंग में अच्छा करना — V Money में लाभ कमाना, लीडरबोर्ड पर चढ़ना, Arena प्रतियोगिता जीतना — इसका मतलब यह नहीं है कि कोई असली निवेश भी वैसा ही प्रदर्शन करता, और यह किसी को भी असली पैसे से ट्रेड या निवेश करने के लिए योग्य नहीं बनाता। असली बाज़ारों में असली जोखिम शामिल होता है, जिसमें पैसा खोने का जोखिम भी शामिल है, जिसे बिना असली पैसे के जोखिम वाला सिमुलेशन पूरी तरह सिखा या दोहरा नहीं सकता।

7. वर्चुअल करेंसी, बैज, टाइटल, और पुरस्कारों का कोई असली-दुनिया मूल्य नहीं है।
V Money, बैज, टाइटल, और Arena प्रतियोगिताओं या अन्य इन-ऐप इवेंट्स के माध्यम से दिया गया कोई भी पुरस्कार वर्चुअल, केवल-Finlamma रिवॉर्ड हैं। ये करेंसी, सिक्योरिटी, गिफ्ट कार्ड, या ऐप के बाहर नकद, सामान, या सेवाओं के लिए भुनाई जा सकने वाली कोई चीज़ नहीं हैं, और इन शर्तों में एक अलग, स्पष्ट रूप से घोषित बदलाव के बिना कभी नहीं बनेंगे।

8. असली निवेश जोखिम पर एक टिप्पणी।
हालांकि Finlamma में कुछ भी असली पैसे से जुड़ा नहीं है, इसके शैक्षिक उद्देश्य का एक हिस्सा आपको यह समझने में मदद करना है कि असली निवेश में असली जोखिम होता है — जिसमें निवेश किए गए कुछ या सारे पैसे खोने का जोखिम शामिल है — और किसी भी असली निवेश का पिछला प्रदर्शन कभी भी भविष्य के परिणामों की गारंटी नहीं होता। ऐप में कुछ भी इस जोखिम को कम करके दिखाने वाला नहीं समझा जाना चाहिए।

9. दायित्व की सीमा
Finlamma शैक्षिक उद्देश्यों के लिए "जैसा है" आधार पर प्रदान किया जाता है। कानून द्वारा अनुमत पूरी सीमा तक, Finlamma और इसे संचालित करने वाली संस्था ऐप के भीतर कंटेंट, मार्केट डेटा, या AI-जनित आउटपुट पर निर्भर रहने से, या ऐप के उपयोग से जुड़े किसी भी असली-दुनिया के वित्तीय फैसले से उत्पन्न किसी भी नुकसान या क्षति के लिए उत्तरदायी नहीं हैं।

10. स्वीकृति
Finlamma का उपयोग करके, आप — या, नाबालिग के मामले में, माता-पिता की सहमति के हिस्से के रूप में उनकी ओर से उनके माता-पिता/अभिभावक — स्वीकार करते हैं कि आपने इस जोखिम प्रकटीकरण को पढ़ और समझ लिया है, और विशेष रूप से यह कि ऐप में सभी ट्रेडिंग सिम्युलेटेड है, इसमें कोई असली पैसा उपयोग नहीं होता, और यह इन्वेस्टमेंट एडवाइस नहीं है।${TRANSLATION_NOTE_HI}`;

const RISK_HX = `${PLACEHOLDER_NOTICE}RISK DISCLOSURE (Jokhim Prakatikaran)

1. Is disclosure ka purpose
Yeh page simple language mein batata hai ki Finlamma kya hai aur kya nahi hai. Please ise padhein isse pehle ki aap — ya, agar aap parent/guardian hain, to aapka bachcha — app use karna start kare. Agar yahan kuch bhi unclear hai, to kisi bhi financial matter ke liye app par depend hone se pehle hamare Contact page par diye details se humse contact karein.

2. Finlamma mein saari trading simulated hai. Isme kabhi real paisa shaamil nahi hota.
Finlamma mein aapke dwara kiya gaya har "trade" — koi stock khareedna ya bechna, kisi mutual fund mein invest karna, SIP chalaana — Finlamma ki apni virtual currency, "V Money" se kiya jaata hai. V Money real paisa nahi hai. Ise kisi bhi situation mein deposit, withdraw, cash mein convert, bank account mein transfer, ya kisi real-world value wali cheez se exchange nahi kiya ja sakta. Aapki taraf se kabhi koi real brokerage account, demat account, ya stock exchange order nahi banaya jaata. Finlamma ke andar aap jo bhi karte hain, uska result kisi real security ki real purchase ya sale nahi hota.

3. Finlamma ek investment adviser nahi hai, aur app mein kuch bhi investment advice nahi hai.
Finlamma, aur ise operate karne wali entity, Securities and Exchange Board of India (SEBI) ke paas investment adviser, research analyst, ya kisi aur regulated market intermediary ki tarah registered nahi hai. App mein kuch bhi — lesson content, quiz questions, news summaries, mentor commentary, Doubt Zone ke answers, ya koi aur feature — kisi real security, mutual fund, ya dusre financial product ko khareedne, bechne, ya rakhne ki personal recommendation nahi hai aur na hi ise aisa samjha jaana chahiye. Finlamma aapki (ya aapke bachche ki) real financial situation nahi jaanta aur uspar advice dene ki position mein nahi hai. Real paise aur real investments ke decisions ek qualified, SEBI-registered professional ke saath liye jaane chahiye.

4. Kuch content artificial intelligence dwara draft ya assist kiya gaya hai.
Finlamma mein kuch content — simplified news summaries aur kuch quiz questions shaamil — ek AI system dwara generate kiye gaye draft ki tarah start hota hai aur learners ko dikhane se pehle staff member dwara review kiya jaata hai. Doubt Zone, in-app question feature, directly answers generate karne ke liye ek AI system use karta hai; yeh answers educational rehne ke liye design kiye gaye hain aur personal investment advice jaisi kisi bhi cheez se bachne ke liye automatically screen kiye jaate hain, lekin AI-generated text phir bhi galat, incomplete, ya odd tarike se likha ja sakta hai. Kisi bhi AI-generated feature ki baat ko learning ki shuruaat maanein, kabhi final answer nahi, aur kabhi kisi specific real-world financial decision ke baare mein advice nahi.

5. Market data delayed, simulated, ya limited ho sakta hai, aur uski accuracy ki guarantee nahi hai.
Finlamma mein dikhayi gayi prices, charts, aur dusri market information third-party data providers se aati hai aur delayed, incomplete, ya kabhi-kabhi galat ho sakti hai. Jab market band hota hai, to Finlamma aakhri available real closing price dikhata hai — yeh app ko "live" feel karane ke liye kabhi bhi price movement nahi banata ya simulate nahi karta. Phir bhi, app mein dikhayi gayi koi bhi cheez ko kisi real market ki accurate, real-time, ya complete picture ki tarah nahi lena chahiye, aur app ke bahar app mein dekhi gayi kisi baat ke aadhar par liye gaye decisions ke liye Finlamma responsible nahi hai.

6. Finlamma ke andar performance real markets mein performance ki prediction nahi karti.
Finlamma mein simulated trading mein accha karna — V Money mein profit banaana, leaderboard par chadhna, Arena competition jeetna — iska matlab yeh nahi hai ki koi real investment bhi waise hi perform karta, aur yeh kisi ko bhi real paise se trade ya invest karne ke liye qualify nahi karta. Real markets mein real risk shaamil hota hai, jisme paisa khone ka risk bhi shaamil hai, jise bina real paise ke risk wala simulation poori tarah sikha ya repeat nahi kar sakta.

7. Virtual currency, badges, titles, aur prizes ki koi real-world value nahi hai.
V Money, badges, titles, aur Arena competitions ya dusre in-app events ke through diya gaya koi bhi prize virtual, sirf-Finlamma rewards hain. Yeh currency, securities, gift cards, ya app ke bahar cash, goods, ya services ke liye redeem ki ja sakne wali koi cheez nahi hain, aur in Sharton mein ek separate, clearly-announced change ke bina kabhi nahi banenge.

8. Real investing risk par ek note.
Chahe Finlamma mein kuch bhi real paise se juda nahi hai, iske educational purpose ka ek hissa aapko yeh samajhne mein help karna hai ki real investing mein real risk hota hai — jisme invest kiye gaye kuch ya saare paise khone ka risk shaamil hai — aur kisi bhi real investment ka past performance kabhi future results ki guarantee nahi hota. App mein kuch bhi is risk ko kam karke dikhane wala nahi samjha jaana chahiye.

9. Liability ki limitation
Finlamma educational purposes ke liye "as is" basis par provide kiya jaata hai. Kanoon dwara allowed poori extent tak, Finlamma aur ise operate karne wali entity app ke andar content, market data, ya AI-generated output par depend karne se, ya app use karne se juda koi bhi real-world financial decision se hone wale kisi bhi loss ya damage ke liye liable nahi hain.

10. Acknowledgement
Finlamma use karke, aap — ya, minor ke case mein, parental consent ke hisse ki tarah unki taraf se unke parent/guardian — acknowledge karte hain ki aapne is Risk Disclosure ko padh aur samajh liya hai, aur khaaskar yeh ki app mein saari trading simulated hai, isme koi real paisa use nahi hota, aur yeh investment advice nahi hai.${TRANSLATION_NOTE_HX}`;

const DOCUMENTS = [
  { type: "terms" as const, content: { en: TERMS_EN, hi: TERMS_HI, hx: TERMS_HX } },
  { type: "privacy" as const, content: { en: PRIVACY_EN, hi: PRIVACY_HI, hx: PRIVACY_HX } },
  { type: "risk_disclosure" as const, content: { en: RISK_EN, hi: RISK_HI, hx: RISK_HX } },
];

async function seed() {
  let createdCount = 0;

  for (const doc of DOCUMENTS) {
    const [existingPublished] = await db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.type, doc.type), eq(legalDocuments.status, "published")))
      .orderBy(desc(legalDocuments.version))
      .limit(1);

    if (existingPublished) {
      console.log(`Skipping ${doc.type}: already has a published version (v${existingPublished.version}).`);
      continue;
    }

    const [created] = await db
      .insert(legalDocuments)
      .values({
        type: doc.type,
        version: 1,
        content: doc.content,
        status: "published",
        publishedAt: new Date(),
        isPlaceholder: true,
        // No staff actor - this is a script-seeded placeholder, not a real
        // staff publish action. publishedBy stays null (nullable column).
      })
      .returning();

    await logActivity({
      actorType: "system",
      action: "legal.published_placeholder",
      targetType: "legal_document",
      targetId: created.id,
      metadata: { type: doc.type, version: created.version, source: "seed-legal-documents" },
    });

    createdCount++;
    console.log(`Seeded ${doc.type} v1 (DRAFT placeholder content, published).`);
  }

  console.log(`Done. ${createdCount} document(s) newly published.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
