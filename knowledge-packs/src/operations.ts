import { pack, page, source, refs as r } from './common.js';
const violence = source(
  'Cal/OSHA: Workplace Violence, General Industry',
  'https://www.dir.ca.gov/dosh/Workplace-Violence/General-Industry.html',
  'Labor Code 6401.9 overview, written plan, training, incident log, and resources.',
);
const violenceFaq = source(
  'Cal/OSHA: Workplace Violence FAQ',
  'https://www.dir.ca.gov/dosh/Workplace-Violence/FAQ.html',
  'Coverage, exclusions, employee participation, incident records, and multi-employer settings.',
);
const rulemaking = source(
  'Cal/OSHA: Workplace Violence Rulemaking',
  'https://www.dir.ca.gov/dosh/doshreg/Workplace-Violence-in-General-Industry/',
  'Draft standards and advisory meetings; drafts are not adopted rules.',
);
const heat = source(
  'Cal/OSHA: Heat Illness Guidance',
  'https://www.dir.ca.gov/dosh/heatillnessinfo.html',
  'Indoor and outdoor standards, model plans, and training materials.',
);
const indoor = source(
  'California Title 8, Section 3396',
  'https://www.dir.ca.gov/Title8/3396.html',
  'Indoor heat applicability, exceptions, assessment, controls, and emergency response.',
);
const smoke = source(
  'DIR: Wildfire Smoke Worker Protection',
  'https://www.dir.ca.gov/wildfire-smoke/worker-protection-requirements.html',
  'Exposure assessment, air quality, controls, respirators, and training.',
);
const ccpa = source(
  'California Attorney General: CCPA',
  'https://oag.ca.gov/privacy/ccpa',
  'Covered businesses, general nonprofit exclusion, rights, and limitations; do not treat the exclusion as exemption from all privacy law.',
);
const breach = source(
  'California Attorney General: Data Breach Reporting',
  'https://oag.ca.gov/privacy/databreach/reporting',
  'Civil Code 1798.29 and 1798.82 notification and Attorney General sample-notice submission.',
);
const elections = source(
  'OLMS: Conducting Local Union Officer Elections',
  'https://www.dol.gov/agencies/olms/compliance-assistance/publications/guide-for-conducting-local-union-officer-elections',
  'Election planning, nominations, eligibility, notices, ballots, observers, and records.',
);
const memberRights = source(
  'OLMS: Union Member Rights and Officer Responsibilities',
  'https://www.dol.gov/agencies/olms/compliance-assistance/publications/union-member-rights-and-officer-responsibilities-under-the-lmrda',
  'LMRDA rights, financial reporting, fiduciary responsibilities, and restrictions on office.',
);
const controls = source(
  'OLMS: Internal Financial Controls',
  'https://www.dol.gov/agencies/olms/compliance-assistance/tips/internal-financial-controls',
  'Documented authorization, segregation of duties, supporting records, and payment controls.',
);
const audits = source(
  'OLMS: Conducting Audits in Unions',
  'https://www.dol.gov/agencies/olms/regs/compliance/union-audit-guide',
  'Trustee review, receipts/disbursements, assets, liabilities, and reconciliation.',
);
const reports = source(
  'OLMS: Officer and Employee Reporting',
  'https://www.dol.gov/agencies/olms/compliance-assistance/labor-organization-officer-employee-reporting',
  'LM-30 and related disclosure resources; reporting is distinct from permissibility.',
);
const fairRepresentation = source(
  'NLRB: Right to Fair Representation',
  'https://www.nlrb.gov/about-nlrb/rights-we-protect/the-law/employees/right-to-fair-representation',
  'Fair representation and limits of that duty; distinguish statutory representation from internal union affairs.',
);
const rights = source(
  'NLRB: Your Rights',
  'https://www.nlrb.gov/about-nlrb/rights-we-protect/your-rights',
  'Protected concerted activity and representation during qualifying investigatory interviews.',
);

