# Frame knowledge packs

[Browse and download packs](CATALOG.md) · [Official source register](SOURCES.md) · [Machine-readable catalog](catalog.json)

These optional packs help Frame identify issues, develop facts, compare practical options, and prepare questions for outside counsel. The collection covers federal business topics, six broad industry groups, and California/guild operations. **No collective bargaining agreement content, rate tables, or agreement interpretations are included.**

The new detailed guides supplement the existing short bundled references. They contain legal-framework discussions, evidence checklists, worked scenarios, and counsel handoff workflows. They are original authored material, not complete statutes, official forms, a case-law database, or attorney-reviewed legal opinions. Existing bundled briefs retain their original content and review dates.

## Collection

There are **36 JSON downloads**: 28 detailed guides containing 61 sections and about 22,500 words, plus eight existing bundled briefs. The detailed collection links 117 distinct official-source URLs. The latest expansion adds 16 guides, 34 sections, and about 12,800 words without changing any previously published pack.

| Collection | Packs | Coverage |
| --- | ---: | --- |
| Federal core | 7 | Employment/pay/leave; workplace safety; privacy and breaches; advertising/competition; copyright/trademarks/AI; benefits; business tax/payroll |
| Industry guides | 9 | Technology/software/professional services; healthcare; nonprofits/associations; education; real estate; manufacturing; construction; logistics; retail/restaurants/hospitality |
| California and guild guides | 12 | Employer and member services, governance, entertainment, state employment, safety, privacy, and outside counsel |
| Bundled briefs | 8 | Existing HR, contract, investigation, performance, leasing, security, and responsible-AI references |

The new federal and industry guides use a federal jurisdiction label, not California. State and local overlays require separate review. Federal agency guidance, voluntary NIST frameworks, and the FDA model Food Code are distinguished from binding requirements. Technical standards, tax filings, clinical judgments, and individual compliance determinations remain with qualified professionals. Government contracting and a fifty-state legal survey are not included in this expansion.

## Install a pack

In Frame, choose **Settings → Knowledge Library → Browse packs**, or **Browse packs** in Project settings. Search or filter the catalog, inspect section details, then choose **Install pack** for direct installation or **Download JSON** to save a file. Neither action attaches a pack to a project. Catalog browsing works offline; downloading optional guides requires the Frame server to reach the public repository. Included briefs need no internet. Downloaded files are size-checked, SHA-256-verified against Frame’s release catalog, and schema-validated before installation.

For manual distribution:

1. Open the [catalog](CATALOG.md) and save the desired **JSON** download. Use the raw download, not a GitHub HTML page. No GitHub account is required for public downloads.
2. In Frame, open **Settings → Knowledge Library**, or **Project settings → Library references**, and select **Import pack**.
3. Review its sections, jurisdiction, review date, and sources. Downloaded files are treated as imported, unverified content; importing is not publisher verification.
4. Select **Attach to project**. The next chat turn can retrieve its sections through the knowledge tools. Importing alone does not add it to a conversation or publish company information.

Packs work locally after installation. Frame does not fetch publisher links, phone home, auto-download from GitHub, or auto-update attached versions. Optional pack downloads happen only on the user's Install or Download action; they send no project data or credentials and follow no redirects. The catalog updates with Frame releases. Opening an external source or GitHub link is a separate browser action. Publisher URLs are references, not offline copies of the linked text. Use counsel or current primary sources for live-law verification; Frame's local model cannot imply it visited those links.

## Suggested selections

- **General business:** Federal Employment; Federal Privacy; Federal Commercial Practices; Federal Benefits; Federal Business Tax, then add the relevant industry guide and state references.
- **Technology/services:** Technology; Federal IP & AI; Federal Privacy; Federal Commercial Practices; Business Contract Review; Outside Counsel.
- **Healthcare/education:** The relevant industry guide; Federal Employment; Federal Privacy; Federal Benefits; Outside Counsel. Add local requirements and actual institutional policies.
- **Manufacturing/construction/logistics:** The relevant industry guides; Federal Workplace Safety; Federal Employment; Federal Commercial Practices; Outside Counsel.
- **Retail/property/nonprofit:** The relevant industry guide; Federal Employment; Federal Commercial Practices; Federal Privacy; Federal Business Tax, plus state/local references.
- **Guild employer:** Pay & Classification; Leave & Accommodation; Investigations; Hiring & Departures; Workplace Safety; Privacy; Outside Counsel.
- **Member services:** Member Services & Statutory Rights; Entertainment Rights & AI; Entertainment Minors & Talent; Pay & Classification; Benefits; Outside Counsel.
- **Governance/operations:** Guild Governance; Privacy; Benefits; Outside Counsel, plus the existing contract and cybersecurity packs as needed.

Projects currently support eight attached packs. Select the relevant set rather than attaching every topic. Search and bounded excerpts keep detailed guides out of unrelated turns; use `read_knowledge` with offsets when a relevant section is truncated. Longer source material does not guarantee legal accuracy or exhaustive recall.

## Updates and provenance

Each file has an immutable pack ID and semantic version. The catalog records file size and SHA-256 for detecting accidental changes; a checksum downloaded from the same repository is **not** an independent authenticity signature. Verify the repository and review content before importing a modified file.

To update, download/import the new version and explicitly choose **Use this version** in project settings. Existing attachments stay pinned; historical citations continue to resolve. Do not replace a published JSON file with different content under the same version. Use a new ID for a custom derivative, including changes to bundled packs whose IDs are reserved by Frame.

`reviewedAt` means the publisher pages were consulted on that date. It is not the effective date of every provision and does not certify legal completeness. The detailed guides intentionally avoid universal filing deadlines, changing dollar thresholds, or claims that proposed rules are effective law. They identify when current statutes, exceptions, local ordinances, plan documents, or facts must be checked. No private organization records, member files, or counsel advice belong in this public repository.

## Maintaining the collection

Authoring files are in `src/`. Run `npm run packs:build` from the repository root to regenerate JSON downloads, the catalog, the metadata-only application catalog (`server/library/download-catalog.ts`), and source register offline. Run `npm run packs:check` to verify generated files match their authoring source. The test suite validates downloads, imports, version pinning, source structure, and bounded retrieval. Automated checks do not validate legal conclusions.

For a substantive update, review current primary sources, record the actual review date, identify changed rules and effective dates, include contrary or limiting authorities where relevant, and increment the version. Retain previous downloads for reproducibility. The detailed guides have **not** been reviewed by a licensed attorney; an outside-counsel editorial review is recommended before relying on them for organizational decisions.

Original detailed-guide text may be used, modified, and redistributed with the rights notice included in each pack. Linked external publications retain their own rights; the downloads do not reproduce them.
