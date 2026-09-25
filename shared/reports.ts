export interface ReportProfile {
  organization: string;
  primary: string;
  secondary: string;
  accent: string;
  template: 'executive' | 'analytical' | 'technical';
  paper: 'letter' | 'a4';
  landscape: boolean;
  cover: boolean;
  confidentialityNotice: string;
  footer: string;
  instructions: string;
}
export interface ReportSettings {
  enabled: boolean;
  profile: ReportProfile;
  defaults: ReportProfile;
  overrides: Partial<ReportProfile>;
  logo: string | null;
  logoInherited: boolean;
  runtime: { state: string; message: string };
}
