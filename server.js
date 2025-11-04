const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const SCORING_FILE = path.join(DATA_DIR, 'scoring.json');
const PERSONAS_FILE = path.join(DATA_DIR, 'personas.json');

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  }
  if (!fs.existsSync(QUESTIONS_FILE)) {
    const defaultQuestions = [
      {
        id: 'goals',
        title: 'Do you have clear project goals?',
        description: 'Helps us define success and align on outcomes.',
        options: ['Yes', 'No'],
        details: {
          Yes: 'Great. We will map them into milestones.',
          No: 'No problem. We can help you shape them together.',
        },
      },
      {
        id: 'timing',
        title: 'Is there a defined timeline?',
        description: 'Understanding timing informs approach and resourcing.',
        options: ['Yes', 'No'],
        details: {
          Yes: 'We will plan phases and checkpoints around your dates.',
          No: 'We can propose a realistic plan based on scope.',
        },
      },
      {
        id: 'stakeholders',
        title: 'Are key stakeholders identified?',
        description: 'Ensures decisions are efficient and feedback is clear.',
        options: ['Yes', 'No'],
      },
      {
        id: 'assets',
        title: 'Do you have brand assets ready?',
        description: 'Logos, guidelines, references, or prior work.',
        options: ['Yes', 'No'],
        caseStudy: { type: 'image', src: '', title: 'Case Study' },
      },
      {
        id: 'channels',
        title: 'Do you have priority channels?',
        description: 'Where will this work primarily live? (e.g., web, social, OOH).',
        options: ['Yes', 'No'],
      },
      {
        id: 'measurement',
        title: 'Is there a measurement plan?',
        description: 'How will performance be tracked and learned from?',
        options: ['Yes', 'No'],
      },
    ];
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(defaultQuestions, null, 2), 'utf-8');
  }
}

ensureDataStore();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

async function readSubmissions() {
  try {
    const raw = await fsp.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    return [];
  }
}

async function writeSubmissions(submissions) {
  const safe = Array.isArray(submissions) ? submissions : [];
  await fsp.writeFile(DATA_FILE, JSON.stringify(safe, null, 2));
}

