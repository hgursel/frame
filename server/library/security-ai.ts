import type { LibraryPack, LibraryPage, LibrarySource } from '../../shared/library.js';

const source = (title: string, url: string, locator: string): LibrarySource => ({
  title,
  url,
  locator,
});
const csf = source(
  'NIST Cybersecurity Framework 2.0 (CSWP 29)',
  'https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf',
  'Sections 2–3: Core, Organizational Profiles and Tiers; Appendix A: Core outcomes',
);
const smallBusiness = source(
  'NIST CSF 2.0 Small Business Quick-Start Guide (SP 1300)',
  'https://www.nist.gov/publications/nist-cybersecurity-framework-20-small-business-quick-start-guide',
  'Getting started with cybersecurity risk management; supplement to CSF 2.0',
);
const aiRmf = source(
  'NIST AI Risk Management Framework 1.0 (AI 100-1)',
  'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf',
  'Part 1: risk and trustworthiness; Part 2: Govern, Map, Measure and Manage',
);
const playbook = (name: string, locator: string) =>
  source(
    `NIST AI RMF Playbook — ${name}`,
    `https://airc.nist.gov/airmf-resources/playbook/${name.toLowerCase()}/`,
    locator,
  );
const page = (
  id: string,
  title: string,
  description: string,
  tags: string[],
  text: string,
  sources: LibrarySource[],
  applicability: string,
  kind: LibraryPage['kind'] = 'review-workflow',
): LibraryPage => ({
  id,
  title,
  description,
  tags,
  text,
  sources,
  applicability,
  kind,
  effectiveDate: null,
});
const securityScope =
  'Organizational cybersecurity planning for US businesses, including California. Framework guidance is not a certification, legal requirement, penetration test, or authorization to change systems. Sector, contract and legal obligations require separate review.';
const aiScope =
  'Internal workplace AI applications, including local models and tool-using assistants. Based on AI RMF 1.0 and selected Playbook suggestions, not a complete AI-law or compliance assessment. Higher-impact uses need appropriate domain and legal review.';
const pack = (
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
  jurisdiction: ['US'],
  reviewedAt: '2026-09-29',
  rights:
    'Original Frame-authored briefs, questions, templates and workflows. Official publications are linked, not reproduced or bundled. No agency endorsement. The source-check date is not a legal effective date, continuous update service, or assurance of completeness. Templates are not official NIST or CISA forms.',
});

