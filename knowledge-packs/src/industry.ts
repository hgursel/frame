import { pack, page, source, refs as r } from './common.js';
const workHire = source(
  'US Copyright Office: Works Made for Hire',
  'https://www.copyright.gov/circs/circ30.pdf',
  'Employee works and eligible specially commissioned works; signed writing and classification facts.',
);
const fairUse = source(
  'US Copyright Office: Fair Use Index',
  'https://www.copyright.gov/fair-use/',
  'Four-factor analysis and fact-specific decisions; no fixed safe word count or duration.',
);
const ai = source(
  'US Copyright Office: Artificial Intelligence Study',
  'https://www.copyright.gov/policy/artificial-intelligence/',
  'Reports on digital replicas, copyrightability, and training; distinguish recommendations from enacted law.',
);
const replica = source(
  'California Governor: Digital Likeness Legislation',
  'https://www.gov.ca.gov/2024/09/17/governor-newsom-signs-bills-to-protect-digital-likeness-of-performers/',
  '2024 enactment overview of AB 2602 and AB 1836; use current statutory text for conditions and exceptions, not this announcement alone.',
);
const minors = source(
  'DIR: Minors Employed in Entertainment',
  'https://www.dir.ca.gov/dlse/minors_employed_in_the_entertainment_industry.html',
  'Worker and employer permits, applicable rules, and links to child-labor resources.',
);
const permit = source(
  'DIR: Entertainment Work Permit',
  'https://www.dir.ca.gov/dlse/Entertainment-Work-Permit.htm',
  'Minor work-permit process and training requirements.',
);
const employerPermit = source(
  'DIR: Permit to Employ Minors',
  'https://www.dir.ca.gov/dlse/Entertainment-Permit-to-Employ-Minors.htm',
  'Employer permit requirements and resources.',
);
const services = source(
  'DIR: Child Performer Services Permit',
  'https://www.dir.ca.gov/dlse/Child_performer_services_permit.htm',
  'Covered service providers, background checks, and current mandated-reporting notice.',
);
const talent = source(
  'DIR: Talent Agency Licensing',
  'https://dir.ca.gov/dlse/Talent%20Agency_License_and_Fee-Related_Talent_Services.htm',
  'Procurement of employment, licensing, fee-related services, and current notices.',
);
const discovery = source(
  'California Courts: Discovery in Civil Cases',
  'https://selfhelp.courts.ca.gov/discovery-civil',
  'Discovery methods and distinction between party discovery and third-party subpoenas.',
);
const subpoenas = source(
  'California Courts: Subpoenas',
  'https://www.selfhelp.courts.ca.gov/subpoena',
  'Document and testimony demands; determine the type of subpoena and appropriate response with counsel.',
);
const erisa = source(
  'DOL EBSA: ERISA',
  'https://www.dol.gov/agencies/ebsa/laws-and-regulations/laws/erisa',
  'Coverage, participant rights, claims resources, and fiduciary responsibilities.',
);
const plan = source(
  'DOL EBSA: Understanding Your Retirement Plan',
  'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/publications/what-you-should-know-about-your-retirement-plan',
  'Plan types, governing documents, vesting, benefits claims, and plan termination concepts.',
);
const fiduciary = source(
  'DOL EBSA: Meeting Your Fiduciary Responsibilities',
  'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/publications/meeting-your-fiduciary-responsibilities',
  'Functional fiduciary roles, prudence, service providers, prohibited transactions, and cybersecurity review.',
);
const fees = source(
  'DOL EBSA: Retirement Plan Fees and Expenses',
  'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/publications/understanding-retirement-plan-fees-and-expenses',
  'Types of fees, allocation, disclosures, and evaluation.',
);

