# GUT Client Catch (Minimal)

Vanilla UI + Node/Express backend to collect client questionnaire responses.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Features
- Minimal, flat black/white UI (vanilla HTML/CSS/JS)
- Accordion questions with Yes/No (and optional details)
- Optional case study modal (video or image)
- Email capture and JSON storage (`data/submissions.json`)
- Optional email notification via SMTP or sendmail
- Mini dashboard at `/admin.html`

## Current status
- Persona-driven flow with stepper: Welcome → filtered Sections → Review & Submit
- Dynamic step count updates based on persona-visible sections
- Per-section and overall scoring computed on the server and previewed on Review
- Submissions persist to JSON and display in dashboard (Created, Email, Persona, Answers, Scores)

## How it works (flow)
1. Welcome: user selects a persona (from `data/personas.json`).
2. Sections: only sections/questions whose `labels` include the persona are shown. If persona is `default` (General), all content is shown.
3. Review & Submit: shows per‑section scores and overall; email form is displayed here only. On submit:
   - server computes final scores and saves `{ email, answers, meta, score }` to `data/submissions.json`
   - optional notification email is sent if SMTP/sendmail is configured

## Environment variables (optional for email)
- `SMTP_HOST` – e.g. smtp.sendgrid.net
- `SMTP_PORT` – e.g. 587 or 465
- `SMTP_USER` – SMTP username (optional if server allows unauth)
- `SMTP_PASS` – SMTP password
- `FROM_EMAIL` – From address (default: no-reply@gut-catcher.local)
- `NOTIFY_EMAIL` – Where to send notifications
- `SENDMAIL=true` – Use local sendmail instead of SMTP
- `DEV_MAIL_LOG=true` – Log email to console instead of sending

If nothing is configured, submissions are still stored locally and email sending is skipped.

## API (for reference)
- `GET /api/questions` → sections/questions (from `data/questions.json`)
- `GET /api/personas` → personas (from `data/personas.json`)
- `GET /api/scoring` → scoring profiles (from `data/scoring.json`)
- `GET /api/submissions` → stored submissions
- `POST /api/submissions` → save a submission `{ email, answers, meta }`

## Add questions
Edit `data/questions.json`. Structure supports categories (sections) with nested questions:
```js
[
  {
    id: 'category-id',
    title: 'Category Title',
    labels: ['designer','developer'], // optional: show this section only to these personas
    items: [
      {
        id: 'question-id',
        title: 'Question title',
        description: 'Optional description',
        options: ['Yes', 'No'],
        details: { Yes: 'Optional', No: 'Optional' },
        labels: ['designer'], // optional: show this question only to these personas
        caseStudy: { type: 'image'|'video', src: '/path/in/public', title: 'Optional' }
      }
    ]
  }
]
```

## Data
All submissions are saved in `data/submissions.json`. This is a simple local dev store; switch to a database later if needed.

## Scoring (per-section)
- Answers are scored using `data/scoring.json` (profile `default`) and/or per-question `scores` maps.
- Each section is treated independently (100% basis). Unanswered questions do not lower a section score.
- For each answered question, we compare the selected option weight to the max weight for that question.
- Stored on submission under `entry.score` with `perSection` and `overall` fields.

### Adding weights
- Global defaults: edit `data/scoring.json` (e.g., `{ "default": { "Yes": 1, "No": 0 } }`).
- Per-question override: in `data/questions.json`, add `scores` to a question.

### Personas (future-ready)
- Persona selector is rendered from `data/personas.json`. Selected persona saved to `localStorage` and sent as `meta.persona`.
- To filter content per persona, add `labels` arrays (on sections or questions). If omitted, content shows for all personas.
- Create persona-specific scoring profiles in `data/scoring.json` with matching keys to alter weights per persona.

## Dev notes
- The dev server ignores changes in `data/` and `public/` to prevent restarts during POST (avoids transient 500s). If you change server code, nodemon will auto-restart. If you change JSON or public files, just refresh the browser.
- If you see a 500 on submit after code edits, restart: `npm run dev`.

## License
MIT