// Add new versions rather than editing published snapshots: projects pin their references.
export const securityAiPacks: LibraryPack[] = [
  pack(
    'cybersecurity-essentials',
    'Cybersecurity Essentials',
    'NIST CSF 2.0 orientation, evidence-based security assessment questions, and an original risk-register template. Compare procedures with a framework and identify gaps.',
    [
      page(
        'csf-gap-review',
        'CSF 2.0 Procedure Gap Review',
        'Compare our security procedures with this framework and identify gaps using current and target profiles.',
        [
          'cybersecurity',
          'security',
          'procedures',
          'framework',
          'nist',
          'csf',
          'gaps',
          'assessment',
          'profile',
        ],
        `## Reference brief
CSF 2.0 organizes cybersecurity outcomes into Govern, Identify, Protect, Detect, Respond and Recover. It describes desired outcomes without prescribing a single implementation. Current and Target Organizational Profiles express present and intended outcomes for a defined scope. Tiers characterize the rigor of risk governance and management; they are not a per-control pass score.

## Original Frame review workflow
Ask which business services, locations, systems and procedure versions are in scope, what evidence is available, and who approves the target. Start with one service if the request is broad. Read the supplied procedures before assessing them. Map relevant evidence to the six functions; use an exact category or subcategory identifier only after verifying it in the official Core. A missing document is an evidence gap, not proof a control is absent.

## Output
Use: function/outcome | procedure citation | observed practice | evidence status | target | gap | next action | owner. Mark evidence as documented, demonstrated, partial, unknown, or out of scope with rationale. Ask for verification of claimed practices. Prioritize a short list by business impact and exposure, not the number of headings matched. Do not invent an audit score, declare NIST certification, or silently turn suggestions into mandatory company rules.`,
        [csf, smallBusiness],
        securityScope,
      ),
      page(
        'security-assessment',
        'Security Assessment Questions',
        'Conduct a practical cybersecurity evidence interview across governance, assets, protection, detection, response and recovery.',
        [
          'security',
          'assessment',
          'questions',
          'evidence',
          'governance',
          'assets',
          'backup',
          'recovery',
        ],
        `## Original Frame question set
These prompts support a scoped interview; they are not the complete NIST Core or an official questionnaire.

| Area | Ask | Request evidence |
| --- | --- | --- |
| Govern | Who owns risk decisions and exceptions? Who reviews supplier access? | Approved responsibilities, exception record, supplier review |
| Identify | Which services and data matter most? Who reconciles the asset inventory? | Service map, inventory owner, recent reconciliation |
| Protect | How are access changes, privileged accounts, training and backups handled? | Redacted access-review record, training record, backup test |
| Detect | Which events produce an alert and who responds after hours? | Detection use case and a recent test ticket |
| Respond | Who can declare an incident and authorize containment? | Contact tree, decision authority, exercise record |
| Recover | Who decides restoration order and validates restored service? | Restore evidence, acceptance criteria, recovery exercise |

## Use
Ask only the relevant questions, one group at a time. Accept redacted evidence; do not request passwords, tokens or unrestricted logs. Record the document/version and interview date. Distinguish policy language from a demonstrated practice. Summarize the three most consequential unanswered questions and the evidence that would resolve them. For operational checklists, retrieve the relevant IT Security Operations section if attached.`,
        [csf, smallBusiness],
        securityScope,
      ),
      page(
        'risk-register',
        'Cybersecurity Risk Register Template',
        'Create a blank risk register with scenarios, evidence, owners, treatment and residual-risk review; no invented probabilities.',
        [
          'risk',
          'register',
          'template',
          'likelihood',
          'impact',
          'residual',
          'treatment',
          'cybersecurity',
        ],
        `## Original Frame template
This is a Frame template, not an official NIST form. Copy it into a project document only when requested. Leave unsupported fields blank or Unknown.

| ID | Service/asset | Scenario and business consequence | Evidence/reference | Existing safeguards | Likelihood and rationale | Impact and rationale | Treatment/action | Owner | Target date | Residual risk | Acceptance authority/review date | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ID] | [Service] | [Event → consequence] | [Document or ticket] | [Verified safeguards] | [Unknown] | [Unknown] | [Proposed action] | [Owner] | [Unassigned] | [Not assessed] | [Pending] | [Open] |

## How to fill it
Separate one event and consequence per row. Agree on the scope, time horizon and rating definitions before rating; use the organization's existing scale where supplied. Do not turn ordinal labels into numerical probabilities or multiply arbitrary scores without an approved method. Keep evidence confidence separate from severity. A planned action does not reduce residual risk until its implementation and effectiveness are checked. Only the authorized risk owner can accept risk; Frame may draft the decision record. Link detailed sensitive evidence instead of copying secrets or personal records into the register.`,
        [],
        securityScope,
      ),
    ],
  ),
  pack(
    'it-security-operations',
    'IT Security Operations',
    'Selected CISA guidance with practical workflows for account security, logging, vulnerability management, and incident preparation.',
    [
      page(
        'account-security',
        'Account Security and Access Review',
        'Review MFA coverage, privileged access, service accounts and account lifecycle evidence with the IT team.',
        [
          'account',
          'accounts',
          'access',
          'mfa',
          'authentication',
          'privileged',
          'identity',
          'offboarding',
        ],
        `## Reference brief
CISA recommends MFA for business systems such as email, file storage and remote access. MFA methods differ in strength; deployment and recovery paths deserve review, not just an enabled/disabled label.

## Original Frame workflow
Ask for the identity provider, authentication methods, remote-access paths, administrative roles, application exceptions and account owners. Work from authorized, redacted exports. Separate human, service and emergency accounts. Review joiner/mover/leaver handoffs, role approvals, stale accounts, privileged-role use, recovery verification and exception expiry. Identify phishing-resistant MFA options supported by the actual systems; do not assume SMS and security keys give equivalent protection.

## Output
System/account class | current access/MFA evidence | gap | proposed action | owner | validation | rollback. Draft a rollout plan that tests recovery and emergency access before broad enforcement. Never disable accounts, rotate credentials, change policies or execute a bulk action merely because this reference suggests reviewing them. Get separate authorization through the configured tools and change process. Keep credentials and individual account data out of reusable knowledge.`,
        [
          source(
            'CISA Require Multifactor Authentication',
            'https://www.cisa.gov/audiences/small-and-medium-businesses/secure-your-business/require-multifactor-authentication',
            'Business MFA coverage and authentication method strength',
          ),
        ],
        securityScope,
      ),
      page(
        'logging-detection',
        'Logging and Detection Readiness',
        'Build a logging coverage matrix and test whether important events reach the people responsible for responding.',
        ['logging', 'logs', 'detection', 'monitoring', 'siem', 'alerts', 'retention', 'events'],
        `## Reference brief
Joint guidance from ASD ACSC, CISA and partners emphasizes an approved logging policy, useful security events, centralized collection/correlation, and protection of logs. Event selection, retention and monitoring should reflect the environment and its risks; a large log volume alone does not establish useful detection.

## Original Frame workflow
Ask which systems, identity services, endpoints, network devices and applications are in scope. Build a matrix: source | event/use case | collection path | timestamp/time zone | retention basis | access/integrity controls | alert owner | last test | known blind spot. Separate an enabled log setting from evidence of successful forwarding and an actionable alert.
Choose an authorized, non-disruptive test event and trace it from generation to the analyst's ticket. Record dropped sources, ingestion delay, time discrepancies and after-hours handoff. Set retention using organizational needs and applicable obligations, not an invented universal duration. Minimize personal data and secrets in collected events.

## Output
Coverage matrix, top missing signals and a proposed validation checklist. Do not install agents, change retention, run detections against production, or upload logs to an external service without separate authorization.`,
        [
          source(
            'ASD ACSC / CISA / Partners: Best Practices for Event Logging and Threat Detection',
            'https://www.cyber.gov.au/business-government/detecting-responding-to-threats/event-logging/best-practices-for-event-logging-and-threat-detection',
            'Joint publisher copy: logging policy, event quality, centralized collection and secure storage',
          ),
          source(
            'CISA Use Logging on Business Systems',
            'https://www.cisa.gov/audiences/small-and-medium-businesses/secure-your-business/use-logging-on-business-systems',
            'Business logging guidance and supporting resources',
          ),
        ],
        securityScope,
      ),
      page(
        'vulnerability-triage',
        'Vulnerability Triage and Remediation',
        'Prioritize verified findings using affected assets, exposure, business impact and current CISA KEV information.',
        [
          'vulnerability',
          'vulnerabilities',
          'patch',
          'patching',
          'remediation',
          'kev',
          'cve',
          'triage',
        ],
        `## Reference brief
CISA's Known Exploited Vulnerabilities (KEV) catalog records vulnerabilities exploited in the wild and is an input to vulnerability prioritization. This static pack does not contain a live CVE feed or current remediation deadlines.

## Original Frame workflow
Use dated inventory and scan evidence. Confirm product, affected version and asset owner; a name match alone is insufficient. When current KEV/vendor evidence is unavailable, mark exploitation and fix status Unknown and request an authorized current source. Consider internet exposure, critical business services, reachable attack paths, existing mitigations and recovery options alongside severity. Absence from KEV is not proof of safety.

## Remediation worksheet
Asset group | CVE/finding | version evidence | exploitation source/date | exposure | business consequence | recommended fix/mitigation | owner | agreed due date | change/rollback plan | verification evidence | exception expiry.
Distinguish a proposed patch, installed patch and verified resolution. Retest against the relevant finding. Federal directive deadlines are not automatically company-wide legal deadlines; verify the organization's actual obligations. Do not hard-code old KEV dates, run scans, or apply patches from this reference alone.`,
        [
          source(
            'CISA Known Exploited Vulnerabilities Catalog',
            'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
            'Catalog purpose and vulnerability-prioritization guidance; retrieve current entries separately',
          ),
        ],
        securityScope,
      ),
      page(
        'incident-checklist',
        'Incident Response Preparation Checklist',
        'Create an incident-response checklist for our IT team, including contacts, evidence, containment authority and recovery validation.',
        [
          'incident',
          'response',
          'checklist',
          'preparation',
          'ransomware',
          'containment',
          'tabletop',
          'recovery',
        ],
        `## Reference brief
CISA published incident and vulnerability response playbooks for federal civilian agencies and encourages other organizations to use them to benchmark their practices. Federal reporting routes and procedures need adaptation; they do not automatically bind a private business.

## Original Frame preparation checklist
- Confirm services, incident lead and backup, severity criteria and who may authorize containment.
- Verify an out-of-band contact tree for IT, leadership, legal/privacy, communications and relevant providers. Use placeholders until contacts are confirmed.
- Identify evidence sources, access permissions, preservation procedures and a restricted incident record.
- Document decision points for isolating hosts, disabling access and restoring service, including dependencies and operational consequences.
- Verify restoration prerequisites and acceptance tests; record who approves return to service.
- Exercise a scoped scenario, assign improvement owners and schedule a human-led review.

## When drafting an incident-specific checklist
Start with confirmed facts, timestamps/time zones, affected services and unknowns. Separate proposed actions from completed actions. Preserve evidence according to the incident lead's process; do not advise indiscriminate deletion or reimaging. Route notification/deadline questions to the authorized legal/privacy team with current applicable sources. Return step | owner | trigger | evidence | approval | status. Never invent contacts, report an incident externally, or run containment commands based on this pack alone.`,
        [
          source(
            'CISA Federal Government Cybersecurity Incident and Vulnerability Response Playbooks',
            'https://www.cisa.gov/news-events/news/new-federal-government-cybersecurity-incident-and-vulnerability-response-playbooks',
            '2021 publication and private-sector benchmarking scope; verify current applicable procedures',
          ),
        ],
        securityScope,
      ),
    ],
  ),
  pack(
    'responsible-ai-at-work',
    'Responsible AI at Work',
    'NIST AI RMF 1.0 orientation, selected Playbook topics, and an original assessment for internal AI applications, human oversight and operational risks.',
    [
      page(
        'ai-rmf-overview',
        'AI RMF and Workplace Risk Review',
        'Review our proposed internal AI application for operational risks using Govern, Map, Measure and Manage.',
        [
          'ai',
          'application',
          'internal',
          'risk',
          'risks',
          'operational',
          'responsible',
          'nist',
          'rmf',
          'framework',
        ],
        `## Reference brief
NIST AI RMF 1.0 is a voluntary framework for managing AI risks throughout the lifecycle. Its four functions are Govern, Map, Measure and Manage. The companion Playbook offers selectable suggestions, not a mandatory checklist to complete in full. As checked on September 29, 2026, NIST's Playbook site says AI RMF 1.0 is being updated; this pack describes 1.0, not an unreleased revision.

## Original Frame review workflow
Ask what decision or action the system supports, who uses it, who may be affected, what data it receives and what it can change. Compare the proposed workflow with the existing human process and a simpler non-AI alternative. Retrieve the assessment, oversight and evaluation sections as needed rather than loading the entire pack.
Local hosting can change data flows, but does not by itself demonstrate correctness, appropriate access, privacy, fairness or safe tool execution. Identify the actual deployment and evidence; do not treat a model benchmark or a vendor claim as proof of business fitness.

## Output
Scope and intended benefit; prioritized failure scenarios; missing evidence; proposed safeguards; unresolved decisions and responsible owners. Cite the actual proposal and the relevant reference section. Recommend a bounded pilot when evidence is incomplete; do not issue automatic deployment approval or regulatory certification.`,
        [
          aiRmf,
          source(
            'NIST AI RMF Playbook',
            'https://airc.nist.gov/airmf-resources/playbook/',
            'Voluntary use and AI RMF revision notice',
          ),
        ],
        aiScope,
      ),
      page(
        'ai-use-assessment',
        'AI-Use Assessment Template',
        'Fill an original assessment of intended use, data, affected people, tools, failure modes and go/no-go evidence.',
        ['ai', 'use', 'assessment', 'template', 'data', 'impact', 'tools', 'pilot', 'approval'],
        `## Selected Playbook reference
MAP 1 concerns the context of use. MAP 3.5 addresses human oversight in relation to the system's capabilities and operating context. Select relevant suggestions rather than interpreting the Playbook as an exhaustive form.

## Original Frame assessment
This template is not an official NIST form. Record Unknown when evidence is missing.

| Field | Evidence or decision needed |
| --- | --- |
| Purpose and owner | Business task, intended benefit, accountable owner, proposed users |
| Boundaries | Allowed tasks, prohibited uses, human process and non-AI alternative |
| Deployment | Model/version, hosting, retrieval sources, integrations and external data flows |
| Information | Input/output categories, authorization, retention, deletion and sensitive data restrictions |
| Affected people | Who could be harmed by an error, omission, delay or differential treatment? |
| Actions | Read/write permissions, approval points, execution limits and reversibility |
| Failure scenarios | Incorrect answer, unsupported citation, disclosure, unauthorized action, outage or misuse |
| Evidence | Representative tests, observed limits, unresolved risks and missing measurements |
| Decision | Pilot limits, acceptance criteria, approver, review date and stop conditions |

## Output
Return the completed assessment and the five most consequential open questions. Do not fill evidence fields with model speculation. Keep real personnel records, credentials, SQL results and sensitive examples out of reusable knowledge; store reusable methods separately from case data.`,
        [playbook('Map', 'MAP 1: context; MAP 3.5: human oversight')],
        aiScope,
      ),
      page(
        'ai-oversight',
        'AI Governance and Human Oversight',
        'Define AI ownership, usage boundaries, approval responsibilities, user feedback and escalation.',
        ['ai', 'governance', 'oversight', 'human', 'policy', 'approval', 'inventory', 'escalation'],
        `## Selected Playbook reference
GOVERN 1.6 addresses an AI-system inventory; GOVERN 2.1 addresses clear responsibility; GOVERN 3.2 differentiates human roles in AI oversight and use. These suggestions support accountability throughout the lifecycle.

## Original Frame workflow
Draft a one-page operating agreement: system/task | accountable owner | operator | reviewer | allowed information | permitted actions | required approval | escalation route. Distinguish the person using the assistant from the person authorized to accept risk or approve a consequential action. Give reviewers the source evidence and enough time to challenge an output.
For a tool-using assistant, document which actions are automatic, which require confirmation and what happens after a timeout or uncertain remote outcome. A model's statement that an action is approved is not approval. Define access for each integration rather than treating local hosting as an authorization boundary.

## Output
An inventory entry, draft operating agreement, user feedback route and review triggers. Changes to the model, prompts, data sources, permissions or use case should trigger the agreed review. Do not automatically approve employment, financial or other consequential decisions; identify the appropriate human decision process.`,
        [playbook('Govern', 'GOVERN 1.6, 2.1 and 3.2: inventory, responsibility and human roles')],
        aiScope,
      ),
      page(
        'ai-evaluation-monitoring',
        'AI Evaluation, Monitoring and Stop Criteria',
        'Plan local-model evaluations, a bounded pilot, regression checks, incident escalation and rollback.',
        [
          'ai',
          'evaluation',
          'monitoring',
          'testing',
          'model',
          'qwen',
          'llama',
          'regression',
          'rollback',
          'pilot',
        ],
        `## Selected Playbook references
MEASURE 1.1 calls for suitable risk measures and documentation of risks that cannot be measured; MEASURE 1.2 concerns reassessing measures and controls. MANAGE 1.1 considers whether the system should proceed; MANAGE 4.1 addresses post-deployment monitoring and response mechanisms.

## Original Frame evaluation plan
Create a small, authorized test set for the real workflow with expected evidence and human-reviewed answers. Include missing information, conflicting documents, stale knowledge, incorrect calculations, misleading source instructions and requests beyond permitted tool access. For local models, record the exact model/quantization, prompt, context settings, tool permissions and retrieval snapshot. Repeat the same tests after relevant changes.
Choose acceptance criteria before testing: task correctness, supported citations, calculation checks, unauthorized-action attempts, sensitive-data exposure, error handling and useful abstention. Track serious individual failures separately from averages. Document sample limits; a pass is not proof of safety in every situation.

## Output
Case | expected behavior | observed behavior | evidence | severity | owner | disposition. Define pilot population, review cadence, feedback channel, stop triggers and recovery/rollback responsibilities. Ask who can suspend the application and how a human completes the task during an outage. Do not quietly rerun consequential operations after uncertain outcomes.`,
        [
          playbook('Measure', 'MEASURE 1.1–1.2: measurement and reassessment'),
          playbook('Manage', 'MANAGE 1.1 and 4.1: proceed decision and post-deployment monitoring'),
        ],
        aiScope,
      ),
    ],
  ),
];
