import { page } from './common.js';
import { federalPack as pack, federalSources as r } from './federal-sources.js';

export const federalPeoplePacks = [
  pack(
    'us-employment-guide',
    'Federal Employment: Fair Decisions, Pay & Leave',
    'A federal baseline for discrimination, retaliation, wage classification, leave, and accommodation across industries.',
    [
      page(
        'fair-decisions',
        'Coverage, Consistent Decisions & Retaliation',
        ['federal', 'employment', 'Title VII', 'ADEA', 'EEOC', 'retaliation', 'hiring'],
        'Private-employer decisions; coverage tests differ by law and employer type. Add applicable state and local protections.',
        `## Framework and limits
Title VII, the ADA, the ADEA, and other federal employment laws have different coverage and substantive tests. EEOC guidance describes the usual private-employer thresholds as 15 employees for several discrimination laws and 20 for age discrimination, with counting periods and other conditions. A small workforce is not a general exemption from employment law. State protections, equal-pay requirements, and special rules for agencies or labor organizations need separate consideration.

Separate three questions: was a decision discriminatory, was an accommodation required, and did the employer retaliate against protected activity? A complaint that is ultimately unsubstantiated does not automatically eliminate retaliation protection. An apparently neutral selection rule also deserves review for discriminatory effects; a manager's good intentions are not the complete analysis.

## Practical review
Prepare a decision file before approving hiring, promotion, discipline, or termination. Identify the actual employing entity, work location, relevant dates, decision makers, and criteria used. Retain the original criteria and evaluation records, including inconvenient comparisons. Record when each decision maker learned of a complaint or request. Compare similarly situated employees while explaining material differences in duties, history, and performance.

For a complaint, appoint an impartial reviewer, define the allegations, preserve messages and scheduling records, and offer reporting routes outside the supervisor involved. Interim measures should address risk without automatically burdening the reporting employee. Limit information to those who need it, but do not promise absolute confidentiality. Track subsequent hours, assignments, references, and advancement as well as formal discipline.

## Example
A consulting firm removes an analyst from a client account shortly after she reports discriminatory remarks. The partner says the customer requested it. Frame should ask for the customer's actual communications, the timeline, alternative assignments, and how other complaints were handled. It should not conclude that customer preference excuses discrimination or that timing alone proves retaliation. A useful output is a chronology with competing explanations and missing evidence.

## Counsel questions and next steps
Ask counsel which entities and statutes are covered, whether an investigation needs independent leadership, and what immediate protection or preservation steps are appropriate. Flag any agency charge or demand on receipt; internal review does not pause external deadlines. Maintain a decision log linking each factual conclusion to evidence and identifying what would change the proposed response. Treat this as preparation for a defensible decision, not a score that automatically authorizes termination.`,
        [r.coverage, r.retaliation],
      ),
      page(
        'pay-and-classification',
        'Exemptions, Hours & Payroll Review',
        ['FLSA', 'overtime', 'exempt', 'classification', 'payroll', 'remote work'],
        'Federal wage-and-hour triage for covered employment; sector exemptions and state law require separate review.',
        `## Framework and limits
The FLSA establishes federal minimum-wage, overtime, recordkeeping, and youth-employment requirements for covered workers. For covered nonexempt employees, overtime generally turns on hours over 40 in a workweek, not a two-week payroll average. State law may add daily overtime, meal rules, higher wages, or stricter exemptions. A salary, job title, professional appearance, or employee agreement does not by itself establish exempt status.

The executive, administrative, professional, computer, and outside-sales exemptions have distinct tests. Actual duties matter, and some exemptions have salary conditions while others operate differently. Use the current DOL materials and controlling law for the relevant pay period; salary thresholds and enforcement positions can change. Contractor classification is a separate question, and federal tax treatment does not resolve FLSA status.

## Practical review
Build a role inventory showing duties actually performed, decision authority, supervisor responsibilities, compensation structure, and work location. Sample employees rather than assuming everyone with the same title performs the same work. For nonexempt staff, map the entire workday: opening systems, mandatory meetings, messages after shifts, travel between assignments, and interrupted unpaid periods. Refer disputed compensability questions to counsel instead of deleting short intervals as immaterial.

Reconcile payroll with time edits, schedules, approved overtime, incentive payments, and employee reports. A rule against unauthorized overtime can be enforced through appropriate management processes; it should not be used to erase compensable work already performed. Review which payments belong in the regular-rate calculation. Document corrections transparently and preserve original records, access history, and calculation assumptions.

## Example
A software support team is salaried and described as technical professionals. Most daily work follows scripts, and staff answer weekend tickets. The review should compare actual work with the specific exemption tests and examine recorded hours and incentive pay. Being employed by a technology company does not itself make everyone a computer professional. Model potential exposure under clearly stated assumptions rather than presenting an estimate as a legal finding.

## Counsel questions and next steps
Ask which exemptions genuinely fit, whether staffing arrangements create shared obligations, what lookback period and records are appropriate, and how corrections should be communicated. Have payroll verify calculations independently. For changing laws or disputed exemptions, identify the governing date and authority rather than treating the newest agency announcement as retroactive. Frame can produce a sampling plan and evidence checklist; it should not invent hours or characterize a payment as a complete release.`,
        [r.flsa, r.exemption, r.taxWorker],
      ),
      page(
        'leave-and-accommodation',
        'Leave, Disability, Pregnancy & Religious Accommodation',
        ['FMLA', 'ADA', 'PWFA', 'religion', 'accommodation', 'leave'],
        'Employer and employee eligibility must be evaluated separately; concurrent state leave and benefit rules may apply.',
        `## Framework and limits
FMLA coverage does not automatically make every employee eligible. Evaluate employer coverage, service, hours, location rules, and the qualifying reason using the DOL guide. Job protection, wage replacement, and health-benefit continuation are separate questions. Paid leave or disability insurance may fund an absence without determining its legal protection.

Accommodation can remain relevant when FMLA is unavailable or exhausted. The ADA addresses disability-related barriers; the PWFA addresses qualifying known limitations related to pregnancy, childbirth, or related medical conditions. Religious accommodation arises under a different framework. Do not use one universal hardship test: the applicable statute and current case law matter. An accommodation request need not arrive with the correct legal label.

## Practical review
Create an intake record describing the work barrier, essential duties, requested adjustment, expected timing, and any immediate safety concern. Separate medical information from routine personnel files. Seek only documentation appropriate to the applicable rule and actual uncertainty; do not demand full medical histories as a default. Discuss effective alternatives, including schedule changes, equipment, task adjustments, and leave where appropriate.

Maintain a notice calendar that distinguishes eligibility, certification, designation, recertification, return-to-work, and benefits responsibilities. Document who sends each communication and how delivery is confirmed. For overlapping laws, record which entitlement is running and why; do not simply subtract every absence from every available bank. Escalate disagreements about essential functions or hardship with evidence of actual operational impact and alternatives considered.

## Example
A small medical office receives a request from a newly hired employee for temporary lifting changes during pregnancy. The employee may not meet FMLA service requirements. That does not finish the analysis: assess PWFA coverage, the limitation, potential accommodations, and any state protections. Compare task rotation or equipment with leave, and avoid deciding that forced leave is automatically the safest option. Capture the employee's input and the rationale for the effective arrangement selected.

## Counsel questions and next steps
Ask which law governs each adjustment, what documentation is permissible, whether the proposed hardship evidence is sufficient, and what current litigation affects the issue. Before a leave-related separation, review all applicable protections and notice history. Set a realistic review date for temporary arrangements without treating it as an automatic termination date. Frame should help prepare the timeline and alternatives; medical judgments and individualized legal conclusions belong with qualified professionals.`,
        [r.fmla, r.accommodation, r.pwfa],
      ),
    ],
  ),
  pack(
    'us-workplace-safety-guide',
    'Federal Workplace Safety & Incident Response',
    'Hazard-based safety planning, shared-worksite coordination, and incident records with federal/state-plan distinctions.',
    [
      page(
        'hazards-and-contractors',
        'Hazards, Controls & Shared Worksites',
        ['OSHA', 'safety', 'contractors', 'staffing', 'hazards', 'training'],
        'General employer planning; identify federal OSHA or the applicable state plan and industry-specific standards.',
        `## Framework and limits
Start with jurisdiction and the actual activity. Federal OSHA standards, approved state plans, construction rules, and specialized requirements do not apply identically to every site. OSHA's recommended safety-program practices are useful management guidance, not a substitute for enforceable standards. A written policy also does not establish that equipment, training, or supervision met the relevant requirement.

Worksites involving a host employer, contractor, staffing company, or several trades require coordination. A contract allocating safety tasks does not necessarily eliminate statutory responsibility. Identify who creates hazards, directs work, supplies equipment, trains people, and can correct a dangerous condition. Confirm the applicable enforcement framework with counsel rather than treating contractor status as immunity.

## Practical review
Make a task-based hazard register covering normal work, maintenance, startup, shutdown, foreseeable upset conditions, and visitors. Describe who can be exposed, the potential harm, existing controls, and how control effectiveness will be checked. Favor removing or engineering out hazards where feasible; training and personal protective equipment should not become an excuse to ignore stronger controls.

Before a contractor starts, exchange site hazards, emergency procedures, work restrictions, reporting routes, and qualifications needed for the task. Specify who authorizes changes and who has authority to stop unsafe work. Verify training in a language and format workers can understand. Inspect the work actually performed, including changes introduced by subcontractors or overtime shifts.

## Example
A warehouse hires temporary workers during a demand surge. The agency provides a general orientation, but the host introduces new loading equipment. A useful review asks who assessed the changed task, whether workers received equipment-specific instruction, and who supervised their first shifts. A signed onboarding form does not answer those questions. Frame can assemble a responsibility table and inspection checklist without presenting it as an OSHA certification.

## Counsel questions and next steps
Ask which standards apply, which parties retain duties, whether exposure monitoring or specialist assessment is necessary, and what records must be retained. Assign an owner, budget, and due date to each corrective action and verify closure through observation. Include workers in identifying practical failures; reward reporting rather than a low reported-injury count. For an imminent hazard, protect people and engage the responsible safety professional immediately instead of waiting for a complete legal memo.`,
        [r.osha, r.programs, r.coordination],
      ),
      page(
        'incident-reporting',
        'Injury Reporting, Preservation & Corrective Action',
        ['OSHA', 'incident', 'injury', 'reporting', 'recordkeeping', 'preservation'],
        'Federal serious-event reporting and incident management; state plans can impose different or additional obligations.',
        `## Framework and limits
OSHA recording and immediate reporting are different duties. An employer may have a serious-event reporting obligation even when exempt from routine injury logs. Under federal 29 CFR 1904.39, covered work-related fatalities generally have an eight-hour reporting clock; inpatient hospitalizations, amputations, and losses of an eye generally have a twenty-four-hour clock. The regulation contains event windows, knowledge rules, and exceptions. Emergency-room treatment alone is not the same as inpatient admission for care or treatment. Check the full rule and applicable state-plan requirements promptly.

Do not let a debate about ultimate fault delay an assessment of reporting. Record when the organization learned of the event and later medical developments. Workers' compensation notice, insurer notice, OSHA reporting, and internal investigation serve different purposes. One does not automatically satisfy another.

## Practical review
First arrange emergency assistance and isolate continuing hazards. Assign one coordinator to record known facts, preserve the scene as safety permits, and maintain a chronology. Secure photographs, machine settings, maintenance records, schedules, training records, and witness contact information. Preserve original versions rather than retrospectively completing missing forms. Avoid collecting unnecessary medical details or circulating them beyond the investigation team.

Use a reporting worksheet with jurisdiction, event type, occurrence date, discovery date, admission facts if relevant, deadline calculation, responsible person, and submission confirmation. If facts remain incomplete, seek prompt professional guidance and record the uncertainty. Do not assume an unanswered voicemail meets a required reporting method. Coordinate with emergency responders and regulators without obstructing their work.

## Example
A worker is treated after a loading accident and later admitted to the hospital. Management initially describes the incident as minor. The review must capture the later admission information and determine what it means under the applicable reporting rule. Frame should flag the issue for immediate verification, not calculate a deadline solely from the first internal email or conclude that no report is needed because the employee walked away initially.

## Counsel questions and next steps
Ask what notices are due, how to preserve evidence while restarting operations safely, and how interview materials should be handled. Separate root-cause learning from unsupported blame. Corrective actions should address equipment, staffing, incentives, and supervision where relevant. Assign verification steps and recheck the work after changes. Monitor for retaliation against injured workers or witnesses; discouraging reports undermines both factual reliability and prevention.`,
        [r.report, r.osha, r.programs],
      ),
    ],
  ),
  pack(
    'us-benefits-guide',
    'Federal Employee Benefits & Plan Administration',
    'Practical retirement and health-plan oversight, participant communications, and continuation-coverage coordination.',
    [
      page(
        'retirement-oversight',
        'Retirement Plans, Contributions & Vendor Oversight',
        ['ERISA', '401k', 'retirement', 'fiduciary', 'benefits', 'contributions'],
        'Private-sector employer plans; governmental, church, and other exceptions require separate analysis.',
        `## Framework and limits
ERISA responsibilities depend on the plan and the function performed. Sponsoring a plan, exercising discretionary administration, controlling assets, and providing services are not interchangeable roles. A third-party administrator does not automatically take over every employer responsibility. Determine coverage before applying an ERISA checklist to governmental, church, or other potentially excluded arrangements.

Plan documents, participant disclosures, payroll operations, and vendor procedures should describe a consistent arrangement. Questions about eligibility, vesting, investments, fees, distributions, and claims may involve different decision makers. A benefits conversation with an employee is not permission to offer individualized investment or tax advice.

## Practical review
Create a responsibility register naming the plan administrator, fiduciaries, payroll owner, recordkeeper, adviser, custodian, and reporting contacts. For each function, identify the governing document and evidence of performance. Reconcile payroll deductions with actual receipt by the plan and investigate delays promptly. Do not treat the latest possible regulatory deadline as permission to delay money that could have been deposited sooner.

Evaluate providers through documented comparisons of services, compensation, conflicts, security, and performance. Review direct and indirect fees and understand which costs may properly be charged to the plan. Record decisions and follow-up issues rather than collecting brochures without analysis. Monitor access to participant data and the process for changing bank information or approving distributions.

## Example
A growing design firm changes payroll providers and discovers that deductions appeared on employee pay statements but were not transferred on several cycles. The first task is to reconcile the dates and amounts, preserve transfer logs, and involve the plan administrator and qualified advisers. Frame can organize a discrepancy schedule; it should not decide that a later lump-sum payment cures every issue or invent a correction formula.

## Counsel questions and next steps
Ask whether a correction program is appropriate, what lost-earnings or reporting issues arise, and how participants should be informed. Establish a recurring reconciliation with independent review and a named escalation contact. Before changing plan design or providers, assess required amendments, notices, blackout periods, and operational transition risks under current rules. Use the plan's claims procedure for benefit disputes and preserve appeal materials. The aim is a traceable administration process that exposes exceptions early, not a generic annual statement that the plan is compliant.`,
        [r.retirement, r.retirementFaq],
      ),
      page(
        'health-and-continuation',
        'Health Plans, Coverage Changes & COBRA',
        ['health plan', 'COBRA', 'ERISA', 'benefits', 'termination', 'coverage'],
        'Employer health-plan administration; plan type, employer coverage, and state continuation rules must be checked.',
        `## Framework and limits
An employer's health-benefit role can include plan sponsorship, fiduciary administration, payroll deductions, and transmission of enrollment information. These functions remain distinct even when one vendor supports all of them. Determine whether the arrangement is insured or self-funded, who administers claims, and which federal and state requirements apply. A summary supplied by a broker is not a substitute for the controlling documents.

COBRA can require continuation opportunities after specified qualifying events for covered plans and qualified beneficiaries. Employer-size rules, exceptions, event type, loss of coverage, and notice responsibilities all matter. Do not assume every separation follows the same timeline or that a general termination letter serves as a compliant election notice. State continuation provisions may be relevant when federal COBRA does not apply.

## Practical review
Build an event workflow for hiring, changes in hours, leave, separation, family changes, and plan termination. Record the event date separately from the date coverage ends and the date each administrator learns of it. Identify who must notify whom, who sends the election materials, and how delivery and follow-up are documented. Review unusual cases promptly rather than forcing them into a routine payroll template.

Reconcile enrollment files, premiums, payroll deductions, and carrier acknowledgments. For denied claims or disputed eligibility, collect the applicable plan language, notices, dates, and appeal instructions without promising payment. Protect health information and separate routine employment records from information obtained through plan administration. Review vendor contracts for data access, audit support, incident reporting, and service failures.

## Example
An employee moves to a reduced schedule while on an extended absence. Payroll stops deductions, but the carrier still lists coverage and the continuation administrator has received no event. Frame should help map the actual dates and responsibilities, including leave-related benefit obligations, rather than selecting a coverage-end date from assumptions. The employer needs a coordinated determination before sending inconsistent notices or collecting retroactive premiums.

## Counsel questions and next steps
Ask which continuation and leave rules apply, whether notices or premiums need correction, and whether affected dependents have separate rights. Clarify what the employer can communicate about alternatives without giving individualized insurance advice. Keep a documented escalation route for missed vendor handoffs and a periodic sample review of completed events. Current plan terms, governing rules, and qualified benefits advice should control the final determination; this workflow is designed to expose gaps and preserve the facts needed to resolve them.`,
        [r.healthPlan, r.cobra, r.fmla],
      ),
    ],
  ),
];
