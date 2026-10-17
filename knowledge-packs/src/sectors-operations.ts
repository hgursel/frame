import { page } from './common.js';
import { federalPack as pack, federalSources as r } from './federal-sources.js';

export const operationsSectorPacks = [
  pack(
    'industry-real-estate-guide',
    'Real Estate & Property Management',
    'Housing screening, accommodations, property work, accessibility, and evidence preparation for local counsel.',
    [
      page(
        'housing-screening',
        'Fair Housing, Screening & Accommodations',
        ['real estate', 'housing', 'tenant', 'FCRA', 'fair housing', 'screening'],
        'Residential housing providers and managers; exemptions, funded-program duties, and local protections require review.',
        `## Framework and limits
The Fair Housing Act addresses discrimination in housing based on protected characteristics. Other federal civil-rights duties may apply to funded programs. Scope and exemptions require specific review; state and local laws can protect additional groups and regulate screening, fees, deposits, or termination. Do not assume commercial leasing and residential housing follow identical rules.

Using a consumer report for a rental decision triggers FCRA responsibilities. A report can include a screening recommendation rather than only a credit score. Adverse action can include less favorable terms, not just rejection, and notice may be required when the report was only part of the reason. Credit-score use can add disclosures. Fair-housing analysis remains separate from FCRA notice compliance.

## Practical review
Document screening criteria, permissible use of reports, vendor controls, decision reasons, notices, and dispute handling. Check that staff apply criteria consistently and can explain exceptions. Avoid letting a vendor's automated score replace the organization's responsibility to evaluate its process. Retain the criteria and report version used at the time, subject to appropriate security and retention limits.

Provide an accessible process for disability-related requests. Distinguish a policy accommodation from a physical modification and identify who has authority to evaluate it. Seek only information appropriate to the actual issue. Track requests, communications, options, and decisions without disclosing unnecessary disability details to maintenance or leasing staff. Do not automatically treat assistance animals as ordinary pets or assume all animal requests must be accepted without assessment.

## Example
A property manager requires a larger deposit after a screening report flags a disputed debt. The applicant also requests a change to a parking policy because of disability. Frame should separate the consumer-report notice question from the accommodation process and local deposit limits. A single generic rejection letter would not necessarily address all three issues. The useful output is a factual decision map with missing evidence and assigned reviewers.

## Counsel questions and next steps
Ask which housing laws apply, whether criteria or exceptions need revision, what notices are required, and how to handle inaccurate reports. Before eviction or nonrenewal, obtain local advice on substantive grounds and procedure; this federal pack supplies no universal termination notice. Preserve relevant applications, communications, and policy versions, and review vendor agreements for access to the evidence needed to explain decisions.`,
        [r.housing, r.housingAccess, r.tenants],
      ),
      page(
        'property-work-access',
        'Property Work, Access & Contractor Oversight',
        ['property management', 'real estate', 'ADA', 'renovation', 'lead', 'maintenance'],
        'Property operations; residential housing, public accommodations, and commercial facilities have different requirements.',
        `## Framework and limits
Map the use of each space before choosing a legal framework. Residential accommodation duties, public-accommodation access, commercial-facility design requirements, building codes, and lease obligations can overlap without being identical. Under ADA Title III, allocating accessibility work in a lease does not necessarily remove obligations to the public. Existing facilities, alterations, and new construction can involve different standards.

Renovation may introduce federal lead requirements for covered work in older housing or child-occupied facilities. EPA's RRP program has scope conditions, exceptions, certification, work-practice, and record requirements. A general contractor license or an owner's consent does not automatically satisfy them. State-authorized programs and local permits may impose additional duties.

## Practical review
Maintain a property register showing age, use, occupancy, known hazards, access features, inspection history, leases, and responsible parties. Before work, define the task, affected occupants, materials disturbed, permits, qualified contractors, and interim protections. Verify certifications and insurance relevant to the actual activity. Preserve work orders, inspection findings, testing, and completion evidence.

For accessibility, document the barrier and the applicable evaluation rather than simply labeling a building grandfathered. Review routes, entries, counters, communications, and service procedures as well as physical dimensions. Engage qualified design or access professionals for technical determinations. Coordinate repairs with tenant or customer communications and alternatives needed during disruption.

## Example
A landlord leases ground-floor space to a clinic and hires a painter to refresh an older residential unit upstairs. The team assumes all compliance belongs to the tenants. Frame should separate the clinic's public-access issues from the residential renovation and identify owner, operator, and contractor responsibilities. It should not infer that a lease clause or small job size eliminates every federal requirement.

## Counsel questions and next steps
Ask which parties remain responsible, whether the planned work triggers an alteration or lead rule, and what notices, permits, or qualified assessments are required. Review indemnity and insurance as risk allocation, not a substitute for safe work. Track deficiencies through verified closure and preserve records of recurring conditions. Local habitability, rent regulation, entry notices, and construction remedies require additional jurisdiction-specific advice. Frame should prepare the property facts and coordination plan so counsel and technical professionals can resolve the actual duties efficiently.`,
        [r.adaRules, r.housingAccess, r.renovation, r.renovationGuide],
      ),
    ],
  ),
  pack(
    'industry-manufacturing-guide',
    'Manufacturing, Product Safety & Environmental Operations',
    'Consumer-product traceability and reporting, hazardous-waste decisions, and supplier-change controls.',
    [
      page(
        'product-quality-reporting',
        'Product Safety, Supplier Changes & Reporting',
        ['manufacturing', 'CPSC', 'product safety', 'recall', 'testing', 'suppliers'],
        'Consumer products within CPSC jurisdiction; food, medical devices, vehicles, and other regulated products need separate regimes.',
        `## Framework and limits
Determine the product, users, supply-chain role, and responsible regulator. CPSC does not regulate every manufactured item. For covered consumer products, testing, certification, labeling, and reporting duties depend on applicable rules and product characteristics. Children's products can have additional requirements. A supplier certificate is not a universal assurance that the finished product complies.

Section 15(b) of the Consumer Product Safety Act can require immediate reporting of information indicating specified noncompliance, defects, or serious risks. Do not wait for a confirmed injury, completed root-cause study, or agreed recall plan before evaluating the reporting trigger. The agency's guidance explains investigation limits and other conditions. Reporting and deciding on corrective action are related but separate steps.

## Practical review
Build a product file with design versions, intended use, test requirements, test results, certificates, warnings, supplier specifications, and distribution records. Link each production lot to components and relevant changes. Require review when a supplier substitutes material, a factory changes a process, or marketing expands the intended use. Check current import and certification procedures for the actual shipment.

Maintain a complaint process that connects returns, warranty claims, incident reports, quality findings, and social feedback. Train staff to escalate potential hazards without requiring them to prove legal liability. Preserve failed samples and traceability records. Establish who can pause shipments, segregate inventory, contact regulators, and communicate with distributors. Avoid minimizing an event in public statements before the evidence is understood.

## Example
A small manufacturer receives several reports of overheating after a component substitution. The supplier says the replacement meets its own specification, and no one has reported an injury. Frame should organize the affected lots, reports, testing history, and distribution scope, then flag immediate reporting assessment. It should not conclude that absence of injury or supplier reassurance removes the need to act.

## Counsel questions and next steps
Ask which regulator and reporting duties apply, whether further testing can proceed without delaying a required report, and what interim distribution controls are appropriate. Coordinate any recall or corrective communication with qualified product-safety personnel and counsel. Verify effectiveness using actual inventory and customer records. Frame's role is to develop a coherent factual record and escalation plan, not to certify engineering safety or decide that a product is safe to keep selling.`,
        [r.productReport, r.productTest],
      ),
      page(
        'waste-and-processes',
        'Hazardous Waste, Process Changes & Site Records',
        ['manufacturing', 'EPA', 'RCRA', 'hazardous waste', 'environment', 'operations'],
        'Federal hazardous-waste triage; authorized state programs, permits, air, water, and local requirements need separate review.',
        `## Framework and limits
Waste obligations depend on the material and how it is generated and handled, not simply the size of the company. EPA's hazardous-waste framework distinguishes generator categories using quantities generated and other relevant conditions. Waste determination, accumulation, shipment, and documentation need an activity-specific assessment. Recycling or calling a material reusable does not automatically remove regulation.

RCRA hazardous-waste duties are only part of environmental compliance. Air emissions, wastewater, stormwater, spill prevention, chemical reporting, and local permits can create separate obligations. Approved state programs can be stricter or broader than the federal baseline. This page does not establish a facility's generator category or permit status.

## Practical review
Map process inputs, outputs, cleaning activities, maintenance, laboratory materials, and discarded inventory. Record the basis for each waste determination, including process knowledge and testing where appropriate. Track quantities by the applicable period and waste stream. Identify containers, accumulation locations, inspections, emergency arrangements, transporters, receiving facilities, and records needed for the actual category.

Review process changes before purchasing substitutes or increasing production. A new solvent, coating, or cleaning step may change waste characteristics and worker hazards. Coordinate environmental and safety reviews so labels, training, protective measures, and disposal arrangements remain consistent. Verify downstream documentation rather than assuming that handing waste to a contractor ends responsibility.

## Example
A fabrication shop replaces a cleaning chemical and begins storing spent material in the same drum used for the prior process. The waste contractor has not been told about the change. Frame should gather product information, process details, generation volumes, mixing practices, and prior determinations. It should not infer compatibility or legal disposal from similar product names. Qualified environmental personnel should reassess before the old handling procedure continues.

## Counsel questions and next steps
Ask which state and federal requirements apply, whether a category or permit change occurred, and what corrective reporting or records are needed. Preserve historical manifests and decisions while correcting practices; do not rewrite old records to appear compliant. Assign an owner to verify contractor credentials, shipments, and unresolved exceptions. Use the federal guide to structure the questions, then obtain site-specific technical and legal advice. A generic checklist cannot authorize disposal, determine chemical compatibility, or replace emergency procedures for a release.`,
        [r.waste, r.wasteCategories, r.osha],
      ),
    ],
  ),
  pack(
    'industry-construction-guide',
    'Construction, Renovation & Shared-Site Operations',
    'Pre-job responsibility mapping, changing site hazards, renovation scope, and lead-related documentation.',
    [
      page(
        'shared-site-planning',
        'Pre-Job Planning, Subcontractors & Changing Conditions',
        ['construction', 'OSHA', 'subcontractor', 'safety', 'jobsite', 'change orders'],
        'Construction operations under the applicable OSHA jurisdiction; licensing, payment, lien, and contract rules remain state-specific.',
        `## Framework and limits
Construction risk follows the work actually performed and site conditions, not just the project description. Falls, excavation, electrical work, equipment movement, hazardous materials, and changing access need appropriate specialist review. Standards can specify competent or qualified persons and task-specific procedures. A general orientation does not establish competence for every operation.

Shared sites require coordination among owners, general contractors, subcontractors, staffing firms, and other participants. OSHA's multi-employer framework can involve more than the direct employer of an exposed worker. Contract language assigning safety responsibility should be reviewed alongside actual authority and practice. State-plan rules can differ from federal requirements.

## Practical review
Before mobilization, prepare a responsibility matrix for site control, hazard identification, equipment, permits, training, emergency response, inspections, and stop-work decisions. Identify the qualified people for specialized activities. Exchange information about existing conditions and planned work sequences. Confirm how adjacent operations and occupied areas will be protected.

Use a change process that treats schedule, methods, staffing, materials, and access changes as potential safety changes as well as commercial changes. Record who approved the revised work and what assessment occurred. Preserve daily reports, site photographs, instructions, inspections, and correction records. A change order may address price without resolving the safety or permit consequences of the new work.

## Example
A subcontractor is asked to accelerate installation while another trade removes a barrier nearby. The foreman assumes the general contractor approved the new sequence. Frame should help reconstruct the instructions, exposed workers, responsible parties, and controls that were actually in place. It should not infer safety approval from a scheduling email or propose that workers continue while responsibility is debated.

## Counsel questions and next steps
Ask which parties have relevant duties, whether work should pause pending qualified assessment, and what notifications or documentation are required. Review contract notice provisions for changed conditions without treating them as substitutes for protecting people. Track corrective actions to verified closure and communicate the revised plan to every affected crew. Local licensing, building permits, lien rights, prevailing-wage coverage, and payment disputes require additional advice. Frame can organize job records and decision points, but engineering judgments and task-specific safety plans must come from competent professionals responsible for the work.`,
        [r.construction, r.coordination, r.osha],
      ),
      page(
        'renovation-scope',
        'Older Buildings, Lead Work & Renovation Records',
        ['construction', 'renovation', 'lead', 'RRP', 'EPA', 'contractors'],
        'Potentially covered renovation of older housing and child-occupied facilities; verify scope, exemptions, and state programs.',
        `## Framework and limits
EPA's Renovation, Repair and Painting program addresses covered work disturbing painted surfaces in specified older housing and child-occupied facilities. Applicability depends on facts such as building age, use, work, and relevant exclusions or testing. Certification, training, work practices, information distribution, and recordkeeping can be involved. A small invoice or a customer's willingness to accept dust does not decide coverage.

Renovation, lead abatement, demolition, and ordinary maintenance should not be casually treated as the same activity. Worker protection, occupant protection, waste handling, and local building requirements may operate under different rules. State-authorized programs can administer requirements, and other hazards such as asbestos need separate assessment.

## Practical review
Document building age and occupancy, work scope, surfaces affected, testing or exemption basis, responsible firm, certified personnel where required, and planned protections. Verify credentials before work and clarify subcontractor responsibilities. Plan access, containment, cleaning, waste handling, and communications for occupied spaces with qualified personnel.

Use a pre-job record that distinguishes established facts from assumptions. If the scope expands, reassess before disturbing additional surfaces. Preserve notices, acknowledgments, test results, work-practice records, photographs, and completion documentation appropriate to the rule. Keep the customer informed about changes without promising that ordinary cleaning proves the absence of a hazard.

## Example
A contractor is hired to replace cabinets in an older apartment and discovers that adjacent painted walls must also be disturbed. The original quote described only carpentry. Frame should flag the changed scope and request the building, surface, and certification facts needed for an RRP assessment. It should not propose avoiding the rule by splitting invoices or treating the tenant's consent as a waiver.

## Counsel questions and next steps
Ask which program governs, whether the work qualifies for an exemption, what testing and documentation are acceptable, and whether the project needs different qualified personnel. Confirm how change-order terms allocate cost and delay while preserving regulatory responsibilities. Review insurance coverage and required notices with appropriate advisers. If work already occurred without the expected controls, preserve evidence and seek prompt guidance on corrective steps rather than reconstructing paperwork after the fact. Frame should provide a factual checklist and handoff record; it should not issue a clearance result, certify a site, or substitute for required training.`,
        [r.renovation, r.renovationGuide, r.construction],
      ),
    ],
  ),
  pack(
    'industry-logistics-guide',
    'Logistics, Fleet & Shipping Operations',
    'Carrier-role mapping, driver-hours planning, shipment records, and hazardous-materials escalation.',
    [
      page(
        'fleet-and-hours',
        'Carrier Roles, Driver Hours & Operational Records',
        ['logistics', 'fleet', 'FMCSA', 'hours of service', 'carrier', 'transportation'],
        'Commercial motor vehicle operations; interstate/intrastate status, vehicle characteristics, role, and exceptions must be checked.',
        `## Framework and limits
Determine whether the organization acts as a motor carrier, broker, shipper, private fleet, or several of these in different transactions. FMCSA requirements depend on operating facts, vehicles, cargo, routes, and applicable exceptions. A vehicle's company logo or a driver's contractor agreement does not settle the regulatory role. State rules can also affect intrastate operations.

Hours-of-service rules distinguish property and passenger operations and include conditions for particular exceptions. Do not apply one driving limit to every route or assume that short distance removes every duty. Driving, on-duty time, breaks, inspections, and records must be evaluated under the applicable framework. Commercial pressure does not establish an exception.

## Practical review
Create an operations register showing entities, authorities, vehicles, drivers, routes, cargo, qualification records, maintenance, and responsible managers. Validate regulatory status and required insurance through appropriate official sources rather than relying only on a sales certificate. For each route type, document the hours assumptions and how dispatch will handle delays, detention, breakdowns, and unsafe conditions.

Reconcile dispatch instructions, driver records, telematics, maintenance reports, and delivery evidence. Provide a route for drivers to report fatigue or unsafe scheduling without pressure to falsify records. Establish who can cancel or reschedule a load. Review recurring exceptions for a planning problem rather than treating them as unavoidable isolated events.

## Example
A distributor adds a long-distance delivery after a driver has spent much of the day loading and waiting. The dispatcher calculates only the remaining driving miles. Frame should request the full duty history, applicable operation type, route assumptions, and any claimed exception. It should not approve the trip based on mileage alone or suggest altering logs to fit the delivery promise.

## Counsel questions and next steps
Ask which federal and state rules apply, whether the business has assumed additional carrier or broker responsibilities, and what records support compliance. Review contracts for dispatch control, cargo responsibility, claims, insurance, and incident cooperation without assuming contractual labels control regulatory status. After a crash or serious complaint, preserve records and involve qualified safety and legal personnel promptly. Frame can organize operational facts and identify unresolved assumptions; it should not certify driver fitness, vehicle roadworthiness, or a legally compliant route from incomplete data.`,
        [r.carrier, r.hours],
      ),
      page(
        'hazmat-and-handoffs',
        'Hazardous Materials & Shipment Handoffs',
        ['logistics', 'hazmat', 'PHMSA', 'shipping', 'batteries', 'training'],
        'Potentially regulated hazardous-material shipments; material, quantity, packaging, transport mode, and exceptions control.',
        `## Framework and limits
Hazardous-material transportation duties depend on the material and functions performed, not simply whether a company calls itself a logistics provider. Classification, packaging, marking, labeling, shipping papers, and training can involve different people. Consumer packaging or a small quantity does not automatically establish an exception. Air, highway, rail, and vessel movements can have different requirements.

PHMSA training guidance explains function-specific and other training duties under the Hazardous Materials Regulations. General workplace safety training does not necessarily cover transportation functions. A person selecting packaging, preparing shipping papers, or offering a shipment may need relevant training even if someone else drives the truck.

## Practical review
Inventory potentially regulated shipments, including batteries, aerosols, chemicals, samples, returns, and damaged goods. Have qualified personnel determine classification and applicable exceptions. Record the material description, quantity, condition, packaging, transport mode, destination, and basis for the shipping method. Do not infer a classification solely from a product's marketing name or a partial safety-data sheet.

Define handoffs between purchasing, warehousing, customer service, carriers, and returns teams. Maintain current training records and instructions for the actual functions performed. Verify that labels and documents match the contents and that carrier acceptance conditions are satisfied. Create a clear stop-and-escalate route when contents or condition are uncertain, especially for damaged products or changed transport modes.

## Example
A retailer's returns team plans to send damaged battery-powered devices back by air using the same labels used for new products. Frame should identify the changed condition and mode as reasons for qualified review before shipment. It should not invent a packaging method or assume that the original supplier's shipping approval applies to damaged returns. The useful output is a complete shipment fact sheet for the trained specialist.

## Counsel questions and next steps
Ask who is performing regulated functions, which exceptions are valid, and whether additional registration, security, or incident requirements apply. Review agreements for responsibility and access to accurate product information, but do not treat indemnity as permission to ship incorrectly. Preserve shipment and training records and investigate rejected or leaking packages for systemic causes. Frame should support classification intake and document organization; technical shipping decisions and emergency response must follow qualified personnel and applicable procedures.`,
        [r.hazmat, r.hazmatShipping],
      ),
    ],
  ),
  pack(
    'industry-retail-hospitality-guide',
    'Retail, Restaurants & Hospitality',
    'Tips and youth employment, food-safety oversight, public access, and customer-facing claims across service businesses.',
    [
      page(
        'service-workforce',
        'Tips, Youth Workers & Shift Controls',
        ['retail', 'restaurant', 'hospitality', 'tips', 'FLSA', 'child labor'],
        'Service-sector employment; state wage, tip-credit, scheduling, and youth-work restrictions may be stricter.',
        `## Framework and limits
The FLSA contains rules for tipped employees, tip credits, pooling, overtime, and youth employment. State law may prohibit a tip credit or add protections. Distinguish voluntary tips from mandatory service charges and determine how each is treated for the relevant purpose. A customer-facing label does not resolve payroll treatment.

Managers and supervisors cannot generally receive other employees' tips through a pool, even if they sometimes serve customers. The applicable duties test matters, not only the title. Youth-employment rules depend on age, hours, equipment, and tasks; parental consent or an employee's willingness does not eliminate prohibited work. Check current rules and any specific exceptions before assigning work.

## Practical review
Map jobs, actual duties, ages where relevant, schedules, pay rates, tip practices, service charges, deductions, and timekeeping. Review opening and closing work, training, meetings, and work across locations. Reconcile point-of-sale records, payroll, tip distributions, and manager adjustments. Explain lawful policies clearly and preserve original records when correcting errors.

For younger staff, maintain a task-and-equipment authorization list based on verified age and applicable rules. Train shift supervisors to recognize restrictions, including when a last-minute substitution changes the work. Review school schedules and local permits where required. Do not assume that safe handling in practice makes a legally restricted task permissible.

## Example
A restaurant assigns a teenage employee to close late and lets an assistant manager share the tip pool because the manager also runs food. Frame should separate youth hours and tasks from the manager's actual duties and the pooling rules. It should request the state, age, schedule, and role facts before offering a conclusion. A staffing shortage is an operational problem to solve within the applicable rules.

## Counsel questions and next steps
Ask whether the tip structure and deductions are lawful, whether overtime calculations are correct, and which youth restrictions apply to each task. Have payroll validate any correction and preserve the calculation basis. Review local scheduling, meal, rest, and minimum-wage requirements independently. Frame can prepare a shift-control checklist and evidence table; it should not calculate a final settlement or assume employees can waive protections in an acknowledgment.`,
        [r.tips, r.youth, r.flsa],
      ),
      page(
        'food-safety',
        'Food Safety, Complaints & Supplier Traceability',
        ['restaurant', 'hospitality', 'food', 'FDA', 'food code', 'retail'],
        'Retail food and food-service oversight; actual requirements depend on adopted state/local codes and facility activities.',
        `## Framework and limits
The FDA Food Code is a model used by jurisdictions to develop retail food rules. Publication of a new edition does not automatically replace a restaurant's applicable local requirements. Identify the regulator, adopted edition, amendments, permit conditions, and type of operation. Manufacturing, wholesale distribution, and specialized processing can raise additional requirements beyond ordinary retail service.

Food-safety procedures should be established by qualified personnel using applicable standards. This guide organizes oversight and incident records; it does not prescribe cooking temperatures, validate shelf life, or determine that a particular food is safe. Allergens, employee illness, sanitation, temperature control, cross-contact, and supplier practices require operational expertise.

## Practical review
Maintain a facility file with permits, inspection findings, responsible managers, approved processes, supplier records, training, cleaning procedures, and relevant logs. Record what is measured, how equipment is checked, who reviews exceptions, and what corrective action follows. Avoid a paper-only system in which staff record expected values rather than actual observations.

For supplier changes, verify product identity, labeling, allergen information, traceability, and handling requirements before use. Keep purchase and lot records sufficient to identify affected inventory. Establish a complaint route that captures symptoms or concerns as reported without diagnosing customers. Preserve implicated product information and engage the appropriate manager, health authority, insurer, and counsel when warranted.

## Example
A café switches ingredient suppliers and receives a complaint about an allergic reaction. The menu description has not changed, and staff no longer have the previous packaging. Frame should help reconstruct the ingredient, supplier, receipt, preparation, and customer-communication records. It should not declare causation, reassure the café that the food was safe, or suggest continuing sales while a potentially serious issue remains unresolved by responsible professionals.

## Counsel questions and next steps
Ask which regulator and reporting obligations apply, what records or samples should be preserved, and what customer communication is appropriate. Coordinate operational changes with qualified food-safety staff rather than treating legal review as permission to resume service. Track inspection and complaint trends, verify corrections, and update training after changes. Confirm local adoption before converting a model-code provision into a mandatory company rule. Frame's useful role is organizing evidence, identifying gaps, and supporting a clear handoff to the people accountable for food safety.`,
        [r.food, r.foodAdoption, r.ads],
      ),
      page(
        'customer-access',
        'Customer Access, Reservations & Promotions',
        ['retail', 'hospitality', 'hotel', 'ADA', 'accessibility', 'advertising'],
        'Public-facing service businesses; public-accommodation coverage and state consumer protections need specific review.',
        `## Framework and limits
ADA Title III can affect how public-facing businesses provide goods and services, communicate, modify policies, and address physical barriers. Existing facilities, new construction, and alterations have different requirements. A small business or older building is not automatically outside the law. Lease allocations can help coordinate work without necessarily eliminating owner or operator responsibilities to the public.

Consumer-facing descriptions also need review. Claims about accessibility, room features, pricing, refunds, or service availability should match actual practice. Federal advertising principles and applicable sector or state rules may affect what must be disclosed. This page does not provide a complete hotel-reservation or pricing compliance checklist.

## Practical review
Walk through a customer's actual journey: discovering the service, obtaining information, booking or purchasing, entering, receiving service, paying, and resolving a complaint. Identify barriers in physical access, communication, policies, and vendor systems. Test promised features and train staff on approved alternatives and escalation routes. Do not assume a website badge or one accessible entrance establishes that the full experience works.

Maintain accurate descriptions of available facilities and services. Review promotions in the format customers actually see, including mobile pages and third-party booking channels. Record mandatory conditions clearly and ensure staff can honor published commitments. Preserve complaints and the version of the offer involved so recurring problems can be investigated.

## Example
A hotel advertises an accessible room but a reservation-platform change removes the feature details and staff cannot confirm the requested arrangement. Frame should help compare the advertised promise, room inventory, booking record, and operational handoff. It should not conclude that a generic disclaimer transfers all responsibility to the platform. A practical response addresses the customer's immediate access needs while investigating the process failure.

## Counsel questions and next steps
Ask which accessibility standards and reservation rules apply, what modifications or communication aids are appropriate, and whether promotional claims need correction. Obtain qualified technical assessment where design or construction is involved. Assign owners for vendor changes, staff training, and complaint follow-up. Review lease and supplier agreements for cooperation and remediation rather than relying solely on indemnities. Frame can organize the facts and proposed improvements; it should not certify accessibility or dismiss a request without an individualized assessment under the applicable rules.`,
        [r.ada, r.adaRules, r.ads],
      ),
    ],
  ),
];
