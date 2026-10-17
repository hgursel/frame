import { pack, page, refs as r } from './common.js';
export const employmentPacks = [
  pack(
    'ca-pay-classification-guide',
    'California Pay, Classification & Production Work',
    'Detailed issue guides for employee classification, office versus production wage rules, time records, and final pay. No bargaining agreement interpretation.',
    [
      page(
        'worker-classification',
        'Employee, Contractor, and Exempt Status',
        ['classification', 'contractor', 'freelance', 'exempt', 'payroll', 'loan-out'],
        'California engagements by a guild or production-related business. Test each legal entity, role, period, and applicable law separately.',
        `## Legal framework
California contractor analysis often begins with the ABC test: freedom from control, work outside the hiring entity’s usual course of business, and an independently established business. DIR describes exceptions that may instead require the multifactor Borello analysis. An exception from ABC is not an automatic finding of contractor status. Wage-order exemptions are a separate inquiry: salary, job title, a 1099, or a loan-out corporation does not by itself establish that no employee protections apply. Federal tax, workers’ compensation, and wage-law classifications can involve different tests.

## Build the analysis
Create one row per engagement, not per person. Identify the contracting entity, the entity directing daily work, who can terminate, who supplies equipment, whether work is integral to the business, whether the person markets services independently, and who bears economic risk. Ask counsel to identify any occupation-specific or business-to-business exception and its conditions before comparing the facts to it. Record unresolved conditions explicitly. For an asserted overtime exemption, separately list actual duties, decision authority, proportion of time spent, pay method, and the threshold applicable during the period.

## Evidence to collect
Preserve signed agreements, statements of work, invoices, schedules, actual work samples, supervision messages, outside-client information voluntarily supplied for review, and payroll records. Compare what the agreement says with what happened. A written right to decline assignments is weak evidence if managers actually require attendance and discipline refusal. Conversely, an office badge alone does not settle the legal test. Do not request a worker’s unrelated private client records without a justified need.

## Discussion example and alternatives
A freelance researcher works a recurring schedule under a staff supervisor using the guild’s systems. The invoice label supports neither a safe classification nor an automatic violation. Develop an employee-treatment option, a genuinely separate vendor-service option if legally supportable, and a pause-for-counsel option. Identify prospective operational changes separately from historical exposure; rewriting the agreement does not erase past facts.

## Questions and deliverable for counsel
Which test controls this claim? Does an exception actually fit, including every condition? Which entities may be employers? Are prior payroll, benefit, or tax corrections indicated? Deliver an element-by-element evidence table with contrary facts, missing records, time periods, and the decision owner. Do not calculate penalties or declare a person exempt before coverage and the governing test are resolved.`,
        [r.classification, r.wage4, r.wage12],
      ),
      page(
        'hours-and-meals',
        'Office and Production Hours, Meals, and Time Records',
        ['overtime', 'meal', 'rest', 'production', 'travel', 'wages'],
        'Nonexempt California work; confirm wage-order coverage and exemptions. A guild office is not automatically part of motion-picture production.',
        `## Legal framework
DIR’s general overtime guidance describes time-and-a-half after eight hours in a workday or forty in a workweek and double-time rules for longer workdays and certain seventh-day work. The regular rate may include more than the base hourly wage. Identify the correct wage order and exceptions before calculating. Wage Order 12 governs covered motion-picture work; office duties may call for a different coverage analysis. DIR’s meal guidance distinguishes the usual five-hour threshold from the six-hour threshold for covered motion-picture workers. An industry name in the employer’s branding does not select the rule.

## Reconstruct actual working time
Collect the defined workday and workweek, daily start/stop records, meal punches, edits, call sheets where relevant, travel instructions, required preparation, training, and after-hours messages. Separate time worked, time recorded, time paid, and time disputed. Ask how edits are approved and whether managers can see original entries. For travel and on-call arrangements, document restrictions, locations, transportation, and actual duties rather than assuming all travel is unpaid. Do not stack daily and weekly overtime mechanically without checking the calculation rules.

## Meals and rest analysis
Identify when a meal began, its duration, whether duties were relieved, interruptions, and any claimed waiver or on-duty arrangement. Rest periods require their own analysis; a meal is not a substitute. A missing punch is an investigative signal, not conclusive proof of what occurred. Compare the written policy, scheduling practice, supervisor instructions, and worker account. Preserve records that support the employer’s explanation as well as those supporting the complaint.

## Locality and practical options
For remote or traveling staff, map actual work locations and dates. Los Angeles city, unincorporated county, and nearby cities are different jurisdictions. Check current official rates and notices for the pay period rather than retaining a static dollar amount in this pack. Possible process changes include accurate time capture, manager training on off-the-clock requests, schedule coverage for breaks, and documented correction procedures. Present them as proposals pending review.

## Example and counsel handoff
A guild-office payroll policy uses the production meal threshold for every employee. Before applying it, identify the office staff’s duties and the relevant wage-order scope; an organization’s industry affiliation does not establish coverage for every role. Compare a proposed office schedule and a production schedule separately, stating the assumptions and missing facts.

Provide a daily ledger with source citations, rate components, break facts, and uncertainty ranges. Ask which order and exceptions apply, whether records are reliable, and whether a sample can fairly be extrapolated. Escalate systemic missed breaks or edits promptly. No bargaining agreement rates or interpretations are supplied here.`,
        [r.overtime, r.meals, r.wage12, r.wage4, r.la],
      ),
      page(
        'final-pay-and-corrections',
        'Final Pay, Payroll Corrections, and Disputed Amounts',
        ['termination', 'resignation', 'final pay', 'wages', 'payroll'],
        'California departures and payroll disputes; confirm ordinary rules versus a statutory industry exception for the actual employment.',
        `## Legal framework
DIR distinguishes discharge, resignation with advance notice, and resignation without it. The ordinary rules can require immediate payment or payment within a short statutory period; accrued vacation and other earned amounts need analysis. DIR separately identifies motion-picture final-pay rules tied to Labor Code 201.5. Do not extend an industry exception to guild office staff merely because their employer represents entertainment workers. Undisputed earned wages should not be held hostage to a release or a dispute over another amount.

## Intake and timeline
Record the last day worked, who ended employment, when notice was given and received, whether employment continued through a stated date, and the applicable pay period. Preserve the original notice, termination authorization, payroll instructions, and delivery records. Identify whether a later correction relates to previously earned wages, a commission condition, a bonus, an expense reimbursement, vacation, or a disputed damages claim. Each category may have different rules and evidence.

## Reconciliation workflow
Build a line-item ledger: amount claimed; basis; work period; source; amount already paid; remaining difference; disputed reason; proposed next action. Reconcile payroll exports against bank/check delivery information without assuming that a generated check was received or negotiable. Keep sensitive bank details out of the model’s discussion copy. Document missing information and how payroll estimated undisputed amounts. Ask counsel about the legal effect of late corrections rather than announcing that a correction eliminates liability.

## Departures and communication
Use neutral factual language with the departing person. Return of equipment, deletion of credentials, reimbursement requests, and final wage payment are separate workstreams. Do not invent a right to deduct an unreturned laptop or condition payment on an exit interview. For disputed commissions or incentives, obtain the actual plan version and relevant triggering events. Any settlement, release, confidentiality, or nondisparagement term needs counsel review and is outside automatic payroll processing.

## Example and questions for counsel
A production-related organization proposes paying a terminated office employee on the next regular payday. First verify the person’s duties and the asserted statutory exception; do not accept the employer’s sector as sufficient. Ask what undisputed amount must be paid now, which delivery method is permitted, and what evidence supports any claimed good-faith dispute. Provide a dated chronology and proposed correction plan; do not present waiting-time penalties as certain or calculate a limitation period from memory.`,
        [r.finalpay, r.wage12, r.retaliation],
      ),
    ],
  ),
  pack(
    'ca-leave-accommodation-guide',
    'California Leave & Accommodation: Detailed Review',
    'Separate job protection, pay replacement, sick leave, pregnancy, disability accommodation, and local rules using fact-specific review workflows.',
    [
      page(
        'leave-coverage',
        'CFRA, FMLA, Pregnancy, and Pay Replacement',
        ['CFRA', 'FMLA', 'pregnancy', 'leave', 'disability'],
        'California staff and member inquiries. Establish employer coverage, worker eligibility, relationship, qualifying event, and leave dates.',
        `## Legal framework
CFRA and FMLA are separate job-protection laws with different coverage and eligibility rules. CRD describes CFRA coverage beginning at five employees and qualifying family and medical purposes. Federal FMLA coverage and employee eligibility require their own review; its employee rules include service, hours, and worksite considerations. Pregnancy disability leave is a separate California protection. Wage replacement, including state disability or paid family leave benefits, does not by itself establish a right to be absent or restored to a job.

## Use parallel tracks
Build separate columns for job protection, benefit/pay replacement, accrued paid time, accommodation, and employer policy. For each track record the authority, eligibility facts, notices, required documentation, available amount, accounting method, and possible overlap. Do not simply add all leave periods or assume they always run concurrently. Ask counsel which periods can overlap and which cannot on the supplied facts. A payroll administrator’s payment decision is not necessarily a leave designation.

## Fact development
Obtain hire dates and breaks in service, actual hours, work locations including remote arrangements, employee counts and entity relationships, the reason for leave at the level needed to assess eligibility, requested dates, and prior leave in the relevant measuring period. Preserve requests even if they do not name a statute. Use a restricted medical channel for certifications; the general case brief should usually describe limitations and scheduling needs rather than diagnoses or full medical records.

## Notices, operations, and return
Identify the person responsible for acknowledging requests, seeking permitted certification, providing required notices, tracking leave, coordinating benefits, and arranging return. Keep managers informed about availability and approved restrictions without distributing medical details. When circumstances change, update the timeline and the governing analysis. Exhaustion of a leave allowance is not an automatic termination instruction; consider the accommodation track and other protections.

## Example and counsel questions
A worker receives state wage-replacement benefits and a supervisor assumes no further leave paperwork is needed. Ask whether any job-protection law applies, whether notices were supplied, whether leave was designated correctly, and what restoration obligations remain. Deliver a calendar with separate legal/pay tracks, unresolved overlaps, and proposed communications for review. Confirm current state guidance for bereavement, reproductive loss, and violence-related leave rather than forcing every absence into CFRA.`,
        [r.leave, r.fmla, r.accommodation],
      ),
      page(
        'interactive-process',
        'Accommodation and the Interactive Process',
        [
          'accommodation',
          'disability',
          'interactive process',
          'remote work',
          'essential functions',
        ],
        'California employment accommodation discussions; individualized assessment and confidential handling are required.',
        `## Legal framework
CRD explains that covered employers must provide reasonable disability accommodation absent undue hardship and engage in a timely good-faith interactive process. The relevant question is how an individual can perform essential functions, not whether every employee receives the same arrangement. A request need not use a specific legal phrase. Accommodation may remain relevant after other leave is exhausted. This guide supports fact development; it does not decide disability status or medical fitness.

## Define the work accurately
Obtain the job description and compare it with actual duties, frequency, location, staffing, and performance expectations. Separate essential functions from a preferred way of performing them. Describe the operational outcome a restriction affects: travel, prolonged standing, schedule predictability, concentration, or physical handling. Do not have the model infer a diagnosis from behavior or reject a request because the person appears healthy.

## Develop alternatives
Create an options table with the requested accommodation, alternatives discussed, employee feedback, feasibility evidence, trial period, and reassessment date. Depending on facts, topics may include equipment, modified schedules, changes in methods, leave, or reassignment analysis. These are possibilities to assess, not a promise that any one is legally required or sufficient. Do not substitute a cheaper option without considering whether it is effective. Record the particular evidence behind a claimed hardship rather than repeating general inconvenience.

## Protect the process
Use the organization’s approved medical-information channel and restrict access. Managers generally need approved functional restrictions and arrangements, not a complete medical file. Document requests, reasonable follow-up, alternatives, decisions, and reasons without argumentative characterizations. A failure to provide one requested document should prompt review of what was requested and why before the case is closed. Keep performance concerns separate enough to determine whether the proposed standard is legitimate and whether accommodation was considered.

## Example and counsel handoff
A staff member requests remote work after a medical event. Establish which duties truly require presence, what can be done remotely, what evidence supports a limitation, and whether a trial or alternative arrangement could work. Ask counsel about permissible documentation, timing, reassignment, and interaction with protected leave. Deliver a factual record of engagement and unresolved options, not a predetermined denial letter or a declaration that remote work is always required.`,
        [r.accommodation, r.employment, r.fmla],
      ),
      page(
        'sick-and-local-leave',
        'Paid Sick Leave and Local Workplace Rules',
        ['paid sick leave', 'accrual', 'frontload', 'Los Angeles', 'local leave'],
        'California work with a separate check for the city or county where services are actually performed.',
        `## Legal framework
DIR’s statewide FAQ explains that covered employees must generally be allowed at least forty hours or five days of annual sick-leave use, whichever is greater. Accrual, use, carryover, and caps are different concepts. Frontloading and accrual methods have different requirements. Los Angeles has its own wage and paid-sick-leave framework tied to work within city boundaries. A state-compliant handbook should not be assumed sufficient for every location or work schedule.

## Audit the policy in four layers
First identify coverage and qualifying purposes under current law. Second map accrual or frontloading and eligibility to begin use. Third examine use increments, carryover, caps, reinstatement after rehire where applicable, and payment calculation. Fourth review notices, balances, records, and how supervisors handle requests. Compare the written policy with payroll configuration and real examples. A benefit labeled PTO needs analysis of its operation, not merely its name.

## Schedule and location evidence
Record scheduled day length, actual hours, exempt/nonexempt status, variable work, remote locations, and relevant employment dates. The hours-versus-days rule can matter for a person with a long normal workday. Ask for the actual work address and city boundary; a Los Angeles postal address alone does not answer municipal coverage. Separate state and local requirements in a comparison table and flag which provisions need current verification.

## Handling a request
Document the request date, requested time, available balance, and reason category only to the extent necessary. Avoid collecting diagnosis details in the general discussion. Check whether an attendance point, replacement-worker requirement, or other supervisor practice interferes with protected use. Escalate inconsistent documentation demands and possible retaliation. Also ask whether another leave or accommodation protection applies when the sick-leave balance is exhausted.

## Example and deliverable
An employee working ten-hour shifts is told that forty hours is always the annual maximum. Frame should identify the schedule issue and request the applicable policy and jurisdiction, not invent a final entitlement. Provide a worked payroll illustration only after verified assumptions are recorded, then distinguish that illustration from a legal conclusion. Counsel questions should identify the applicable use allowance, accrual method, local overlays, and corrective notices. Do not reuse expired pandemic supplemental-leave summaries as current general law.`,
        [r.sick, r.la, r.leave],
      ),
    ],
  ),
  pack(
    'ca-investigations-guide',
    'California Investigations & Retaliation',
    'Detailed intake, evidence assessment, independence, confidentiality, corrective-action, and retaliation-monitoring guides for staff and member matters.',
    [
      page(
        'investigation-design',
        'Designing a Fair Workplace Investigation',
        ['harassment', 'investigation', 'complaint', 'evidence', 'witness'],
        'Workplace allegations involving staff or production personnel. First identify whether the guild is employer, representative, witness, or recipient of a referral.',
        `## Legal framework
CRD’s harassment guidance emphasizes prompt, fair, impartial fact gathering and an appropriate response. The inquiry should be designed to find facts rather than justify a preferred outcome. A workplace investigation is distinct from a judicial decision and from a criminal investigation. Employer, individual, and organizational duties can differ. Do not promise absolute secrecy or treat the absence of a formal complaint form as a reason to ignore notice of a problem.

## Scope and independence
Record each allegation, people involved, dates, locations, applicable policy version, immediate safety concerns, and the organization’s role. Check the proposed investigator’s reporting line, prior involvement, financial interests, and relationships. Senior-leadership allegations, competing member interests, or significant conflicts may warrant outside counsel or an independent investigator. Define who investigates, who decides, and who handles interim arrangements. Interim steps should address risk without predetermining facts or burdening the complainant automatically.

## Evidence plan
Create an allegation matrix with supporting evidence, contrary evidence, missing evidence, and source reliability. Preserve relevant messages, schedules, contemporaneous reports, and available recordings through approved channels. Interview people with direct knowledge and give the respondent a fair chance to address the allegations. Separate firsthand recollection from inference and repetition. Use open questions, retain the witness’s qualifications, and avoid feeding a rehearsed narrative to witnesses.

## Evaluation and findings
Assess consistency, opportunity to observe, contemporaneous corroboration, plausible alternative explanations, and contradictions. Demeanor alone is an unreliable shortcut; do not generate credibility scores from personality, protected characteristics, or an AI impression. State the standard and policy being applied and distinguish factual findings from legal conclusions. A finding of insufficient evidence is not a finding that the reporter lied. Record limitations, including unavailable witnesses or missing messages.

## Example and counsel brief
A member reports misconduct at a production and also alleges that a guild employee mishandled the report. Split the employer’s underlying investigation from the guild’s response review and identify conflicts before sharing files. Deliver a timeline, allegation matrix, interview list, preservation status, and questions about scope, independence, notices, and corrective options. Do not assume that copying counsel makes the investigation privileged; counsel must design and assess the privilege strategy.`,
        [r.investigations, r.employment, r.crdComplaint],
      ),
      page(
        'retaliation-and-response',
        'Retaliation, Corrective Action, and Follow-Up',
        ['retaliation', 'whistleblower', 'discipline', 'complaint', 'follow-up'],
        'Employment and member-service responses to reports, participation in investigations, or exercise of workplace rights; identify the specific protected activity.',
        `## Legal framework
California has several retaliation protections with different protected activities, decision standards, agencies, and deadlines. CRD handles civil-rights-related matters; the Labor Commissioner administers numerous labor-law retaliation protections. Do not collapse wage complaints, safety reports, discrimination complaints, and internal disagreements into a single rule. Protection does not necessarily depend on the underlying allegation ultimately being substantiated.

## Separate chronology from inference
Record the protected activity asserted, when each decision-maker learned of it, the challenged action, earlier plans or performance records, comparators, and stated reasons. Timing can be relevant but does not alone prove or disprove causation. A prior problem does not automatically justify any later response. Preserve drafts and approvals showing when the decision was formed. Include changes in assignments, access, schedules, references, exclusion, and other consequences, not just firing.

## Review proposed actions
Before discipline or a significant change involving a reporter or witness, review the factual basis, consistent treatment, policy, approval history, and practical impact. Consider whether an interim separation of people can be accomplished without automatically reducing the reporting person’s opportunities. Frame may identify inconsistencies and questions, but should not decide whose account is true or recommend punishment based on an unverified summary.

## Follow-up controls
Assign an independent contact, explain how new concerns can be raised, and set actual check-in dates. Review whether corrective measures were implemented and whether problems recur. Limit information shared with the workforce to what is appropriate; do not publish witness statements or a disciplinary file. Preserve the original investigation and later follow-up separately so that updates do not overwrite the historical record. Confidentiality instructions need legal review and should not be a blanket prohibition on protected discussion.

## Worked discussion and escalation
A supervisor removes a staff member from a visible assignment after the person participates in an investigation, explaining that the change reduces tension. Ask who chose the change, whether the employee agreed, what alternatives existed, and how duties and advancement are affected. Present neutral alternatives for counsel rather than a conclusion of liability. Deliver a decision timeline, comparator evidence, risks needing prompt action, and a follow-up plan. Refer filing deadlines and agency selection for current legal verification; an internal review does not automatically extend an external deadline.`,
        [r.retaliation, r.employment, r.crdComplaint],
      ),
    ],
  ),
  pack(
    'ca-hiring-separation-guide',
    'California Hiring, Pay Equity & Departures',
    'Deeper review of recruiting criteria, background checks, automated hiring, pay equity, disciplined decision records, and separation planning.',
    [
      page(
        'hiring-screening',
        'Hiring Criteria, Background Checks, and AI Screening',
        ['hiring', 'fair chance', 'background check', 'AI', 'recruitment'],
        'California staff hiring or review of a member’s hiring concern. Determine employer size, location, occupation, and any statutory exception.',
        `## Legal framework
The Fair Chance Act generally restricts conviction-history inquiries before a conditional offer for covered employers and requires an individualized process before disqualifying a person based on conviction history. Specific exceptions and other background-check laws require separate review. CRD’s approved employment AI regulations address discriminatory use of automated-decision systems; calling a tool advisory does not remove the need to examine its effect on employment decisions. Earlier proposals should not be used in place of final text.

## Design a job-related process
Document essential functions and distinguish required qualifications from preferences. Ask which evidence actually demonstrates ability to do the work. Review selection rubrics, interview prompts, accessibility, and accommodation channels before using them. Do not have Frame infer protected traits, score personality from a photograph, or decide whom to hire. Keep a human decision owner and a documented reason tied to verified criteria.

## Screening and adverse information
Record the timing of the conditional offer, disclosures and authorizations, source of the report, possible inaccuracies, individual assessment, notices, and response opportunity. A vendor’s label is not a final legal assessment. Ask counsel about federal consumer-reporting requirements, California laws, and local ordinances; do not reuse a generic rejection template for every background-check issue. Preserve corrections and the person’s explanation with appropriate access limits.

## Automated systems
Inventory resume ranking, assessments, video tools, scheduling filters, and vendor recommendations that influence access to opportunities. Ask vendors what data they use, how accessibility is handled, whether disparate effects have been tested, what records can be exported, and how a human can review an error. Treat assurances of compliance as claims to verify. Capture tool version, relevant criteria, human review, and changes without collecting unnecessary sensitive data.

## Example and counsel questions
A screening vendor rejects a candidate based on an old conviction and a low automated suitability score. Separate the two grounds, confirm the stage of hiring, inspect the actual job duties, and preserve both the report and model/vendor version. Ask which restrictions apply, what notices and response periods are required, and whether the scoring method is defensible. Deliver a process map and evidence gaps, not a final rejection letter or an invented deadline.`,
        [r.fairchance, r.hiringAi, r.employment],
      ),
      page(
        'equity-and-departure-review',
        'Pay Equity and Defensible Departure Decisions',
        ['pay equity', 'salary history', 'severance', 'termination', 'performance'],
        'California compensation and separation review; distinguish factual analysis from a legal conclusion and use approved decision-makers.',
        `## Legal framework
California equal-pay analysis concerns substantially similar work under the statutory factors, not merely identical job titles. DIR explains pay-transparency and salary-history requirements separately from equal-pay obligations. A pay difference needs fact-specific justification rather than a generalized claim about market forces. Departure decisions may also intersect with protected leave, accommodation, retaliation, and final-pay rules. At-will terminology does not resolve those separate duties.

## Compensation review
Build a documented comparison of actual duties, skill, effort, responsibility, working conditions, pay components, relevant periods, and claimed explanatory factors. Avoid publishing identifiable employee salary tables in a shared project unnecessarily. Use aggregation where feasible, but do not imply that an aggregate analysis proves individual compliance. Check whether criteria were documented and applied consistently; do not create a retrospective justification after seeing a disparity. Confirm current posting and pay-scale rules against the source.

## Departure fact record
Before a planned separation, reconcile the stated reason with performance records, prior communications, decision timing, comparators, and any recent protected activity. Separate misconduct, performance, restructuring, and job elimination; they raise different questions. Record missing evidence and whether accommodation or leave issues remain open. Do not let a generated memo convert allegations into established facts.

## Operational and agreement tracks
Coordinate payroll, benefits contacts, access changes, property return, preservation, and respectful communications. Keep final wage processing distinct from negotiations over severance or releases. Counsel should review any age-related waiver, confidentiality, nondisparagement, noncompete, release, or arbitration provision and the actual applicable law. Do not generate enforceability assurances or make payment of earned wages contingent on signing.

## Example and deliverable
A department proposes eliminating a role shortly after a medical-leave request. Provide the earlier restructuring records, alternatives considered, selection criteria, affected positions, and who knew of the request. Ask counsel whether additional review or a different sequence is needed. The output should include a factual chronology, compensation questions, open legal issues, an operational checklist, and drafts clearly labeled for review. Legal deadlines and statutory waiver language should be checked against current authority for the specific case.`,
        [r.equalpay, r.finalpay, r.accommodation, r.employment],
      ),
    ],
  ),
];