export const industryPacks = [
  pack(
    'entertainment-rights-ai-guide',
    'Entertainment Copyright, Digital Likeness & AI',
    'Rights-clearance and AI-use analysis for guild communications, archives, events, and member inquiries. No contract-rate tables or bargaining agreements.',
    [
      page(
        'copyright-clearance',
        'Copyright Ownership and Rights Clearance',
        ['copyright', 'license', 'archive', 'screening', 'work for hire', 'fair use'],
        'US creative works used by an organization or discussed in a member inquiry; copyright, likeness, trademark, and contractual rights must be separated.',
        `## Legal framework
The Copyright Office explains two work-made-for-hire routes: an employee’s work within the scope of employment, or specified commissioned categories with the required signed agreement. Commissioning or paying for a work alone does not establish that status. Fair use is a fact-specific analysis rather than a fixed number of seconds, words, or images. A credit line, nonprofit mission, or educational purpose is not automatic permission. Copyright ownership and permission to use someone’s likeness are separate questions.

## Create a rights map
Identify each asset: footage, stills, music, script excerpts, artwork, logos, interviews, photographs, and promotional copy. For each record the creator, claimed owner, source, creation date, agreement, rights granted, territory, media, term, editing permission, sublicensing, attribution, and exclusions. Distinguish possession of a file from permission to reproduce or publicly show it. Verify that the person granting permission actually controls the relevant rights.

## Define the proposed use
Describe who will see the material, whether access is restricted, how it will be promoted, whether money changes hands, and whether the asset will be modified, recorded, streamed, archived, or repurposed. A license for one event may not cover an online recording. A vendor’s stock license may impose restrictions on transfer or use in a new product. Identify unanswered questions before publication rather than relying on an assumed customary practice.

## Fair-use discussion and alternatives
If permission is absent, ask counsel to assess purpose/character, nature of the work, amount/substantiality, and market effects with the actual material and use. Do not have Frame guarantee fair use from a short description. Compare obtaining a license, reducing the use, linking to an authorized source, substituting original material, or omitting the asset. Preserve evidence of the analysis and approvals, including conditions on the permitted use.

## Example and counsel deliverable
A guild wants to include film clips, headshots, and music in an awards-event recording later posted publicly. Build separate clearance rows for each asset and each use, not a single statement that the event is nonprofit. Deliver the proposed edit, license documents, owner contacts, gaps, and feasible alternatives. Ask counsel about ownership, permissions, exceptions, releases, and distribution limits. No bargaining agreement provisions are included or inferred.`,
        [workHire, fairUse],
      ),
      page(
        'digital-replicas-ai',
        'Digital Replicas, Creative AI, and Consent',
        ['AI', 'digital replica', 'voice', 'likeness', 'synthetic media', 'copyright'],
        'US/California creative AI and likeness questions; separate living-person consent, deceased-person rights, copyright, and workplace use.',
        `## Legal framework
The Copyright Office’s AI reports distinguish digital-replica concerns from copyrightability of generated material and training questions. A report recommending legislation is not itself an enacted rule. California’s 2024 enactment announcement describes digital-likeness measures involving personal-service contracts and deceased performers. The announcement is an orientation source only: counsel must check current statutory conditions, exceptions, dates, and later developments before applying it. This pack makes no claim that all AI use is prohibited or all consent clauses are enforceable.

## Inventory the activity
Separate scanning or recording a person, storing the source, training or adapting a model, generating a new performance, editing an existing performance, and distributing the result. For each stage identify actor, purpose, data, authority, audience, time period, and retention. A permission to record an interview may not answer whether its voice can be cloned. A model license may not grant rights in every training input or output.

## Review consent and control
Collect the actual signed permission and any amendments, explanations, representation information, and restrictions. Compare the proposed use with what was described. Ask about specific media, duration, new uses, transfer to vendors, security, deletion, review rights, compensation, and revocation terms where applicable. Do not assume that a broad future-technology phrase resolves statutory or contractual questions. Identify whose authorization is needed and who has authority to grant it.

## Human authorship and workplace use
Document human creative contributions, AI-generated portions, editing choices, and provenance when discussing registration or ownership. Do not classify an entire output from a percentage estimate or promise that prompting alone creates protectable authorship. For employment or member-service decision systems, separately review discrimination, accessibility, privacy, and records issues. This creative-rights analysis does not authorize automated personnel decisions.

## Example and questions
A vendor proposes a synthetic narration in a member’s recognizable voice using prior event recordings. Create a stage-by-stage rights map and request the exact consent and vendor terms before proceeding. Ask counsel about applicable likeness protections, contract conditions, copyrights, possible misleading attribution, retention, and permitted future use. Present licensed-human narration, a properly authorized replica, or a non-identifying alternative as options for review. Clearly identify unsettled law and current-source gaps; do not manufacture a universal rule from a press release.`,
        [ai, replica, workHire, r.hiringAi],
      ),
    ],
  ),
  pack(
    'entertainment-minors-talent-guide',
    'California Entertainment Minors & Talent Services',
    'Permit, safeguarding, work-condition, agency-licensing, and referral review for entertainment-related inquiries, without bargaining agreement coverage.',
    [
      page(
        'minor-performer-intake',
        'Minor Performers: Permits and Safeguarding',
        ['minor', 'child performer', 'permit', 'entertainment', 'safeguarding'],
        'California entertainment work involving people under eighteen; age, schooling, work type, and actual location determine the review.',
        `## Legal framework
DIR distinguishes a minor’s entertainment work permit from an employer’s permit to employ minors. A permit is not blanket authorization for any hours, activity, or conditions. Separate rules address schooling, work conditions, supervision, and other protections. DIR’s child-performer-services guidance also identifies provider permitting and current mandated-reporting developments. Do not treat parental consent, unpaid participation, or a short appearance as automatically removing legal requirements.

## Intake and document verification
Identify age using an appropriate confidential verification process, legal guardian or authorized contact, employer, production, work location, dates, school status, proposed activities, and who will supervise. Record permit type, holder, validity, and conditions without exposing identification documents in a general chat. Confirm the employer’s permit separately. Ask the responsible specialists to verify applicable working hours, school obligations, rest, and any trust-account or court-approval questions; do not invent an age-based schedule from memory.

## Safeguarding review
Map access to the child, transport, changing areas, communications, supervision, emergency contacts, and reporting routes. Establish who handles concerns independently of the person arranging the work. Do not ask Frame to investigate suspected abuse or decide whether an immediate report is required before obtaining qualified assistance. Preserve a report factually, avoid repeated suggestive interviews, and follow the applicable safeguarding and reporting procedures promptly.

## Role boundaries
Determine whether the guild is employer, organizer, service provider, representative, or a source of information. Referral to a production does not necessarily make the guild the employer, but neither should the organization assume it has no relevant responsibilities. Verify the actual activity and legal entity. Protect the minor’s data, restrict case access, and keep medical, identification, and financial documents out of widely shared references.

## Example and counsel handoff
A member asks whether their child can appear in a short promotional video at a guild event. Establish whether this is entertainment employment, who controls the work, the child’s age, and the nature of any compensation or benefit. Ask counsel and the relevant permit authority about worker/employer permits, supervision, schooling, hours, consent, and financial protections. Deliver a fact sheet and missing-document list; do not say that an informal event or parental signature makes the arrangement exempt.`,
        [minors, permit, employerPermit, services],
      ),
      page(
        'talent-services-review',
        'Talent Agencies, Managers, and Service Providers',
        ['talent agency', 'manager', 'license', 'procurement', 'audition', 'minor'],
        'California artist employment procurement and entertainment services; labels do not determine whether licensing rules apply.',
        `## Legal framework
DIR explains that arranging employment for artists can trigger talent-agency licensing requirements. The actual activities matter more than whether a business calls itself a manager, coach, consultant, or platform. Fee-related talent services and services to child performers can involve additional requirements. A guild recommendation or industry reputation is not a substitute for checking the applicable license and legal obligations.

## Map the services
Obtain the contract, marketing claims, payment terms, communications, referrals, and examples of what the provider actually does. Separate coaching, portfolio services, advice, introductions, auditions, negotiations, and procurement of employment. Identify who receives fees, commissions, referral payments, or other benefits and when. Do not assume that a service is lawful because the artist agreed to the fee or that every dispute makes the provider unlicensed.

## Verify representations
Use the official licensing/permit process to verify the correct legal entity and status for the relevant period. Compare the represented entity with the contracting/payee entity and disclosed business address. Ask about authority to hold funds or bind the artist, termination provisions, record access, and dispute handling. Identify missing licenses or inconsistent identity information as questions for investigation, not proof of fraud.

## Minors and referrals
Where minors are involved, separately review child-performer-services permitting, applicable training and reporting requirements, parental communications, and access to the child. A provider’s adult-client license may not answer every child-safety obligation. A guild referral process should document selection criteria and disclose relevant relationships; it should not imply that the guild guarantees outcomes or provides legal approval of every contract.

## Example and deliverable
A company sells costly coaching and promises introductions that appear to include arranging paid work. Assemble the advertised promises, actual communications, fees, legal entity, and license evidence. Ask counsel whether the conduct triggers talent-agency or other requirements, what remedies or deadlines may apply, and how the guild should communicate with the member. Frame can compare documents and prepare questions; it should not threaten enforcement, determine contract invalidity, or tell the artist to ignore an agreement without legal review.`,
        [talent, services, permit],
      ),
    ],
  ),
  pack(
    'outside-counsel-matter-guide',
    'Outside Counsel: Matter Preparation & Dispute Support',
    'Practical legal intake, evidence preservation, contract issue review, and decision briefs that make outside counsel engagement more focused. No claim of AI-created privilege.',
    [
      page(
        'matter-intake-preservation',
        'Matter Intake, Preservation, and Counsel Handoff',
        ['counsel', 'litigation', 'legal hold', 'subpoena', 'evidence', 'privilege'],
        'Organizational legal matters and member referrals; counsel determines representation, privilege, legal-hold scope, procedural duties, and deadlines.',
        `## Legal and process framework
California Courts describes discovery tools for parties and subpoenas for information or testimony from others. A demand letter, informal request, agency inquiry, and subpoena are different events. Record the actual document and service facts before deciding how to respond. This is an original preparation workflow, not a statement that a particular preservation duty or privilege applies. Marking a document confidential or using a local model does not create attorney-client privilege.

## Open the matter
Identify the legal entities, people, relationships, requested outcome, known adverse parties, potential conflicts, and who can authorize counsel. Confirm whom counsel represents: the guild, a plan, an individual, or another entity. Preserve the received document unchanged, including attachments, envelope or service information, and exact receipt time. Flag asserted deadlines immediately for counsel to verify; do not calculate extensions from a generic template.

## Evidence preservation plan
Inventory likely custodians and systems: email, chat, member-service records, HR, payroll, shared drives, backups, devices, recordings, and vendor systems. Ask counsel and IT to define appropriate hold scope and suspend relevant deletion through authorized procedures. Preserve originals and metadata; use working copies for analysis. Do not ask custodians to curate only favorable records. Log collection methods, gaps, access, and transfers, and avoid overwriting originals with AI summaries.

## Factual brief
Separate confirmed facts, allegations, disputed interpretations, and unknowns. Use a dated chronology with a source reference for each material event. Include adverse facts, missing evidence, and alternative explanations. State the organization’s operational objectives without converting them into legal conclusions. Restrict sensitive data and legal communications to an approved matter location rather than adding them automatically to shared project knowledge.

## Example and deliverable
A subpoena seeks member communications held partly by a vendor. Collect the actual subpoena, service record, custodians, retention schedules, vendor contract, and data locations; notify counsel promptly. Ask about objections, privacy, privilege, preservation, vendor coordination, and response format. Deliver a one-page issue brief plus indexed evidence and a decision log. Frame should not send responses, waive objections, claim documents are privileged, or instruct deletion; counsel directs those legal decisions.`,
        [discovery, subpoenas, r.crdComplaint],
      ),
      page(
        'contract-and-decision-brief',
        'Contract Issues, Options, and Counsel Decision Briefs',
        ['contract', 'indemnity', 'liability', 'SOW', 'renewal', 'counsel'],
        'Commercial vendor, event, service, and organizational agreements. Excludes collective bargaining agreements and does not supply jurisdiction-specific enforceability conclusions.',
        `## Framework and document authority
Start with the executed agreement, amendments, incorporated policies, statements of work, and order-of-precedence language. Distinguish a draft, proposal, purchase order, and signed version. Contract review is not a keyword exercise: an attractive clause can be narrowed by definitions, exclusions, schedules, or another controlling document. The linked sources support specific copyright, privacy, or fiduciary issues; this original workflow is not a complete contract-law treatise.

## Analyze obligations and dependencies
Build a table for deliverables, acceptance, dates, fees, expenses, change control, service levels, confidentiality, data use, intellectual property, warranties, indemnity, liability limits, insurance, renewal, termination, and dispute terms. For each record the clause citation, who must act, trigger, dependency, consequence, and unresolved question. Separate a business preference from a legal requirement. Do not label missing text a breach before confirming the full agreement and actual performance.

## Compare risk allocations
Read indemnity together with liability caps, defense control, exclusions, notice, and insurance. Ask whether a cap applies to the relevant claim and whether insurance actually covers the proposed obligation. Compare ownership with licenses needed to use deliverables and existing materials. Examine permitted data uses, subprocessors, security, incident notice, export, and deletion on termination. A general promise of compliance should not replace operationally specific obligations.

## Prepare options for counsel
For each material issue, propose a preferred business position, an alternative, and the consequence of leaving the term unchanged. Label proposed wording as a draft and state assumptions. Do not quietly replace negotiated language with a generic template. Identify decision authority, budget, implementation owner, and practical feasibility; an obligation that no team can perform is not solved by signing it.

## Example and final brief
A platform agreement permits broad reuse of member data, caps all liability at one month’s fees, and renews automatically while the export process is unspecified. Provide the exact clauses, data categories, operational needs, renewal dates, and available alternatives. Ask counsel to assess enforceability and appropriate protections, while leadership decides commercial tolerance. The final brief should contain the decision requested, relevant facts, source-linked issue analysis, alternatives, unresolved legal questions, and next actions. Do not certify the agreement safe or complete.`,
        [
          workHire,
          source(
            'California Attorney General: CCPA',
            'https://oag.ca.gov/privacy/ccpa',
            'Privacy coverage and rights; apply to the actual entity and processing relationship.',
          ),
          fiduciary,
        ],
      ),
    ],
  ),
  pack(
    'guild-benefits-oversight-guide',
    'Benefits, Plan Roles & Service-Provider Oversight',
    'Separate guild/member-service roles from plan administration, benefit eligibility, appeals, fiduciary duties, fees, and vendor oversight.',
    [
      page(
        'benefits-claims-roles',
        'Benefit Questions, Plan Documents, and Claims',
        ['benefits', 'ERISA', 'pension', 'health plan', 'appeal', 'eligibility'],
        'Staff or member benefit inquiries involving potentially ERISA-covered plans; identify the actual plan and responsible administrator.',
        `## Legal framework
DOL’s ERISA resources distinguish participant rights, claims procedures, plan documents, and fiduciary responsibilities. A guild, employer, insurer, administrator, and benefit fund are not interchangeable. Retirement plans can also differ significantly by type. A general explanation of a plan does not establish a person’s eligibility, benefit amount, or appeal outcome. The relevant plan terms and applicable law must be identified for the actual period and claim.

## Establish the record
Obtain the plan name, administrator, plan type, relevant summary plan description and amendments, governing documents where needed, eligibility records, claim submission, denial notice, and communications. Identify coverage dates, service periods, contributions, and any dispute about records. Restrict medical and financial information to an appropriate case channel. Do not place a full medical file into general project knowledge to answer an administrative question.

## Claims and appeals workflow
Distinguish an informal inquiry, request for documents, initial claim, appeal, and external legal action. Extract the actual reasons for a denial, cited plan provisions, evidence considered, missing information, and the appeal instructions in the notice. Ask counsel or the plan administrator to confirm applicable procedures and deadlines promptly. Do not assume an informal conversation extends the time to appeal or that a generic ERISA period fits every claim type.

## Role boundaries and assistance
Document whether guild staff are providing navigation, collecting records with authorization, representing a person, or exercising actual plan authority. Avoid promising approval or overriding the administrator’s decision without authority. If the complaint concerns the guild’s own conduct or a shared official, review conflicts. Keep member communications clear about who is responsible for the next step and what assistance is actually being provided.

## Example and counsel handoff
A member believes service credit is missing after work with several employers. Assemble dated work and contribution records, plan statements, the actual benefit formula source, and prior inquiries. Separate a possible employer reporting error from a plan interpretation or eligibility dispute. Prepare a reconciliation and focused questions for the administrator and counsel. Frame should not calculate a guaranteed pension, give investment advice, or imply that membership alone establishes coverage under a particular plan.`,
        [erisa, plan],
      ),
      page(
        'fiduciary-vendor-review',
        'Plan Fiduciary Roles, Fees, and Vendor Monitoring',
        ['fiduciary', 'benefits', 'fees', 'vendor', 'plan', 'cybersecurity'],
        'Potential ERISA plan decisions by an employer, union, trustee, committee, or service provider; functional responsibilities must be determined.',
        `## Legal framework
DOL explains that fiduciary status can depend on functions and discretion, not merely title. Hiring a provider does not necessarily eliminate the responsibility to select and monitor it prudently. Plan duties and prohibited-transaction rules are separate from a guild officer’s responsibilities over union funds. Fees should be evaluated in relation to services and the applicable legal standard, not treated as reasonable because a vendor describes them as standard.

## Role and authority map
Identify the plan, governing documents, named fiduciaries, actual decision-makers, committee authority, delegated functions, and conflicts. Separate business decisions about establishing or changing a plan from administration and investment functions that may have different legal treatment. Do not infer fiduciary status from an organizational chart alone. Record who exercises discretion and what the contract and actual practice show.

## Provider evaluation
Document services required, provider qualifications, experience, compensation sources, conflicts, references, security practices, subcontractors, insurance, reporting, and termination/data-return arrangements. Compare alternatives on consistent criteria. For fee analysis, distinguish direct and indirect compensation, bundled services, participant charges, and allocation methods. Do not recommend an investment or provider solely from a headline fee or marketing performance number.

## Monitoring record
Set a schedule for reviewing service performance, complaints, fees, security incidents, staffing changes, control reports, and unresolved issues. Minutes should capture the information considered, questions asked, reasons for decisions, and follow-up owners. Do not backfill minutes as if a review occurred when it did not. Preserve independent advice and conflict disclosures through appropriate channels, and seek counsel when a transaction may involve a related party or prohibited arrangement.

## Example and output
A benefit administrator proposes a cheaper bundled platform with a new subcontractor handling participant data. Compare the full services and compensation, migration risks, access controls, incident obligations, exit rights, and monitoring evidence. Ask counsel about fiduciary roles, conflicts, disclosure, and transaction restrictions. Deliver a decision matrix with uncertainties and action owners. Frame can organize diligence; it cannot certify prudence, guarantee an investment outcome, or replace a plan fiduciary’s documented judgment.`,
        [fiduciary, fees, erisa],
      ),
    ],
  ),
];
