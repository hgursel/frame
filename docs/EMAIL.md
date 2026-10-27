# Internal email

Administrators configure **Admin → Email** once. Email is available in every project after it is enabled; there is no per-project switch. Frame prepares email only on request. The user reviews a draft and clicks **Send email**. There is no inbox, reply processing, scheduler, automatic background sending, CC, or BCC.

## Configure SMTP

Enter the SMTP host, port, encryption, optional username/password, sender display name, sender address, and approved recipient domains. Use a dedicated no-reply sender. **Save email settings** stores configuration without connecting. **Test saved connection** explicitly connects and checks the saved SMTP credentials; it does not send email or prove that the sender is authorized to deliver mail.

STARTTLS is required when selected; implicit TLS is also available. Certificates are verified. For an internal CA, configure the Node host's trust using `NODE_EXTRA_CA_CERTS`. Unencrypted SMTP is available for an internal relay without authentication. Password authentication requires TLS. The connector uses Nodemailer; credentials remain on the Frame server in its protected data directory and are never returned by settings APIs or supplied to model workers.

Domains match exactly. Add subdomains separately. Every recipient is checked when preparing, editing, and sending. SMTP and relay access policies remain the operator's responsibility; the connector's confirmation rules do not replace network controls for other applications or existing unrestricted host-tool networking.

## User profiles and recipients

Under **Admin → Users**, admins manage Display Name and Email for new and existing accounts, including their own profile. These fields are optional for migration compatibility. The sidebar shows Display Name, falling back to username; login usernames are unchanged. Regular users can view their own details but cannot edit them.

“Email this to me” uses the signed-in user's saved email. Frame can search active registered users by display name or email, limited to approved domains. It should ask the user to choose when names are ambiguous. For other recipients, the user supplies an exact address. Missing profile emails must be supplied by the administrator or explicitly provided as a recipient; Frame must not invent an address.

## Review and send

The model's `email_recipients` and `email_outputs` tools find recipients and generated files. `email_prepare` creates a visible draft and returns without sending. There is no model send tool. The draft shows From, all To recipients, subject, plain-text body, the no-reply footer, and attachments. **Edit draft → Save draft for review** updates the preview; sending requires a separate click on **Send email**. **Cancel email** discards the pending send.

Attachments come only from the current conversation's generated output directory, not uploaded files or project knowledge. Supported extensions: PDF, DOCX, XLSX, CSV, TXT, Markdown, PNG, JPEG, and PPTX. Limits: 20 recipients, 10 attachments, 20 MiB total attachment bytes, and 50,000 body characters. Artifact filenames are validated; symlinks, hard links, paths, URLs, unsupported files, and oversized attachments are rejected. Files are hashed at preview and checked again before sending. Changed files or SMTP settings require saving and reviewing a refreshed draft. Generated output directory membership is the attachment boundary, not a content provenance guarantee.

Drafts and send results persist with the conversation. Repeated clicks or HTTP retries never send the same draft twice. A restart during sending marks the outcome uncertain rather than retrying. Accepted means the SMTP server accepted the message, not that it was delivered. Partial acceptance lists accepted and rejected recipients. For an uncertain outcome, check the mail server before preparing another email. Deleting a conversation deletes its email records; deletion is blocked while a send is active. Email is unavailable in incognito chats because it requires persistent confirmation and send records.

Messages have no Reply-To and include “This mailbox is not monitored. Please do not reply.” Configure the mail server to reject replies if desired; SMTP sending alone cannot stop a recipient from replying.

## Validation

Automated tests use a local SMTP capture server, a mock OpenAI-compatible model endpoint, and the real Pi SDK. They cover authorization, domain checks, secret isolation, recipient lookup, confirmation, file boundaries, changed previews, duplicate requests, partial/uncertain outcomes, restart recovery, deletion, profile management, and desktop/mobile UI. Real SMTP, corporate CA, relay policy, and delivery acceptance must be verified in the deployment environment.

## Scheduled delivery

[Scheduled tasks](SCHEDULED.md) authorize automatic email when the user activates the review card. Recipients are fixed at activation, changes require review again, and only authorized generated outputs from the current run can be attached. The server sends after successful task completion. Interactive chat emails continue to require Send confirmation.
