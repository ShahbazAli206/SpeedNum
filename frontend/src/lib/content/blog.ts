/** Editorial content for /blog and /blog/[slug]. */

export interface BlogSection {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface BlogPost {
  slug: string;
  category: "Product" | "How-to" | "Opinion & benchmarks" | "Deadlines & compliance";
  title: string;
  excerpt: string;
  /** Display date — the list sorts on `order`, not on parsing this. */
  date: string;
  order: number;
  readMinutes: number;
  author: { name: string; role: string };
  sections: BlogSection[];
}

export const POSTS: BlogPost[] = [
  {
    slug: "engagement-letters-from-services-catalogue",
    category: "Product",
    title: "From services catalogue to signed letter: engagement letters in SpeedNum",
    excerpt:
      "A walkthrough of SpeedNum engagement letters: build a priced letter from your services, send a branded no-login link, and collect e-signatures on the record.",
    date: "March 2027",
    order: 1,
    readMinutes: 5,
    author: { name: "The SpeedNum team", role: "Product" },
    sections: [
      {
        paragraphs: [
          "An engagement letter has one job: to say what the firm agreed to do, for how much, before the work starts. Everything else about it — the drafting, the chasing, the filing — is overhead the firm absorbs because the letter matters.",
          "SpeedNum removes most of that overhead by treating the letter as a view over data the firm already has, rather than as a document someone writes from scratch each year.",
        ],
      },
      {
        heading: "Start from the services, not from a blank page",
        paragraphs: [
          "When you create a letter for a client, the line items are pre-populated from the services that client is assigned in the catalogue: the code, the description and the price the firm agreed for that client, including any per-client override.",
          "You can add custom lines for anything outside the catalogue, reorder them, and set the tax rate. Subtotal, tax and total compute as you type, so there is no arithmetic to check before sending.",
        ],
      },
      {
        heading: "Send a branded link, not an attachment",
        paragraphs: [
          "Sending produces a link to a public signing page carrying the firm's name, logo, brand colour and letter footer. The client does not create an account and does not need a password — a no-login page is the difference between a signature today and a support call tomorrow.",
          "The client can type a signature, draw one, or upload an image, then download the finished PDF. The firm gets the same PDF on the client record.",
        ],
      },
      {
        heading: "Status is a field, not an email search",
        paragraphs: [
          "Every letter carries a status — draft, sent, viewed, signed, declined or void — with a timestamp for each transition. \"Which clients have not signed yet?\" is a filter on the letters list, and the count of letters awaiting signature is a KPI on the dashboard.",
          "Declines are recorded with a reason, so a scope disagreement is captured at the moment it happens rather than reconstructed later.",
        ],
        bullets: [
          "Line items priced from the client's assigned services",
          "Automatic subtotal, tax and total",
          "Branded no-login signing page with type, draw or upload",
          "Full status history with timestamps, kept on the client record",
        ],
      },
    ],
  },
  {
    slug: "what-smb-clients-expect-from-their-accountant",
    category: "Opinion & benchmarks",
    title: "What SMB clients now expect from their accountant (and what they'll leave over)",
    excerpt:
      "The service baseline small-business clients now assume — e-signatures, proactive deadline warnings, a branded portal, fast answers — and where firms lose them.",
    date: "March 2027",
    order: 2,
    readMinutes: 6,
    author: { name: "The SpeedNum team", role: "Practice research" },
    sections: [
      {
        paragraphs: [
          "The technical work a small firm does has not changed much in a decade. What has changed is the service baseline clients compare it against — and that baseline is not set by other accountants. It is set by every other business service the client uses.",
        ],
      },
      {
        heading: "The four things now assumed",
        paragraphs: [
          "None of these are differentiators any more. They are the price of not being remarked upon:",
        ],
        bullets: [
          "Signing something without printing it. A client asked to print, sign, scan and email a letter in 2027 notices.",
          "Being warned before a deadline, not after. Proactive is the expectation; reactive reads as disorganised.",
          "One place to find their own documents. Not a thread, not a shared drive invite that expired.",
          "An answer inside a day. Not a full answer — an acknowledgement with a date.",
        ],
      },
      {
        heading: "Where firms actually lose clients",
        paragraphs: [
          "Rarely on price, and rarely on technical error. Clients leave over the accumulation of small frictions that read as \"they are not on top of my file\": the second time they are asked for a document they already sent, the deadline they found out about from the CRA, the question that took nine days.",
          "Each of those is an information problem inside the firm, not a competence problem. The client's file exists; it is just spread across an inbox, a drive and one person's memory.",
        ],
      },
      {
        heading: "The uncomfortable part",
        paragraphs: [
          "Meeting this baseline does not let a firm charge more. It lets the firm keep the clients it has, which is a less exciting proposition and a more valuable one — the cost of replacing a recurring client is several times the cost of not losing them.",
          "The firms that handle this well are rarely the ones with the most software. They are the ones where every client's services, deadlines and documents live in one record that anyone in the firm can open.",
        ],
      },
    ],
  },
  {
    slug: "the-solo-cpas-first-hire",
    category: "Opinion & benchmarks",
    title: "The solo CPA's first hire: when, who, and the math nobody shows you",
    excerpt:
      "When a solo practice should hire, why the first hire is usually admin or systems rather than a junior accountant, and the capacity signals that say it is time.",
    date: "February 2027",
    order: 3,
    readMinutes: 6,
    author: { name: "The SpeedNum team", role: "Practice research" },
    sections: [
      {
        paragraphs: [
          "The standard advice is to hire a junior accountant when you can no longer do all the accounting. This is usually wrong, and the reason is arithmetic.",
        ],
      },
      {
        heading: "What the solo practitioner actually spends time on",
        paragraphs: [
          "In most solo practices, chargeable technical work is well under half the week. The rest is scheduling, chasing documents, drafting letters, answering status questions, invoicing, and reconstructing where a file got to.",
          "Hiring a junior accountant addresses the smaller half. It also adds review time, which comes out of the principal's chargeable hours — so the first few months often reduce capacity rather than increasing it.",
        ],
      },
      {
        heading: "The math",
        paragraphs: [
          "Take a 45-hour week where 18 hours are chargeable. A junior who can take 8 hours of technical work but needs 3 hours of review nets 5 hours — and only after ramp-up. An administrator who takes 12 hours of chasing, scheduling and document handling nets 12 hours immediately, and those hours convert directly to chargeable time.",
          "The junior is the right hire eventually. It is rarely the right hire first.",
        ],
      },
      {
        heading: "The signals that say it is time",
        paragraphs: [
          "Capacity signals are more reliable than revenue ones. Watch for these:",
        ],
        bullets: [
          "Deadlines are being met, but only by working the weekend before them.",
          "You are the only person who can answer any client question.",
          "Onboarding a new client takes more than a week of elapsed time.",
          "You have declined work you were capable of doing and wanted.",
        ],
      },
      {
        heading: "Systems first, where they are cheaper than people",
        paragraphs: [
          "Some of the twelve hours an administrator would absorb do not need a person at all. Deadlines generated from fiscal year-ends, letters priced from a catalogue, and a portal where clients find their own documents remove work rather than reassigning it.",
          "The practical sequence for most solo practices: systematise what is mechanical, hire an administrator for what is not, and hire the junior accountant when technical work is genuinely the constraint.",
        ],
      },
    ],
  },
  {
    slug: "pipeda-for-accounting-firms",
    category: "How-to",
    title: "PIPEDA for accounting firms: a working compliance checklist",
    excerpt:
      "What PIPEDA requires of firms holding client financial data — consent, safeguards, breach response, retention — plus Quebec's Law 25 and provincial overlays.",
    date: "February 2027",
    order: 4,
    readMinutes: 9,
    author: { name: "The SpeedNum team", role: "Compliance" },
    sections: [
      {
        paragraphs: [
          "This is a working checklist, not legal advice. PIPEDA applies to organisations that collect, use or disclose personal information in the course of commercial activity — which includes essentially every accounting practice in Canada outside the provinces with substantially similar legislation.",
        ],
      },
      {
        heading: "1. Accountability",
        paragraphs: [
          "Name someone accountable for privacy compliance. In a small firm this is a partner, and the appointment should be written down somewhere other than in that partner's head.",
        ],
      },
      {
        heading: "2. Consent and purpose",
        paragraphs: [
          "Identify why you collect each category of personal information before you collect it, and limit collection to what those purposes require. Engagement letters are the natural home for this: the letter that defines the scope of work can also define the scope of data.",
        ],
      },
      {
        heading: "3. Safeguards proportional to sensitivity",
        paragraphs: [
          "Financial and tax data sits at the sensitive end, so the expected safeguards are correspondingly higher:",
        ],
        bullets: [
          "Encryption in transit and at rest.",
          "Access control — staff see the clients they work on, not the whole book, unless their role requires it.",
          "Multi-factor authentication on every account with access to client data.",
          "An audit trail showing who accessed or changed what.",
          "A documented, tested restore — a backup nobody has restored is a hypothesis.",
        ],
      },
      {
        heading: "4. Retention and disposal",
        paragraphs: [
          "Set retention periods per record type — professional standards and tax law set floors, PIPEDA sets the expectation of a ceiling — and dispose securely when they expire. \"We keep everything forever\" is a defensible answer to an auditor and an indefensible one to a regulator.",
        ],
      },
      {
        heading: "5. Breach response",
        paragraphs: [
          "Breaches posing a real risk of significant harm must be reported to the Privacy Commissioner and to affected individuals, and you must keep records of all breaches — including the ones that do not meet the reporting threshold.",
          "Write the response plan before you need it: who is called, who assesses risk of harm, who notifies, and where the log lives.",
        ],
      },
      {
        heading: "6. Provincial overlays",
        paragraphs: [
          "Alberta, British Columbia and Quebec have their own private-sector privacy legislation. Quebec's Law 25 is the most demanding: mandatory privacy officer, breach register, privacy impact assessments for systems handling personal information, and rules around transfers outside Quebec.",
          "A firm with clients in multiple provinces should plan to the strictest applicable standard rather than maintaining several.",
        ],
      },
      {
        heading: "7. Vendors are in scope",
        paragraphs: [
          "You remain accountable for personal information transferred to a service provider. Ask where the data is hosted, what the provider's breach obligations are, whether tenant isolation is enforced at the database layer, and what happens to your data when the contract ends.",
          "\"Hosted in Canada\" is not a legal requirement under PIPEDA, but it removes an entire category of client question and cross-border assessment.",
        ],
      },
    ],
  },
  {
    slug: "quebec-two-administration-problem",
    category: "Deadlines & compliance",
    title: "Quebec's two-administration problem: CRA and Revenu Québec deadlines together",
    excerpt:
      "Quebec practices file with two tax administrations — CO-17 with Revenu Québec, T2 with the CRA, QST alongside GST. How firms run one calendar for both.",
    date: "February 2027",
    order: 5,
    readMinutes: 8,
    author: { name: "The SpeedNum team", role: "Compliance" },
    sections: [
      {
        paragraphs: [
          "A corporation resident in Quebec files two corporate returns: a T2 with the Canada Revenue Agency and a CO-17 with Revenu Québec. It registers for two sales taxes, GST federally and QST provincially. It remits payroll source deductions to both administrations.",
          "Nearly every date is aligned. Almost is the problem — a calendar built on the assumption that the two administrations always agree will eventually be wrong on a date that matters.",
        ],
      },
      {
        heading: "Where firms actually get caught",
        paragraphs: [
          "Not on the annual returns, which are well known and well diarised. The failures cluster in the recurring obligations, where a difference in threshold or frequency between the two administrations means a client is monthly for one and quarterly for the other.",
          "A single calendar entry reading \"sales tax\" hides that difference until the month it bites.",
        ],
      },
      {
        heading: "One calendar, two administrations",
        paragraphs: [
          "The structural fix is to stop treating the administration as context and start treating it as data. Each obligation is its own record carrying its administration, its own frequency, and its own due rule — even where the two currently coincide.",
          "That way a threshold change that moves a client from quarterly to monthly QST changes one record, and the calendar follows. Nobody has to remember that this particular client is now different.",
        ],
        bullets: [
          "Model federal and provincial obligations as separate services, never as one entry.",
          "Give each its own frequency, so a divergence is a data change rather than a rewrite.",
          "Roll due dates forward past weekends and the statutory holidays that apply.",
          "Show both administrations on the same board, distinguished by label rather than by colour.",
        ],
      },
      {
        heading: "The payoff",
        paragraphs: [
          "A Quebec practice running this way stops carrying the two-administration difference as tribal knowledge. New staff see two obligations because there are two, and a client's calendar is complete without anyone remembering the exception.",
        ],
      },
    ],
  },
  {
    slug: "rolling-out-a-client-portal",
    category: "How-to",
    title: "Rolling out a client portal without losing half your clients on the way",
    excerpt:
      "A rollout plan for a firm client portal: segment clients, migrate in waves, script the announcement, and keep an off-ramp for the clients who will never log in.",
    date: "February 2027",
    order: 6,
    readMinutes: 7,
    author: { name: "The SpeedNum team", role: "Practice research" },
    sections: [
      {
        paragraphs: [
          "Portal rollouts fail in a predictable way: the firm announces it to everyone at once, a third of clients cannot get in, the support load spikes during a filing season, and the firm quietly goes back to email while still paying for the portal.",
          "The fix is sequencing, not software.",
        ],
      },
      {
        heading: "Segment before you announce",
        paragraphs: [
          "Sort the client book into three groups: clients who already interact digitally with the firm, clients who will adopt if walked through it once, and clients who will never log in.",
          "The third group is real and it is not a failure. A firm with 200 clients might have 25 who will always prefer paper or email, and planning for them up front is what prevents the rollout from being judged a failure.",
        ],
      },
      {
        heading: "Migrate in waves",
        paragraphs: [
          "Start with the first group — twenty or thirty clients who need no help. They surface the setup problems while the volume is small enough to fix them individually.",
          "Move to the second group in batches of twenty, timed away from filing season, each with a short call or a two-minute video. Do not batch a hundred invitations the week before a deadline.",
        ],
        bullets: [
          "Wave 1: digitally comfortable clients, no hand-holding. Fix what breaks.",
          "Wave 2: batches of ~20 with a walkthrough, outside filing season.",
          "Wave 3: the clients who need a phone call. Some will convert; plan as if they will not.",
          "Keep the off-ramp: email and paper stay available, quietly.",
        ],
      },
      {
        heading: "Script the announcement around the client's benefit",
        paragraphs: [
          "\"We are moving to a new system\" is a message about the firm. \"Your documents, deadlines and invoices are now in one place you can check any time\" is a message about the client.",
          "Say what changes, what does not, and what to do if they get stuck — with a named person, not a support address.",
        ],
      },
      {
        heading: "Measure adoption, not activation",
        paragraphs: [
          "Invitations accepted is a vanity number. The number that matters is clients who used the portal twice in a quarter — the second visit is the one that says the habit formed.",
          "Expect the third group never to move, and count the rollout a success on the first two.",
        ],
      },
    ],
  },
  {
    slug: "capacity-planning-before-t1-season",
    category: "How-to",
    title: "Capacity planning before T1 season, in one afternoon",
    excerpt:
      "A lightweight way to work out whether the firm can actually absorb the coming season — using the records you already have rather than a new spreadsheet.",
    date: "January 2027",
    order: 7,
    readMinutes: 6,
    author: { name: "The SpeedNum team", role: "Practice research" },
    sections: [
      {
        paragraphs: [
          "Most capacity planning in small firms happens in February, in the form of discovering that there is not any. The exercise below takes an afternoon in November and is usually enough.",
        ],
      },
      {
        heading: "Count the obligations, not the clients",
        paragraphs: [
          "Client count is a poor proxy for load. One corporate client with payroll, quarterly GST and a year-end is more work than four T1-only individuals.",
          "Count the obligations falling inside the season instead — every filing, remittance and year-end with a due date in the window. If services and cadences are recorded per client, this is a filter rather than a count-up.",
        ],
      },
      {
        heading: "Apply a rough hour estimate per obligation type",
        paragraphs: [
          "Not a precise one. A simple T1 is an hour, a T1 with rental and investment income is three, a T2 with a bookkeeping catch-up is fifteen. Multiply, and you have a total that is wrong in the details and right in the order of magnitude.",
          "That total is the number to compare against real capacity.",
        ],
      },
      {
        heading: "Real capacity is not headcount times hours",
        paragraphs: [
          "Take each person's weekly capacity, subtract review time, admin, holidays and the hours that non-season work will still consume. What remains is usually 55–70% of the nominal figure.",
          "If the obligation estimate exceeds that, the season is already oversubscribed and you have three months to do something about it — decline work, move deadlines forward, add seasonal help, or drop a service line.",
        ],
        bullets: [
          "Count obligations in the window, not clients.",
          "Rough hours per obligation type — order of magnitude is enough.",
          "Discount nominal capacity by a third before comparing.",
          "Decide in November. February is not a planning month.",
        ],
      },
    ],
  },
  {
    slug: "pricing-recurring-services",
    category: "Opinion & benchmarks",
    title: "Pricing recurring services when every client is a special case",
    excerpt:
      "Why per-client pricing drifts, what a services catalogue with overrides fixes, and how to raise fees on a recurring book without a negotiation per client.",
    date: "January 2027",
    order: 8,
    readMinutes: 7,
    author: { name: "The SpeedNum team", role: "Practice research" },
    sections: [
      {
        paragraphs: [
          "Ask a firm what it charges for quarterly bookkeeping and you will usually get a range, then a pause, then \"it depends on the client\". Both parts are true, and the pause is the problem.",
        ],
      },
      {
        heading: "How pricing drifts",
        paragraphs: [
          "A firm sets a price, then discounts for a client who was a favour, then holds a price for three years because raising it means a conversation, then quotes a new client from memory of the last quote rather than from the list.",
          "After five years the book has no price structure — it has a history. Two similar clients pay materially different fees for reasons nobody can now reconstruct.",
        ],
      },
      {
        heading: "A catalogue with explicit overrides",
        paragraphs: [
          "The fix is not to eliminate per-client pricing; it is to make it explicit. Keep one catalogue price per service, and record each client's deviation as an override on their record.",
          "The catalogue answers \"what do we charge for this?\" The override answers \"and why is this client different?\" — and because the override is a field rather than a memory, it survives the person who granted it.",
        ],
      },
      {
        heading: "Raising fees on a recurring book",
        paragraphs: [
          "With a catalogue, an increase is one change to the catalogue price plus a decision about which overrides to retire. Without one, it is a negotiation per client, which is why most firms do not do it.",
          "The mechanical part matters more than it sounds: firms that can see the whole fee structure at once raise fees more regularly and by smaller increments, which clients tolerate far better than a 20% correction every five years.",
        ],
        bullets: [
          "One catalogue price per service, visible to everyone quoting.",
          "Per-client overrides recorded as data, with a note on why.",
          "Recurring revenue computed from assignments, not maintained by hand.",
          "Smaller, more frequent increases beat rare corrections.",
        ],
      },
    ],
  },
  {
    slug: "why-deadline-spreadsheets-fail",
    category: "Deadlines & compliance",
    title: "Why the deadline spreadsheet always fails eventually",
    excerpt:
      "The three failure modes of a hand-maintained compliance calendar — staleness, single ownership and silent divergence — and what replaces it.",
    date: "December 2026",
    order: 9,
    readMinutes: 5,
    author: { name: "The SpeedNum team", role: "Compliance" },
    sections: [
      {
        paragraphs: [
          "Almost every firm starts with a deadline spreadsheet, and it works. It works for years. Then it does not, and the failure is rarely dramatic — it is one date, on one client, in a busy month.",
        ],
      },
      {
        heading: "Failure one: it goes stale where nobody looks",
        paragraphs: [
          "A spreadsheet records the state of the world on the day someone updated it. A client changes their fiscal year-end, or crosses a GST threshold and becomes monthly, and the row does not change unless a person changes it.",
          "The stale rows are invisible precisely because they look identical to the correct ones.",
        ],
      },
      {
        heading: "Failure two: it has exactly one real owner",
        paragraphs: [
          "There is always one person who understands the tab structure, the colour coding and which columns are formulas. The calendar's reliability is that person's attendance record.",
          "This is fine until they are on leave in March.",
        ],
      },
      {
        heading: "Failure three: copies diverge silently",
        paragraphs: [
          "Someone downloads it to work offline. Someone else emails a version to a partner. Two people now hold documents that disagree, and neither knows.",
          "By the time the divergence is found, the question is not which copy is right but which filings were made from the wrong one.",
        ],
      },
      {
        heading: "What actually replaces it",
        paragraphs: [
          "Not a better spreadsheet, and not a shared calendar — a calendar is still hand-maintained, it just fails in a nicer font. The replacement is derivation: dates computed from the client's fiscal year-end and service cadences, so changing the client's data changes the calendar.",
          "The test is simple. Change a client's year-end and see whether the deadlines move on their own. If a person has to move them, the failure modes above are still present, whatever the tool is called.",
        ],
      },
    ],
  },
];

export const POSTS_SORTED = [...POSTS].sort((a, b) => a.order - b.order);
export const POST_BY_SLUG = new Map(POSTS.map((post) => [post.slug, post]));
export const POST_SLUGS = POSTS.map((post) => post.slug);
export const BLOG_CATEGORIES = Array.from(new Set(POSTS.map((post) => post.category)));
