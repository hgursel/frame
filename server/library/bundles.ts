import type { LibraryPack, LibraryPage, LibrarySource } from '../../shared/library.js';
const source = (title: string, url: string, locator: string): LibrarySource => ({
  title,
  url,
  locator,
});
const dir = (title: string, file: string, locator: string) =>
  source(title, `https://www.dir.ca.gov/${file}`, locator);
const page = (
  id: string,
  title: string,
  description: string,
  tags: string[],
  applicability: string,
  text: string,
  sources: LibrarySource[] = [],
  kind: LibraryPage['kind'] = 'reference-brief',
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
const rights =
  'Original Frame-authored briefs and workflows distributed with Frame. Linked agency publications are not reproduced or bundled. Sources are not endorsements. Source-check date is not a legal effective date or a certification of completeness.';
export const bundledPacks: LibraryPack[] = [
  {
    id: 'california-hr',
    version: '1.0.0',
    title: 'California HR Essentials',
    description:
      'Review hiring, wages, leave, workplace policies, and departures with concise California references and federal resource links. Not a complete employment-law manual.',
    jurisdiction: ['US', 'US-CA'],
    reviewedAt: '2026-09-26',
    rights,
    pages: [
      page(
        'handbook-review',
        'Handbook Review and Applicability',
        'Start a California HR or employee handbook review; identify missing facts and select relevant topics.',
        ['hr', 'handbook', 'policy', 'policies', 'employment', 'california', 'review'],
        'California employer reviews. Coverage varies by law, employer, worker, location, industry, date, and collective bargaining agreement.',
        `## Intake
Identify the employer entity and type, employee work locations (including remote work), headcount, industry, bargaining agreements, policy effective date, and the specific question. Do not assume headquarters determines every worker’s applicable rules.

## Review workflow
Inventory the supplied handbook and amendments. Review hiring, classification, pay and hours, meals/rest, sick leave, other leave, accommodations, complaints, and departures separately. Retrieve the matching library topic before drawing a legal conclusion. Record missing policies as missing, not as violations. Distinguish a company benefit from a legal minimum. Do not resolve a conflict by automatically preferring the handbook or the newest uploaded file.

## Output
Use columns: handbook section; observed wording; relevant reference and date; potential gap; missing facts; suggested review action. Cite the actual handbook heading/page and the library section. Do not invent page numbers. Prioritize actionable gaps over a generic compliance score. State when source currency or a local rule needs verification. Refer legal decisions to qualified HR/counsel; do not label a handbook compliant.`,
        [],
        'review-workflow',
      ),
      page(
        'hiring',
        'Hiring and Onboarding',
        'Prepare a hiring and onboarding checklist with discrimination, notices, and employment-verification reference links.',
        ['hiring', 'onboarding', 'interview', 'recruitment', 'employee', 'notices'],
        'US and California employers; individual requirements have different coverage tests.',
        `## Reference brief
EEOC’s small-business resources explain federal employment discrimination responsibilities and provide employer assistance. Coverage is law-specific; do not use one headcount threshold for every protection.
California DIR’s workplace-posting directory identifies required notices and the employers to which each applies. A digital knowledge pack does not satisfy a workplace posting or employee-delivery requirement.

## Review workflow
Gather role, work location, start date, employer size, employee/contractor classification, and approved offer terms. Review job-related interview criteria, accommodation contact, wage/benefit communications, required notices, policy acknowledgments, and onboarding ownership. Check current official employment-verification instructions separately; this pack does not reproduce Form I-9 or determine an individual’s work authorization. Avoid requesting sensitive identity documents in ordinary chat.

## Output
Checklist with item, owner, timing to verify, source, and completion evidence. Distinguish optional organizational steps from legal requirements.`,
        [
          source(
            'EEOC Small Business Resource Center',
            'https://www.eeoc.gov/employers/small-business',
            'Employer responsibilities and coverage resources',
          ),
          dir(
            'California Workplace Postings',
            'wpnodb.html',
            'Notice table and employer applicability',
          ),
          source(
            'USCIS Handbook for Employers M-274',
            'https://www.uscis.gov/i-9-central/form-i-9-resources/handbook-for-employers-m-274',
            'Current Form I-9 completion guidance; verify current form and updates',
          ),
        ],
      ),
      page(
        'pay-hours',
        'Pay and Overtime',
        'Review California overtime policies and identify inputs needed for a wage calculation.',
        ['pay', 'wages', 'salary', 'overtime', 'hours', 'exempt', 'payroll', 'compensation'],
        'California wage/hour review; exemptions, wage orders, industry exceptions, and alternative schedules require separate assessment.',
        `## Reference brief
DIR describes daily and weekly overtime rules for covered nonexempt employees, including premium tiers and seventh-day rules. Salary alone does not establish exempt status. The regular rate can differ from the stated hourly rate, and applicable exceptions must be checked.

## Review workflow
Obtain the applicable wage order, duties/classification, defined workday and workweek, time records, pay components, and any alternative workweek arrangement. Separate actual work from assumptions. Check daily, weekly, and seventh-day treatment without double-counting the same premium entitlement. Identify bonuses or other compensation that may affect the regular rate. Do not use a fixed statewide minimum wage from memory; the rate depends on date, location, and potentially industry.

## Output
Show inputs, formula, assumptions, unresolved exceptions, and cited reference. If records are missing, produce a missing-input checklist instead of fabricated payroll totals.`,
        [
          dir(
            'DIR Overtime FAQ',
            'dlse/faq_overtime.htm',
            'General rule, exemptions/exceptions, and regular-rate questions',
          ),
        ],
      ),
      page(
        'meal-rest',
        'Meal and Rest Periods',
        'Review meal and rest policies against California guidance while preserving exceptions.',
        ['meal', 'lunch', 'rest', 'break', 'breaks', 'shift', 'hours'],
        'Covered California employees; wage orders, industry-specific rules, waivers, and exceptions matter.',
        `## Reference brief
DIR’s general meal-period guidance describes a meal of at least 30 minutes for a work period exceeding five hours, with limited waiver conditions. A second meal generally applies beyond ten hours. Motion-picture rules differ; do not apply the general schedule to every industry. Duty-free status and timing matter, not merely whether time was deducted.
DIR’s rest-period guidance generally describes paid ten-minute rest periods per four hours or major fraction, with an exception for workdays shorter than three and one-half hours.

## Review workflow
Collect shift lengths, actual break timing, interruptions, applicable wage order, and any waiver terms. Review meals and paid rests separately. Do not treat a signed waiver or automatic time deduction as proof that a practice is lawful. Identify possible missed-break issues for HR review rather than assuming liability or calculating penalties without full facts.`,
        [
          dir(
            'DIR Meal Periods',
            'dlse/faq_mealperiods.htm',
            'General rule; Questions 1–5 and industry exceptions',
          ),
          dir('DIR Rest Periods', 'dlse/FAQ_RestPeriods.htm', 'General entitlement and exceptions'),
        ],
      ),
      page(
        'sick-leave',
        'Paid Sick Leave',
        'Review California sick leave eligibility, use, accrual/frontloading, and local-rule questions.',
        ['sick', 'leave', 'pto', 'time', 'off', 'accrual', 'frontload'],
        'California employees subject to the sick-leave law; full/partial exclusions and qualifying collective bargaining agreements require review.',
        `## Reference brief
DIR explains a general annual use minimum of 40 hours or five days, whichever is greater, beginning January 1, 2024. That is not a universal accrual cap. Eligibility generally involves 30 days with the same employer in California within a year; use generally follows a 90-day employment period. Accrual and upfront plans have different requirements. Local ordinances may require additional benefits, while specified topics are state-preempted. Qualifying collective bargaining arrangements can change coverage.

## Review workflow
Identify work location, schedule length, employment dates, plan year, accrual/frontload method, carryover, use limit, eligible reasons, and bargaining coverage. Read current source provisions before resolving special cases. Distinguish accrual, balance, permitted use, and payment. Never equate five days with 40 hours for every schedule.

## Output
Compare each policy provision with the relevant FAQ question and flag missing facts or current local-law checks.`,
        [
          dir(
            'California Paid Sick Leave FAQ',
            'dlse/paid_sick_leave.htm',
            'Questions 1–6, qualification, plan methods, and permitted uses',
          ),
        ],
      ),
      page(
        'protected-leave',
        'Protected Leave and Accommodations',
        'Separate job protection, paid benefits, pregnancy disability, family care, and workplace accommodations.',
        [
          'leave',
          'family',
          'medical',
          'pregnancy',
          'disability',
          'accommodation',
          'cfra',
          'fmla',
          'bereavement',
        ],
        'Eligibility and employer coverage differ among California leave protections, federal law, and accommodation duties.',
        `## Reference brief
California CRD’s leave resource covers family/medical leave, pregnancy disability, reproductive loss, bereavement, and qualifying acts of violence. These are different protections; one leave balance does not resolve them all. CRD’s employment guidance also addresses disability and pregnancy accommodation responsibilities.

## Review workflow
Ask for employer size, work location, tenure/hours where relevant, reason category, requested dates, and prior leave. Gather only information needed for the review; avoid putting medical detail into reusable knowledge. Evaluate job protection separately from wage-replacement benefits and company-paid leave. Do not assume California and federal leave always run together. Do not infer a denial from an exhausted paid-time-off balance. Use the linked agency guides for eligibility and interaction questions; a federal FMLA determination needs the applicable federal source as well.

## Output
A matrix of possible protection, eligibility facts still needed, pay source, notice/documentation questions, and HR review owner. No automatic approval or denial.`,
        [
          source(
            'DOL FMLA Employer Guide',
            'https://www.dol.gov/agencies/whd/fmla/employer-guide',
            'Employer coverage, employee eligibility, notices, and leave administration',
          ),
          source(
            'CRD Job-Protected Leave',
            'https://calcivilrights.ca.gov/family-medical-pregnancy-leave/',
            'Leave types and linked quick-reference guides',
          ),
          source(
            'CRD Employment',
            'https://calcivilrights.ca.gov/employment/',
            'Disability, pregnancy, and accommodation guidance',
          ),
        ],
      ),
      page(
        'fair-workplace',
        'Fair Workplace and Complaints',
        'Review harassment, discrimination, retaliation, and complaint-handling policies.',
        [
          'harassment',
          'discrimination',
          'retaliation',
          'complaint',
          'investigation',
          'training',
          'conduct',
        ],
        'California workplace protections; employer thresholds and covered conduct vary. This workflow is not an investigation finding.',
        `## Reference brief
CRD provides guidance on prohibited employment discrimination, harassment, retaliation, and employer responsibilities. Evaluate the applicable protection rather than assuming all duties use the same coverage threshold.

## Review workflow
Check that the policy identifies reporting channels, alternatives when a supervisor is involved, nonretaliation, a response owner, and a fair review process. Record allegations separately from established facts; retain relevant evidence. Do not promise absolute confidentiality or reach credibility findings from an incomplete chat. Identify potential conflicts of interest and escalation needs. Verify applicable training requirements using current official resources.

## Output
A neutral intake summary, missing evidence list, and process checklist. Keep names, allegations, and sensitive facts out of reusable learned methods. Do not recommend adverse action without an appropriate human review.`,
        [
          source(
            'CRD Employment',
            'https://calcivilrights.ca.gov/employment/',
            'Discrimination, harassment, retaliation, and employer responsibilities',
          ),
        ],
      ),
      page(
        'departures',
        'Departures and Final Pay',
        'Prepare resignation/termination review and distinguish final wages from vacation and other benefits.',
        [
          'departure',
          'termination',
          'resignation',
          'final',
          'pay',
          'vacation',
          'offboarding',
          'quit',
        ],
        'California separations; special industry rules, contracts, and bargaining terms require checking.',
        `## Reference brief
DIR’s general guidance says discharged employees are due earned unpaid wages, including accrued vacation, at termination, subject to specified exceptions. For employees without a definite-term written contract who resign, at least 72 hours’ notice generally makes final pay due at quitting; without that notice, the general deadline is within 72 hours. Special industry rules exist.
DIR explains that earned vacation is treated as wages and generally cannot be forfeited. Vacation/PTO and standalone sick leave require different treatment.

## Review workflow
Confirm separation type/date, notice given, industry, contract, hours, outstanding commissions/expenses, and vacation/PTO records. Confirm payment method, applicable benefit notices, and handoff owners. Do not delay wages simply to obtain returned company property. Have payroll/HR verify calculations, deadlines, and exceptions before acting.

## Output
Itemized checklist with source, required facts, responsible person, and deadlines marked unverified until the case facts are confirmed.`,
        [
          dir(
            'DIR Paydays and Final Wages',
            'dlse/faq_paydays.htm',
            'Final-pay paragraphs and industry exceptions',
          ),
          dir('DIR Vacation FAQ', 'dlse/faq_vacation.htm', 'Vesting and termination payout'),
        ],
      ),
      page(
        'contractors',
        'Independent Contractor Classification',
        'Identify classification facts before reviewing a California contractor arrangement.',
        ['contractor', 'classification', 'freelancer', '1099', 'employee', 'abc'],
        'California employment classification; exceptions and different legal purposes can change the applicable test.',
        `## Reference brief
DIR describes the ABC test: the hiring entity generally must establish freedom from control, work outside its usual business, and an independently established business of the same nature. A contractual label or Form 1099 does not determine classification. Some occupations or relationships use another test, sometimes only after additional conditions are satisfied.

## Review workflow
Collect actual duties, control over work, business activities, other clients, industry/occupation, and the proposed exception if any. Compare actual practice with the contract; avoid deciding from wording alone. Identify the legal purpose of the classification inquiry. Do not conflate contractor status with overtime exemption.

## Output
Facts supporting or undermining each relevant condition, unresolved exception requirements, and questions for counsel. Do not automatically classify or approve the arrangement.`,
        [
          dir(
            'DIR Independent Contractor FAQ',
            'dlse/faq_independentcontractor.htm',
            'Questions 1–5 and 9',
          ),
        ],
      ),
    ],
  },
  {
    id: 'business-contract-review',
    version: '1.0.0',
    title: 'Business Contract Review',
    description:
      'Evidence-based workflows for contracts, amendments, renewals, supplier terms, NDAs, and invoice comparisons. Original review methods, not a legal treatise or approved contract forms.',
    jurisdiction: ['US — governing law must be identified'],
    reviewedAt: '2026-09-26',
    rights,
    pages: [
      page(
        'agreement-review',
        'Contract Review and Document Authority',
        'Review an agreement, establish document versions, and produce cited findings.',
        ['contract', 'agreement', 'review', 'legal', 'amendment', 'terms', 'msa'],
        'Business agreements. Governing law, contract type, and company requirements must be supplied; this workflow states no jurisdiction-specific legal rule.',
        `## Intake
Identify parties and roles, contract type, governing law, purpose, executed/draft status, effective dates, and company-approved requirements. Request the base agreement, amendments, schedules, statements of work, and incorporated documents. Do not infer enforceability or signature authority from a filename.

## Review
Build a document inventory with dates and execution status. Read order-of-precedence and amendment provisions; do not assume the newest upload replaces the agreement. Trace definitions and cross-references. Review scope, obligations, price, acceptance, term, renewal, termination, confidentiality, ownership, liability, remedies, notices, and disputes. Separate a missing provision from an unfavorable provision. Compare company requirements only when provided. Ask for missing exhibits instead of inventing their terms.

## Output
Executive summary, obligations table, and findings with document/section, observed term, business consequence, missing facts, and suggested negotiation question. Cite source passages for every contractual obligation. Label legal interpretations and proposed wording as requiring counsel review. A review is not approval to sign.`,
        [],
        'review-workflow',
      ),
      page(
        'renewal-obligations',
        'Renewals, Notices, and Obligations',
        'Extract recurring obligations and calculate notice dates from actual agreement terms.',
        [
          'renewal',
          'renew',
          'notice',
          'deadline',
          'obligation',
          'termination',
          'calendar',
          'expiration',
        ],
        'Contract-specific extraction; no universal notice period or date convention is assumed.',
        `## Workflow
Extract term commencement, initial end, renewal mechanism, renewal length, termination rights, notice window, delivery method/address, receipt rule, business-day definition, and survival clauses. Cite each clause. Distinguish obligation owner from counterparty and note triggers or dependencies.
For a deadline calculation, show the cited anchor date, exact period, calendar/business-day convention, timezone when relevant, and calculation. Request missing dates or holiday rules. Distinguish send-by and received-by dates. Do not assume a signature date equals an effective date.

## Output
Obligation | owner | trigger | due date or unresolved formula | delivery/evidence | clause citation. Mark inferred dates explicitly. Do not claim reminders were scheduled: extracting a register does not create an operational reminder system. Human confirmation is needed before relying on a deadline.`,
        [],
        'review-workflow',
      ),
      page(
        'supplier-pricing',
        'Supplier Scope, Pricing, and Invoice Review',
        'Compare service obligations, price schedules, and invoices without inventing commercial rules.',
        [
          'supplier',
          'vendor',
          'invoice',
          'pricing',
          'price',
          'payment',
          'sla',
          'service',
          'procurement',
        ],
        'Supplier/service contracts with supplied schedules and transaction records.',
        `## Workflow
Extract deliverables, quantities/units, acceptance criteria, milestones, rates, discounts, tiers, minimums, tax treatment, currency, billing frequency, indexation, expenses, and change-control clauses. Record service levels, measurement windows, exclusions, remedies, claim procedure, and caps. Do not assume every missed target creates an automatic credit.
Match invoice lines or read-only SQL results to contracted items and effective pricing periods. Validate keys and units before joining. Calculate locally from source records; show the formula and source for each assumption. Distinguish unmatched items, duplicates, missing evidence, and actual discrepancies. Read access does not authorize SQL writes or payment changes.

## Output
Contracted basis | billed basis | calculation | discrepancy | evidence | unresolved question. Include page/clause and transaction references in the current report only. Never copy SQL results, actual parameter values, customer examples, or calculated totals into learned knowledge.`,
        [],
        'review-workflow',
      ),
      page(
        'nda',
        'NDA and Confidentiality Review',
        'Compare confidentiality provisions with company-approved requirements.',
        ['nda', 'confidentiality', 'disclosure', 'confidential', 'secret', 'recipient'],
        'Commercial confidentiality agreements; employment restrictions and enforceability need separate legal review.',
        `## Workflow
Identify mutual/unilateral structure, discloser/recipient, permitted purpose, definition of protected information, marking/oral-disclosure rules, exclusions, permitted recipients, care obligations, compelled-disclosure procedure, duration, and survival. Review return/destruction requirements and backup/legal-retention exceptions. Check ownership/license language, residuals, remedies, publicity, and restrictions beyond confidentiality.
Compare the actual wording with the organization’s approved template or requirements. Do not invent a standard acceptable duration or state that an NDA prevents legally protected disclosures. Flag employee/contractor restrictions and jurisdiction-sensitive provisions for counsel.

## Output
Clause | proposed term | approved baseline if supplied | difference | business question | citation. Proposed alternative language is a draft for review, not a determination of legal enforceability.`,
        [],
        'review-workflow',
      ),
      page(
        'compare-versions',
        'Amendment and Version Comparison',
        'Compare contract versions and trace the effect of amendments.',
        ['compare', 'comparison', 'version', 'redline', 'amendment', 'change', 'revised'],
        'Requires both versions or the original agreement plus amendments; extracted text may omit signatures, formatting, or image-only clauses.',
        `## Workflow
Identify the versions and compare definitions, obligations, amounts, dates, renewal, termination, liability, confidentiality, and dispute terms. Detect moved clauses separately from substantive changes. Follow changed cross-references and document precedence. For amendments, distinguish replaced text from additions and provisions left unchanged. Explicitly list missing schedules and extraction limitations.

## Output
Topic | earlier clause | later clause | substantive change | practical effect | citations to both versions. Use short supporting excerpts, preserve qualifications, and avoid declaring a clause absent if the source extraction is incomplete. For a proposed consolidated version, identify every assumption and obtain human verification before use.`,
        [],
        'review-workflow',
      ),
    ],
  },
];
