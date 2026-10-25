export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  security: 'starttls' | 'tls' | 'none';
  username: string;
  fromName: string;
  fromEmail: string;
  domains: string[];
  hasPassword: boolean;
}
export interface EmailRecipient {
  id: string;
  displayName: string;
  email: string;
}
export interface EmailDraft {
  id: string;
  conversationId: string;
  revision: number;
  to: string[];
  subject: string;
  body: string;
  attachments: { name: string; bytes: number; hash: string }[];
  from: { name: string; address: string };
  status: 'draft' | 'sending' | 'accepted' | 'partial' | 'failed' | 'uncertain' | 'cancelled';
  message: string;
  accepted: string[];
  rejected: string[];
  createdAt: string;
}
export const EMAIL_FOOTER = 'This mailbox is not monitored. Please do not reply.';
