import { page } from './common.js';
import { federalPack as pack, federalSources as r } from './federal-sources.js';

export const federalBusinessPacks = [
  pack(
    'us-data-privacy-guide',
    'Federal Privacy, Data Security & Breach Triage',
    'Identify applicable federal data regimes, evaluate vendors and privacy promises, and coordinate incident obligations.',
    [
      page(
        'coverage-and-promises',
        'Data Coverage, Privacy Promises & Vendors',
        ['privacy', 'FTC', 'GLBA', 'COPPA', 'HIPAA', 'data', 'vendors'],
        'Cross-industry federal issue spotting; sector, state, local, contractual, and international duties require additional review.',
        `## Framework and limits
Determine obligations from data, activity, people, and organizational role. Do not assume that one privacy regime covers every record or that the absence of HIPAA means information is unregulated. HIPAA coverage depends on covered-entity or business-associate status. The FTC Safeguards Rule covers specified financial institutions under FTC jurisdiction. COPPA addresses covered online collection involving children under 13. FTC Act issues can also arise from misleading privacy representations or unfair practices where jurisdiction exists.

Nonprofit status, a business-to-business label, and a vendor's security certification do not answer all coverage questions. State privacy, consumer-health, biometric, breach, and employment rules may apply independently. Federal rules also differ in definitions and exemptions; a single spreadsheet column marked sensitive is not enough.

## Practical review
Prepare a data map by actual use: collection source, purpose, individuals affected, access, vendors, retention, deletion, and disclosures. Include analytics, support tickets, recordings, exports, and AI prompts. Match public notices and sales claims to what systems really do. For each use, identify the authority or consent relied on, the responsible owner, and the evidence supporting that conclusion.

When selecting a vendor, review its permitted purposes, subcontractors, data location, retention, model-training use, security controls, incident cooperation, and exit process. Distinguish contractual restrictions from technical enforcement. Ask what happens to backups, logs, and derived data after a deletion request. Verify that access is limited and periodically reviewed. These are proposed review controls, not a claim that every item is legally mandated for every business.

## Example
A wellness platform describes itself as outside HIPAA and allows a marketing tool to receive user activity. The relevant questions include what health information is conveyed, whether the platform falls within a different federal regime, what users were told, and which state rules apply. Frame should produce a coverage matrix with unknowns rather than approving the integration because no hospital is involved.

## Counsel questions and next steps
Ask which federal regimes cover each activity, whether a notice or consent is adequate, and which data uses should pause until resolved. Assign a process for reviewing new uses before launch. For children or health information, avoid relying on an ordinary terms-of-service acceptance as a universal authorization. Retain the versions of notices and contracts actually used so future investigations can reconstruct the promises made at the time.`,
        [r.privacy, r.safeguards, r.coppa, r.hipaa, r.healthBreach],
      ),
      page(
        'incident-triage',
        'Security Incidents, Notifications & Evidence',
        ['breach', 'incident response', 'notification', 'ransomware', 'FTC', 'security'],
        'Business incident coordination; reporting triggers and clocks must be established for each applicable regime.',
        `## Framework and limits
A security incident, contractual incident, legally defined breach, and reportable event may be different things. A notification obligation can depend on data type, affected people, access or acquisition, encryption and key exposure, organizational role, and timing of discovery. There is no safe universal deadline for every U.S. business. State and sector requirements must be assessed alongside contractual and insurer conditions.

The FTC's general breach guide supports an organized response. The Safeguards Rule and Health Breach Notification Rule contain specific obligations for their covered populations. HIPAA has its own assessment and notification rules. Do not assume a vendor's conclusion, absence of visible theft, or later recovery of files resolves every applicable definition.

## Practical review
Activate a response owner and preserve a contemporaneous chronology. Contain continuing access while retaining evidence where feasible: identity events, endpoint records, application logs, affected file inventories, configuration changes, and vendor messages. Record gaps and logging limitations explicitly. Involve qualified technical responders and counsel for material incidents; mark hypotheses separately from verified observations.

Create an obligation register showing the potentially applicable law or contract, trigger, discovery date, recipient, required content, deadline, decision owner, and evidence supporting the conclusion. Update it as facts change. Establish who approves notices and who confirms delivery. Coordinate communications so support staff, management, customers, and regulators do not receive conflicting explanations. Preserve uncertainty in statements instead of promising that no data was affected before investigation supports it.

## Example
A managed-service provider reports that an administrator token was exposed but says its review found no downloads. The customer has limited logs and contractual obligations to notify business clients. Frame should separate confirmed exposure from unknown access, request the investigation scope and evidence, and identify independent notification duties. It should not label the incident harmless solely because the provider used the phrase no evidence.

## Counsel questions and next steps
Ask when each reporting clock started, whether a permitted delay or exception actually applies, and how to communicate continuing investigation results. Consider insurer and law-enforcement coordination where relevant without assuming either suspends legal duties. After containment, test recovery and access changes, preserve required records, and assign corrective actions with verification. Review whether the original privacy notices and contracts need prospective changes. Frame's useful output is a decision-ready incident chronology and obligation register, not an unsupported declaration that notification is unnecessary.`,
        [r.breach, r.safeguards, r.healthBreach, r.hipaaBreach],
      ),
    ],
  ),
  pack(
    'us-commercial-practices-guide',
    'Federal Advertising, Competition & Commercial Practices',
    'Review marketing claims, endorsements, competitor interactions, and commercial terms with clear federal/state boundaries.',
    [
      page(
        'claims-and-reviews',
        'Advertising Claims, Endorsements & Customer Reviews',
        ['advertising', 'consumer protection', 'FTC', 'endorsements', 'reviews', 'marketing'],
        'Advertising and consumer-facing representations; specialized products and state consumer laws may add requirements.',
        `## Framework and limits
FTC truth-in-advertising principles require attention to what a reasonable audience understands, including implied claims, not just literal wording. Objective claims need appropriate support before publication. A disclosure does not reliably cure a misleading headline or an unsupported promise. Health, safety, environmental, financial, and performance claims can demand specialized evidence and additional legal review.

Endorsement guidance addresses truthful experience and material connections. Paid relationships, free products, employment, and other connections may affect how an audience evaluates an endorsement. Distinguish agency guides from binding rules governing reviews and testimonials. Neither a platform's built-in label nor an agency contract automatically establishes compliance.

## Practical review
Create a claims register containing the exact statement, audience, channel, implied message, supporting evidence, limitations, and approval date. Save the actual screen, packaging, script, or landing page, including mobile display. Identify who owns the underlying study or measurement and whether it describes the product and population being advertised. Review changes in product performance rather than reusing old substantiation indefinitely.

For campaigns using influencers or customer stories, record permissions, compensation, instructions, and monitoring responsibilities. Ask whether the story suggests typical results that the business can support. Review solicitation and moderation practices so the displayed feedback is not misleading. Do not generate fictional customers or turn internal examples into purported real testimonials. Escalate incentives tied to positive sentiment and restrictions on honest consumer reviews.

## Example
A SaaS company advertises that its tool cuts processing time in half after testing only one favorable customer workflow. A careful review distinguishes a narrow measured result from a general promise. Frame can propose qualified wording tied to documented conditions and a broader validation plan. It should not fabricate supporting statistics or suggest hiding limitations in a distant policy page.

## Counsel questions and next steps
Ask which express and implied claims require substantiation, whether disclosures are clear in each format, and what review rules apply to the proposed incentive. Identify special sector rules before launch. Keep a correction and withdrawal process for inaccurate claims, including reseller materials and scheduled social posts. Track complaints as evidence about audience interpretation. A campaign approval should specify what was reviewed and when it expires; it should not be treated as permanent clearance for altered products, audiences, or statements.`,
        [r.ads, r.reviews],
      ),
      page(
        'competition-and-terms',
        'Competitor Contact, Trade Groups & Contract Review',
        ['antitrust', 'competition', 'contracts', 'trade association', 'pricing', 'bids'],
        'Commercial issue spotting; ordinary contract enforceability is largely state-law dependent and is not resolved here.',
        `## Framework and limits
Federal antitrust law distinguishes certain serious competitor restraints from collaborations requiring more detailed analysis. Price fixing, bid rigging, and market allocation are major warning signs. Trade associations and professional networks do not create a blanket exemption. A business justification should be documented and evaluated, not assumed to legalize a restriction.

Agreements about shared standards, joint purchasing, information exchange, or access to association services can require fact-specific analysis. Avoid relying on an old agency safe harbor without confirming its current status and scope. This guide does not interpret collective bargaining agreements or labor exemptions. Refer those separate questions to counsel.

## Practical review
Before a competitor meeting, set an agenda, identify legitimate purposes, and assign someone to stop inappropriate discussion. Escalate conversations about current or future prices, customers, territories, bids, wages, or hiring restrictions. Record an objection and departure when needed; merely remaining silent may not be an adequate response. Do not use a shared vendor or algorithm as a presumed workaround for an unlawful agreement.

For commercial contracts, prepare a separate issue table covering scope, deliverables, payment, renewal, termination, intellectual property, confidentiality, security, indemnities, liability limits, insurance, and dispute process. Identify the governing law and the parties' actual roles. Federal competition or consumer rules may affect a term, but contract formation, remedies, restraints, and enforceability often require state-specific analysis. Label negotiation suggestions as commercial positions, not statements that a clause is legally required.

## Example
Members of a professional association propose a common minimum consulting rate and a shared spreadsheet of planned increases. Frame should flag competitor-pricing coordination and recommend counsel review before any exchange. A safer discussion may address general operational issues without sharing competitively sensitive plans, but the appropriate design depends on the facts. Calling the spreadsheet educational does not decide the legal question.

## Counsel questions and next steps
Ask which participants compete, what information is necessary, how the proposed activity affects customers and workers, and whether restrictions can be narrowed or removed. For a suspicious communication already received, preserve it and seek advice rather than deleting it or forwarding it widely. Document an approved process for association events and recurring surveys. Keep commercial contract review distinct from antitrust clearance: a signed agreement can still create regulatory risk, and a favorable business deal can still contain impractical operational obligations.`,
        [r.competitors, r.associations, r.ads],
      ),
    ],
  ),
  pack(
    'us-ip-ai-guide',
    'Federal Copyright, Trademarks & AI Use',
    'Rights provenance, licenses, brand clearance, and responsible AI-output review for ordinary business activities.',
    [
      page(
        'copyright-and-ai',
        'Copyright Ownership, Licensing & AI Outputs',
        ['copyright', 'AI', 'license', 'ownership', 'work made for hire', 'training'],
        'Business content and software rights triage; patents, publicity, trade secrets, and state contract rules need separate review.',
        `## Framework and limits
Copyright protects qualifying original expression, not every idea, fact, style, or method. Ownership and permission are separate from whether material is accessible online. Payment for a deliverable does not automatically answer who owns the copyright. Work-made-for-hire treatment has specific statutory conditions; commissioned work is not universally covered merely because an agreement uses that phrase.

AI creates several different questions: rights in inputs, authorization for training or processing, protectability of output, similarity to existing work, and contractual allocation of risk. Copyright Office reports explain its analysis but do not themselves enact new law or resolve every pending dispute. Human contribution and the circumstances of creation matter; neither all AI-assisted work is unprotectable nor all output is safely exclusive.

## Practical review
Build a rights ledger for important deliverables. Identify creators, employment or contractor status, source assets, licenses, assignments, permitted uses, territories, duration, modification rights, and sublicensing. Save the actual license version and proof of permission. For software, include dependencies and license obligations; an open repository is not the same as unrestricted use.

For AI-assisted work, record the tool and terms used, approved input sources, human edits, and review performed. Do not send client materials into a service merely because staff can access them. Check confidentiality and data-use permissions separately from copyright. Where ownership or uniqueness is important, preserve the human creative process and consider alternatives that provide clearer provenance.

## Example
A design agency delivers an AI-assisted campaign incorporating a stock photo and a contractor's illustration. The client requests exclusive worldwide rights. Frame should identify the separate assets and whether each license permits the requested use, then distinguish assignable rights from third-party limitations. It should not promise exclusivity across the entire campaign because the agency generated the final file.

## Counsel questions and next steps
Ask whether assignments or additional permissions are needed, whether a proposed use may qualify for a limitation such as fair use, and what registration or enforcement steps are appropriate. Fair use requires a fact-specific assessment; there is no universal safe percentage. Review indemnity and liability language against the provider's actual ability to stand behind the work. For disputed material, preserve provenance and seek advice before publishing, making an accusation, or issuing a takedown.`,
        [r.copyright, r.copyrightLaw, r.copyrightAi],
      ),
      page(
        'brand-clearance',
        'Trademark Clearance, Brand Use & Launch Decisions',
        ['trademark', 'brand', 'USPTO', 'clearance', 'domain', 'marketing'],
        'U.S. brand selection and use; foreign markets, disputes, and specialized marks require additional research.',
        `## Framework and limits
A trademark identifies source in relation to goods or services. Registering a domain or business name does not establish that a proposed brand is available. USPTO clearance guidance recommends looking beyond exact matches in the federal database. Similar appearance, sound, meaning, and related goods or services can matter, as can rights arising outside federal registration.

Registration review and real-world infringement analysis are related but not identical. A search is evidence for a judgment, not a guarantee. Descriptive wording, weak distinctiveness, crowded markets, geography, and how consumers encounter the mark can change the risk. Different spelling alone does not necessarily avoid confusion.

## Practical review
Define the proposed mark precisely: words, design, slogan, goods and services, customers, channels, and planned expansion. Search variants, pronunciations, translations where relevant, related goods, marketplace use, and state or common-law sources. Save dated results and distinguish active use from abandoned filings or unrelated references. Do not rely solely on a model's memory or an empty search result.

Prepare a launch memo comparing candidate names, potential conflicts, rebranding cost, and remaining uncertainty. Have counsel review material conflicts before investing in signage, packaging, domains, or advertising. For licensed brands, verify ownership, scope, quality-control obligations, approval rights, and what happens at termination. Give marketing teams an approved-use guide that matches the license and actual registration status.

## Example
A regional property-services company selects a name that differs by one letter from a national maintenance platform. Its team finds no identical domain and assumes it is clear. Frame should ask about related services, customer overlap, pronunciation, and marketplace use. A useful output compares the proposed name with alternatives and records unanswered clearance questions rather than issuing a definitive infringement opinion.

## Counsel questions and next steps
Ask whether a broader search is necessary, which goods or services should be covered, and whether the proposed mark is distinctive enough for the intended protection. Confirm filing strategy and permissible symbols before launch. For a demand letter, preserve the correspondence and usage history, verify who owns the asserted rights, and route response deadlines to counsel. Do not automatically admit infringement, abandon a valuable brand, or threaten a counterclaim. Periodically review changes in products and markets because a clearance analysis prepared for one business model may not cover a later expansion.`,
        [r.trademarks, r.confusion],
      ),
    ],
  ),
  pack(
    'us-business-tax-guide',
    'Federal Business Tax & Payroll Readiness',
    'Organize classification, deposits, supporting records, and adviser handoffs without hard-coding changing tax thresholds.',
    [
      page(
        'payroll-tax',
        'Worker Status, Payroll Taxes & Reconciliation',
        ['IRS', 'tax', 'payroll', 'contractor', 'withholding', 'employment taxes'],
        'Federal employer tax preparation; state payroll rules, entity-specific issues, and individual advice are outside this guide.',
        `## Framework and limits
Federal employment tax responsibilities include appropriate withholding, employer taxes, deposits, returns, and information reporting. Determine the relationship before choosing a payroll or contractor workflow. The IRS common-law test considers the actual relationship; a contractor agreement or payment through an entity does not alone resolve status. Other laws use different tests, so a tax conclusion does not settle wage-and-hour or state classification.

Use Publication 15 and relevant current-year instructions for the period at issue. Deposit schedules, wage bases, forms, and special rules must be verified rather than copied from an old checklist. Outsourcing payroll does not mean the employer can ignore whether returns and payments were actually made.

## Practical review
Maintain a worker register with the employing entity, start and end dates, work locations, classification basis, payment method, and supporting documents. Identify who directs the work, provides tools, bears business risk, and controls the relationship. Route ambiguous cases to the tax adviser and counsel before repeatedly using an unsupported classification.

For each payroll cycle, reconcile gross pay, taxable adjustments, deductions, net pay, employer liabilities, bank funding, and tax deposits. At quarter and year end, compare filed returns and information statements with payroll totals and the general ledger. Investigate mismatches rather than forcing a balancing entry. Restrict access to tax identifiers and payment credentials, and use independent verification for bank-account changes.

## Example
A nonprofit pays a recurring project coordinator as a contractor because funding comes from a short-term grant. The coordinator uses the organization's systems and follows a manager's daily instructions. Frame should collect the actual relationship facts and identify the separate tax and labor questions. Grant duration does not establish worker status. The appropriate output is a documented adviser referral, not a retroactive declaration that every payment was wages.

## Counsel and tax-adviser questions
Ask whether a formal classification determination or correction process is appropriate, which periods and returns are affected, and how to communicate changes. If a payroll provider failed to deposit taxes, preserve authorization and payment records and contact qualified advisers promptly. Build a calendar with named owners and backup reviewers, using verified dates for the actual forms and entity. Keep tax advice and employment advice coordinated, since fixing one workflow can expose issues in another.`,
        [r.payroll, r.pub15, r.taxWorker],
      ),
      page(
        'business-records',
        'Business Records, Expenses & Tax-Adviser Handoff',
        ['IRS', 'records', 'expenses', 'tax return', 'assets', 'reconciliation'],
        'Federal business-record organization; entity type, tax year, accounting method, and transaction details control treatment.',
        `## Framework and limits
Federal tax treatment depends on more than a transaction's label in accounting software. Determine the legal entity, tax classification, tax year, accounting method, and business purpose. Publication 334 is aimed at Schedule C sole proprietors and statutory employees; it is not a universal filing manual for corporations, partnerships, or exempt organizations.

Records should substantiate income, expenses, assets, and relevant employment obligations. Payment evidence alone may not explain business purpose or establish deductibility. Costs may require allocation, capitalization, or other treatment rather than immediate deduction. Tax thresholds and special provisions change, so this pack intentionally does not supply a universal deduction limit or filing calendar.

## Practical review
Prepare an adviser package with reconciled books, bank and payment-processor statements, revenue detail, invoices, contracts, payroll reports, asset purchases and disposals, financing, owner transactions, and prior-year carryforwards identified by the adviser. Separate missing documents from disputed treatment. Maintain a list of unusual transactions instead of burying them in miscellaneous expense accounts.

For expenses, record what was purchased, who benefited, the business purpose, date, amount, and supporting evidence. Identify mixed personal/business use and related-party transactions for review. For assets, preserve acquisition, improvement, disposition, and financing records. Choose retention periods based on the record and governing requirement, and suspend ordinary destruction when a dispute, examination, or preservation duty applies.

## Example
A small software firm records a large development engagement, hardware purchases, and the owner's travel under one project expense. Frame should help separate the transactions and list the facts the tax adviser needs. It should not assume that all project spending is currently deductible, that a vendor invoice proves business use, or that a rule for sole proprietors applies to the firm's chosen entity.

## Counsel and tax-adviser questions
Ask which items need capitalization, allocation, corrected information reporting, or additional support. Confirm estimated-payment and filing responsibilities for the actual entity and owners rather than deriving them from revenue alone. Review state nexus and sales-tax questions separately; a federal income-tax guide does not answer them. Keep a final reconciliation from the books to the filed return and document adviser-approved adjustments. Frame can organize records and surface inconsistencies, while qualified advisers determine filing positions and sign-off.`,
        [r.records, r.pub334, r.pub15],
      ),
    ],
  ),
];
