# Frame knowledge packs

[Browse and download packs](CATALOG.md) · [Official source register](SOURCES.md) · [Machine-readable catalog](catalog.json)

These optional packs help Frame identify issues, develop facts, compare practical options, and prepare questions for outside counsel. They cover a guild both as an employer and as a member-services organization. **No collective bargaining agreement content, rate tables, or agreement interpretations are included.**

The new detailed guides supplement the existing short bundled references. They contain legal-framework discussions, evidence checklists, worked scenarios, and counsel handoff workflows. They are original authored material, not complete statutes, official forms, a case-law database, or attorney-reviewed legal opinions. Existing bundled briefs retain their original content and review dates.

## Install a pack

1. Open the [catalog](CATALOG.md) and save the desired **JSON** download. Use the raw download, not a GitHub HTML page. No GitHub account is required for public downloads.
2. In Frame, open **Settings → Knowledge Library**, or **Project settings → Library references**, and select **Import pack**.
3. Review its sections, jurisdiction, review date, and sources. Downloaded files are treated as imported, unverified content; importing is not publisher verification.
4. Select **Attach to project**. The next chat turn can retrieve its sections through the knowledge tools. Importing alone does not add it to a conversation or publish company information.

Packs work locally after import. Frame does not fetch publisher links, phone home, auto-download from GitHub, or auto-update attached versions. Opening an external source or GitHub link is a separate browser action. Publisher URLs are references, not offline copies of the linked text. Use counsel or current primary sources for live-law verification; Frame's local model cannot imply it visited those links.

## Suggested selections

- **Guild employer:** Pay & Classification; Leave & Accommodation; Investigations; Hiring & Departures; Workplace Safety; Privacy; Outside Counsel.
- **Member services:** Member Services & Statutory Rights; Entertainment Rights & AI; Entertainment Minors & Talent; Pay & Classification; Benefits; Outside Counsel.
- **Governance/operations:** Guild Governance; Privacy; Benefits; Outside Counsel, plus the existing contract and cybersecurity packs as needed.

Projects currently support eight attached packs. Select the relevant set rather than attaching every topic. Search and bounded excerpts keep detailed guides out of unrelated turns; use `read_knowledge` with offsets when a relevant section is truncated. Longer source material does not guarantee legal accuracy or exhaustive recall.

## Updates and provenance

Each file has an immutable pack ID and semantic version. The catalog records file size and SHA-256 for detecting accidental changes; a checksum downloaded from the same repository is **not** an independent authenticity signature. Verify the repository and review content before importing a modified file.

To update, download/import the new version and explicitly choose **Use this version** in project settings. Existing attachments stay pinned; historical citations continue to resolve. Do not replace a published JSON file with different content under the same version. Use a new ID for a custom derivative, including changes to bundled packs whose IDs are reserved by Frame.

`reviewedAt` means the publisher pages were consulted on that date. It is not the effective date of every provision and does not certify legal completeness. The detailed guides intentionally avoid universal filing deadlines, changing dollar thresholds, or claims that proposed rules are effective law. They identify when current statutes, exceptions, local ordinances, plan documents, or facts must be checked. No private organization records, member files, or counsel advice belong in this public repository.

## Maintaining the collection

Authoring files are in `src/`. Run `npm run packs:build` from the repository root to regenerate JSON downloads, the catalog, and source register offline. Run `npm run packs:check` to verify generated files match their authoring source. The test suite validates imports, version pinning, source structure, and bounded retrieval. Automated checks do not validate legal conclusions.

For a substantive update, review current primary sources, record the actual review date, identify changed rules and effective dates, include contrary or limiting authorities where relevant, and increment the version. Retain previous downloads for reproducibility. The first detailed release has **not** been reviewed by a licensed attorney; an outside-counsel editorial review is recommended before relying on it for organizational decisions.

Original detailed-guide text may be used, modified, and redistributed with the rights notice included in each pack. Linked external publications retain their own rights; the downloads do not reproduce them.
