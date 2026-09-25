// Seeds the 12 NSE large caps named in docs/PRODUCT_SPEC.md §4. Idempotent by
// symbol - never overwrites an existing row's fields on conflict, same
// reasoning as seed-reward-rules.ts: once staff edit a stock's about/tip/tags
// in the admin editor, this script running again must not silently reset it.
// `about`/`tip` copy here is best-effort en/hi/hx, written during development
// - like scripts/seed-mentors.ts's bios, it needs a native-speaker review
// before launch (see docs/ROADMAP.md's pre-launch checklist, extended to
// cover this file too). `mcap`/`pe` are deliberately left null - they're
// admin-curated display figures (docs/FEATURE_MAP.md Gaps -> Trade #5/#8),
// not something to guess at seed time; staff fill them in via the admin
// Instrument editor once Checkpoint 1's CRUD exists.
import "../envConfig";
import { db } from "../src/db/client";
import { instruments } from "../src/db/schema";

type SeedInstrument = {
  symbol: string;
  name: string;
  sector: string;
  about: { en: string; hi: string; hx: string };
  tip: { en: string; hi: string; hx: string };
  tags: string[];
};

const INSTRUMENTS: SeedInstrument[] = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    sector: "Oil, Gas & Conglomerate",
    about: {
      en: "India's largest private company by revenue - runs oil refining and petrochemicals, plus retail (Reliance Retail) and telecom (Jio) businesses.",
      hi: "राजस्व के हिसाब से भारत की सबसे बड़ी निजी कंपनी - तेल रिफाइनिंग और पेट्रोकेमिकल्स के साथ-साथ रिटेल (रिलायंस रिटेल) और टेलीकॉम (जियो) कारोबार भी चलाती है।",
      hx: "Revenue ke hisaab se India ki sabse badi private company - oil refining aur petrochemicals ke saath-saath retail (Reliance Retail) aur telecom (Jio) bhi chalaati hai.",
    },
    tip: {
      en: "One company, three different businesses. If oil prices fall, retail or telecom earnings can still keep the overall company steady - that's what 'diversification' means.",
      hi: "एक कंपनी, तीन अलग-अलग कारोबार। अगर तेल की कीमतें गिरें, तो रिटेल या टेलीकॉम की कमाई पूरी कंपनी को स्थिर रख सकती है - इसी को 'डाइवर्सिफिकेशन' कहते हैं।",
      hx: "Ek company, teen alag-alag businesses. Agar oil prices girein, toh retail ya telecom ki earnings poori company ko stable rakh sakti hain - isi ko 'diversification' kehte hain.",
    },
    tags: ["NIFTY 50", "Large cap", "Oil & Gas"],
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services Ltd",
    sector: "IT Services",
    about: {
      en: "India's largest IT services company - writes and maintains software for banks, retailers and other big companies around the world.",
      hi: "भारत की सबसे बड़ी आईटी सेवा कंपनी - दुनिया भर के बैंकों, रिटेलरों और अन्य बड़ी कंपनियों के लिए सॉफ्टवेयर बनाती और उसकी देखभाल करती है।",
      hx: "India ki sabse badi IT services company - duniya bhar ke banks, retailers aur doosri badi companies ke liye software banaati aur maintain karti hai.",
    },
    tip: {
      en: "TCS doesn't sell a product you can hold - it sells work hours and expertise. Its biggest cost is employee salaries, not raw materials.",
      hi: "TCS कोई ऐसा प्रोडक्ट नहीं बेचती जिसे आप छू सकें - यह काम के घंटे और विशेषज्ञता बेचती है। इसकी सबसे बड़ी लागत कच्चा माल नहीं, कर्मचारियों की सैलरी है।",
      hx: "TCS koi aisa product nahi bechti jise aap chhoo sakein - yeh kaam ke ghante aur expertise bechti hai. Iski sabse badi cost raw material nahi, employees ki salary hai.",
    },
    tags: ["NIFTY 50", "Large cap", "IT Services"],
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank Ltd",
    sector: "Banking",
    about: {
      en: "India's largest private-sector bank by assets - takes deposits and lends to individuals and businesses, and earns the difference (the 'spread') between the two.",
      hi: "संपत्ति के हिसाब से भारत का सबसे बड़ा निजी क्षेत्र का बैंक - जमा लेता है और व्यक्तियों व व्यवसायों को कर्ज देता है, और दोनों के बीच का अंतर ('स्प्रेड') कमाता है।",
      hx: "Assets ke hisaab se India ka sabse bada private-sector bank - deposits leta hai aur logon/businesses ko loan deta hai, aur dono ke beech ka difference ('spread') kamaata hai.",
    },
    tip: {
      en: "A bank's biggest risk is loans that don't get repaid ('bad loans'). Watching how much of a bank's lending goes bad each year tells you a lot about how carefully it lends.",
      hi: "बैंक का सबसे बड़ा जोखिम वे कर्ज हैं जो चुकाए नहीं जाते ('बैड लोन')। हर साल बैंक के कितने कर्ज खराब होते हैं, यह देखना बताता है कि बैंक कितनी सावधानी से कर्ज देता है।",
      hx: "Bank ka sabse bada risk woh loans hain jo chukaaye nahi jaate ('bad loans'). Har saal bank ke kitne loans kharab hote hain, yeh dekhna batata hai ki bank kitni saavdhani se lend karta hai.",
    },
    tags: ["NIFTY 50", "Large cap", "Banking"],
  },
  {
    symbol: "INFY",
    name: "Infosys Ltd",
    sector: "IT Services",
    about: {
      en: "One of India's largest IT services companies - similar business to TCS, building and running software/consulting for global clients.",
      hi: "भारत की सबसे बड़ी आईटी सेवा कंपनियों में से एक - TCS जैसा ही कारोबार, वैश्विक ग्राहकों के लिए सॉफ्टवेयर/परामर्श बनाना और चलाना।",
      hx: "India ki sabse badi IT services companies mein se ek - TCS jaisa hi business, global clients ke liye software/consulting banaana aur chalaana.",
    },
    tip: {
      en: "Since Infosys earns a lot of revenue from US/European clients, a weaker rupee (against the dollar) can actually help its reported profits, even if nothing else about the business changed.",
      hi: "चूंकि इन्फोसिस की काफी कमाई अमेरिकी/यूरोपीय ग्राहकों से होती है, कमज़ोर रुपया (डॉलर के मुकाबले) असल में इसके मुनाफे को बढ़ा सकता है, भले ही कारोबार में कुछ और न बदला हो।",
      hx: "Chunki Infosys ki kaafi earning US/European clients se hoti hai, kamzor rupee (dollar ke muqable) actually iske profits ko badha sakta hai, bhale hi business mein kuch aur na badla ho.",
    },
    tags: ["NIFTY 50", "Large cap", "IT Services"],
  },
  {
    symbol: "ICICIBANK",
    name: "ICICI Bank Ltd",
    sector: "Banking",
    about: {
      en: "A large private-sector bank offering savings/current accounts, loans, credit cards and insurance products to individuals and businesses.",
      hi: "एक बड़ा निजी क्षेत्र का बैंक जो व्यक्तियों और व्यवसायों को बचत/चालू खाते, कर्ज, क्रेडिट कार्ड और बीमा उत्पाद देता है।",
      hx: "Ek bada private-sector bank jo logon aur businesses ko savings/current accounts, loans, credit cards aur insurance products deta hai.",
    },
    tip: {
      en: "Banks are one of the most heavily regulated businesses in the country - the RBI sets rules on how much they can lend and how much cash reserve they must keep.",
      hi: "बैंक देश के सबसे अधिक नियंत्रित कारोबारों में से एक हैं - RBI यह तय करता है कि वे कितना कर्ज दे सकते हैं और कितना नकद भंडार रखना ज़रूरी है।",
      hx: "Banks desh ke sabse zyada regulated businesses mein se ek hain - RBI yeh decide karta hai ki woh kitna loan de sakte hain aur kitna cash reserve rakhna zaroori hai.",
    },
    tags: ["NIFTY 50", "Large cap", "Banking"],
  },
  {
    symbol: "SBIN",
    name: "State Bank of India",
    sector: "Banking",
    about: {
      en: "India's largest bank by assets, majority government-owned - offers the same kind of savings, loans and cards as a private bank, at a much bigger scale.",
      hi: "संपत्ति के हिसाब से भारत का सबसे बड़ा बैंक, जिसका अधिकांश हिस्सा सरकार के पास है - निजी बैंक जैसी ही बचत, कर्ज और कार्ड सेवाएं, पर बहुत बड़े पैमाने पर।",
      hx: "Assets ke hisaab se India ka sabse bada bank, jiska zyadatar hissa government ke paas hai - private bank jaisi hi savings, loans aur card services, par bahut bade scale par.",
    },
    tip: {
      en: "A government-owned ('PSU') bank isn't run for profit the same way a private bank is - it also serves government schemes like farm loans and rural banking access.",
      hi: "सरकारी ('PSU') बैंक निजी बैंक की तरह सिर्फ मुनाफे के लिए नहीं चलता - यह कृषि कर्ज और ग्रामीण बैंकिंग पहुंच जैसी सरकारी योजनाओं को भी पूरा करता है।",
      hx: "Government-owned ('PSU') bank private bank ki tarah sirf profit ke liye nahi chalta - yeh farm loans aur rural banking access jaisi government schemes ko bhi poora karta hai.",
    },
    tags: ["NIFTY 50", "Large cap", "Banking", "PSU"],
  },
  {
    symbol: "ITC",
    name: "ITC Ltd",
    sector: "FMCG & Conglomerate",
    about: {
      en: "A diversified company - cigarettes (its biggest profit source), plus packaged foods, personal care, paperboard and hotels.",
      hi: "एक विविध कंपनी - सिगरेट (इसका सबसे बड़ा मुनाफा स्रोत), साथ ही पैकेज्ड फूड, पर्सनल केयर, पेपरबोर्ड और होटल।",
      hx: "Ek diversified company - cigarettes (iska sabse bada profit source), saath hi packaged food, personal care, paperboard aur hotels.",
    },
    tip: {
      en: "A single company can be a leader in more than one unrelated business at once - ITC's food brands and its cigarette business have almost nothing in common except the parent company.",
      hi: "एक कंपनी एक साथ कई असंबंधित कारोबारों में अग्रणी हो सकती है - ITC के फूड ब्रांड और उसके सिगरेट कारोबार में पैरेंट कंपनी के अलावा लगभग कुछ भी समान नहीं है।",
      hx: "Ek company ek saath kai unrelated businesses mein leader ho sakti hai - ITC ke food brands aur uske cigarette business mein parent company ke alawa lagbhag kuch bhi common nahi hai.",
    },
    tags: ["NIFTY 50", "Large cap", "FMCG"],
  },
  {
    symbol: "TATAMOTORS",
    name: "Tata Motors Ltd",
    sector: "Automobile",
    about: {
      en: "Makes commercial vehicles and passenger cars in India, and owns Jaguar Land Rover, a luxury car brand sold mainly overseas.",
      hi: "भारत में कमर्शियल वाहन और यात्री कारें बनाती है, और जगुआर लैंड रोवर की मालिक है, जो मुख्य रूप से विदेशों में बिकने वाला एक लग्ज़री कार ब्रांड है।",
      hx: "India mein commercial vehicles aur passenger cars banaati hai, aur Jaguar Land Rover ki owner hai, jo mainly overseas bikta hai ek luxury car brand.",
    },
    tip: {
      en: "Car makers are 'cyclical' - their sales rise and fall a lot with the broader economy, since a car is a big, delay-able purchase for most families.",
      hi: "कार निर्माता 'साइक्लिकल' होते हैं - उनकी बिक्री समग्र अर्थव्यवस्था के साथ बहुत ऊपर-नीचे होती है, क्योंकि ज़्यादातर परिवारों के लिए कार एक बड़ी, टाली जा सकने वाली खरीद है।",
      hx: "Car makers 'cyclical' hote hain - unki sales overall economy ke saath bahut upar-neeche hoti hain, kyunki zyaadatar families ke liye car ek badi, taali ja sakne wali purchase hai.",
    },
    tags: ["NIFTY 50", "Large cap", "Automobile"],
  },
  {
    symbol: "BHARTIARTL",
    name: "Bharti Airtel Ltd",
    sector: "Telecom",
    about: {
      en: "One of India's largest telecom operators - mobile network, broadband and enterprise connectivity, with operations in Africa too.",
      hi: "भारत के सबसे बड़े टेलीकॉम ऑपरेटरों में से एक - मोबाइल नेटवर्क, ब्रॉडबैंड और एंटरप्राइज़ कनेक्टिविटी, अफ्रीका में भी परिचालन के साथ।",
      hx: "India ke sabse bade telecom operators mein se ek - mobile network, broadband aur enterprise connectivity, Africa mein bhi operations ke saath.",
    },
    tip: {
      en: "Telecom needs huge upfront spending (towers, spectrum, fibre) before it earns a rupee - that's why only a few large players compete in this sector.",
      hi: "टेलीकॉम को एक रुपया कमाने से पहले भारी शुरुआती खर्च (टावर, स्पेक्ट्रम, फाइबर) चाहिए - इसीलिए इस सेक्टर में सिर्फ कुछ बड़े खिलाड़ी ही मुकाबला करते हैं।",
      hx: "Telecom ko ek rupaya kamaane se pehle bhaari shuruaati kharch (towers, spectrum, fibre) chahiye - isiliye is sector mein sirf kuch bade players hi compete karte hain.",
    },
    tags: ["NIFTY 50", "Large cap", "Telecom"],
  },
  {
    symbol: "HINDUNILVR",
    name: "Hindustan Unilever Ltd",
    sector: "FMCG",
    about: {
      en: "Makes everyday household products - soaps, shampoos, detergents and packaged food brands most Indian homes already use.",
      hi: "रोज़मर्रा के घरेलू उत्पाद बनाती है - साबुन, शैंपू, डिटर्जेंट और पैकेज्ड फूड ब्रांड जो ज़्यादातर भारतीय घरों में पहले से इस्तेमाल होते हैं।",
      hx: "Rozmarra ke household products banaati hai - soap, shampoo, detergent aur packaged food brands jo zyaadatar Indian ghar pehle se use karte hain.",
    },
    tip: {
      en: "FMCG ('fast-moving consumer goods') companies sell things people buy again and again, month after month - which tends to make their sales steadier than a car or a phone maker's.",
      hi: "FMCG ('फास्ट-मूविंग कंज़्यूमर गुड्स') कंपनियां वे चीज़ें बेचती हैं जो लोग महीने-दर-महीने बार-बार खरीदते हैं - इससे इनकी बिक्री कार या फोन बनाने वाली कंपनी से ज़्यादा स्थिर रहती है।",
      hx: "FMCG ('fast-moving consumer goods') companies woh cheezein bechti hain jo log mahine-dar-mahine baar-baar khareedte hain - isse inki sales car ya phone banaane waali company se zyaada stable rehti hain.",
    },
    tags: ["NIFTY 50", "Large cap", "FMCG"],
  },
  {
    symbol: "LT",
    name: "Larsen & Toubro Ltd",
    sector: "Infrastructure & Engineering",
    about: {
      en: "A large engineering and construction company - builds roads, power plants, factories and defence equipment for governments and companies.",
      hi: "एक बड़ी इंजीनियरिंग और निर्माण कंपनी - सरकारों और कंपनियों के लिए सड़कें, बिजली संयंत्र, कारखाने और रक्षा उपकरण बनाती है।",
      hx: "Ek badi engineering aur construction company - governments aur companies ke liye roads, power plants, factories aur defence equipment banaati hai.",
    },
    tip: {
      en: "L&T's business depends heavily on large government and corporate projects ('order book') - a big new contract win can move its outlook a lot more than a small one.",
      hi: "L&T का कारोबार बड़े सरकारी और कॉर्पोरेट प्रोजेक्ट्स ('ऑर्डर बुक') पर बहुत निर्भर करता है - एक बड़ा नया अनुबंध मिलना इसकी संभावनाओं को छोटे अनुबंध से कहीं ज़्यादा बदल सकता है।",
      hx: "L&T ka business bade government aur corporate projects ('order book') par bahut depend karta hai - ek bada naya contract milna iski outlook ko chhote contract se kahin zyaada badal sakta hai.",
    },
    tags: ["NIFTY 50", "Large cap", "Infrastructure"],
  },
  {
    symbol: "ASIANPAINT",
    name: "Asian Paints Ltd",
    sector: "Paints & FMCG",
    about: {
      en: "India's largest paint company - sells decorative and industrial paints, plus home-decor products, through a huge dealer network.",
      hi: "भारत की सबसे बड़ी पेंट कंपनी - एक विशाल डीलर नेटवर्क के ज़रिए सजावटी और औद्योगिक पेंट, साथ ही होम-डेकोर उत्पाद बेचती है।",
      hx: "India ki sabse badi paint company - ek bade dealer network ke zariye decorative aur industrial paint, saath hi home-decor products bechti hai.",
    },
    tip: {
      en: "A strong distribution network - being available in almost every paint shop in the country - can be as big an advantage for a company as the product itself.",
      hi: "मज़बूत वितरण नेटवर्क - देश की लगभग हर पेंट की दुकान में उपलब्ध होना - किसी कंपनी के लिए उतना ही बड़ा फ़ायदा हो सकता है जितना खुद प्रोडक्ट।",
      hx: "Strong distribution network - desh ki lagbhag har paint shop mein available hona - kisi company ke liye utna hi bada fayda ho sakta hai jitna khud product.",
    },
    tags: ["NIFTY 50", "Large cap", "Paints"],
  },
];

async function seed() {
  for (const inst of INSTRUMENTS) {
    await db
      .insert(instruments)
      .values({
        symbol: inst.symbol,
        name: inst.name,
        sector: inst.sector,
        about: inst.about,
        tip: inst.tip,
        tags: inst.tags,
      })
      .onConflictDoNothing({ target: instruments.symbol });
  }
  console.log(
    `Seeded ${INSTRUMENTS.length} instrument(s) (existing rows, if any, were left untouched).`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
