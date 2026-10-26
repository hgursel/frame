# Scheduled tasks

[Back to Frame](../README.md)

Ask Frame in a regular project chat to do work later or repeatedly, for example: “Every Monday at 7 AM, summarize last week’s data, create a PDF, and email me.” Frame prepares a review card with standalone instructions, timing, timezone, recipients, and attachment policy. Review it and click **Activate**. Preparing the card does not activate it or send email.

Open **Scheduled** at the bottom left to view your tasks, next runs, results, run history, email status, and downloadable outputs. Edit, pause/resume, run now, or delete tasks there. Editing requires reactivation. Deleting a task deletes its run history and outputs. Deleting the source chat leaves the standalone task intact; deleting its project removes the task and all its runs. Tasks and results are private to their owner, including against other administrators.

## Timing and operation

An administrator selects one IANA timezone under **Settings → Scheduled** (initially UTC). It applies to everyone. Changing it returns existing schedules to review so users can approve the changed timing. One-time, daily, weekdays, weekly, and monthly schedules are supported. Daily/weekly schedules follow local daylight saving time. Nonexistent spring-forward wall times are skipped; repeated fall-back wall times run once, at the first occurrence. A monthly day absent from a month is skipped.

Frame's server must remain running; users need not be signed in and browsers can be closed. The server checks for due work every 15 seconds and uses the existing model concurrency queue. After downtime it runs only the latest missed occurrence. Occurrences are claimed and the next time is saved before execution. One task cannot overlap itself. Interrupted accepted runs are recorded as interrupted and are never replayed on restart. A manual **Run now** does not move the next scheduled occurrence.

Each execution gets a fresh internal conversation. It uses the saved task instructions and current project instructions, knowledge, enabled SQL/Charts/Reports tools, and current model settings. The originating chat's history, images, and temporary uploads are not copied. Include necessary instructions or place durable source material in project knowledge. Internal run conversations stay out of the chat sidebar and conversation learning.

## Capabilities and delivery

Runs can read project knowledge, run supported read-only SQL, analyze data, create charts and branded PDF reports, and create Word documents when the document runtime is installed. Arbitrary shell/file tools, executable skills, database writes/procedures, interactive questions, and nested scheduling are unavailable. Missing required information can be reported as a task failure.

Activated email schedules authorize unattended sends to their saved recipients in admin-approved internal domains. The model cannot choose new recipients at runtime. Attachments, when authorized, must be generated outputs from the current run. The server sends the prepared email only after the agent completes successfully. No per-run approval is requested. Regular interactive chat email drafts still require **Send** confirmation.

Owner availability, project ownership, and current email policy are checked before and during execution and before delivery. A disabled owner, removed permission, or no-longer-approved domain fails the run. Errors appear in Scheduled; Frame attempts one failure notification to the owner's admin-managed address if SMTP and its domain policy allow it. Failed, partial, and uncertain SMTP sends are not retried automatically. SMTP acceptance is not proof of delivery; check the mail server before manually repeating an uncertain run.

## Validation

`npm test` includes calendar/DST, activation, authorization, restart, catch-up, unattended SMTP, attachment, and read-only tool coverage. `npm run test:scheduled-ui` exercises chat creation, the review card, timezone settings, activation, automatic email, results, pause/resume, edit/reactivate, deletion, and mobile layout against local fixtures. Real model/SMTP deployment acceptance remains a separate step.