export const operationsPacks = [
  pack(
    'ca-workplace-safety-guide',
    'California Workplace Safety & Incident Planning',
    'Office, event, and production-adjacent safety review: violence prevention, reporting roles, heat, smoke, and practical emergency coordination.',
    [
      page(
        'violence-prevention',
        'Workplace Violence Plans and Incident Response',
        ['workplace violence', 'safety', 'SB 553', 'WVPP', 'incident'],
        'California non-healthcare workplaces; determine coverage and any exclusion under the current statute and applicable standard.',
        `## Legal framework
California Labor Code 6401.9 establishes workplace-violence prevention obligations for covered general-industry employers, including a written plan, employee participation, training, and incident-related records. Cal/OSHA’s FAQ explains exclusions and multi-employer questions. The rulemaking page also contains proposed standards: distinguish an existing statutory duty from a discussion draft or future effective requirement. A small office, remote employee, or public event should not be classified as exempt from a headline alone.

## Plan review
Identify each worksite and activity, public access, security responsibilities, reporting channels, emergency contacts, employee involvement, and coordination with landlords or vendors. Assess reception areas, parking, off-site meetings, member events, and work-related threats received online. Assign an owner for corrective actions and a process for verifying completion. A downloaded template becomes useful only when site-specific responsibilities and controls are filled in and exercised.

## Incident handling
Immediate safety and emergency response come first. Do not ask Frame to evaluate whether a threat is genuine before contacting appropriate emergency or security resources. After immediate needs are addressed, preserve the report and record what happened, location, circumstances, injuries, involved roles, actions taken, and witnesses through an approved incident process. Separate the violence incident log from confidential investigative material and avoid unnecessary identifiers in broadly accessible records. Determine whether occupational injury reporting, workers’ compensation, or other notifications are also implicated; one log does not satisfy every requirement.

## Assessment and follow-up
Compare the incident with existing controls: how was access gained, were reporting instructions understood, could help be summoned, and were corrective actions delayed? Involve appropriate employees in the review. Avoid blaming a reporter for using a designated channel. Track training attendance and questions, changes to the plan, and recurring patterns without making medical or criminal-risk predictions about an individual.

## Example and counsel questions
A guild holds an evening member event in rented space and receives threatening messages. Map the roles of the guild, venue, security contractor, and any production employer separately. Ask counsel and safety professionals which plans apply, what coordination is needed, what documentation can be shared, and which reporting duties are triggered. Produce a responsibility matrix and unresolved action list; do not label a plan compliant based on a checklist alone.`,
        [violence, violenceFaq, rulemaking],
      ),
      page(
        'heat-smoke-event-safety',
        'Heat, Smoke, Events, and Worksite Coordination',
        ['heat', 'wildfire', 'smoke', 'events', 'production', 'emergency'],
        'California indoor/outdoor work, including visits and events. This is a planning guide, not technical safety instruction for hazardous production activities.',
        `## Legal framework
Cal/OSHA provides separate indoor and outdoor heat-illness standards and wildfire-smoke protections. Indoor heat rules include scope, exceptions, assessment, and control requirements. Wildfire obligations depend on conditions and the applicable standard, not simply whether an office remains open. A venue’s permission to operate does not establish that all employer safety duties have been met. Current thresholds and exceptions must be checked in the standards for the particular setting.

## Build an exposure map
Identify locations, dates, hours, tasks, exertion, equipment or clothing, access to cooling or shade, indoor ventilation, outdoor air infiltration, and employee transportation. Distinguish staff who remain indoors from people working outdoors, loading equipment, attending locations, or staffing entrances. Record who monitors conditions, where measurements come from, how frequently they are updated, and who can stop or relocate work. Avoid relying only on a weather forecast when workplace conditions differ.

## Practical controls and coordination
Ask a qualified safety lead about engineering controls, scheduling, water, rest, cooling, training, acclimatization, communication, and emergency response as applicable. Use the relevant official requirements to develop measures; do not improvise respirator or medical instructions. Verify responsibility among the employer, venue, landlord, security provider, and production organization. Agreements about who supplies equipment should not be assumed to eliminate statutory duties.

## Individual needs and records
Use a confidential process for accommodation requests and restrictions. Do not require a person to disclose a diagnosis publicly to obtain an assessment. Keep logs of conditions, alerts, decisions, instructions, and incidents, including contrary information that was considered. Document a change in conditions and the resulting action rather than silently overwriting an earlier assessment. Review the effect of cancellations or schedule changes on pay, leave, and access to assistance separately.

## Example and escalation
An outdoor event proceeds while smoke conditions worsen; office staff assigned to entrances were treated as indoor workers. Frame should identify the mismatch in exposure assumptions, request the actual duty schedule and monitoring record, and flag the decision owner. Deliver a scenario table for postponement, relocation, reduced exposure, or cancellation for professional review. Serious injuries, hazardous equipment, stunts, pyrotechnics, weapons, and medical emergencies require qualified specialists; this guide cannot authorize continuing unsafe work.`,
        [heat, indoor, smoke, violenceFaq],
      ),
    ],
  ),
  pack(
    'ca-privacy-incident-guide',
    'California Privacy, Member Data & Breach Readiness',
    'Analyze legal-entity coverage, sensitive staff/member records, vendor processing, retention, and incident response without assuming nonprofit status settles privacy duties.',
    [
      page(
        'privacy-coverage',
        'Privacy Coverage and Member-Data Handling',
        ['privacy', 'CCPA', 'CPRA', 'member data', 'nonprofit', 'vendor'],
        'Guilds, affiliates, benefit-related entities, employers, and their service providers; assess each legal entity and processing activity separately.',
        `## Legal framework
The California Attorney General states that the CCPA generally does not apply to nonprofit organizations. That is a starting point for coverage analysis, not a conclusion that no privacy duties exist. Affiliates, commercial activities, contracts, other statutes, and data-breach obligations need separate review. Do not promise CCPA rights or deny a request solely because someone describes the organization as a nonprofit. Employment and member-service information can also carry contractual, confidentiality, or sector-specific obligations.

## Map entities and data
Identify the legal entity collecting the information, its status, why information is needed, where it comes from, who receives it, and where it is stored. Separate staff HR files, member contact details, dues records, complaints, disciplinary files, benefits information, and event registrations. Do not presume that the guild and a benefit plan are the same data controller or legal entity. Record sensitive categories without copying real identifying information into a general planning pack.

## Review the lifecycle
For each dataset describe notice or authorization, access controls, purpose, disclosures, retention, deletion, backups, and applicable holds. Compare public privacy statements with actual vendor integrations and exports. Limit access to what the operational role needs; a shared project is not an appropriate default destination for every complaint or medical record. Evaluate whether an AI vendor uses submitted data for training, retains prompts, or permits subprocessors to access them. A local model reduces some transfers but does not automatically make every upload appropriate or privileged.

## Requests and vendors
Create a request-routing process with identity verification proportionate to the risk. Determine the actual legal basis, exceptions, and deadlines before answering an access or deletion request. Avoid collecting more identity evidence than necessary. Review vendor security, deletion, incident notice, subcontracting, permitted use, export, and termination provisions. A confidentiality clause alone does not settle operational data protection.

## Example and counsel output
A member asks for all records about a complaint and demands deletion of the file. Identify the holder, role, retention/hold issues, third-party information, and legal basis before promising either disclosure or deletion. Deliver a data map, coverage questions, proposed response process, and record categories for counsel to review. Keep staff, member, and benefit-plan records distinct and explain uncertainty instead of asserting a blanket nonprofit exemption.`,
        [ccpa, breach, r.employment],
      ),
      page(
        'breach-triage',
        'Data Incidents, Notification Review, and Preservation',
        ['breach', 'incident', 'notification', 'ransomware', 'privacy'],
        'California personal-information incidents and potentially affected people in other jurisdictions; counsel must determine applicable notice duties and deadlines.',
        `## Legal framework
The Attorney General’s reporting guidance describes California breach-notification laws and when a sample notice must be submitted to the Attorney General. The analysis depends on the data, affected people, acquisition or access facts under the applicable law, security protections, and the organization’s role. The CCPA coverage question is separate. A security alert is not automatically a reportable breach, but a lack of proven misuse is not a sufficient reason to close the matter.

## First response record
Record discovery time, who reported it, affected systems, containment steps, known data categories, and the difference between confirmed facts and hypotheses. Preserve logs and volatile evidence through the approved incident-response process. Restrict distribution of credentials, forensic images, and personal data. Use a factual chronology; do not let an AI-generated summary replace original evidence. Containment must be coordinated with preservation and business continuity rather than treated as a reason to erase systems reflexively.

## Build the notification assessment
Map potentially affected individuals by jurisdiction and identify whether the organization owns/licenses data, maintains it for another entity, or receives it from a vendor. Track encryption and key exposure, evidence of exfiltration, access permissions, vendor findings, and uncertainties. Ask counsel to verify current statutory timing, content, recipient, regulator, and contractual duties immediately. Do not calculate a notice deadline from a cached pack or assume a vendor’s later final report stops the clock.

## Communications and insurance
Identify counsel, insurer, incident-response specialists, vendor contacts, and the executive decision owner. Review notice and consent conditions in relevant policies and contracts. Draft messages using only supported facts, distinguishing what is being investigated from what is known. Avoid unsupported assurances that no information was taken or that all affected people have been identified. Preserve version history of public and private communications and record who approved them.

## Example and counsel brief
A vendor reports that a member-services export was exposed, but cannot yet identify downloads. Record the export date, fields, permissions, access logs, affected population, and vendor obligations. Prepare a decision log with alternative hypotheses, needed evidence, notification questions, and assigned deadlines for counsel to confirm. Frame should organize the incident and source material; it should not declare that notification is unnecessary, direct evidence destruction, or represent that local processing creates attorney-client privilege.`,
        [breach, ccpa],
      ),
    ],
  ),
  pack(
    'guild-governance-guide',
    'Guild Governance, Elections & Financial Stewardship',
    'LMRDA issue guides for member rights, elections, financial controls, conflicts, and reporting. Does not reproduce or interpret collective bargaining agreements.',
    [
      page(
        'member-rights-elections',
        'Member Rights and Officer Elections',
        ['guild', 'LMRDA', 'elections', 'member rights', 'bylaws'],
        'Labor organizations potentially covered by the LMRDA. Identify national, intermediate, or local structure and the applicable governing documents.',
        `## Legal framework
OLMS explains that the LMRDA protects member rights and establishes standards for officer elections and organizational accountability. Coverage and requirements differ by organizational level and type. Internal officer elections are different from NLRB representation elections. The union’s constitution and bylaws matter, but should not be assumed to override statutory protections. Public-sector-only organizations can involve a different legal framework; this pack does not resolve that coverage question.

## Establish the governing record
Collect the current and historical constitution/bylaws relevant to the event, amendment approvals, election rules, office descriptions, eligibility criteria, notice records, and prior decisions. Record the version and effective date used for each decision. Identify who has authority to interpret the rules and conflicts of interest among organizers and candidates. Ask counsel to review unusual restrictions before applying them, rather than defending an exclusion after ballots are sent.

## Election operations
Map nominations, eligibility checks, notices, candidate access, ballot distribution, secrecy, observers, counting, challenges, and records. Assign roles so that a candidate does not control disputed eligibility or the only copy of results. For electronic systems, ask how secrecy, authentication, duplicate prevention, accessibility, auditability, and retention are demonstrated; a vendor’s claim of security is not proof that statutory election requirements are satisfied.

## Complaints and member participation
Log complaints without retaliatory commentary, preserve relevant notices and records, and route them to the authorized process. Distinguish a request for records from an election protest or disciplinary appeal. Do not invent an exhaustion requirement or filing deadline. Ask counsel about internal remedies, external review, and preservation promptly. Avoid sharing membership lists or ballot-level information beyond authorized purposes.

## Example and counsel deliverable
A disputed member is excluded from an election because a database marks dues as unpaid, while bank records suggest a payment-processing delay. Preserve both records and the applicable eligibility rule. Prepare a neutral chronology, list of similarly situated cases, authority for the decision, and options that protect election integrity pending review. Frame should identify the legal and factual questions rather than determine eligibility, adjudicate a protest, or declare an election valid.`,
        [memberRights, elections],
      ),
      page(
        'funds-and-conflicts',
        'Union Funds, Conflicts, and Internal Controls',
        ['guild', 'fiduciary', 'conflict', 'expenses', 'audit', 'procurement'],
        'Union funds and organizational decisions; distinguish union officer duties from separate benefit-plan fiduciary obligations.',
        `## Legal framework
OLMS describes fiduciary responsibilities concerning union money and property and provides practical internal-control and audit guidance. A disclosure filing is not approval of an underlying transaction. The governing documents, authorized purpose, conflicts, supporting evidence, and actual decision process all matter. Fiduciary duties of a benefit-plan trustee are a separate analysis even when the same person also holds guild office.

## Transaction review
Identify the payer, payee, beneficial relationships, purpose, amount, budget authority, approval chain, and supporting records. Separate a legitimate expense with missing documentation from an allegation of intentional misuse. Document the relationship and potential benefit before deciding how the conflict should be handled. Use appropriate recusal and independent review processes; a generic disclosure at the beginning of the year may not address a particular transaction.

## Practical controls
Design separation between authorization, payment preparation, payment release, and reconciliation where feasible. For a small staff, identify compensating independent review rather than pretending roles are separated. Require support for reimbursements, credit-card charges, travel, vendor changes, and unusual transfers. Inspect actual bank/payment-platform permissions; a policy requiring two approvals is ineffective if one person can bypass it in the system. Retain evidence of approvals and follow up on exceptions.

## Audit preparation
Reconcile receipts and disbursements, compare budgets with actual spending, verify asset records, review outstanding obligations, and sample supporting documents. Track questions to resolution without rewriting historical explanations. Distinguish an internal review from an independent audit or legal opinion. Protect reporter confidentiality as appropriate and preserve evidence if misconduct is suspected; do not permit an implicated person to curate the only available records.

## Example and counsel questions
A vendor owned by an officer’s relative receives a contract after an informal email approval. Obtain competing bids or the reason none were sought, relationship disclosures, decision authority, service evidence, and payment records. Ask counsel about the conflict, permissible process, reporting, recovery options, and whether independent investigation is appropriate. Deliver a transaction chronology and controls-gap table, not an accusation of embezzlement or a claim that a fair price alone cures every conflict.`,
        [controls, audits, memberRights, reports],
      ),
      page(
        'reporting-records',
        'Reporting, Records, and Organizational Accountability',
        ['LM-2', 'LM-30', 'records', 'reporting', 'guild', 'retention'],
        'Potential LMRDA filings and union records; determine actual organization/officer obligations and current form instructions.',
        `## Legal framework
OLMS administers financial reporting and disclosure requirements for covered unions and certain officers or employees. Different forms address different filers and transactions. An organization’s annual report does not automatically satisfy an officer’s personal reporting obligation. A transaction can require reporting without being unlawful, and disclosure does not make a prohibited transaction lawful. Verify current thresholds, exceptions, filing methods, and instructions rather than embedding changing figures in a generic pack.

## Reporting inventory
List the organization and affiliates, fiscal year, entity type, prior filings, receipts, activities, related-party arrangements, and responsible preparers. Separately identify officers or employees who need advice about personal disclosure. Map each possible filing to its source authority, required records, owner, review process, and confirmed due date. Do not automatically include outside counsel’s privileged advice in a public report or assume it can be withheld when reporting is legally required.

## Supporting records
Maintain a traceable relationship between ledger entries, authorizations, invoices, receipts, payroll, asset records, and report classifications. Document the basis for judgmental classifications and changes from prior years. Record unresolved discrepancies and escalation rather than rounding them away. Ensure an authorized reviewer can reproduce reported totals from retained records. When records are incomplete, ask counsel and accounting advisers about correction procedures before reconstructing or amending a filing.

## Retention and requests
Set retention by record category and controlling duty, including legal holds and election-related records. Do not apply one generic retention period to everything. Distinguish public filings, member inspection rights, confidential personnel data, legal advice, and internal working papers. Route requests to a responsible reviewer; a request from a member is neither automatic permission to disclose every record nor grounds for blanket refusal.

## Example and handoff
A new treasurer discovers expense classifications that differ from the prior annual report and missing receipts for several reimbursements. Preserve the original ledger and report, obtain the underlying transactions, and build a reconciliation with explanations and unresolved items. Ask whether a correction, additional disclosure, or independent review is needed. Frame can draft a workpaper and records-request list; it should not certify a filing, determine criminal intent, or send a regulator response without authorized review.`,
        [reports, audits, memberRights],
      ),
    ],
  ),
  pack(
    'guild-member-services-guide',
    'Guild Member Services & Statutory Rights',
    'Member intake, representation boundaries, conflicts, protected workplace activity, and referral workflows. No bargaining agreement provisions or grievance deadlines are supplied.',
    [
      page(
        'member-intake',
        'Member Intake, Conflicts, and Fair Representation',
        ['member services', 'representation', 'conflict', 'intake', 'referral'],
        'Private-sector labor-organization inquiries; establish whether a statutory representation duty applies. Internal governance and independent legal claims may differ.',
        `## Legal framework
The NLRB describes a duty of fair representation in matters within a union’s role as statutory representative. It also explains limits: the duty does not ordinarily cover rights workers enforce independently or all internal union affairs. Identify the actual role before announcing that the guild must pursue a matter or has no responsibility. This pack deliberately contains no agreement language, bargaining analysis, or contractual deadlines; those must come from authorized matter-specific material and counsel.

## Intake record
Record the person’s contact preference, employer/entity, work dates and location, issue, immediate consequences, prior communications, documents available, and deadlines the person has actually received. Ask what help they seek and what authority they grant to contact others. Do not promise representation before the appropriate conflict and eligibility review. A staff member taking an intake is not necessarily the person authorized to decide the matter.

## Conflicts and scope
Identify competing member interests, allegations involving guild employees or officers, the organization’s own potential exposure, and any overlapping counsel roles. Explain the limits of the service accurately and route conflicts to an independent decision-maker. Separate the member’s individual claim from organizational interests and do not assume that counsel for the guild is also counsel for the member. Protect sensitive information from unnecessary sharing with another member or employer.

## Decision record and follow-through
Track facts reviewed, evidence sought, applicable decision authority, missing information, reasons, communications, and review routes. Apply criteria consistently while recognizing relevant factual differences. A decision not to proceed should be made by an authorized human and explained accurately; Frame must not rank members’ worthiness or infer motives. A referral is not complete until the member understands what has and has not been undertaken.

## Example and counsel handoff
Two members make incompatible allegations about a workplace incident, and each requests the same representative. Preserve separate intake records, identify who can review the conflict, and avoid distributing one member’s confidential account to the other. Ask counsel which statutory duties apply, whether separate representation is needed, how to communicate limits, and what urgent rights need protection. Deliver a role map, chronology, documents list, and unresolved questions; do not invent a contractual remedy or assure anyone that an internal review tolls an external deadline.`,
        [fairRepresentation, memberRights, r.crdComplaint],
      ),
      page(
        'workplace-rights-referrals',
        'Protected Activity, Interviews, and Agency Referrals',
        ['protected activity', 'Weingarten', 'interview', 'NLRB', 'complaint', 'referral'],
        'Potential NLRA-covered workplace activity; coverage, employee status, interview purpose, and applicable forum require case-specific review.',
        `## Legal framework
NLRB guidance describes protected concerted activity concerning workplace conditions and, for union-represented employees in qualifying circumstances, a right to request representation at an investigatory interview reasonably believed to risk discipline. Not every conversation, individual complaint, worker category, or employer is covered. These statutory concepts are distinct from any additional contractual protections, which are outside this pack.

## Interview triage
Ask who requested the meeting, what purpose was stated, whether facts are being investigated, whether discipline could reasonably follow, who will attend, and whether representation was requested. Preserve the notice and exact communications. Do not instruct a person to refuse every meeting or promise an unconditional right in all settings. Escalate promptly to a qualified representative or counsel when a meeting is imminent.

## Protected-activity analysis
Document what people did, whose workplace interests were involved, who knew, employer responses, and potential exceptions or exclusions. Separate a protected-activity question from harassment, threats, disclosure of confidential records, or other conduct needing its own analysis. A social-media post or group message should be reviewed in context, not classified from a single keyword. Preserve the full relevant thread with appropriate privacy controls.

## Referral design
Map the concern to possible forums: NLRB, CRD, Labor Commissioner, workplace-safety authorities, benefit-plan procedures, or courts. More than one route may be relevant, and each has its own coverage, deadlines, and remedies. Record dates of actual acts, notices, and receipt; ask counsel to calendar applicable deadlines. Do not tell someone to wait for a guild decision before obtaining time-sensitive legal advice or filing assistance.

## Example and output
A worker is invited to a meeting described as routine but is asked detailed questions about alleged misconduct. Prepare the facts about meeting purpose, reasonable expectations, requests made, and responses. Ask counsel or the authorized representative what protection applies and what immediate communication is appropriate. Produce a concise referral brief with source-linked statutory issues and missing facts. Avoid promising reinstatement, a particular remedy, or automatic agency acceptance of a complaint.`,
        [rights, fairRepresentation, r.retaliation, r.crdComplaint],
      ),
    ],
  ),
];
