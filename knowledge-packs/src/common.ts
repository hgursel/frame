import type { LibraryPack, LibraryPage, LibrarySource } from '../../shared/library.js';

export const source = (title: string, url: string, locator: string): LibrarySource => ({
  title,
  url,
  locator,
});
export const page = (
  id: string,
  title: string,
  tags: string[],
  applicability: string,
  text: string,
  sources: LibrarySource[],
): LibraryPage => ({
  id,
  title,
  tags,
  applicability,
  text,
  sources,
  description: `${title}: legal framework, fact development, practical analysis, and questions for counsel.`,
  kind: 'review-workflow',
  effectiveDate: null,
});
export const pack = (
  id: string,
  title: string,
  description: string,
  pages: LibraryPage[],
): LibraryPack => ({
  id,
  title,
  description,
  pages,
  version: '1.0.0',
  jurisdiction: ['United States', 'California'],
  reviewedAt: '2026-10-17',
  rights:
    'Original Frame-authored analysis and workflows; permission is granted to use, modify, and redistribute this pack with this notice. External publications remain with their respective rights holders and are linked, not reproduced. No agency or guild endorsement. Not legal advice or a complete statement of law; no attorney review has been performed. No collective bargaining agreement content is included. Source check means the cited publisher pages were consulted on the stated date, not that every rule or later amendment was independently validated.',
});

export const refs = {
  classification: source(
    'DIR: Independent Contractors',
    'https://dir.ca.gov/dlse/faq_independentcontractor.htm',
    'ABC test, exemptions, and relationship to the Borello test; identify the applicable statutory exception before relying on it.',
  ),
  overtime: source(
    'DIR: Overtime',
    'https://dir.ca.gov/dlse/FAQ_Overtime.htm',
    'General daily/weekly overtime, regular rate, and exceptions.',
  ),
  wage12: source(
    'IWC Wage Order 12: Motion Picture Industry',
    'https://www.dir.ca.gov/t8/11120.html',
    'Sections 1–3 (scope, definitions, hours), 7 (records), 11–12 (meals/rest); verify current amendments.',
  ),
  wage4: source(
    'IWC Wage Order 4: Professional and Clerical Occupations',
    'https://dir.ca.gov/t8/11040.html',
    'Scope and occupational coverage; compare office work with industry-specific orders.',
  ),
  meals: source(
    'DIR: Meal Periods',
    'https://dir.ca.gov/dlse/FAQ_MealPeriods.html',
    'General five-hour rule, motion-picture exception, waivers, and on-duty meals.',
  ),
  finalpay: source(
    'DIR: Paydays and Final Wages',
    'https://www.dir.ca.gov/dlse/FAQ_Paydays.htm',
    'Discharge, resignation, undisputed wages, and the special motion-picture final-pay discussion referencing Labor Code 201.5.',
  ),
  equalpay: source(
    'DIR: Equal Pay and Pay Transparency',
    'https://www.dir.ca.gov/dlse/california_equal_pay_act.htm',
    'Labor Code 432.3 and 1197.5; salary history, pay scales, and substantially similar work.',
  ),
  sick: source(
    'DIR: California Paid Sick Leave FAQ',
    'https://www.dir.ca.gov/dlse/paid_sick_leave.htm',
    'Use, accrual, frontloading, schedules, and state/local interaction; check current permitted purposes.',
  ),
  la: source(
    'Los Angeles Office of Wage Standards',
    'https://wagesla.lacity.gov/',
    'City boundaries, current local wage and sick-leave notices; distinguish city from county and neighboring cities.',
  ),
  leave: source(
    'CRD: Job-Protected Leave',
    'https://calcivilrights.ca.gov/family-medical-%20pregnancy-leave/',
    'CFRA, pregnancy disability, bereavement, reproductive loss, and violence-related leave resources.',
  ),
  accommodation: source(
    'CRD: Reasonable Accommodation',
    'https://calcivilrights.ca.gov/accommodation/',
    'Interactive process, essential functions, disability accommodation, and undue hardship.',
  ),
  fmla: source(
    'DOL: FMLA Employer Guide',
    'https://www.dol.gov/agencies/whd/fmla/employer-guide',
    'Coverage, employee eligibility, notices, certification, designation, and restoration.',
  ),
  employment: source(
    'CRD: Employment',
    'https://calcivilrights.ca.gov/Employment/',
    'FEHA coverage, protected categories, harassment, retaliation, and complaint information.',
  ),
  investigations: source(
    'CRD: Harassment Prevention Guide (2025)',
    'https://calcivilrights.ca.gov/wp-content/uploads/sites/32/2025/04/Harassment-Prevention-Guide-2025.pdf',
    'Fair investigations, impartiality, confidentiality, evidence, and corrective responses.',
  ),
  retaliation: source(
    'DIR: Retaliation Complaint Investigation Unit',
    'https://www.dir.ca.gov/dlse/dlseretaliation.html',
    'Labor Commissioner retaliation jurisdiction and links to filing procedures.',
  ),
  crdComplaint: source(
    'CRD: Complaint Process',
    'https://calcivilrights.ca.gov/ComplaintProcess/',
    'Intake, supporting documents, investigation, and case-closure procedures.',
  ),
  fairchance: source(
    'CRD: Fair Chance Act',
    'https://calcivilrights.ca.gov/fair-chance-act/',
    'Conditional offers, individualized assessment, notices, and response opportunities.',
  ),
  hiringAi: source(
    'CRD: Approved Employment AI Regulations',
    'https://calcivilrights.ca.gov/2025/06/30/civil-rights-council-secures-approval-for-regulations-to-protect-against-employment-discrimination-related-to-artificial-intelligence/',
    'Approval announcement; employment decisions and automated-decision records. Consult linked final regulations, not earlier proposals.',
  ),
};
