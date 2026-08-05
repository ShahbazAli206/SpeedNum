/**
 * Illustrative firm scenarios for /case-studies and /case-studies/[slug].
 *
 * These are deliberately *archetypes*, not customer stories. No client names,
 * no quotes and no measured results — the disclaimer on the index page says so
 * plainly, and every page repeats it. Do not add outcome numbers here without
 * real, attributable evidence behind them.
 */

export interface CaseStudy {
  slug: string;
  location: string;
  title: string;
  summary: string;
  /** Right-aligned footnote on the index card. */
  scale: string;
  challenge: string[];
  approach: { heading: string; body: string }[];
  /** Modules this archetype leans on, by feature slug. */
  modules: string[];
  dayToDay: string[];
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "two-partner-toronto-tax-practice",
    location: "Toronto, Ontario",
    title: "A two-partner Toronto tax practice",
    summary: "T1 season triage for a two-partner Toronto practice",
    scale: "Two partners and three seasonal staff",
    challenge: [
      "A practice whose volume is concentrated into ten weeks has a scheduling problem, not a capacity problem. The same five people who are comfortable in September are the constraint in March.",
      "The usual failure is not missing the filing date — it is discovering in the last fortnight which returns are still waiting on client documents, when there is no longer time to chase them.",
    ],
    approach: [
      {
        heading: "Every return is a project with a status",
        body: "A project per client per season, with ordered tasks, means \"waiting on documents\" is a column rather than a recollection. The board answers what is blocked without anyone being asked.",
      },
      {
        heading: "Chase from the board, in batches",
        body: "Because blocked returns are filterable, document chasing happens once a week against a list, rather than continuously against whoever comes to mind.",
      },
      {
        heading: "Seasonal staff onboard against the record",
        body: "A seasonal hire opens a client and sees contacts, services, prior letters and what is due. The ramp-up does not consume a partner's chargeable time.",
      },
    ],
    modules: ["workflow", "deadlines", "client-management", "internal-team"],
    dayToDay: [
      "Blocked returns are a filter, checked weekly, not a memory exercise in April.",
      "Partners see the whole season's state on one board rather than in a status meeting.",
      "Seasonal staff answer client questions from the record instead of interrupting a partner.",
    ],
  },
  {
    slug: "calgary-firm-three-gst-cadences",
    location: "Calgary, Alberta",
    title: "A Calgary firm with three GST/HST cadences",
    summary: "Mixed GST/HST cadences across 60 Calgary bookkeeping clients",
    scale: "Four staff",
    challenge: [
      "Sixty bookkeeping clients on a mix of monthly, quarterly and annual GST cadences is sixty separate recurring calendars, and the differences between them are invisible in a client list.",
      "When a client crosses a threshold and changes cadence, a hand-maintained calendar only changes if someone remembers to change it.",
    ],
    approach: [
      {
        heading: "Cadence lives on the service assignment",
        body: "Each client's GST service carries its own frequency. Changing a client from quarterly to monthly is one field, and every future date follows from it.",
      },
      {
        heading: "One feed, triaged by proximity",
        body: "Sixty calendars render as one feed sorted by urgency, so the question is never \"whose GST is due?\" but \"what is red this week?\"",
      },
      {
        heading: "Remittances roll past holidays",
        body: "Dates landing on a weekend or an Alberta statutory holiday move forward automatically rather than being adjusted by hand each year.",
      },
    ],
    modules: ["services-catalogue", "deadlines", "client-management"],
    dayToDay: [
      "A cadence change is a data edit, not a calendar rebuild.",
      "The week's remittances are one filtered list across the whole book.",
      "New clients inherit the correct cadence at onboarding rather than at the first missed period.",
    ],
  },
  {
    slug: "montreal-dual-filing-practice",
    location: "Montréal, Quebec",
    title: "A Montréal dual-filing practice",
    summary: "CRA and Revenu Québec deadlines on one board in Montréal",
    scale: "Six staff",
    challenge: [
      "Quebec corporations file with two administrations. Most dates align, which is exactly what makes the ones that do not so easy to miss.",
      "Firms that carry the difference as tribal knowledge lose it the moment a staff member who holds it is unavailable.",
    ],
    approach: [
      {
        heading: "Two obligations, modelled as two services",
        body: "Federal and provincial filings are separate service assignments with their own cadences and due rules, even where the dates currently coincide.",
      },
      {
        heading: "The administration is a label, not a colour",
        body: "Colour is reserved for urgency across the whole firm. The administration reads from the service code, so the SLA triage keeps one meaning.",
      },
      {
        heading: "New staff see two because there are two",
        body: "Nobody needs to be told about the divergence — the board shows both obligations for every client that has both.",
      },
    ],
    modules: ["deadlines", "services-catalogue", "custom-fields"],
    dayToDay: [
      "A QST frequency change is one record edit and the calendar follows.",
      "Staff who have never worked a Quebec file still see the full obligation set.",
      "Both administrations appear on the same board without competing colour schemes.",
    ],
  },
  {
    slug: "halifax-solo-cpa-engagement-letters",
    location: "Halifax, Nova Scotia",
    title: "A Halifax solo CPA's engagement letters",
    summary: "Engagement letters signed before the work starts, solo practice",
    scale: "One CPA",
    challenge: [
      "A solo practitioner drafting letters by hand tends to start the work before the letter comes back, because chasing a signature costs time the practice does not have.",
      "That is fine until a scope disagreement, at which point there is nothing on the record.",
    ],
    approach: [
      {
        heading: "The letter is generated, not written",
        body: "Line items come from the client's assigned services, already priced. Producing a letter takes a minute rather than half an hour.",
      },
      {
        heading: "Signing needs no account",
        body: "A branded link and a typed signature removes the print-sign-scan loop that stalls most letters.",
      },
      {
        heading: "Unsigned is a number, not a worry",
        body: "Letters awaiting signature is a dashboard figure, so the practice knows what is outstanding without reconstructing it from sent mail.",
      },
    ],
    modules: ["engagements", "services-catalogue", "client-portal"],
    dayToDay: [
      "Letters go out the same day the engagement is agreed.",
      "Scope is on the record before the first hour is worked.",
      "Chasing signatures is a filtered list, not an inbox search.",
    ],
  },
  {
    slug: "three-office-vancouver-firm",
    location: "Vancouver, British Columbia",
    title: "A three-office Vancouver firm",
    summary: "Cross-office workload visibility for an 18-person BC firm",
    scale: "Eighteen staff across three offices",
    challenge: [
      "Multi-office firms tend to load-balance within an office rather than across the firm, because nobody can see the other offices' capacity at the moment of assignment.",
      "The result is one office working weekends while another has room.",
    ],
    approach: [
      {
        heading: "One roster, computed load",
        body: "Open tasks, clients handled and overdue counts are computed from the task records for every member, regardless of office.",
      },
      {
        heading: "Capacity in the same view as load",
        body: "Each member carries a weekly capacity, so the comparison is against a number rather than an impression.",
      },
      {
        heading: "Assignment is a firm-level decision",
        body: "Work can be routed to whoever has room, not to whoever is nearby.",
      },
    ],
    modules: ["internal-team", "workflow", "reporting"],
    dayToDay: [
      "Overload shows up in November instead of February.",
      "Assignment conversations reference a roster, not seniority.",
      "Cover during leave is a filter on the departing person's book.",
    ],
  },
  {
    slug: "winnipeg-family-firm-going-paperless",
    location: "Winnipeg, Manitoba",
    title: "A Winnipeg family firm going paperless",
    summary: "Succession-driven digitisation at a Manitoba family firm",
    scale: "Five staff",
    challenge: [
      "A firm passing to the next generation usually discovers that a large part of its operating knowledge is not written down anywhere — it is in the retiring partner's head and in a filing cabinet.",
      "Digitising the cabinet is the easy half. Digitising the knowledge is the succession risk.",
    ],
    approach: [
      {
        heading: "Custom fields capture what the partner knows",
        body: "The attributes the firm actually manages by — who signs, referral source, sensitivities — become typed fields on the client record instead of notes.",
      },
      {
        heading: "Documents attach to the client, not to a folder tree",
        body: "Files live on the record they belong to, so finding last year's return does not require knowing the naming convention.",
      },
      {
        heading: "Deadlines stop depending on one memory",
        body: "Dates derived from fiscal year-ends and cadences survive the retirement that would otherwise take them.",
      },
    ],
    modules: ["custom-fields", "client-portal", "deadlines", "csv-import"],
    dayToDay: [
      "The successor can open any client and see the full relationship.",
      "Client history is searchable rather than filed alphabetically in a room.",
      "The calendar keeps working after the partner who maintained it stops.",
    ],
  },
  {
    slug: "ottawa-practice-80-year-ends",
    location: "Ottawa, Ontario",
    title: "An Ottawa practice with 80 year-ends",
    summary: "Staggered corporate year-ends at an Ottawa niche practice",
    scale: "Seven staff",
    challenge: [
      "Eighty corporate clients with year-ends spread across all twelve months means there is no off-season — but also no obvious peak to plan against.",
      "Firms in this position often discover a cluster only when three year-ends land in the same fortnight.",
    ],
    approach: [
      {
        heading: "Year-ends are derived, so the distribution is visible",
        body: "Deadlines generated from each client's fiscal year-end produce a by-month view that shows clusters months ahead.",
      },
      {
        heading: "Lead times move the work, not the deadline",
        body: "Each service carries a lead time, so preparation starts early enough that a cluster is absorbed rather than survived.",
      },
      {
        heading: "Reporting shows filed against due",
        body: "On-time filing rate is measured from the records, so drift is visible before it becomes a pattern.",
      },
    ],
    modules: ["deadlines", "reporting", "workflow"],
    dayToDay: [
      "Clusters are visible a quarter ahead and staffed for.",
      "Preparation starts on a lead time rather than on a reminder.",
      "On-time performance is a measured number the partners can act on.",
    ],
  },
  {
    slug: "saskatoon-agri-bookkeeping-firm",
    location: "Saskatoon, Saskatchewan",
    title: "A Saskatoon agri-bookkeeping firm",
    summary: "Seasonal client availability at a Saskatchewan agri practice",
    scale: "Three staff",
    challenge: [
      "Agricultural clients are unreachable for months at a time. A document request sent during seeding is a document request sent into a void.",
      "The firm's constraint is not its own capacity but its clients' availability windows.",
    ],
    approach: [
      {
        heading: "Availability is a field on the client",
        body: "A custom field recording each client's unreachable window turns \"they never answer in May\" into data the whole firm can filter on.",
      },
      {
        heading: "Lead times set to the window, not the deadline",
        body: "Services carry lead times long enough that requests go out before the window closes.",
      },
      {
        heading: "The portal collects what the phone cannot",
        body: "Clients upload when they have a spare evening, rather than when the firm happens to call.",
      },
    ],
    modules: ["custom-fields", "services-catalogue", "client-portal", "deadlines"],
    dayToDay: [
      "Document requests go out before the client becomes unreachable.",
      "Nobody wastes a week phoning clients who are in a field.",
      "Seasonal patterns are recorded rather than remembered.",
    ],
  },
  {
    slug: "mississauga-practice-250-t2-files",
    location: "Mississauga, Ontario",
    title: "A Mississauga practice at 250 T2 files",
    summary: "Making stalled T2 files visible at 250-file volume",
    scale: "Nine staff",
    challenge: [
      "At 250 corporate files, a stalled file is statistically invisible. It is not late, it is not urgent, and it is not on anyone's list — until it is three weeks from the deadline.",
      "Volume defeats attention; only structure survives it.",
    ],
    approach: [
      {
        heading: "Every file is a project with a last-movement date",
        body: "A file that has not changed status in three weeks stands out on a board in a way it never does in an inbox.",
      },
      {
        heading: "Needs-attention is computed",
        body: "Overdue deadlines, unsigned letters and blocked tasks collect into one list rather than three habits.",
      },
      {
        heading: "Assignment is explicit",
        body: "Every file has one owner, so a stalled file always has someone to ask.",
      },
    ],
    modules: ["workflow", "reporting", "notifications", "internal-team"],
    dayToDay: [
      "Stalled files surface weekly instead of at the deadline.",
      "The needs-attention list replaces three separate personal checks.",
      "Every file has an owner, so nothing is collectively nobody's.",
    ],
  },
  {
    slug: "edmonton-firm-white-label-portal",
    location: "Edmonton, Alberta",
    title: "An Edmonton firm launching a branded portal",
    summary: "White-label portal rollout at an Edmonton practice",
    scale: "Eleven staff",
    challenge: [
      "A firm that has spent years building its brand does not want its client-facing software to advertise someone else's.",
      "Half-branding is worse than none: a branded login followed by a vendor-branded email tells the client exactly what is happening.",
    ],
    approach: [
      {
        heading: "Branding resolves per tenant at runtime",
        body: "Name, logo, colours and letter footer apply to the portal, the signing pages, the letter PDFs and the emails.",
      },
      {
        heading: "The address belongs to the firm",
        body: "A firm subdomain from day one, and the firm's own domain by CNAME when it is ready.",
      },
      {
        heading: "Isolation is enforced below the app",
        body: "Row-level security means the branding promise is backed by a data boundary, not just a stylesheet.",
      },
    ],
    modules: ["white-label", "custom-domains", "client-portal", "security"],
    dayToDay: [
      "Clients see the firm's brand from the sign-in page to the email footer.",
      "The firm can answer security questions about isolation with specifics.",
      "Nothing in the client experience names the underlying platform.",
    ],
  },
  {
    slug: "victoria-bookkeeping-collective",
    location: "Victoria, British Columbia",
    title: "A Victoria bookkeeping collective",
    summary: "Shared standards across independent bookkeepers in Victoria",
    scale: "Six independent bookkeepers",
    challenge: [
      "A collective of independents shares a brand and a client-facing promise but not a working method. Each member records clients differently, which makes cover between members expensive.",
      "The shared brand is a liability when the underlying consistency is not there.",
    ],
    approach: [
      {
        heading: "One catalogue defines the vocabulary",
        body: "Services are defined once for the collective, so a service means the same thing whoever delivers it.",
      },
      {
        heading: "Custom fields enforce the minimum record",
        body: "Required fields mean every client record carries the same baseline regardless of who created it.",
      },
      {
        heading: "Cover is a reassignment, not a handover meeting",
        body: "Because records are consistent, another member can pick up a file from the record alone.",
      },
    ],
    modules: ["services-catalogue", "custom-fields", "client-management", "internal-team"],
    dayToDay: [
      "Any member can cover any client without a briefing call.",
      "The client experience is the same whoever answers.",
      "Onboarding a new member is a matter of access, not retraining.",
    ],
  },
  {
    slug: "st-johns-practice-remote-clients",
    location: "St. John's, Newfoundland and Labrador",
    title: "A St. John's practice with remote clients",
    summary: "Serving clients across time zones and outports from St. John's",
    scale: "Four staff",
    challenge: [
      "A practice serving clients spread across a province with poor connectivity cannot rely on synchronous contact. Phone tag consumes the week.",
      "Asynchronous only works if the client can see the state of their own file without asking.",
    ],
    approach: [
      {
        heading: "The portal answers the routine question",
        body: "Deadlines, documents and invoice status are visible to the client, so the common questions never become calls.",
      },
      {
        heading: "Digests replace status calls",
        body: "A daily summary of what is due keeps both sides current without a scheduled conversation.",
      },
      {
        heading: "Signatures do not need a meeting",
        body: "A no-login signing link works from a phone on a bad connection.",
      },
    ],
    modules: ["client-portal", "notifications", "engagements", "deadlines"],
    dayToDay: [
      "Routine status questions stop arriving as calls.",
      "Clients act on their own deadlines rather than waiting to be reminded.",
      "Engagements are signed without a scheduled appointment.",
    ],
  },
];

export const CASE_STUDY_BY_SLUG = new Map(CASE_STUDIES.map((study) => [study.slug, study]));
export const CASE_STUDY_SLUGS = CASE_STUDIES.map((study) => study.slug);

export const CASE_STUDY_DISCLAIMER =
  "Every scenario below is illustrative. SpeedNum does not publish customer results it has not measured, so these pages describe firm archetypes and the workflow that fits them — no client names, no quotes, no numbers we cannot stand behind.";
