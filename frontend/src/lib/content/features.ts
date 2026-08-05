/**
 * The fifteen product modules.
 *
 * Each entry drives three surfaces from one record: the header mega-menu, the
 * /features index card, and the full /features/[slug] page. Adding a module
 * here is the only edit needed to make it appear in all three.
 */

export interface FeatureSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface FeatureModule {
  slug: string;
  /** Small caps label above the title. */
  eyebrow: string;
  /** Short name used in the mega-menu and footer. */
  navLabel: string;
  /** Full page title. */
  title: string;
  /** One-line description under the nav label. */
  tagline: string;
  /** Lead paragraph on the detail page. */
  intro: string;
  /** Lucide icon name, resolved by the icon map in components/icon.tsx. */
  icon: string;
  /** Three benefit cards under the detail hero. */
  highlights: { title: string; body: string }[];
  sections: FeatureSection[];
  /** "What ships in the module" checklist. */
  ships: string[];
  /** Shown in the mega-menu only for the eight primary modules. */
  primary?: boolean;
}

export const FEATURES: FeatureModule[] = [
  {
    slug: "client-management",
    eyebrow: "Client CRM",
    navLabel: "Client CRM",
    title: "Client management for accounting firms",
    tagline: "Client management for accounting firms",
    intro:
      "A practical product capability for Canadian accounting and bookkeeping practices.",
    icon: "users",
    primary: true,
    highlights: [
      {
        title: "Central client and contact records",
        body: "Legal name, fiscal year-end, status, plan and an assigned manager — with as many contacts as the client has, each labelled with a designation.",
      },
      {
        title: "Service and reporting-frequency visibility",
        body: "Every assigned service and its next-due date hangs off the same record, so what the client buys and what is due next read together.",
      },
      {
        title: "Clear ownership across the firm",
        body: "One assigned manager per client and per service, so cover for a colleague never starts with an archaeology session.",
      },
    ],
    sections: [
      {
        heading: "Where does client knowledge live in most firms?",
        paragraphs: [
          "Usually in fragments: a master spreadsheet that is three versions behind, an inbox that only one partner can search, and the memory of whoever handled the file last. The firm knows its clients — but no single place does.",
          "The cost shows up at the worst moments. A staff member covering a colleague's file cannot find the signing officer's number. A fiscal year-end recorded wrong in one copy of the spreadsheet quietly shifts a filing season. Client questions get answered from recollection rather than from the record.",
        ],
      },
      {
        heading: "How the Client CRM works",
        paragraphs: [
          "Each client is one record carrying legal name, fiscal year-end, status, plan and an assigned manager, with as many contacts as the client has — each contact labelled with a designation, so the bookkeeper, the signing officer and the payroll contact are distinct people, not one phone number.",
          "The record is where the rest of the system attaches. Assigned services and their next-due dates, engagement letters and their signature status, portal access and documents all hang off the client, and administrators can add custom fields for whatever else the firm tracks.",
        ],
        bullets: [
          "Structured fields: legal name, fiscal year-end, status, plan, assigned manager",
          "Multiple contacts per client, each with a designation",
          "CSV/XLSX import and export with a downloadable template",
          "Portal invites by magic link with a temporary password",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Anyone can open a client and see the whole relationship in one screen: who to call, what services the client buys, what is due next and what has been signed. Cover for a colleague without an archaeology session first.",
          "Because fiscal year-ends and service cadences live on the record, they drive the Reminders feed automatically — recording the data once is what puts the deadlines on the board. The client file stops being admin overhead and starts being the thing that runs the work.",
        ],
      },
    ],
    ships: [
      "Client records hold legal name, fiscal year-end, status, plan and an assigned manager.",
      "Each client can carry multiple contacts, each labelled with a designation.",
      "Clients import from CSV or XLSX with a template download, and export the same way.",
      "Administrators can define custom fields that appear on every client record.",
      "Portal invites send a magic link with a temporary password and force a password change on first sign-in.",
    ],
  },
  {
    slug: "client-onboarding",
    eyebrow: "Client onboarding",
    navLabel: "Client onboarding",
    title: "Client onboarding & portal invites",
    tagline: "Client onboarding & portal invites",
    intro:
      "From first record to deadline-tracked client: contacts, services, e-signed letter and branded portal invite in one path.",
    icon: "user-plus",
    primary: true,
    highlights: [
      {
        title: "One guided path",
        body: "Create the client, attach contacts, assign services, price the letter and send the invite without leaving the flow.",
      },
      {
        title: "Deadlines from day one",
        body: "The moment services and a fiscal year-end are set, the deadline engine generates the client's calendar.",
      },
      {
        title: "Branded from the first email",
        body: "The invite, the letter and the portal all carry the firm's name, logo and colours — never ours.",
      },
    ],
    sections: [
      {
        heading: "Onboarding is where firms lose the most time",
        paragraphs: [
          "A new client typically means a spreadsheet row, a folder, a letter drafted from the last client's letter, a calendar entry someone remembers to make, and an email explaining how to send documents. Five systems, five chances to skip a step.",
          "Skipped steps are invisible until the season. A client onboarded without a fiscal year-end has no year-end deadline. A client onboarded without a signed letter has no scope on record when the scope is questioned.",
        ],
      },
      {
        heading: "How onboarding works",
        paragraphs: [
          "Onboarding runs as one path with the steps in a fixed order: client details and fiscal year-end, contacts and designations, services from the catalogue, an engagement letter priced from those services, then the portal invite.",
          "Each step writes to the same client record, so nothing is re-keyed and nothing is optional-by-accident — an incomplete client is visibly incomplete rather than silently missing its deadlines.",
        ],
        bullets: [
          "Fixed-order steps with a visible completion state",
          "Services assigned from the catalogue, priced into the letter automatically",
          "Portal invite by magic link with a forced password change",
          "Deadlines generated as soon as year-end and cadences are known",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Onboarding becomes something an administrator can complete, not a partner task. The output is consistent: every client arrives with contacts, services, a signed letter and portal access.",
          "Because the same path always runs, the firm can tell at a glance which clients are fully onboarded and which are still missing a signature or a year-end.",
        ],
      },
    ],
    ships: [
      "A fixed-order onboarding path from client details to portal invite.",
      "Services assigned from the catalogue during onboarding, with per-client price overrides.",
      "An engagement letter drafted from the assigned services and sent for e-signature.",
      "Portal invites by magic link with a temporary password.",
      "Automatic deadline generation once the fiscal year-end and cadences are recorded.",
    ],
  },
  {
    slug: "csv-import",
    eyebrow: "CSV/XLSX import",
    navLabel: "CSV/XLSX import",
    title: "Client data import & export",
    tagline: "Client data import & export",
    intro:
      "Template-driven CSV/XLSX import and full export — off the spreadsheet in an afternoon, never locked in.",
    icon: "file-spreadsheet",
    primary: true,
    highlights: [
      {
        title: "Template-driven",
        body: "Download a template that matches your columns, fill it, upload it. No mapping puzzle on the first try.",
      },
      {
        title: "Preview before commit",
        body: "Every row is validated and shown with its errors before a single record is written.",
      },
      {
        title: "Export is always available",
        body: "The whole client book exports to CSV or XLSX on demand. Your data is never hostage to the platform.",
      },
    ],
    sections: [
      {
        heading: "Migration is the reason firms stay on spreadsheets",
        paragraphs: [
          "Most practice-management evaluations die at the same step: someone estimates the hours to re-key 200 clients and the project quietly stops. The software was never the problem — the migration was.",
          "The second fear is the mirror of the first. A firm that does migrate wants to know it can leave, and a platform with no export is a platform that has to be trusted forever.",
        ],
      },
      {
        heading: "How import and export work",
        paragraphs: [
          "Download the template, which carries the exact column headers the importer expects. Paste the spreadsheet in, upload it, and the importer detects the column mapping and validates every row.",
          "The preview shows the total row count, how many rows are valid, and the specific errors on the rows that are not — a bad province code, a missing legal name, a fiscal year-end that is not a date. Fix and re-upload, or import the valid rows and handle the rest by hand.",
        ],
        bullets: [
          "Downloadable template with the expected headers",
          "Automatic column-mapping detection on upload",
          "Row-level validation with a preview before anything is written",
          "Full client export to CSV or XLSX at any time",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Getting onto the platform is an afternoon, not a project. A firm can trial the product with its real client book rather than with five test records.",
          "Ongoing, the same importer handles bulk updates — a fee change across a plan, a batch of new clients from an acquisition — without touching records one at a time.",
        ],
      },
    ],
    ships: [
      "A downloadable CSV/XLSX template matching the importer's expected columns.",
      "Automatic column mapping detection with a manual override.",
      "Row-by-row validation and an error preview before commit.",
      "A created / updated / failed summary after every import.",
      "Full client export to CSV or XLSX.",
    ],
  },
  {
    slug: "custom-fields",
    eyebrow: "Custom fields",
    navLabel: "Custom fields",
    title: "Admin-defined custom client fields",
    tagline: "Admin-defined custom client fields",
    intro:
      "Admin-defined fields on every client record — the attributes your firm tracks, structured instead of buried in notes.",
    icon: "sliders-horizontal",
    primary: true,
    highlights: [
      {
        title: "Typed fields, not free text",
        body: "Text, number, date, select, checkbox, email and phone — each validated, each filterable.",
      },
      {
        title: "Defined by administrators",
        body: "No developer, no support ticket. An admin adds the field and it appears on every client record.",
      },
      {
        title: "Structured, so it is usable",
        body: "A typed field can be filtered, exported and reported on. A note cannot.",
      },
    ],
    sections: [
      {
        heading: "Every firm tracks something the software did not anticipate",
        paragraphs: [
          "A referral source. A CRA My Business Account status. Which partner signs. Whether the client is on pre-authorised debit. The attribute is always specific to the practice, and the software never ships with it.",
          "So it goes in the notes field, where it cannot be filtered, cannot be exported cleanly, and is written differently by every person who records it.",
        ],
      },
      {
        heading: "How custom fields work",
        paragraphs: [
          "An administrator defines the field once: a label, a type, whether it is required, and — for select fields — the list of allowed options. The field then appears on every client record, in the position the admin chose.",
          "Because the field is typed, it behaves like a built-in one: select fields render as dropdowns with a fixed option list, dates use the date picker, and every value comes through the export.",
        ],
        bullets: [
          "Seven field types: text, number, date, select, checkbox, email, phone",
          "Required-field enforcement and help text per field",
          "Ordered positions, so the record reads the way the firm thinks",
          "Values included in the client export",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "The notes field goes back to being notes. The attributes the firm actually manages by become real data — filterable in the client list, present in exports, consistent between staff.",
          "New staff record the same things the same way, because the form asks for them rather than relying on someone knowing to write them down.",
        ],
      },
    ],
    ships: [
      "Administrator-defined fields on the client record, with seven field types.",
      "Per-field help text, required flags and select option lists.",
      "Ordered field positions on the record.",
      "Custom values included in CSV/XLSX export.",
    ],
  },
  {
    slug: "services-catalogue",
    eyebrow: "Services catalogue",
    navLabel: "Services catalogue",
    title: "Services catalogue & recurring cadence",
    tagline: "Services catalogue & recurring cadence",
    intro:
      "Typed services with code, frequency and price — assigned per client with overrides, next-due dates driving the work.",
    icon: "tag",
    primary: true,
    highlights: [
      {
        title: "One catalogue, one vocabulary",
        body: "T4, T5, GST/HST, bookkeeping, year-end — each defined once with a code, a cadence and a default price.",
      },
      {
        title: "Cadence drives the calendar",
        body: "A service's frequency and due rule are what generate the client's deadlines. Define it once, it runs forever.",
      },
      {
        title: "Per-client overrides",
        body: "Assign a catalogue service to a client and override the price or the frequency without forking the catalogue.",
      },
    ],
    sections: [
      {
        heading: "Services are the firm's real unit of work",
        paragraphs: [
          "Firms do not sell hours to most clients; they sell a recurring set of services. But when those services only exist in an engagement letter and a fee schedule, nothing else in the system knows about them.",
          "The consequence is that the calendar, the pricing and the work are three separate acts of memory instead of one definition.",
        ],
      },
      {
        heading: "How the catalogue works",
        paragraphs: [
          "Each service carries a code, a name, a category, a frequency (annual, semi-annual, quarterly, monthly or one-time), a default price, a lead time and a due rule that describes when it is due relative to a period end.",
          "Assign the service to a client and it becomes a live obligation: the due rule and the client's fiscal year-end together generate the next-due dates, and the price flows into engagement letters. Override the price or cadence for a specific client without changing the catalogue entry.",
        ],
        bullets: [
          "Service code, category, frequency, lead time and default price",
          "CRA-style due rules evaluated against each client's fiscal year-end",
          "Per-client price and frequency overrides",
          "Assigned services visible on the client record and in reporting",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Pricing conversations reference the same list the deadlines come from. Recurring revenue becomes a number the system can compute instead of one someone maintains in a spreadsheet.",
          "Adding a service to a client is the single act that puts it on the calendar, in the letter, and in the reporting.",
        ],
      },
    ],
    ships: [
      "A firm-wide services catalogue with code, category, frequency, lead time and default price.",
      "Due rules evaluated against each client's fiscal year-end.",
      "Per-client assignment with price and frequency overrides.",
      "Assigned-service counts and recurring revenue in reporting.",
    ],
  },
  {
    slug: "workflow",
    eyebrow: "Workflow",
    navLabel: "Workflow",
    title: "Accounting workflow automation",
    tagline: "Accounting workflow automation",
    intro:
      "Task Master: a project per client per period with ordered tasks, table/Kanban toggle and inline status changes.",
    icon: "kanban",
    primary: true,
    highlights: [
      {
        title: "A project per client per period",
        body: "Q3 bookkeeping for Maple Leaf is one project with its own tasks, assignee and due date.",
      },
      {
        title: "Table or Kanban, same data",
        body: "Partners want a table they can sort. Staff want a board they can drag. Both read the same records.",
      },
      {
        title: "Status changes inline",
        body: "Move a task without opening it. The project's completion percentage updates as you go.",
      },
    ],
    sections: [
      {
        heading: "The work exists; the visibility does not",
        paragraphs: [
          "Most firms know what has to happen for a year-end. It is a known sequence. What they lack is a shared view of where each file is in that sequence right now.",
          "Without it, status is a meeting. Someone asks, someone remembers, someone is wrong.",
        ],
      },
      {
        heading: "How Task Master works",
        paragraphs: [
          "A project is created per client per period — Q3 GST for one client, the 2026 year-end for another — carrying a period label, a due date, an assignee and a status. Inside it sits an ordered list of tasks, each with its own status, priority, assignee and estimate.",
          "The same set of projects renders as a sortable table or as a Kanban board grouped by status. Changing a task's status from either view writes to the same record and rolls up into the project's completion count.",
        ],
        bullets: [
          "Projects scoped to a client and a period, with a due date and an owner",
          "Ordered tasks with status, priority, assignee, due date and estimate",
          "Table and Kanban views over the same records",
          "Completion counts rolled up to the project",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "The status meeting becomes a screen. A partner filters to what is in review; a manager filters to what is blocked; a staff member sees only their own column.",
          "Because tasks carry estimates and assignees, the same records feed the workload numbers on the team roster — nobody maintains a second capacity spreadsheet.",
        ],
      },
    ],
    ships: [
      "Projects per client per period with status, assignee, due date and budget hours.",
      "Ordered tasks with status, priority, assignee, due date and estimated hours.",
      "A table view and a Kanban board over the same task records.",
      "Inline status changes and rolled-up completion counts.",
    ],
  },
  {
    slug: "internal-team",
    eyebrow: "Internal team",
    navLabel: "Internal Team",
    title: "Team workload & assignment",
    tagline: "Team workload & assignment",
    intro:
      "A staff roster with live-computed workload — clients handled and open tasks per accountant — for assignment decisions made on numbers.",
    icon: "network",
    primary: true,
    highlights: [
      {
        title: "Workload computed, not reported",
        body: "Open tasks, clients handled and overdue counts come from the task records themselves.",
      },
      {
        title: "Capacity in the same view",
        body: "Each member carries a weekly capacity, so load reads against something rather than in the abstract.",
      },
      {
        title: "Roles that mean something",
        body: "Owner, admin, member and viewer — enforced by the API, not just hidden in the UI.",
      },
    ],
    sections: [
      {
        heading: "Assignment is usually a guess",
        paragraphs: [
          "\"Who has room?\" is answered by whoever speaks first, or by whoever is least likely to say no. The firm rarely has a number in front of it at the moment the decision is made.",
          "By the time overload is visible it is February and the person carrying it has been carrying it since December.",
        ],
      },
      {
        heading: "How the team roster works",
        paragraphs: [
          "Every staff member has a profile carrying a role, a title and a weekly capacity. Against that profile the system computes, live from the task and client records, how many clients they handle, how many tasks are open, and how many of those are overdue.",
          "Because the numbers are computed rather than entered, they cannot drift. Reassigning a task changes both people's counts immediately.",
        ],
        bullets: [
          "Roles: owner, admin, member, viewer — enforced server-side",
          "Weekly capacity per member",
          "Live counts of clients handled, open tasks and overdue tasks",
          "Invitations by email with an expiring token",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Assignment decisions get made against the roster instead of against the loudest voice. Overload is visible in November rather than in February.",
          "When someone leaves or goes on leave, their book is a filter rather than a reconstruction.",
        ],
      },
    ],
    ships: [
      "A staff roster with role, title and weekly capacity per member.",
      "Live-computed clients handled, open tasks and overdue tasks per member.",
      "Four roles enforced at the API layer.",
      "Email invitations with expiring tokens.",
    ],
  },
  {
    slug: "deadlines",
    eyebrow: "Deadlines",
    navLabel: "Deadlines",
    title: "CRA deadline management",
    tagline: "CRA deadline management",
    intro:
      "One deadline feed from live client data — personal tax, GST/HST cadences, year-ends and tasks — triaged by shared SLA colours.",
    icon: "calendar-clock",
    primary: true,
    highlights: [
      {
        title: "Generated, not entered",
        body: "Deadlines come from each client's fiscal year-end and service cadences. Nobody keys a date twice.",
      },
      {
        title: "Weekend and holiday aware",
        body: "A due date landing on a weekend or a Canadian statutory holiday rolls forward automatically.",
      },
      {
        title: "One colour rule everywhere",
        body: "Red, orange and green mean the same thing on the dashboard, in the feed and in the email digest.",
      },
    ],
    sections: [
      {
        heading: "Deadlines are the risk the whole practice runs on",
        paragraphs: [
          "A missed filing is not an inconvenience; it is interest, penalties and a conversation with a client about why the firm they pay to watch the calendar did not.",
          "Most firms manage this with a calendar someone maintains by hand — which works exactly as long as that person is present and correct.",
        ],
      },
      {
        heading: "How the deadline engine works",
        paragraphs: [
          "Deadlines are pure date arithmetic over data the firm has already recorded: each client's fiscal year-end and each assigned service's due rule and lead time. Personal tax lands in the spring, GST/HST on each client's own cadence, year-ends relative to fiscal close.",
          "Every generated date is then rolled forward past weekends and Canadian statutory holidays, and triaged into overdue, due soon or upcoming by proximity — the same three colours the dashboard, the feed and the email digest all use.",
        ],
        bullets: [
          "Deadlines generated from fiscal year-ends and service cadences",
          "Weekend and Canadian statutory holiday roll-forward",
          "Overdue / due soon / upcoming triage shared across every surface",
          "Snooze, mark filed, or dismiss — the firm stays in control",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "The calendar maintains itself. Adding a client with a June year-end and a quarterly GST cadence puts every one of that client's dates on the board without anyone typing a date.",
          "Because the triage colours are shared, \"what is red\" means the same thing to the partner reading the dashboard and the staff member reading the digest.",
        ],
      },
    ],
    ships: [
      "Automatic deadline generation from fiscal year-ends and service cadences.",
      "Weekend and Canadian statutory holiday roll-forward.",
      "Three-colour SLA triage shared by the dashboard, the feed and email digests.",
      "Snooze, mark-filed and dismiss actions with an audit trail.",
    ],
  },
  {
    slug: "notifications",
    eyebrow: "Notifications",
    navLabel: "Notifications",
    title: "In-app notifications and alerts for accounting firms",
    tagline: "In-app notifications and alerts",
    intro:
      "An in-app feed and a live header bell that keep the team current without another inbox.",
    icon: "bell",
    highlights: [
      {
        title: "In the app, not the inbox",
        body: "Assignments, signatures and approaching deadlines surface where the work already is.",
      },
      {
        title: "Deep-linked",
        body: "Every notification carries a link to the record it is about — one click, not a search.",
      },
      {
        title: "Digest, not drip",
        body: "Email carries a daily summary rather than one message per event.",
      },
    ],
    sections: [
      {
        heading: "Another email channel is not the answer",
        paragraphs: [
          "Firms already lose things in email. A tool that sends one message per task assignment adds to the pile it claims to reduce.",
          "But without any signal, work sits: a letter is signed and nobody notices for a week; a task is reassigned and the new owner never learns.",
        ],
      },
      {
        heading: "How notifications work",
        paragraphs: [
          "Events that change someone's work — a task assigned, a letter signed or declined, a deadline crossing into due-soon — create a notification in the app, surfaced by a count on the header bell and a feed listing them newest first.",
          "Each entry carries the link to the record. Email is reserved for the digest: one message summarising what is red and what is due, not one message per event.",
        ],
        bullets: [
          "Header bell with an unread count",
          "Feed with read/unread state and mark-all-read",
          "Deep links to the client, task, deadline or letter",
          "Daily email digest instead of per-event email",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Staff learn about their own work in the place they do it. Partners get one digest rather than a stream.",
          "Nothing waits a week to be noticed because the only channel was an inbox someone was on holiday from.",
        ],
      },
    ],
    ships: [
      "An in-app notification feed with unread counts on the header bell.",
      "Deep links from each notification to the underlying record.",
      "Mark-as-read and mark-all-read.",
      "A daily email digest of overdue and due-soon items.",
    ],
  },
  {
    slug: "engagements",
    eyebrow: "Engagements",
    navLabel: "Engagement letters",
    title: "Digital engagement letters",
    tagline: "Services-priced engagement letters, e-signed by clients",
    intro:
      "Build a priced letter from your services, load scope from history, then send a branded link. Clients sign by type, draw or upload — and download the PDF.",
    icon: "file-signature",
    highlights: [
      {
        title: "Priced from the catalogue",
        body: "Line items come from the services the client is assigned, with custom lines where the engagement needs them.",
      },
      {
        title: "Signed on a no-login page",
        body: "Clients open a branded link and sign. No account, no password, no support call.",
      },
      {
        title: "Kept on the client record",
        body: "Every letter, every signature and every decline stays attached to the client, with timestamps.",
      },
    ],
    sections: [
      {
        heading: "The letter is the scope, and the scope is the dispute",
        paragraphs: [
          "Scope disagreements are the most common source of write-offs in small practices. The defence is a signed letter that says what the firm agreed to do and for how much.",
          "When letters live as Word documents mailed as attachments, the firm often cannot say quickly whether a given client's letter for the current year was ever signed.",
        ],
      },
      {
        heading: "How engagement letters work",
        paragraphs: [
          "Start from the client's assigned services and the letter's line items are already priced. Add custom lines, set the tax rate, and the subtotal, tax and total compute themselves.",
          "Send it and the client receives a branded link to a no-login page carrying the firm's name, logo and colours. They sign by typing, drawing or uploading a signature, and both sides can download the PDF. Status moves through draft, sent, viewed, signed or declined, each with a timestamp.",
        ],
        bullets: [
          "Line items priced from the services catalogue, plus custom lines",
          "Automatic subtotal, tax and total",
          "Branded no-login signing page with type, draw or upload signature",
          "Draft / sent / viewed / signed / declined status with timestamps",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "\"Has this client signed?\" is a filter, not an email search. Letters awaiting signature are a number on the dashboard.",
          "Because the letter is priced from the catalogue, the fee on the letter and the fee in the reporting are the same fee.",
        ],
      },
    ],
    ships: [
      "Letters built from the client's assigned services, with custom line items.",
      "Automatic subtotal, tax rate and total, in the letter's own currency.",
      "A branded, no-login signing page with type, draw or upload signature capture.",
      "Full status history with sent, viewed, signed and declined timestamps.",
      "PDF download for both the firm and the client.",
    ],
  },
  {
    slug: "client-portal",
    eyebrow: "Client experience",
    navLabel: "Client portal",
    title: "Branded accounting client portal",
    tagline: "A branded, client-scoped portal for services, deadlines, documents and letters",
    intro:
      "Clients get their own portal — invoices, expenses, payroll, taxes, documents and filing deadlines — under the firm's brand, never ours.",
    icon: "layout-dashboard",
    highlights: [
      {
        title: "Scoped to one client",
        body: "A portal user sees their own records and nothing else. Isolation is enforced in the database, not the UI.",
      },
      {
        title: "The firm's brand throughout",
        body: "Name, logo and colours resolve per tenant at runtime — including the emails the portal sends.",
      },
      {
        title: "Fewer status emails",
        body: "Clients check their own deadlines and documents instead of asking.",
      },
    ],
    sections: [
      {
        heading: "Clients ask because they cannot see",
        paragraphs: [
          "\"Did you get my receipts?\" \"When is my GST due?\" \"Can you resend last year's T2?\" Every one of these is a question the client would answer themselves if they could.",
          "Each costs a staff member a context switch, and the answer usually already exists in the firm's own records.",
        ],
      },
      {
        heading: "How the portal works",
        paragraphs: [
          "A client is invited by magic link with a temporary password and a forced change on first sign-in. Once in, they see a dashboard scoped to their own account: invoices and their status, tracked expenses, payroll runs, tax obligations, shared documents and their upcoming filing deadlines.",
          "Everything renders under the firm's branding. The client never sees the platform's name — on the app, in the emails, or on the engagement letters.",
        ],
        bullets: [
          "Client-scoped dashboard: invoices, expenses, payroll, taxes, documents, deadlines",
          "Document upload and download",
          "Deadlines shown with the same colour triage the firm uses",
          "Firm branding on the app and on every email the portal sends",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "The routine status question stops arriving. Documents come in through one channel that is already attached to the client record.",
          "The client's experience of the firm looks like the firm, which is the point of paying for software the client can see.",
        ],
      },
    ],
    ships: [
      "A branded, client-scoped portal covering invoices, expenses, payroll, taxes, documents and deadlines.",
      "Magic-link invitations with a temporary password and forced change on first sign-in.",
      "Client document upload and download.",
      "Firm branding applied to the portal and to every email it sends.",
    ],
  },
  {
    slug: "reporting",
    eyebrow: "Reporting",
    navLabel: "Practice reporting",
    title: "Accounting practice reporting",
    tagline: "KPI cards, a needs-attention list and one SLA colour rule shared everywhere",
    intro:
      "Reporting reads the same records the work runs on — so the numbers on the dashboard and the numbers in the report never disagree.",
    icon: "bar-chart-3",
    highlights: [
      {
        title: "Computed from live records",
        body: "Recurring revenue, on-time filing rate and workload come from clients, services and tasks as they stand.",
      },
      {
        title: "A needs-attention list",
        body: "Not just what happened — what is about to go wrong and who owns it.",
      },
      {
        title: "One colour rule",
        body: "The SLA triage in the report is the same triage on the dashboard and in the digest.",
      },
    ],
    sections: [
      {
        heading: "Practice reporting is usually about last year",
        paragraphs: [
          "Most firm reporting is a year-end exercise: revenue by service, realisation, a headcount chart. Useful for planning, useless on a Tuesday in March.",
          "The report a practice actually needs answers \"what is at risk right now, and who has it?\"",
        ],
      },
      {
        heading: "How reporting works",
        paragraphs: [
          "Every figure is computed from live records: clients by status and type, recurring revenue by service, deadlines by month with filed counts, tasks by status, and per-person workload against weekly capacity.",
          "On-time filing rate is derived from filed dates against due dates, so it is a measured number rather than an impression. The needs-attention list surfaces overdue deadlines, letters awaiting signature and blocked tasks in one place.",
        ],
        bullets: [
          "KPI cards: recurring revenue, average fee, on-time filing rate, letters awaiting signature",
          "Clients by status and type; revenue by service and category",
          "Deadlines by month with filed counts",
          "Workload by person against weekly capacity",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Partners get a Tuesday-morning view instead of a year-end deck. The list of things at risk is a list, not a feeling.",
          "Because the report reads the operational records, there is no reconciliation step between \"the system\" and \"the report\".",
        ],
      },
    ],
    ships: [
      "KPI cards for recurring revenue, average fee, on-time filing rate and pending signatures.",
      "Clients by status and type, and revenue by service and category.",
      "Deadlines by month with filed counts, and tasks by status.",
      "Per-person workload against weekly capacity.",
    ],
  },
  {
    slug: "white-label",
    eyebrow: "White-label",
    navLabel: "White-label branding",
    title: "White-label branding for accounting firms",
    tagline: "The whole platform under the firm's own brand — reselling invited",
    intro:
      "One deployment hosts many firms, each fully isolated and fully branded. Your clients see your name on the app, the emails and the engagement letters. They never see ours.",
    icon: "palette",
    highlights: [
      {
        title: "Branded end to end",
        body: "Name, logo, colours and letterhead resolve per tenant at runtime — down to the email footer.",
      },
      {
        title: "Every firm isolated",
        body: "Cryptographically scoped data. A firm can never see another firm's records.",
      },
      {
        title: "Resell it as your own",
        body: "Run it for one firm — or a hundred — from a single platform, with a super-admin console.",
      },
    ],
    sections: [
      {
        heading: "Client-facing software is client-facing branding",
        paragraphs: [
          "The moment a firm invites a client into a portal, the software becomes part of how that firm is perceived. A portal carrying a vendor's logo tells the client the firm rents its systems.",
          "Half-measures are worse than none: a branded login page followed by a vendor-branded email undermines the whole exercise.",
        ],
      },
      {
        heading: "How white-labelling works",
        paragraphs: [
          "Each tenant record carries a firm name, logo, brand colour, accent colour, email sender name and letter footer. Those values resolve at runtime everywhere the client can see: the portal, the signing page, the engagement letter PDF and the transactional emails.",
          "Isolation is enforced below the application. Every query is filtered by the tenant pinned to the caller's profile, and row-level security in the database backs that up — a bug in the application layer cannot leak another firm's data.",
        ],
        bullets: [
          "Per-tenant name, logo, brand and accent colours, email sender and letter footer",
          "Branding applied to the portal, signing pages, letter PDFs and emails",
          "Row-level tenant isolation enforced in the database",
          "A super-admin console to provision firms, set plans and limits, and audit actions",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "The client sees the firm. That is the whole point, and it holds all the way to the footer of the last automated email.",
          "For a reseller, one deployment serves every firm on the roster, each convinced — correctly — that it is theirs alone.",
        ],
      },
    ],
    ships: [
      "Per-tenant firm name, logo, brand colour, accent colour, email sender name and letter footer.",
      "Branding applied to the portal, signing pages, letter PDFs and transactional emails.",
      "Row-level tenant isolation enforced in the database.",
      "A super-admin console for provisioning, plans, limits and an append-only audit log.",
    ],
  },
  {
    slug: "custom-domains",
    eyebrow: "Custom domains",
    navLabel: "Custom domains",
    title: "Custom domains and firm subdomains",
    tagline: "Instant firm subdomains, or the firm's own domain — branding follows",
    intro:
      "Every firm gets a subdomain immediately and can point its own domain at the platform whenever it is ready. Branding resolves from the hostname.",
    icon: "globe",
    highlights: [
      {
        title: "A subdomain on day one",
        body: "No DNS work required to start. The firm's portal has a real address the moment it is provisioned.",
      },
      {
        title: "Your own domain when ready",
        body: "Point a CNAME and the portal answers on the firm's domain, certificate included.",
      },
      {
        title: "Branding follows the hostname",
        body: "The tenant resolves from the domain, so the right firm's brand renders before anyone signs in.",
      },
    ],
    sections: [
      {
        heading: "The address is part of the brand",
        paragraphs: [
          "A client asked to sign in at a vendor's domain reads it as a vendor's product. A client signing in at their accountant's domain reads it as their accountant's system.",
          "But requiring DNS configuration before a firm can use anything is a good way to stall an onboarding for three weeks.",
        ],
      },
      {
        heading: "How domains work",
        paragraphs: [
          "Each firm is provisioned with a subdomain from its slug, which works immediately and needs no configuration. When the firm wants its own domain, it points a CNAME and the platform issues the certificate.",
          "In both cases the tenant is resolved from the hostname, so the correct firm's name, logo and colours render on the sign-in page — before there is a session to read them from.",
        ],
        bullets: [
          "An immediate per-firm subdomain from the tenant slug",
          "Optional custom domain by CNAME, with automatic certificates",
          "Tenant resolution from the hostname, so branding renders pre-login",
          "Both addresses live at once during a migration",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "Firms can start today and brand the address later, without a migration when they do.",
          "Clients bookmark an address that belongs to their accountant.",
        ],
      },
    ],
    ships: [
      "An automatic per-firm subdomain, live at provisioning.",
      "Optional custom domain via CNAME with managed certificates.",
      "Hostname-based tenant resolution so branding renders before sign-in.",
      "Both the subdomain and the custom domain serving simultaneously.",
    ],
  },
  {
    slug: "security",
    eyebrow: "Security",
    navLabel: "Security & data residency",
    title: "Security and Canadian data residency",
    tagline: "Canadian-hosted data with fail-closed per-tenant isolation",
    intro:
      "Client financial data hosted in Canada, isolated per tenant at the database layer, and reachable only through authenticated, tenant-scoped requests.",
    icon: "shield-check",
    highlights: [
      {
        title: "Locked-down access",
        body: "No public data access — every read runs through authenticated, tenant-scoped server actions.",
      },
      {
        title: "Data residency",
        body: "Hosted on Postgres in ca-central-1, aligned with PIPEDA and provincial privacy law.",
      },
      {
        title: "Audited and isolated",
        body: "Signed tenant sessions, JWT-verified portals, and an append-only audit log.",
      },
    ],
    sections: [
      {
        heading: "Accounting firms hold the most sensitive data a business has",
        paragraphs: [
          "Bank details, payroll, tax filings, ownership structures. A breach at a firm is a breach at every client of that firm simultaneously, which is why the security question arrives early in every evaluation.",
          "Canadian firms carry an additional constraint: PIPEDA, provincial privacy law, and in many cases a client expectation that the data does not leave the country.",
        ],
      },
      {
        heading: "How the security model works",
        paragraphs: [
          "Authentication issues a signed session; every API request is verified against the identity provider's public keys. The caller's profile pins exactly one tenant, and every query is filtered by that tenant before it reaches the database.",
          "Row-level security policies in Postgres enforce the same boundary independently, so the isolation is fail-closed: an application-layer mistake cannot expose another firm's records. Every mutation writes to an append-only audit log carrying the actor, the action and the affected entity.",
        ],
        bullets: [
          "Data hosted on Postgres in ca-central-1",
          "Asymmetric JWT verification against the identity provider's public keys",
          "Row-level security enforcing tenant isolation independently of the application",
          "Append-only audit log of every mutation",
        ],
      },
      {
        heading: "What changes for the firm day-to-day",
        paragraphs: [
          "The security section of a client's due-diligence questionnaire has answers the firm can give without calling anyone.",
          "The audit log means \"who changed this, and when\" is a query rather than an investigation.",
        ],
      },
    ],
    ships: [
      "Canadian data residency on Postgres in ca-central-1.",
      "Asymmetric JWT verification and signed tenant sessions.",
      "Fail-closed row-level security enforcing per-tenant isolation.",
      "An append-only audit log covering every mutation.",
    ],
  },
];

export const FEATURE_BY_SLUG = new Map(FEATURES.map((feature) => [feature.slug, feature]));

/** The eight modules listed in the header mega-menu. */
export const PRIMARY_FEATURES = FEATURES.filter((feature) => feature.primary);

export const FEATURE_SLUGS = FEATURES.map((feature) => feature.slug);
