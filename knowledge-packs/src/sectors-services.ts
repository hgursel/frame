import { page } from './common.js';
import { federalPack as pack, federalSources as r } from './federal-sources.js';

export const serviceSectorPacks = [
  pack(
    'industry-technology-guide',
    'Technology, Software & Professional Services',
    'Delivery acceptance, software rights, client confidentiality, secure development, and AI vendor review.',
    [
      page(
        'delivery-and-rights',
        'Client Scope, Acceptance & Rights Handoffs',
        ['technology', 'software', 'consulting', 'professional services', 'SOW', 'licenses'],
        'Software and professional-service engagements; contract remedies and professional duties require jurisdiction-specific advice.',
        `## Framework and limits
A services engagement combines commercial promises with rights, confidentiality, and operational dependencies. Define whether the customer is buying a result, access to a platform, staff time, or a combination. Ordinary contract formation and remedies are largely governed by state law. Federal copyright questions may affect software and other deliverables, but ownership language does not resolve every contractual issue.

Separate pre-existing tools, newly created materials, third-party components, client data, and general know-how. Copyright work-made-for-hire rules do not automatically vest every commissioned deliverable in the customer. A promise to assign all rights may be impossible where the work includes licensed components. Security commitments should describe real practices and measurable responsibilities rather than unsupported claims of complete protection.

## Practical review
Build an acceptance matrix linking deliverables to objective criteria, test data, reviewer, decision date, and correction process. Record dependencies on client access, decisions, integrations, and supplied materials. Define how requested changes affect price, schedule, testing, and ownership. Preserve approval history so a later dispute can distinguish a defect from a newly requested feature.

Prepare a handoff inventory containing source code or export rights, deployment instructions, credentials transferred through approved channels, license notices, operational documentation, support obligations, and remaining defects. Clarify who may reuse components and whether subcontractors granted necessary permissions. Review termination assistance and data return before signing, when both parties still have leverage to resolve gaps.

## Example
A consulting firm builds a client portal using its own library, open-source dependencies, and a subcontractor's design. The client demands ownership of everything and refuses payment after requesting a new integration. Frame should separate the rights inventory from the acceptance history, identify the disputed scope change, and prepare questions for negotiation. It should not conclude that an invoice, repository access, or the phrase work for hire settles the entire dispute.

## Counsel questions and next steps
Ask what assignment or license is needed for each asset, which limitations survive termination, and whether the liability allocation matches the risk and insurance. Confirm confidentiality obligations for both teams and any professional licensing restrictions. Use a written change log and explicit acceptance decisions rather than informal assumptions. Before escalation, collect the signed documents, versioned deliverables, test results, and communications into a chronology that distinguishes agreed obligations from each party's later expectations.`,
        [r.copyrightLaw, r.copyright, r.privacy],
      ),
      page(
        'secure-ai-services',
        'Secure Delivery, AI Features & Vendor Assurances',
        ['software', 'SaaS', 'AI', 'NIST', 'security', 'vendors', 'professional services'],
        'Technology suppliers and service firms; regulated customer data can add obligations beyond this general workflow.',
        `## Framework and limits
NIST's Secure Software Development Framework and AI Risk Management Framework provide useful voluntary practices. They are not universal laws or a certification that a product is secure, accurate, or legally compliant. A contract or sector requirement can give particular controls additional significance. Verify the specific publication and status; a draft revision should not be described as an adopted requirement.

For AI, evaluate the intended use, affected people, data, outputs, and consequences of error. A tool that summarizes internal notes presents different questions from one that ranks applicants or influences medical care. Existing privacy, discrimination, consumer-protection, intellectual-property, and professional obligations still need attention. A vendor's general assurance does not answer those use-specific questions.

## Practical review
Maintain a system inventory with owners, dependencies, privileged access, release process, vulnerabilities, and recovery arrangements. For important releases, retain evidence of review, testing, known limitations, and rollback readiness. Ask suppliers what their attestations actually cover, who assessed them, and which services or time periods are excluded. Review operational evidence rather than counting badges.

For an AI feature, document approved inputs, prohibited data, output review, evaluation cases, monitoring, fallback, and a person who can stop the use. Evaluate failure modes using realistic scenarios and edge cases before production. Ensure customer-facing claims match the evaluation and deployment conditions. Assign responsibility for model or vendor changes that can alter behavior after initial approval.

## Example
A professional-services firm adds an AI assistant to draft client advice. The supplier promises enterprise privacy, but the contract permits retention of some logs and the firm has no output-review process. Frame should compare the actual data flow and terms with client confidentiality commitments, then propose a limited pilot using approved material and human review. It should not equate local hosting or an enterprise subscription with permission to process every client record.

## Counsel questions and next steps
Ask whether the use affects regulated decisions, what client disclosures or permissions are needed, and what contractual protections are realistic. Define an incident route for harmful or confidential outputs and preserve test evidence. Reassess after material changes in inputs, intended users, integrations, or vendor terms. Keep commercial claims specific: tested capabilities under stated conditions are more useful than broad promises that AI eliminates error or makes an organization compliant.`,
        [r.ssdf, r.aiRisk, r.ads, r.privacy],
      ),
    ],
  ),
  pack(
    'industry-healthcare-guide',
    'Healthcare & Medical Practice Operations',
    'HIPAA role mapping, vendor incidents, billing integrity, referral arrangements, and compliance escalation.',
    [
      page(
        'health-data',
        'Health Data, Business Associates & Incidents',
        ['healthcare', 'medical practice', 'HIPAA', 'PHI', 'business associate', 'breach'],
        'Provider and service-vendor operations; clinical advice, state medical privacy, and specialized records need separate review.',
        `## Framework and limits
Identify whether the organization is a HIPAA covered entity or business associate before deciding which duties apply. Healthcare providers meet the covered-entity definition only under the relevant transaction conditions; health plans and clearinghouses have their own definitions. A vendor's access, functions, and relationship determine whether business-associate requirements apply. A signed business associate agreement is not proof that the actual service is configured appropriately.

HIPAA privacy, security, and breach-notification rules address different obligations. Security Rule duties concern electronic protected health information. Unauthorized access or disclosure needs an assessment under the applicable breach framework, including relevant exceptions and risk factors. Other health information may fall under FTC or state rules even where HIPAA does not apply. Specialized records can add further restrictions.

## Practical review
Map scheduling, billing, portal, transcription, analytics, imaging, support, and backup workflows. Record who receives data, the permitted purpose, minimum access needed, subcontractors, and incident contacts. Match contracts to actual configurations and disable optional data uses until appropriately reviewed. Maintain risk analysis and risk-management evidence, access reviews, workforce training, and tested recovery arrangements.

For an incident, preserve logs and affected-data inventories, contain continuing exposure, and coordinate with the privacy/security officer and counsel. Separate the incident date, discovery date, assessment, and notification decisions. Require vendor cooperation sufficient to evaluate the organization's own duties. Do not conclude that a vendor handled everything merely because it offered a template notification.

## Example
A practice enables an AI transcription feature through an existing software vendor. The original agreement covers billing support but the new feature sends recordings to a different processor. Frame should identify the changed data path, contractual scope, access, retention, and clinical review responsibilities. Existing vendor approval does not automatically approve the new use. The output should be a gap list and decision record, not a claim that the feature is HIPAA certified.

## Counsel questions and next steps
Ask whether business-associate or subcontractor terms are needed, what authorizations or restrictions apply, and whether an incident is reportable under each relevant regime. Confirm the status of any proposed rule before treating it as binding. Maintain a controlled inventory of approved services and a review gate for new features. Preserve patient access and continuity of care during security changes, with clinical professionals directing patient-care decisions.`,
        [r.hipaa, r.hipaaSecurity, r.hipaaBreach, r.healthBreach],
      ),
      page(
        'billing-and-referrals',
        'Billing Integrity, Referral Relationships & Compliance',
        ['healthcare', 'medical practice', 'False Claims Act', 'Stark', 'Anti-Kickback', 'billing'],
        'Healthcare business arrangements and claims; program participation, services, intent, and statutory exceptions matter.',
        `## Framework and limits
Federal healthcare fraud-and-abuse laws are not interchangeable. The False Claims Act, Anti-Kickback Statute, physician self-referral law commonly called Stark, exclusion rules, and civil monetary penalty provisions have different elements and exceptions. A payment that looks commercially reasonable may still require specialized analysis. State fee-splitting, licensing, ownership, and payer requirements add separate questions.

The HHS OIG General Compliance Program Guidance is voluntary guidance for organizing compliance work. It does not create a universal safe harbor for a practice that follows a checklist. Evaluate actual arrangements and claims with qualified healthcare counsel and billing expertise. Do not treat fair-market-value language alone as proof that every legal condition is satisfied.

## Practical review
Inventory compensation, marketing, referral, space, equipment, management, and ownership arrangements. Record parties, services actually delivered, payment formulas, referral connections, federal-program exposure, written terms, and changes over time. Look for payments tied to volume or value of business without jumping directly to a conclusion. Preserve valuation support and evidence that contracted services occurred.

For billing, compare orders, clinical documentation, coding, payer rules, submitted claims, denials, and refunds. Sample areas with repeated overrides or unexplained revenue changes. Provide a confidential escalation route for staff and protect against retaliation. When a potential overpayment or false claim is identified, involve the appropriate specialists promptly; do not wait for the next annual audit or silently change records to match billing.

## Example
A clinic proposes paying a marketing partner per patient booked, including patients whose care may be reimbursed by federal programs. Frame should gather the services, payment basis, participants, and payer mix, then flag the need for legal analysis before signing. It should not declare the arrangement lawful because the contract calls the payment advertising, or unlawful without examining the actual facts and applicable protections.

## Counsel questions and next steps
Ask which laws govern, whether an exception or safe harbor actually fits, what reporting or repayment obligations may arise, and how to preserve documents appropriately. Assign corrective actions with accountable owners and follow-up testing. Track whether training, contract changes, or billing edits address the root cause. Frame should produce a factual issue list and counsel packet; it should not select billing codes, certify medical necessity, or promise that a corrective payment resolves all enforcement risk.`,
        [r.healthcareFraud, r.healthcareProgram],
      ),
    ],
  ),
  pack(
    'industry-nonprofit-guide',
    'Nonprofits, Associations & Charitable Operations',
    'Exempt-status distinctions, board decisions, conflicts, earned revenue, and restricted-fund controls.',
    [
      page(
        'status-and-governance',
        'Exempt Status, Board Decisions & Conflicts',
        ['nonprofit', 'association', 'charity', '501c3', 'governance', 'conflicts'],
        'Nonprofit and association operations; federal exemption category and state organizational law must be identified.',
        `## Framework and limits
Nonprofit incorporation and federal tax exemption are different questions. A charity under section 501(c)(3), a trade association, a labor organization, and another exempt entity can have materially different rules. Identify the entity's actual determination, purposes, governing documents, and activities before applying charity-specific restrictions. A name containing foundation or association is not evidence of tax classification.

Federal tax requirements interact with state rules governing directors, charitable assets, registrations, and fiduciary duties. IRS conflict-policy guidance encourages a documented process; it should not be presented as a universal federal command that every organization adopt an identical policy. Related-party transactions require analysis of the actual relationship, value, approval, and applicable law.

## Practical review
Create a governance file with governing documents, exemption records, board roster, delegated authority, minutes, filings, and material agreements. For major decisions, record the proposal, organizational purpose, alternatives, financial impact, disclosed interests, and who participated. Confirm quorum and approval requirements from the actual documents and law. Do not retroactively rewrite minutes to conceal disagreement or a missed approval.

Use a conflict register that covers current transactions as well as annual disclosures. Identify family, ownership, compensation, and vendor relationships that could affect judgment. Establish who reviews a conflict, how an interested person participates or recuses, and what evidence supports the final decision. Keep organizational and personal expenses separate, with independent review of sensitive payments.

## Example
An association considers a software contract with a board member's company. The price appears competitive, but the member helped write the requirements and is participating in selection. Frame should help document the relationship, comparable options, procurement history, and approval process. The existence of a signed annual disclosure does not by itself resolve the transaction, and a conflict does not automatically prove the contract is prohibited.

## Counsel questions and next steps
Ask which exemption and state-law rules govern, whether additional approvals or disclosure are needed, and whether the transaction threatens exempt purposes or creates an excess-benefit concern. Distinguish recommendations for better governance from legal mandates. Give the board a concise decision record with unresolved questions rather than a blanket compliance certification. Review delegation and oversight as the organization grows, especially when staff, volunteers, and related entities share resources.`,
        [r.charity, r.otherNonprofits, r.conflicts],
      ),
      page(
        'revenue-and-funds',
        'Earned Revenue, Fund Restrictions & Advocacy',
        ['nonprofit', 'UBIT', 'donations', 'sponsorship', 'fundraising', 'advocacy'],
        'Exempt organizations with earned revenue or restricted support; tax category and transaction facts control.',
        `## Framework and limits
Tax-exempt status does not make every revenue stream exempt. The IRS describes unrelated business income using the trade-or-business, regularly-carried-on, and substantially-unrelated tests, with exceptions and exclusions. Applying profits to a good purpose does not by itself establish that the activity generating them is related. Conversely, earned revenue is not automatically taxable merely because customers pay a fee.

Restrictions on political activity and lobbying depend on exemption category and activity. Section 501(c)(3) political campaign restrictions should not be indiscriminately applied to every association, and issue advocacy, lobbying, and campaign intervention should not be treated as synonyms. Donor restrictions, grant conditions, and state charitable-asset rules also require separate review.

## Practical review
Maintain a revenue register separating dues, donations, grants, program fees, sales, advertising, sponsorship, rentals, and investment income. For each stream, identify who pays, what they receive, how often the activity occurs, its connection to exempt purposes, and applicable restrictions. Keep contracts and promotional materials so the tax adviser can evaluate substance rather than relying only on an accounting label.

Track restricted funds from receipt through authorized use. Record the source of the restriction, eligible costs, allocation approach, reporting dates, and approval for changes. Reconcile shared-cost allocations and related-entity transfers. Do not assume a board vote can remove a donor restriction or that a cash shortage authorizes temporary diversion.

## Example
A charity sells sponsorship packages that include logos, promotional statements, and preferred placement at events. Frame should separate simple acknowledgment from advertising benefits and identify the facts needed for tax review. It should not classify the entire package as a donation because the invoice says sponsor, or assume that every logo placement creates taxable income. A separate worksheet can track any restricted use of the resulting funds.

## Counsel and tax-adviser questions
Ask whether an income stream is related, whether an exception applies, what filings are required, and how shared expenses should be allocated. Review advocacy plans before committing organizational resources, especially when several related exempt entities are involved. Preserve approvals, public messages, and expenditure records. Frame can prepare a revenue-and-restrictions matrix and identify missing support, while qualified advisers determine tax treatment and permissible activity under the organization's actual legal structure.`,
        [r.ubi, r.ubiExceptions, r.charity, r.otherNonprofits],
      ),
    ],
  ),
  pack(
    'industry-education-guide',
    'Education, Student Data & Program Access',
    'FERPA vendor review, student-record requests, and disability-access workflows for schools and educational programs.',
    [
      page(
        'student-data-vendors',
        'Student Records, Vendors & Educational Technology',
        ['education', 'school', 'FERPA', 'student data', 'edtech', 'COPPA'],
        'Educational institutions and their vendors; FERPA coverage, student age, funding, and state student-privacy rules matter.',
        `## Framework and limits
FERPA governs qualifying education records at covered educational agencies and institutions. Determine coverage and who holds the rights before releasing records; a parent's role can change when rights transfer to an eligible student. Do not assume that every tutoring business or training provider is directly covered, or that a school-related label makes every disclosure permissible.

The school-official exception is conditional. Outsourced providers need the required relationship, control, legitimate educational interest, and limits on use and redisclosure. It is not a blanket permission to send student records to any useful application. COPPA and state student-privacy rules can present additional obligations, especially for online services involving children. School authorization has limits and should not be treated as approval for unrelated commercial use.

## Practical review
Inventory learning platforms, assessment tools, messaging, recordings, AI assistants, analytics, and support systems. For each, document data fields, purpose, access, retention, subcontractors, and whether records are used to train models or advertise. Evaluate the actual settings and contract, not only a vendor's education-friendly branding. Assign responsibility for student access requests, correction issues, incident response, and end-of-contract deletion or return.

Create a disclosure decision record identifying the requester, student's status, records sought, authority or consent, scope, and any required disclosure log. Verify identity and avoid sharing entire files when only a narrow record is relevant. Keep records and communications accessible to authorized staff while limiting unnecessary copying into personal accounts or unsupported tools.

## Example
A teacher uploads named student essays to a free AI feedback service. The service retains submissions for product improvement and has no agreement with the school. Frame should identify the educational purpose, data, vendor terms, applicable exception or consent, and approval process. It should not assume classroom usefulness or removal of student names alone resolves all privacy issues.

## Counsel questions and next steps
Ask whether FERPA applies, whether the proposed vendor arrangement satisfies an exception, what additional children's-privacy requirements exist, and how parent or student rights will be honored. Require review before expanding a tool from an approved administrative purpose to analytics or research. For a suspected disclosure, preserve facts and involve the school's responsible officials promptly. This workflow supports governance and factual review; it does not authorize disclosure or replace institution-specific policies.`,
        [r.ferpa, r.schoolOfficial, r.coppa],
      ),
      page(
        'program-access',
        'Disability Access, Accommodations & Educational Decisions',
        ['education', 'Section 504', 'ADA', 'disability', 'accommodation', 'accessibility'],
        'Schools and postsecondary programs; public/private status, federal funding, and educational level change the framework.',
        `## Framework and limits
Section 504, the ADA, and special-education laws can overlap but are not identical. Public elementary and secondary schools have evaluation, placement, and free-appropriate-public-education obligations under applicable rules. Postsecondary access generally uses a different framework involving qualified students, academic adjustments, and auxiliary aids. Do not transplant a college process into K–12 or assume a prior school plan automatically answers every college request.

Coverage also depends on institutional type and funding. Religious, private, public, and federally funded programs need separate analysis. A diagnosis alone does not define every appropriate adjustment, and a uniform policy does not excuse failure to consider an applicable access obligation. Essential requirements and claimed undue burdens require careful, documented analysis under the correct law.

## Practical review
Identify the student's barrier, program requirements, requested support, existing evidence, and the responsible decision process. Involve qualified educational and disability professionals. Maintain a clear route for requests, timely communication, review, and grievances. Separate confidential disability information from general classroom or personnel access while ensuring relevant staff know the approved supports they must implement.

Review practical access to materials, assessments, labs, fieldwork, events, transportation, and digital systems. Test whether a proposed aid works for the individual rather than assuming that purchasing technology solves the problem. Document alternatives and reasons for decisions. If a request intersects with safety or a professional program's technical requirements, obtain appropriate expertise rather than relying on stereotypes or a broad exclusion.

## Example
A college changes a course to mandatory video participation and a student requests an accessible alternative. Frame should gather the learning objective, actual barrier, available technology, proposed alternatives, and institutional process. It should not conclude that online delivery is inherently accessible or that an identical requirement for everyone guarantees equal opportunity. The decision needs a record of what was considered and why the selected support is effective.

## Counsel questions and next steps
Ask which legal framework and procedural safeguards apply, who is authorized to decide, and whether the proposed alternative preserves access to the program. Identify unresolved implementation problems before exams or placements occur. Review recurring complaints for systemic barriers and procurement failures. Frame can organize the facts and options, but individualized educational placement, clinical assessment, and legal determinations require the institution's qualified professionals and counsel.`,
        [r.schoolAccess, r.collegeAccess, r.adaRules],
      ),
    ],
  ),
];