async function readQuestions() {
  try {
    const raw = await fsp.readFile(QUESTIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    return [];
  }
}

async function readScoring() {
  try {
    const raw = await fsp.readFile(SCORING_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

async function readPersonas() {
  try {
    const raw = await fsp.readFile(PERSONAS_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function getQuestionById(sections, questionId) {
  for (const sec of sections) {
    const found = (sec.items || []).find((q) => q.id === questionId);
    if (found) return { section: sec, question: found };
  }
  return null;
}

function getOptionWeight(option, question, profileWeights) {
  // Prefer question-level mapping
  if (question && question.scores && typeof question.scores === 'object') {
    const val = question.scores[option];
    if (typeof val === 'number') return val;
  }
  // Fallback to profile defaults
  if (profileWeights && typeof profileWeights === 'object') {
    const val = profileWeights[option];
    if (typeof val === 'number') return val;
  }
  // Default unknown options to 0
  return 0;
}

function getQuestionMaxWeight(question, profileWeights) {
  const options = (question && Array.isArray(question.options)) ? question.options : [];
  let maxW = 1;
  if (options.length > 0) {
    maxW = Math.max(
      ...options.map((opt) => getOptionWeight(opt, question, profileWeights)),
      1
    );
  }
  return maxW;
}

function computeScores(answers, sections, scoringProfiles, persona) {
  const profile = scoringProfiles[persona] || scoringProfiles['default'] || {};
  const perSection = {};

  const entries = Object.entries(answers || {});
  for (const [questionId, selected] of entries) {
    const locate = getQuestionById(sections, questionId);
    if (!locate) continue;
    const { section, question } = locate;
    const sectionId = section.id;
    const weight = getOptionWeight(selected, question, profile);
    const maxWeight = getQuestionMaxWeight(question, profile);
    if (!perSection[sectionId]) {
      perSection[sectionId] = { title: section.title, num: 0, den: 0, answered: 0 };
    }
    perSection[sectionId].num += weight;
    perSection[sectionId].den += maxWeight;
    perSection[sectionId].answered += 1;
  }

  const sectionPercents = {};
  let overallNum = 0;
  let overallDen = 0;
  for (const [sid, agg] of Object.entries(perSection)) {
    const pct = agg.den > 0 ? (agg.num / agg.den) * 100 : null;
    sectionPercents[sid] = { title: perSection[sid].title, percent: pct, answered: agg.answered };
    if (pct !== null) {
      // For overall, average by denominator (i.e., weight by #questions' max weights)
      overallNum += agg.num;
      overallDen += agg.den;
    }
  }
  const overall = overallDen > 0 ? (overallNum / overallDen) * 100 : null;
  return { perSection: sectionPercents, overall, persona: persona || 'default' };
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5) return false;
  return /.+@.+\..+/.test(trimmed);
}

function buildMailTransport() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SENDMAIL,
    DEV_MAIL_LOG,
  } = process.env;

  if (SMTP_HOST && SMTP_PORT) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }

  if (SENDMAIL === 'true') {
    return nodemailer.createTransport({ sendmail: true, newline: 'unix', path: '/usr/sbin/sendmail' });
  }

  if (DEV_MAIL_LOG === 'true') {
    return nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
  }

  return null;
}

async function sendNotificationMail(entry) {
  const transport = buildMailTransport();
  const to = process.env.NOTIFY_EMAIL;
  const from = process.env.FROM_EMAIL || 'no-reply@gut-catcher.local';

  if (!transport || !to) {
    console.log('[mail] Skipping send (transport or NOTIFY_EMAIL not configured).');
    return;
  }

  const subject = `New Client Catch Submission: ${entry.email}`;
  const body = [
    `Email: ${entry.email}`,
    `Created: ${entry.createdAt}`,
    `IP: ${entry.ip || 'n/a'}`,
    `User-Agent: ${entry.userAgent || 'n/a'}`,
    '',
    'Answers:',
    JSON.stringify(entry.answers, null, 2),
  ].join('\n');

  try {
    const info = await transport.sendMail({ from, to, subject, text: body });
    if (info && info.message) {
      console.log('[mail] Message output (stream):\n' + info.message.toString());
    } else {
      console.log('[mail] Sent:', info);
    }
  } catch (err) {
    console.error('[mail] Failed to send notification:', err.message);
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/submissions', async (req, res) => {
  const submissions = await readSubmissions();
  res.json({ count: submissions.length, submissions });
});

app.get('/api/questions', async (req, res) => {
  const questions = await readQuestions();
  try {
    console.log(`[api] /api/questions -> ${Array.isArray(questions) ? questions.length : 0} sections`);
  } catch {}
  res.json(questions);
});

app.get('/api/personas', async (req, res) => {
  const personas = await readPersonas();
  res.json(personas);
});

app.get('/api/scoring', async (req, res) => {
  const scoring = await readScoring();
  res.json(scoring);
});

app.post('/api/submissions', async (req, res) => {
  const { email, answers, meta } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (typeof answers !== 'object' || answers === null) {
    return res.status(400).json({ error: 'Answers must be an object.' });
  }

  const baseEntry = {
    id: Date.now().toString(),
    email: email.trim(),
    answers,
    meta: typeof meta === 'object' && meta !== null ? meta : undefined,
    createdAt: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || undefined,
    userAgent: req.headers['user-agent'] || undefined,
  };

  let savedEntry;
  try {
    // Compute scoring
    const [sections, profiles] = await Promise.all([readQuestions(), readScoring()]);
    const persona = (baseEntry.meta && baseEntry.meta.persona) || 'default';
    const score = computeScores(answers, sections, profiles, persona);

    const entry = { ...baseEntry, score };
    const submissions = await readSubmissions();
    submissions.push(entry);
    await writeSubmissions(submissions);
    savedEntry = entry;
  } catch (err) {
    console.error('[store] Failed to write submission:', err.message);
    return res.status(500).json({ error: 'Failed to save submission.' });
  }

  if (savedEntry) {
    sendNotificationMail(savedEntry).catch(() => {});
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


