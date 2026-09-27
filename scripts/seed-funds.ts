// Seeds the 9 fictional Finlamma-branded funds (docs/ARCHITECTURE.md D45).
// Idempotent by amfiSchemeCode - never overwrites an existing row's fields
// on conflict, same reasoning as seed-instruments.ts (staff edits in the
// admin Fund editor must survive a re-run of this script).
//
// IMPORTANT (D45): every `name`/`description` here is a FICTIONAL Finlamma
// wrapper - never a real AMC's fund name, never copied real marketing copy.
// `amfiSchemeCode` is the only link to a real scheme (for realistic NAV
// movement) and is an internal-only field the app/API never surfaces.
// `expenseRatioBps` is an illustrative, category-typical figure, not the
// real scheme's own filed rate. No star rating, no AUM (D45). This copy is
// best-effort en/hi/hx written during development - like
// scripts/seed-instruments.ts's about/tip, it needs a native-speaker review
// before launch (docs/ROADMAP.md pre-launch checklist).
import "../envConfig";
import { db } from "../src/db/client";
import { funds } from "../src/db/schema";

const MIN_SIP_PAISE_INDEX = 10000; // ₹100
const MIN_SIP_PAISE_OTHER = 50000; // ₹500

type SeedFund = {
  name: string;
  category: "index" | "equity" | "hybrid" | "debt" | "elss";
  risk: "very_low" | "low" | "moderate" | "high" | "very_high";
  amfiSchemeCode: string;
  expenseRatioBps: number;
  minSipPaise: number;
  description: { en: string; hi: string; hx: string };
};

