import type { LibraryPack, LibraryPage, LibrarySource } from '../../shared/library.js';
const ref = (title: string, url: string, locator: string): LibrarySource => ({
  title,
  url,
  locator,
});
const section = (
  id: string,
  title: string,
  description: string,
  tags: string[],
  applicability: string,
  text: string,
  sources: LibrarySource[] = [],
  kind: LibraryPage['kind'] = 'review-workflow',
): LibraryPage => ({
  id,
  title,
  description,
  tags,
  applicability,
  text,
  sources,
  kind,
  effectiveDate: null,
});
const crd = ref(
  'CRD Harassment Prevention Guide (2025)',
  'https://calcivilrights.ca.gov/wp-content/uploads/sites/32/2025/04/Harassment-Prevention-Guide-2025.pdf',
  'Investigation practices, impartiality, confidentiality, and evidence evaluation',
);
const eeocPerformance = ref(
  'EEOC Performance and Conduct Standards',
  'https://www.eeoc.gov/laws/guidance/applying-performance-and-conduct-standards-employees-disabilities',
  'Performance standards, conduct, and reasonable accommodation',
);
const usReview =
  'US business workflow. Applicable law, company policies, bargaining agreements, and case facts need separate review. Not an automated employment decision.';
const leaseScope =
  'US commercial property agreements; identify state/city and governing law. No residential-tenant rules or jurisdiction-specific legal conclusions are supplied.';
