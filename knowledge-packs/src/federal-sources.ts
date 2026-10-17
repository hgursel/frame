import { pack, source } from './common.js';

// Separate factory: published California/guild v1 files must remain byte-for-byte stable.
export const federalPack: typeof pack = (...args) => ({
  ...pack(...args),
  jurisdiction: ['United States — federal; state and local overlays require separate review'],
});

export const federalSources = {
  coverage: source(
    'EEOC: Coverage of Business/Private Employers',
    'https://www.eeoc.gov/employers/coverage-businessprivate-employers',
    'Private-employer coverage and different employee-count tests; state law can cover smaller employers.',
  ),
  retaliation: source(
    'EEOC: Small Business Retaliation Guidance',
    'https://www.eeoc.gov/laws/guidance/small-business-fact-sheet-retaliation-and-related-issues',
    'Protected activity, materially adverse actions, and independent review of employment decisions.',
  ),
  accommodation: source(
    'EEOC: Reasonable Accommodation Policy Tips',
    'https://www.eeoc.gov/employers/small-business/reasonable-accommodation-policy-tips',
    'Disability and religious accommodation; updated religious undue-hardship discussion after Groff.',
  ),
  pwfa: source(
    'EEOC: Pregnant Workers Fairness Act',
    'https://www.eeoc.gov/wysk/what-you-should-know-about-pregnant-workers-fairness-act',
    'Known limitations, reasonable accommodation, and undue hardship; check current regulations and litigation.',
  ),
  flsa: source(
    'DOL: Wages and the Fair Labor Standards Act',
    'https://www.dol.gov/agencies/whd/flsa',
    'Federal minimum wage, overtime, recordkeeping, and youth employment; coverage and exemptions matter.',
  ),
  exemption: source(
    'DOL: Fact Sheet 17A — Overtime Exemptions',
    'https://www.dol.gov/agencies/whd/fact-sheets/17a-overtime',
    'Executive, administrative, professional, computer, and outside-sales exemptions; verify current salary rules.',
  ),
  fmla: source(
    'DOL: FMLA Employer Guide',
    'https://www.dol.gov/agencies/whd/fmla/employer-guide',
    'Employer coverage, employee eligibility, certification, notices, and restoration; 29 CFR Part 825.',
  ),
  osha: source(
    'OSHA: Employer Responsibilities',
    'https://www.osha.gov/workers/employer-responsibilities',
    'Workplace hazards, standards, training, records, reporting, and protection against retaliation.',
  ),
  programs: source(
    'OSHA: Recommended Practices for Safety and Health Programs',
    'https://www.osha.gov/safety-management/',
    'Voluntary program framework; distinguish recommended practices from enforceable standards.',
  ),
  report: source(
    'OSHA: Severe-Injury Reporting Standard',
    'https://www.osha.gov/laws-regs/regulations/standardnumber/1904/1904.39',
    '29 CFR 1904.39; reportable events, timing, knowledge, exclusions, and event windows.',
  ),
  coordination: source(
    'OSHA: Host Employer and Contractor Coordination',
    'https://www.osha.gov/safety-management/communication',
    'Recommended communication and responsibility allocation at shared workplaces and staffing assignments.',
  ),
  privacy: source(
    'FTC: Protecting Personal Information',
    'https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business',
    'Data inventory, minimization, access protection, disposal, and incident planning; guidance rather than a universal code.',
  ),
  breach: source(
    'FTC: Data Breach Response',
    'https://www.ftc.gov/business-guidance/resources/data-breach-response-guide-business',
    'Containment, investigation, notifications, and communication; determine applicable state and sector requirements.',
  ),
  safeguards: source(
    'FTC: Safeguards Rule Business Guide',
    'https://www.ftc.gov/business-guidance/resources/ftc-safeguards-rule-what-your-business-needs-know',
    '16 CFR Part 314; covered financial institutions, security programs, service providers, and notification events.',
  ),
  healthBreach: source(
    'FTC: Health Breach Notification Rule',
    'https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule',
    '16 CFR Part 318; personal health record vendors and related entities outside HIPAA; final-rule links.',
  ),
  coppa: source(
    'FTC: Complying with COPPA — FAQs',
    'https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions',
    '16 CFR Part 312; child-directed services, actual knowledge, parental consent, and educational use limits.',
  ),
  ads: source(
    'FTC: Advertising FAQs for Small Business',
    'https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business',
    'FTC Act truthfulness, substantiation, express and implied claims, and disclosures.',
  ),
  reviews: source(
    'FTC: Endorsements, Influencers, and Reviews',
    'https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews',
    'Endorsement Guides, material connections, consumer reviews, and linked binding review rules.',
  ),
  competitors: source(
    'FTC: Dealings with Competitors',
    'https://www.ftc.gov/advice-guidance/competition-guidance/guide-antitrust-laws/dealings-competitors',
    'Price fixing, bid rigging, market allocation, and fact-dependent competitor collaborations.',
  ),
  associations: source(
    'FTC: Other Agreements Among Competitors',
    'https://www.ftc.gov/advice-guidance/competition-guidance/guide-antitrust-laws/dealings-competitors/other-agreements-among-competitors',
    'Trade-association standards, membership restrictions, advertising rules, and competitive effects.',
  ),
  copyright: source(
    'Copyright Office: Copyright Basics',
    'https://www.copyright.gov/what-is-copyright/',
    'Original expression, fixation, ownership, exclusive rights, and links to copyright circulars.',
  ),
  copyrightLaw: source(
    'Copyright Act: Chapter 1',
    'https://www.copyright.gov/title17/92chap1.html',
    '17 USC 101–122; work-made-for-hire definition, exclusive rights, and statutory limitations.',
  ),
  copyrightAi: source(
    'Copyright Office: Artificial Intelligence Study',
    'https://copyright.gov/policy/artificial-intelligence/',
    'Reports on digital replicas, output copyrightability, and training; reports do not themselves enact law.',
  ),
  trademarks: source(
    'USPTO: Why Search for Similar Trademarks?',
    'https://www.uspto.gov/trademarks/basics/why-search-similar-trademarks',
    'Comprehensive clearance, federal and other sources, related goods/services, and common-law considerations.',
  ),
  confusion: source(
    'USPTO: Likelihood of Confusion',
    'https://www.uspto.gov/trademarks/search/likelihood-confusion',
    'Registration conflicts involving similar marks and related goods or services; search analysis limits.',
  ),
  retirement: source(
    'DOL: Retirement Responsibilities for Small Employers',
    'https://www.dol.gov/agencies/ebsa/employers-and-advisers/small-business-owners/understanding-your-responsibilities',
    'ERISA sponsorship, administration, prudent oversight, expenses, disclosure, and reporting.',
  ),
  retirementFaq: source(
    'DOL: Retirement Plans and ERISA FAQs',
    'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/faqs/retirement-plans-and-erisa',
    'Plan documents, participant rights, contributions, and fiduciary responsibilities.',
  ),
  healthPlan: source(
    'DOL: Group Health Plan Fiduciary Responsibilities',
    'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/publications/understanding-your-fiduciary-responsibilities-under-a-group-health-plan',
    'ERISA fiduciary functions, vendor selection, monitoring, plan assets, and participant information.',
  ),
  cobra: source(
    'DOL: Employer Guide to COBRA',
    'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/publications/an-employers-guide-to-group-health-continuation-coverage-under-cobra',
    'Covered plans, qualifying events, beneficiaries, notice responsibilities, and continuation procedures.',
  ),
  payroll: source(
    'IRS: Employment Taxes',
    'https://www.irs.gov/businesses/small-businesses-self-employed/employment-taxes',
    'Federal withholding, Social Security, Medicare, unemployment taxes, deposits, and returns.',
  ),
  pub15: source(
    'IRS: Publication 15 — Employer Tax Guide',
    'https://www.irs.gov/forms-pubs/about-publication-15',
    'Current-year employer tax guide and revision links; tax periods and forms must be verified.',
  ),
  taxWorker: source(
    'IRS: Independent Contractor vs. Employee',
    'https://www.irs.gov/taxtopics/tc762',
    'Federal common-law employment tax classification; distinct from FLSA and state tests.',
  ),
  records: source(
    'IRS: Business Records',
    'https://www.irs.gov/businesses/small-businesses-self-employed/what-kind-of-records-should-i-keep',
    'Support for income, expenses, assets, and employment taxes; records must establish business purpose.',
  ),
  pub334: source(
    'IRS: Publication 334 — Small Business Tax Guide',
    'https://www.irs.gov/forms-pubs/about-publication-334',
    'Federal tax guide for Schedule C sole proprietors and statutory employees, not all entity types.',
  ),
  ssdf: source(
    'NIST: Secure Software Development Framework 1.1',
    'https://csrc.nist.gov/pubs/sp/800/218/final',
    'SP 800-218 final guidance; secure development vocabulary, supplier discussions, and vulnerability reduction.',
  ),
  aiRisk: source(
    'NIST: AI Risk Management Framework',
    'https://www.nist.gov/itl/ai-risk-management-framework',
    'Voluntary framework for governing, mapping, measuring, and managing AI risks; not legal certification.',
  ),
  hipaa: source(
    'HHS: Covered Entities and Business Associates',
    'https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html',
    '45 CFR 160.103 coverage; provider transaction condition, health plans, clearinghouses, and business associates.',
  ),
  hipaaSecurity: source(
    'HHS: HIPAA Security Rule',
    'https://www.hhs.gov/hipaa/for-professionals/security/index.html',
    '45 CFR Part 164 Subpart C, electronic PHI safeguards and assessment resources; distinguish proposals from final rules.',
  ),
  hipaaBreach: source(
    'HHS: HIPAA Breach Notification Rule',
    'https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html',
    '45 CFR 164.400–414; unsecured PHI, breach assessment, exceptions, and notification responsibilities.',
  ),
  healthcareFraud: source(
    'HHS OIG: Fraud and Abuse Laws',
    'https://oig.hhs.gov/compliance/physician-education/fraud-abuse-laws/',
    'False Claims Act, Anti-Kickback Statute, Stark law, exclusions, and civil monetary penalties; distinct legal elements.',
  ),
  healthcareProgram: source(
    'HHS OIG: General Compliance Program Guidance',
    'https://oig.hhs.gov/compliance/general-compliance-program-guidance/',
    'Voluntary healthcare compliance program guidance, governance, reporting, monitoring, and corrective action.',
  ),
  charity: source(
    'IRS: Charitable Organizations',
    'https://www.irs.gov/charities-non-profits/charitable-organizations',
    'Section 501(c)(3) requirements, exempt purposes, reporting, and political campaign restrictions.',
  ),
  otherNonprofits: source(
    'IRS: Other Nonprofits',
    'https://www.irs.gov/charities-non-profits/other-nonprofits',
    'Different exempt organization categories; do not apply charity rules indiscriminately to associations.',
  ),
  conflicts: source(
    'IRS: Purpose of a Conflict of Interest Policy',
    'https://www.irs.gov/charities-non-profits/form-1023-purpose-of-conflict-of-interest-policy',
    'Recommended disclosure and decision processes for actual or potential conflicts in charities.',
  ),
  ubi: source(
    'IRS: Unrelated Business Income Defined',
    'https://www.irs.gov/charities-non-profits/unrelated-business-income-defined',
    'Trade/business, regularly carried on, and not substantially related to exempt purpose.',
  ),
  ubiExceptions: source(
    'IRS: UBIT Exceptions and Exclusions',
    'https://www.irs.gov/charities-non-profits/charitable-organizations/unrelated-business-income-tax-exceptions-and-exclusions',
    'Activity-specific exclusions and exceptions; avoid assuming all earned revenue is exempt or taxable.',
  ),
  ferpa: source(
    'Education: FERPA Frequently Asked Questions',
    'https://studentprivacy.ed.gov/frequently-asked-questions',
    '20 USC 1232g and 34 CFR Part 99; coverage, consent, records access, and disclosure exceptions.',
  ),
  schoolOfficial: source(
    'Education: School Officials Under FERPA',
    'https://studentprivacy.ed.gov/faq/who-school-official-under-ferpa',
    'Outsourcing, direct control, legitimate educational interests, and annual-notice criteria.',
  ),
  schoolAccess: source(
    'Education: Section 504 FAPE FAQs',
    'https://www.ed.gov/laws-and-policy/civil-rights-laws/disability-discrimination/frequently-asked-questions-section-504-free-appropriate-public-education-fape',
    'Elementary/secondary evaluation, placement, educational services, and procedural safeguards.',
  ),
  collegeAccess: source(
    'Education: Postsecondary Auxiliary Aids',
    'https://www.ed.gov/laws-and-policy/individuals-disabilities/auxiliary-aids-and-services-for-postsecondary-students-with-disabilities',
    'Section 504/ADA higher-education access and effective auxiliary aids; different framework from K–12 FAPE.',
  ),
  housing: source(
    'HUD: Fair Housing Rights and Obligations',
    'https://www.hud.gov/stat/fheo/rights-obligations',
    'Fair Housing Act protected characteristics and overlapping civil rights obligations for funded programs.',
  ),
  housingAccess: source(
    'HUD: Information for Persons with Disabilities',
    'https://www.hud.gov/helping-americans/disabilities',
    'Links to reasonable accommodation and modification guidance; distinguish housing from public accommodations.',
  ),
  tenants: source(
    'FTC: Consumer Reports for Landlords',
    'https://www.ftc.gov/business-guidance/resources/using-consumer-reports-what-landlords-need-know',
    'FCRA permissible purpose, adverse action, credit-score disclosures, investigative reports, and disposal.',
  ),
  productReport: source(
    'CPSC: Duty to Report',
    'https://www.cpsc.gov/Business--Manufacturing/Recall-Guidance/Duty-to-Report-to-CPSC-Rights-and-Responsibilities-of-Businesses',
    'Consumer Product Safety Act section 15(b); information triggering immediate reporting and investigation limits.',
  ),
  productTest: source(
    'CPSC: General Use Product Certification and Testing',
    'https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/General-Use-Products-Certification-and-Testing',
    'Applicable rules, certificates, testing, and changes to components; check current import eFiling requirements.',
  ),
  waste: source(
    'EPA: Hazardous Waste Guide for Small Businesses',
    'https://www.epa.gov/hwgenerators/managing-your-hazardous-waste-guide-small-businesses',
    'RCRA hazardous waste determination, generator duties, storage, shipment, and state program differences.',
  ),
  wasteCategories: source(
    'EPA: Hazardous Waste Generators',
    'https://www.epa.gov/hwgenerators',
    'Generator category depends on monthly waste generation; links to category and state-specific guidance.',
  ),
  construction: source(
    'OSHA: Construction Compliance Quick Start',
    'https://www.osha.gov/complianceassistance/quickstarts/construction',
    'Construction hazards, applicable standards, training, and multi-employer responsibility review.',
  ),
  renovation: source(
    'EPA: Renovation, Repair and Painting — Contractors',
    'https://www.epa.gov/lead/renovation-repair-and-painting-program-contractors',
    'Lead RRP requirements for covered renovations, certifications, practices, and exemptions.',
  ),
  renovationGuide: source(
    'EPA: Small Entity Guide to Renovate Right',
    'https://www.epa.gov/lead/small-entity-compliance-guide-renovate-right',
    'March 2026 guide to the RRP rule; scope, work practices, documentation, and compliance planning.',
  ),
  carrier: source(
    'FMCSA: Motor Carrier Safety Planner',
    'https://www.fmcsa.dot.gov/safety/carrier-safety/motor-carrier-safety-planner',
    'Carrier applicability, qualification, vehicle maintenance, hours, and records; links to detailed planner.',
  ),
  hours: source(
    'FMCSA: Hours of Service Summary',
    'https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations',
    'Separate property/passenger limits, exceptions, short haul, and adverse driving conditions.',
  ),
  hazmat: source(
    'PHMSA: Training Requirements for Industry',
    'https://www.phmsa.dot.gov/training/hazmat/training-requirements-industry',
    '49 CFR 172.700–704; function-specific, safety, security, and other applicable hazmat training.',
  ),
  hazmatShipping: source(
    'PHMSA: Hazmat Transportation Requirements',
    'https://www.phmsa.dot.gov/training/hazmat/hazmat-transportation-requirements-pdf',
    'Shipping papers, hazardous materials table, packaging, marking, labels, placards, and training.',
  ),
  tips: source(
    'DOL: Fact Sheet 15 — Tipped Employees',
    'https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa',
    'FLSA tip credit, tip pools, manager restrictions, overtime, and stronger state protections.',
  ),
  youth: source(
    'DOL: Child Labor in Restaurants',
    'https://www.dol.gov/agencies/whd/fact-sheets/2a-child-labor-restaurants',
    'Age, hours, equipment and task restrictions; school schedules and limited exceptions.',
  ),
  food: source(
    'FDA: Food Code',
    'https://www.fda.gov/food/retail-food-protection/fda-food-code',
    'Model retail food code and editions, including 2026; enforceability depends on jurisdiction adoption.',
  ),
  foodAdoption: source(
    'FDA: State Retail Food Codes',
    'https://www.fda.gov/food/fda-food-code/state-retail-and-food-service-codes-and-regulations-state',
    'Locate state retail food requirements; verify local authority, adopted edition, and amendments.',
  ),
  ada: source(
    'DOJ: ADA Small Business Primer',
    'https://www.ada.gov/resources/title-iii-primer/',
    'Public accommodations, barrier removal, effective communication, policy modifications, and new construction.',
  ),
  adaRules: source(
    'DOJ: ADA Title III Regulations',
    'https://www.ada.gov/law-and-regs/regulations/title-iii-regulations/',
    '28 CFR Part 36; coverage, owner/tenant duties, modifications, communication, and accessibility.',
  ),
};
