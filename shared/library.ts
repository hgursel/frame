export interface LibrarySource {
  title: string;
  url: string;
  locator: string;
}
export interface LibraryPage {
  id: string;
  title: string;
  description: string;
  tags: string[];
  kind: 'reference-brief' | 'review-workflow';
  applicability: string;
  effectiveDate: string | null;
  text: string;
  sources: LibrarySource[];
}
export interface LibraryPack {
  id: string;
  version: string;
  title: string;
  description: string;
  jurisdiction: string[];
  reviewedAt: string;
  rights: string;
  pages: LibraryPage[];
}
export interface LibraryEntry {
  pack: LibraryPack;
  installed: boolean;
  attached: boolean;
  bundled: boolean;
  newerVersion?: string;
}
export interface LibraryReference {
  pack: string;
  version: string;
  page: string;
  url: string;
  reviewedAt: string;
  kind: LibraryPage['kind'];
}