export function expandedPacks(initial: LibraryPack[]): LibraryPack[] {
  const hr = initial.find((p) => p.id === 'california-hr')!;
  const contracts = initial.find((p) => p.id === 'business-contract-review')!;
  const pack = (
    id: string,
    title: string,
    description: string,
    jurisdiction: string[],
    pages: LibraryPage[],
  ): LibraryPack => ({
    id,
    title,
    description,
    jurisdiction,
    pages,
    version: '1.0.0',
    reviewedAt: '2026-09-26',
    rights: hr.rights,
  });
  return [
    {
      ...hr,
      version: '1.1.0',
      description:
        'California HR references for hiring, job descriptions, offer letters, pay transparency, fair chance hiring, wages, leave, complaints, and departures.',
      pages: [
        ...hr.pages,
        section(
          'job-descriptions-offers',
          'Job Descriptions & Offer Letters',
          'Draft and review job descriptions and offer letters against actual role requirements and company-approved terms.',
          [
            'job',
            'description',
            'descriptions',
            'offer',
            'letter',
            'letters',
            'hiring',
            'role',
            'duties',
          ],
          'US and California hiring; job-specific duties, employer coverage, work location, and approved terms must be identified.',
          `## Reference brief
EEOC describes essential functions as the fundamental job duties a person must perform with or without reasonable accommodation. Its employer guidance identifies written job descriptions prepared before recruitment as relevant evidence, alongside the actual work. A title alone does not establish the duties or exemption classification.

## Job description workflow
Ask for role purpose, reporting relationship, actual responsibilities, essential versus marginal tasks, work location/schedule, and genuinely job-related qualifications. Describe the needed outcome without automatically prescribing one physical way to achieve it. Flag unsupported experience, degree, travel, or lifting requirements for human review. Do not invent an approved salary range or rank candidates by protected characteristics.

## Offer letter workflow
Use the approved company template. Confirm legal employer, role, manager, location, start date, compensation basis, variable-pay references, benefit-plan references, and authorized conditions. Compare the offer with the posting and compensation approval. Do not insert at-will, arbitration, restrictive covenants, immigration promises, or guaranteed benefits without supplied approved wording and legal review. A conditional offer is not a completed screening decision.

## Output
Provide a marked draft with placeholders for missing terms, a differences table against the approved template, and an approval checklist. Label suggested language as a draft; do not send or sign it.`,
          [
            ref(
              'EEOC ADA Employer Responsibilities',
              'https://www.eeoc.gov/publications/ada-your-responsibilities-employer',
              'How essential functions are determined; written job descriptions',
            ),
          ],
        ),
        section(
          'pay-transparency',
          'Pay Transparency & Equal Pay',
          'Review California job-posting pay scales, salary-history practices, and evidence needed for an equal-pay review.',
          ['pay', 'transparency', 'equal', 'equity', 'salary', 'range', 'posting', 'compensation'],
          'California employers and covered postings; confirm employee count, work location, applicable date, and current DIR guidance.',
          `## Reference brief
DIR distinguishes pay transparency from equal-pay obligations. Its guidance addresses required pay-scale disclosures, salary-history restrictions, and wage-discussion protections. California’s equal-pay comparison concerns substantially similar work assessed through skill, effort, responsibility, and working conditions, not identical titles. Justifications for disparities require the applicable legal conditions; a possible explanation is not proof. Prior salary does not justify a prohibited disparity.

## Posting review
Identify the employer, headcount, possible work locations, posting date, approved pay scale, and recruiting channels. Use current DIR guidance to determine coverage and the required scale definition. Compare third-party postings with approved wording. Do not copy an old range or confuse benefits/bonuses with the stated salary or hourly range.

## Compensation review
Use authorized records and documented job content. Separate missing data, comparable-job questions, observed differences, and claimed explanations. Avoid declaring discrimination—or its absence—from an average alone. Do not infer protected traits from names or other proxies. Keep employee-level data and SQL result values out of learned knowledge.

## Output
Posting checklist or comparison table with source, observation, missing evidence, and HR/counsel review question. No automatic pay changes or compliance certification.`,
          [
            ref(
              'DIR California Equal Pay Act and Pay Transparency',
              'https://www.dir.ca.gov/dlse/california_equal_pay_act.htm',
              'Equal Pay Act questions and Pay Transparency Law questions',
            ),
          ],
          'reference-brief',
        ),
        section(
          'fair-chance',
          'Background Checks & Fair Chance Hiring',
          'Organize California fair-chance review and distinguish it from federal consumer-report requirements.',
          [
            'background',
            'check',
            'checks',
            'fair',
            'chance',
            'criminal',
            'screening',
            'hiring',
            'adverse',
          ],
          'California applicants/employees where the Fair Chance Act applies; exceptions, local rules, and federal/state reporting laws require separate checks.',
          `## Reference brief
CRD provides a staged process and sample forms for conditional offers, individual assessment, preliminary withdrawal notices, reassessment, and final notices. Do not replace that process with a blanket criminal-record exclusion.
FTC/EEOC guidance separately addresses employment consumer reports: disclosure and authorization before obtaining a report, and required steps before and after adverse action. The federal consumer-report process and California fair-chance process are not interchangeable.

## Workflow
Gather employer size, role, work location, conditional-offer status, report provider/type, screening authorization, and any claimed statutory exception. Identify what information may be considered before discussing its effect. Build a chronology of assessments, notices, delivery, response opportunities, disputes, and reassessment. Use current official sources to verify deadlines and notice content rather than assuming one waiting period covers all laws. Request the candidate’s response through the authorized human process; do not infer guilt or decide suitability from incomplete records.

## Output
A process checklist and neutral evidence summary distinguishing disputed, corrected, and unverified information. Draft correspondence only against an approved template. Do not automatically reject an applicant, send notices, request a background report, or save criminal-history details to reusable knowledge.`,
          [
            ref(
              'CRD Fair Chance Act',
              'https://calcivilrights.ca.gov/fair-chance-act/',
              'Coverage, exceptions, and applicant/employer resources',
            ),
            ref(
              'CRD Sample Form Guide',
              'https://calcivilrights.ca.gov/fair-chance-act/fca-forms/',
              'Conditional offer, assessments, and preliminary/final notices',
            ),
            ref(
              'FTC Background Checks: What Employers Need to Know',
              'https://www.ftc.gov/business-guidance/resources/background-checks-what-employers-need-know',
              'Before obtaining a report; before and after adverse action',
            ),
          ],
          'reference-brief',
        ),
      ],
    },
    {
      ...contracts,
      version: '1.1.0',
      description:
        'Review contracts, renewals, supplier pricing, NDAs, amendments, statements of work, and change orders using evidence from actual agreements.',
      pages: [
        ...contracts.pages,
        section(
          'statements-of-work',
          'Statements of Work & Change Orders',
          'Review SOW deliverables, acceptance criteria, dependencies, and the effect of proposed change orders.',
          [
            'sow',
            'statement',
            'statements',
            'work',
            'change',
            'order',
            'orders',
            'scope',
            'deliverable',
            'acceptance',
          ],
          'Business services/projects. Use the executed master agreement, SOW, exhibits, and authorized changes; this workflow assumes no default legal terms.',
          `## Establish the baseline
Identify the master agreement and SOW versions, execution status, precedence clauses, approvers, and incorporated documents. Ask for missing attachments. Separate contractual commitments from informal planning notes. Do not assume a signed change order replaces every provision of the original SOW.

## Scope and acceptance
For each deliverable, extract the measurable result, format, owner, deadline, acceptance test, reviewer, review window, rejection/cure process, exclusions, and dependencies. Distinguish an estimate from a binding milestone and customer inputs from supplier duties. Flag ambiguous phrases such as “as needed” with a concrete clarification question. Do not invent acceptance criteria or assume silence means acceptance.

## Change impact
Compare baseline and proposed scope, quantities, rates, milestones, resources, and dependencies. Show additions, deletions, unchanged duties, price/schedule effects, approval status, and affected cross-references. Calculate only from supplied inputs, exposing assumptions. Flag work proposed before required approval; never claim approval or initiate payment/work changes.

## Output
Deliverable matrix plus change log: original clause; proposed change; business impact; missing information; decision owner; citations. Suggested wording is a draft for the authorized reviewers.`,
          [],
          'review-workflow',
        ),
      ],
    },
    pack(
      'workplace-investigations',
      'Workplace Investigations',
      'Neutral complaint intake, evidence organization, interview preparation, and investigation-report workflows for human-led reviews.',
      ['US', 'US-CA'],
      [
        section(
          'intake-plan',
          'Complaint Intake & Investigation Plan',
          'Structure a workplace complaint, define investigation scope, and identify process risks.',
          [
            'investigation',
            'investigations',
            'complaint',
            'intake',
            'harassment',
            'retaliation',
            'scope',
          ],
          usReview,
          `## Reference brief
CRD’s harassment-prevention guide discusses prompt, fair investigations by impartial, qualified investigators. Confidentiality has practical limits, and findings require an evidence-based process. This pack supports that process; it does not appoint an investigator or make findings.

## Intake
Record each allegation separately with the reported event/date, people involved, source, relevant policy, and requested follow-up. Use “reported” or “alleged” for unestablished facts. Identify missing records and potential conflicts of interest. Do not promise secrecy, legal privilege, a particular outcome, or that no action will occur without the complainant’s approval.

## Plan
Suggest the issues to examine, relevant date range, evidence to preserve, interview roles, investigator/decision-maker responsibilities, and a review schedule. Escalate urgent safety or preservation concerns to the authorized human owner. Interim measures require human assessment and should not be treated as a finding. Avoid blanket instructions restricting lawful workplace discussions.

## Output
Issue list, evidence-request list, proposed investigation steps, conflict/escalation questions, and nonretaliation follow-up plan. Separate company procedure from external guidance and identify what counsel must verify.`,
          [crd],
        ),
        section(
          'evidence-interviews',
          'Evidence Timeline & Interview Preparation',
          'Organize records and prepare neutral questions without inventing facts or assessing credibility automatically.',
          [
            'evidence',
            'timeline',
            'chronology',
            'interview',
            'witness',
            'statement',
            'investigation',
          ],
          usReview,
          `## Evidence organization
Assign a local evidence identifier to each provided item. Record the original source, date received, event date/time if known, and extraction limitations. Preserve original wording when a short quotation is necessary; keep summaries distinct. Link each event to supporting and contradicting material. Mark unknown dates and uncertain ordering explicitly. Never fill gaps with a plausible narrative.

## Interview preparation
Draft open questions for each issue: what occurred, when/where, who was present, what records exist, what the person directly observed, and what they learned from others. Add neutral follow-up questions for inconsistencies. Give the responding person’s account a place in the plan. Do not treat hesitation, writing style, an accent, emotion, or a model’s impression as evidence of truthfulness.

## Output
Chronology columns: date/uncertainty; reported event; source ID/page; direct observation or secondhand account; dispute; next verification step. Produce separate question lists by interview role. Do not contact witnesses, secretly record, alter source evidence, or store case-specific allegations and identities in learned methods.`,
          [],
          'review-workflow',
        ),
        section(
          'investigation-report',
          'Investigation Report & Human Review',
          'Prepare a source-linked report that separates evidence, unresolved issues, and human findings.',
          ['investigation', 'report', 'findings', 'conclusion', 'evidence', 'complaint'],
          usReview,
          `## Report structure
Use purpose/scope, process followed, materials reviewed, allegations, evidence by issue, conflicting accounts, missing information, and limitations. Include relevant policy text and dates from actual company documents. If a human investigator has supplied findings and the applicable standard, identify those findings as theirs and trace them to supporting evidence. Do not invent the standard or label an allegation substantiated on the model’s authority.

## Review checks
Check that adverse evidence and alternative explanations are not omitted, factual assertions have citations, and quotations match sources. Identify statements supported by only one account, extraction gaps, and contradictions needing follow-up. Do not infer legal privilege merely because a report is confidential or a lawyer is copied.

## Output
A draft report plus a human-review checklist. Keep factual synthesis separate from legal conclusions, disciplinary recommendations, and management decisions. Restrict unnecessary sensitive details. Use approved report instructions when a PDF is requested; do not claim the report has been delivered to employees or counsel.`,
          [],
          'review-workflow',
        ),
      ],
    ),
    pack(
      'performance-reviews',
      'Performance Reviews & Improvement Plans',
      'Evidence-based review drafts, measurable goals, support plans, and follow-up records without automated personnel decisions.',
      ['US', 'US-CA — company and local requirements must be checked'],
      [
        section(
          'performance-review',
          'Performance Review Evidence & Drafting',
          'Turn documented expectations and work evidence into a balanced performance-review draft.',
          ['performance', 'review', 'reviews', 'evaluation', 'feedback', 'goals', 'rating'],
          usReview,
          `## Reference brief
EEOC’s disability guidance discusses clear, consistently applied performance and conduct standards and reasonable accommodation. Standards and accommodations must be considered in the actual circumstances; the guide is not permission to ignore accommodation needs or protected rights.

## Workflow
Obtain the role description, review period, previously communicated goals, measurement definitions, work evidence, relevant context, and approved rating rubric. Map each observation to a specific expectation and cited evidence. Distinguish isolated events from a documented pattern and results from factors outside the employee’s control. Include achievements and the employee’s account, not only shortcomings.
Replace vague labels such as “bad attitude” with observable, relevant behavior only when evidence supports it. Do not invent feedback, infer disability, or use protected traits or protected activity as negative factors. Refer leave/accommodation interactions to HR for review. A model-generated score is not an employment decision.

## Output
Expectation | observed evidence and date | impact | employee/context response | proposed feedback | missing information. Suggested ratings require the supplied rubric and human verification.`,
          [eeocPerformance],
        ),
        section(
          'improvement-plan',
          'Performance Improvement Plan & Follow-up',
          'Draft a PIP with measurable expectations, support, checkpoints, and evidence-based review.',
          ['pip', 'improvement', 'plan', 'performance', 'coaching', 'checkpoint', 'goal'],
          usReview,
          `## Inputs
Ask for the specific performance gap, documented examples, agreed role expectations, prior feedback, employee response, available support, and the company’s approved process. Do not assume a PIP is legally required or that it guarantees continued employment. Do not use the plan to create a pretext for a decision already made.

## Plan template
For each gap, specify the desired observable outcome, measurement/source, responsible people, training/resources, realistic checkpoint dates, review owner, and how the employee can raise blockers. Proposed targets and timeframes need manager approval; there is no universal 30/60/90-day rule. Keep accommodation requests and protected leave questions in the appropriate HR process rather than making medical assumptions.

## Follow-up
Compare documented progress with the original measures. Note support actually provided and any agreed changes. Explain missing evidence and contextual limits. Do not retroactively change the standard or call a missed target misconduct without review.

## Output
Draft plan, checkpoint agenda, and progress table. Label any suggested consequence language as requiring approved company wording and human review. Do not send the plan, schedule meetings, recommend termination automatically, or save identifiable performance records into reusable knowledge.`,
          [],
          'review-workflow',
        ),
      ],
    ),
    pack(
      'commercial-leases',
      'Commercial Leases',
      'Review premises, rent schedules, operating costs, repairs, options, and exit terms against the actual commercial lease.',
      ['US — property jurisdiction and governing law must be identified'],
      [
        section(
          'lease-review',
          'Commercial Lease Review & Premises',
          'Inventory a commercial lease and identify business obligations and missing exhibits.',
          ['commercial', 'lease', 'leases', 'tenant', 'landlord', 'premises', 'rent', 'property'],
          leaseScope,
          `## Intake
Identify landlord/tenant entities, property and suite, intended use, state/city, governing law, draft/executed status, lease term, amendments, guaranties, and company-approved requirements. Obtain exhibits, plans, rules, work letters, and incorporated documents. Do not apply residential rent, deposit, repair, or eviction rules to a commercial agreement by analogy.

## Review matrix
Extract permitted use and restrictions, area/measurement definition, possession and commencement conditions, base/additional rent, deposit/guaranty, insurance, maintenance/repairs, alterations, access, assignment/subletting, defaults/cure, notices, options, casualty/condemnation, and surrender. Identify landlord obligations as well as tenant obligations. Distinguish lease statements from externally verified permits, accessibility, or suitability; the agreement alone does not prove a site can lawfully support the intended business.

## Output
Topic | actual clause/exhibit | responsible party | business consequence | missing fact | negotiation question. Cite the lease for every claimed duty. Ask counsel to check applicable local commercial-tenant protections and enforceability rather than declaring terms valid or invalid.`,
          [],
          'review-workflow',
        ),
        section(
          'rent-operating-costs',
          'Rent Schedules & Operating Costs',
          'Check base rent, escalations, CAM/NNN charges, reconciliation, and invoice calculations.',
          ['rent', 'cam', 'nnn', 'operating', 'costs', 'escalation', 'lease', 'invoice', 'charges'],
          leaseScope,
          `## Extract before calculating
Identify commencement, possession and rent-start dates separately. Record area basis, currency, payment frequency, abatements, escalation dates/formula, index/base period, floors/caps, percentage rent if any, and taxes/insurance/utilities. Read definitions of operating expenses and the tenant’s share. Labels such as “NNN” or “gross” do not replace the actual clauses.

## Review
Extract excluded expenses, management/admin fees, capital-cost treatment, gross-up provisions, base-year assumptions, reconciliation rules, supporting-record access, audit/objection windows, and caps on controllable costs where present. Do not invent caps or assume the landlord can pass through every expense.

## Calculate
Use the supplied lease schedule and invoices. Show units, period, proration basis, formula, intermediate steps, and cited inputs. Request missing indices, area, dates, or expense records. Separate forecast assumptions from actual liabilities. Avoid double-counting base rent and additional rent.

## Output
Period | contracted basis | billed basis | supported calculation | difference | source | unresolved question. Calculations do not authorize withholding rent or changing payment instructions.`,
          [],
          'review-workflow',
        ),
        section(
          'lease-options-exit',
          'Lease Options, Repairs & Exit',
          'Extract renewal/termination options, notice mechanics, repair allocations, and surrender obligations.',
          [
            'lease',
            'renewal',
            'option',
            'notice',
            'repair',
            'maintenance',
            'surrender',
            'exit',
            'termination',
          ],
          leaseScope,
          `## Options and notices
Identify each renewal, expansion, early-termination, assignment, and subletting provision. Capture prerequisites, exercise window, recipient/address, permitted delivery, receipt rule, pricing mechanism, and consequences of default. Show calculations from cited anchor dates and verified day-count rules. Mark unknown conditions; an option is not an automatic renewal.

## Repairs and exit
Allocate structural, roof, building systems, interior, and shared-area duties from the lease and amendments. Distinguish routine maintenance, replacement, code-related work, and damage responsibility. Review improvements ownership, removal/restoration, inspection, keys/access, remaining charges, deposit accounting, guaranty release, and holdover provisions. Do not assume returning keys ends liability or that one party pays every repair.

## Output
An obligations/notice register and exit checklist with clause citations, owners, conditions, unresolved dates, and requested evidence. Distinguish generated dates from confirmed deadlines. Frame has not scheduled reminders, exercised an option, sent notice, or authorized withholding payment.`,
          [],
          'review-workflow',
        ),
      ],
    ),
  ];
}