const FUNDS: SeedFund[] = [
  {
    name: "Finlamma Nifty 50 Index Fund",
    category: "index",
    risk: "low",
    amfiSchemeCode: "120716",
    expenseRatioBps: 20,
    minSipPaise: MIN_SIP_PAISE_INDEX,
    description: {
      en: "Buys all 50 companies in the Nifty 50 index, in the same proportion as the index itself. No fund manager picks stocks here - you simply get the market's own return, minus a small fee.",
      hi: "निफ्टी 50 इंडेक्स की सभी 50 कंपनियों को उसी अनुपात में खरीदता है जैसा इंडेक्स में है। यहाँ कोई फंड मैनेजर स्टॉक नहीं चुनता - आपको बस बाज़ार का अपना रिटर्न मिलता है, एक छोटी सी फीस काटकर।",
      hx: "Nifty 50 index ki saari 50 companies ko usi proportion mein khareedta hai jaisa index mein hai. Yahaan koi fund manager stock nahi chunta - aapko bas market ka apna return milta hai, ek chhoti si fee kaatkar.",
    },
  },
  {
    name: "Finlamma Next 50 Index Fund",
    category: "index",
    risk: "moderate",
    amfiSchemeCode: "120684",
    expenseRatioBps: 25,
    minSipPaise: MIN_SIP_PAISE_INDEX,
    description: {
      en: "Tracks the 50 companies ranked just below the Nifty 50 - often called tomorrow's large caps. Usually moves more sharply than the Nifty 50 itself, in both directions.",
      hi: "निफ्टी 50 से ठीक नीचे रैंक की गई 50 कंपनियों को ट्रैक करता है - इन्हें अक्सर 'आने वाले कल के लार्ज कैप' कहा जाता है। आमतौर पर निफ्टी 50 से ज़्यादा तेज़ी से ऊपर-नीचे होता है।",
      hx: "Nifty 50 se theek neeche rank ki gayi 50 companies ko track karta hai - inhe aksar 'aane wale kal ke large cap' kaha jaata hai. Aam taur par Nifty 50 se zyada tezi se upar-neeche hota hai.",
    },
  },
  {
    name: "Finlamma Flexi Growth Fund",
    category: "equity",
    risk: "moderate",
    amfiSchemeCode: "118955",
    expenseRatioBps: 65,
    minSipPaise: MIN_SIP_PAISE_OTHER,
    description: {
      en: "A fund manager freely mixes large, mid and small companies based on where they see opportunity. More flexibility than an index fund, but returns depend on the manager's calls.",
      hi: "एक फंड मैनेजर मौके देखकर बड़ी, मंझोली और छोटी कंपनियों को अपनी मर्ज़ी से मिलाता है। इंडेक्स फंड से ज़्यादा लचीलापन, लेकिन रिटर्न मैनेजर के फैसलों पर निर्भर करता है।",
      hx: "Ek fund manager mauka dekhkar badi, manjholi aur chhoti companies ko apni marzi se milata hai. Index fund se zyada flexibility, lekin return manager ke faislon par depend karta hai.",
    },
  },
  {
    name: "Finlamma Mid Cap Fund",
    category: "equity",
    risk: "high",
    amfiSchemeCode: "120505",
    expenseRatioBps: 70,
    minSipPaise: MIN_SIP_PAISE_OTHER,
    description: {
      en: "Invests in medium-sized companies that are past the risky early-startup stage but still growing fast. Historically bumpier than large caps, in both good years and bad ones.",
      hi: "उन मंझोली कंपनियों में निवेश करता है जो शुरुआती जोखिम भरे स्टार्टअप दौर से आगे निकल चुकी हैं पर अभी भी तेज़ी से बढ़ रही हैं। लार्ज कैप की तुलना में ऐतिहासिक रूप से ज़्यादा उतार-चढ़ाव वाला।",
      hx: "Un manjholi companies mein invest karta hai jo shuruaati risky startup daur se aage nikal chuki hain par abhi bhi tezi se badh rahi hain. Large cap ke comparison mein historically zyada utaar-chadhaav wala.",
    },
  },
  {
    name: "Finlamma Small Cap Fund",
    category: "equity",
    risk: "very_high",
    amfiSchemeCode: "125497",
    expenseRatioBps: 75,
    minSipPaise: MIN_SIP_PAISE_OTHER,
    description: {
      en: "Invests in small, fast-growing companies. This category has historically swung the hardest of any fund type here - big gains in strong years, sharp falls in weak ones.",
      hi: "छोटी, तेज़ी से बढ़ने वाली कंपनियों में निवेश करता है। यह श्रेणी यहाँ मौजूद किसी भी फंड टाइप से ऐतिहासिक रूप से सबसे ज़्यादा उतार-चढ़ाव वाली रही है - अच्छे साल में बड़ा मुनाफ़ा, बुरे साल में तेज़ गिरावट।",
      hx: "Chhoti, tezi se badhne wali companies mein invest karta hai. Yeh category yahaan maujood kisi bhi fund type se historically sabse zyada utaar-chadhaav wali rahi hai - achhe saal mein bada munafa, bure saal mein tez giraawat.",
    },
  },
  {
    name: "Finlamma Balanced Advantage Fund",
    category: "hybrid",
    risk: "moderate",
    amfiSchemeCode: "120377",
    expenseRatioBps: 55,
    minSipPaise: MIN_SIP_PAISE_OTHER,
    description: {
      en: "Shifts money between shares and bonds on its own, based on how expensive the stock market looks - more bonds when shares seem pricey, more shares when they look cheap.",
      hi: "शेयर बाज़ार कितना महंगा लग रहा है, उसके हिसाब से खुद-ब-खुद शेयर और बॉन्ड के बीच पैसा शिफ्ट करता है - शेयर महंगे लगें तो ज़्यादा बॉन्ड, सस्ते लगें तो ज़्यादा शेयर।",
      hx: "Share market kitna mehnga lag raha hai, uske hisaab se khud-ba-khud share aur bond ke beech paisa shift karta hai - share mehnge lagein toh zyada bond, saste lagein toh zyada share.",
    },
  },
  {
    name: "Finlamma Corporate Bond Fund",
    category: "debt",
    risk: "low",
    amfiSchemeCode: "118987",
    expenseRatioBps: 35,
    minSipPaise: MIN_SIP_PAISE_OTHER,
    description: {
      en: "Lends money to well-rated companies for a few years in exchange for interest. Steadier than shares, but the value can still dip a little when interest rates move.",
      hi: "अच्छी रेटिंग वाली कंपनियों को कुछ सालों के लिए ब्याज के बदले पैसा उधार देता है। शेयरों से ज़्यादा स्थिर, लेकिन ब्याज दरें बदलने पर वैल्यू थोड़ी घट सकती है।",
      hx: "Achhi rating wali companies ko kuch saalon ke liye interest ke badle paisa udhaar deta hai. Shares se zyada stable, lekin interest rates badalne par value thodi ghat sakti hai.",
    },
  },
  {
    name: "Finlamma Liquid Fund",
    category: "debt",
    risk: "very_low",
    amfiSchemeCode: "119800",
    expenseRatioBps: 15,
    minSipPaise: MIN_SIP_PAISE_OTHER,
    description: {
      en: "Parks money in very short-term, high-safety government and company paper. The steadiest fund here - meant for money you might need back soon, not for long-term growth.",
      hi: "बहुत छोटी अवधि के, सुरक्षित सरकारी और कंपनी के कागज़ात में पैसा लगाता है। यहाँ का सबसे स्थिर फंड - जल्दी ज़रूरत पड़ने वाले पैसे के लिए, लंबी अवधि की ग्रोथ के लिए नहीं।",
      hx: "Bahut chhoti avadhi ke, surakshit sarkaari aur company ke kaagzaat mein paisa lagaata hai. Yahaan ka sabse stable fund - jaldi zaroorat padne wale paise ke liye, lambi avadhi ki growth ke liye nahi.",
    },
  },
  {
    name: "Finlamma Tax Saver Fund",
    category: "elss",
    risk: "moderate",
    amfiSchemeCode: "135781",
    expenseRatioBps: 65,
    minSipPaise: MIN_SIP_PAISE_OTHER,
    description: {
      en: "An equity fund with a 3-year lock-in - in real life, this category is popular because it can also reduce taxable income under Section 80C. This simulation does not model taxes.",
      hi: "3 साल के लॉक-इन वाला इक्विटी फंड - असल ज़िंदगी में यह श्रेणी इसलिए लोकप्रिय है क्योंकि यह सेक्शन 80C के तहत टैक्स योग्य आय भी घटा सकती है। यह सिमुलेशन टैक्स को मॉडल नहीं करता।",
      hx: "3 saal ke lock-in wala equity fund - asal zindagi mein yeh category isliye popular hai kyunki yeh Section 80C ke tehat taxable income bhi ghata sakti hai. Yeh simulation tax ko model nahi karta.",
    },
  },
];

async function seed() {
  for (const fund of FUNDS) {
    await db
      .insert(funds)
      .values({
        name: fund.name,
        category: fund.category,
        risk: fund.risk,
        description: fund.description,
        amfiSchemeCode: fund.amfiSchemeCode,
        expenseRatioBps: fund.expenseRatioBps,
        minLumpSumPaise: fund.minSipPaise,
        minSipPaise: fund.minSipPaise,
      })
      .onConflictDoNothing({ target: funds.amfiSchemeCode });
  }
  console.log(`Seeded ${FUNDS.length} fund(s) (existing rows, if any, were left untouched).`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
