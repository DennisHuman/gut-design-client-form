let sections = [];
let personas = [];
let scoringProfiles = {};

async function loadSections() {
  try {
    const res = await fetch('/api/questions', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load questions');
    sections = await res.json();
  } catch (err) {
    console.error('[questions] load failed', err);
    const container = document.getElementById('accordion');
    if (container) {
      container.innerHTML = '<div class="desc">Failed to load questions. Please refresh.</div>';
    }
  }
}

async function loadPersonas() {
  try {
    const res = await fetch('/api/personas', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load personas');
    personas = await res.json();
  } catch (err) {
    personas = [{ id: 'default', title: 'General' }];
  }
}

async function loadScoring() {
  try {
    const res = await fetch('/api/scoring', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load scoring');
    scoringProfiles = await res.json();
  } catch (err) {
    scoringProfiles = { default: { Yes: 1, No: 0 } };
  }
}

const state = {
  sectionExpanded: new Set(),
  expanded: new Set(),
  answers: {},
  persona: localStorage.getItem('persona') || 'default',
  step: 0, // 0: welcome, 1..N: sections, N+1: review
};

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function renderAccordion() {
  const container = $('#accordion');
  container.innerHTML = '';

  const filteredSections = getFilteredSections();
  if (!Array.isArray(filteredSections) || filteredSections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'desc';
    empty.textContent = 'No sections found.';
    container.appendChild(empty);
    return;
  }


  filteredSections.forEach((section) => {
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.dataset.sid = section.id;

    const secSummary = document.createElement('div');
    secSummary.className = 'section-summary';
    secSummary.innerHTML = `
      <div class="title">${section.title}</div>
      <div class="caret">›</div>
    `;

    const secPanel = document.createElement('div');
    secPanel.className = 'section-panel';

    // Build questions within the section
    (section.items || []).forEach((q) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.dataset.qid = q.id;

      const summary = document.createElement('div');
      summary.className = 'summary';
      summary.innerHTML = `
        <div class="title">${q.title}</div>
        <div class="caret">›</div>
      `;

      const panel = document.createElement('div');
      panel.className = 'panel';

      const panelInner = document.createElement('div');
      panelInner.className = 'panel-inner';

      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = q.description || '';

      const options = document.createElement('div');
      options.className = 'options';
      (q.options || []).forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option';
        btn.setAttribute('aria-pressed', state.answers[q.id] === opt ? 'true' : 'false');
        btn.textContent = opt;
        btn.addEventListener('click', () => onSelectOption(q, opt, item, options));
        options.appendChild(btn);
      });

      const extra = document.createElement('div');
      extra.className = 'extra';
      updateExtra(extra, q, state.answers[q.id]);

      panelInner.appendChild(desc);
      panelInner.appendChild(options);
      panelInner.appendChild(extra);

      if (q.caseStudy) {
        const csBtn = document.createElement('button');
        csBtn.type = 'button';
        csBtn.className = 'case-study-btn';
        csBtn.textContent = 'View Case Study';
        csBtn.addEventListener('click', () => openCaseStudy(q.caseStudy));
        panelInner.appendChild(csBtn);
      }

      panel.appendChild(panelInner);

      summary.addEventListener('click', () => toggleItem(item, panel, secPanel));
      item.appendChild(summary);
      item.appendChild(panel);

      secPanel.appendChild(item);
    });

    secSummary.addEventListener('click', () => toggleSection(sec, secPanel));

    sec.appendChild(secSummary);
    sec.appendChild(secPanel);
    container.appendChild(sec);
  });
}

function renderPersonaSelector() {
  const container = document.getElementById('personaSection');
  if (!container) return;
  container.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Who are you?';
  const roles = document.createElement('div');
  roles.className = 'roles';

  (personas || []).forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'role-btn';
    btn.textContent = p.title;
    btn.setAttribute('aria-pressed', state.persona === p.id ? 'true' : 'false');
    btn.addEventListener('click', () => {
      state.persona = p.id;
      localStorage.setItem('persona', p.id);
      // Rerender accordion for filtering
      renderAccordion();
      // Recalculate step count based on persona-filtered sections
      setStep(0);
      // Keep existing opens consistent by collapsing all
      document.querySelectorAll('.item .panel').forEach((el) => { el.style.maxHeight = '0px'; });
      document.querySelectorAll('.item').forEach((el) => el.classList.remove('open'));
      document.querySelectorAll('.section .section-panel').forEach((el) => { el.style.maxHeight = '0px'; });
      document.querySelectorAll('.section').forEach((el) => el.classList.remove('open'));
      // Update pressed states
      renderPersonaSelector();
    });
    roles.appendChild(btn);
  });

  container.appendChild(label);
  container.appendChild(roles);
}

function getFilteredSections() {
  const activePersona = state.persona || 'default';
  // If persona is General/default, return all sections/questions without filtering.
  if (activePersona === 'default') {
    return (sections || []).map((s) => ({ ...s, items: (s.items || []).slice() }));
  }
  let base = (sections || [])
    .map((section) => {
      const itemList = (section.items || []).filter((q) => {
        if (!q.labels || q.labels.length === 0) return true;
        return q.labels.includes(activePersona);
      });
      // If section has labels, require persona to be included; otherwise hide section entirely
      if (section.labels && Array.isArray(section.labels) && section.labels.length > 0 && !section.labels.includes(activePersona)) {
        return null;
      }
      return { ...section, items: itemList };
    })
    .filter((s) => s && (s.items || []).length > 0);
  return base;
}

function updateStepbar(total) {
  const stepbar = document.getElementById('stepbar');
  if (!stepbar) return;
  const last = total - 1; // 0..last where last is review
  const human = Math.min(state.step + 1, total);
  const label = state.step === 0 ? 'Welcome' : (state.step === last ? 'Review' : 'Section');
  stepbar.textContent = `Step ${human} of ${total} • ${label}`;
}

function setStep(nextStep) {
  const filtered = getFilteredSections();
  const total = 2 + filtered.length - 0; // welcome + sections + review
  const maxIndex = total - 1; // 0-based
  state.step = Math.max(0, Math.min(nextStep, maxIndex));

  // Toggle visibility
  const personaEl = document.getElementById('personaSection');
  const accordionEl = document.getElementById('accordion');
  const reviewEl = document.getElementById('review');
  const submitEl = document.querySelector('.submit-section');
  if (state.step === 0) {
    personaEl.hidden = false;
    accordionEl.hidden = true;
    reviewEl.hidden = true;
    if (submitEl) submitEl.hidden = true;
  } else if (state.step > 0 && state.step < maxIndex) {
    personaEl.hidden = true;
    accordionEl.hidden = false;
    reviewEl.hidden = true;
    if (submitEl) submitEl.hidden = true;
    // Render only the current section
    renderSectionOnly(filtered[state.step - 1]);
  } else {
    personaEl.hidden = true;
    accordionEl.hidden = true;
    reviewEl.hidden = false;
    if (submitEl) submitEl.hidden = false;
    renderReview();
  }

  // Update controls
  updateStepbar(total);
  const back = document.getElementById('backBtn');
  const next = document.getElementById('nextBtn');
  back.disabled = state.step === 0;
  next.textContent = state.step === maxIndex ? 'Submit' : 'Next';
}

function renderSectionOnly(section) {
  const container = $('#accordion');
  container.innerHTML = '';
  // Section hero title for the step
  const stepTitle = document.createElement('h2');
  stepTitle.className = 'step-title';
  stepTitle.textContent = section.title;
  container.appendChild(stepTitle);

  if (section.description) {
    const lead = document.createElement('p');
    lead.className = 'step-lead';
    lead.textContent = section.description;
    container.appendChild(lead);
  }

  (section.items || []).forEach((q) => {
    const item = document.createElement('div');
    item.className = 'item';
    item.dataset.qid = q.id;
    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.innerHTML = `<div class="title">${q.title}</div><div class="caret">›</div>`;
    const panel = document.createElement('div');
    panel.className = 'panel';
    const panelInner = document.createElement('div');
    panelInner.className = 'panel-inner';
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = q.description || '';
    const options = document.createElement('div');
    options.className = 'options';
    (q.options || []).forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.setAttribute('aria-pressed', state.answers[q.id] === opt ? 'true' : 'false');
      btn.textContent = opt;
      btn.addEventListener('click', () => onSelectOption(q, opt, item, options));
      options.appendChild(btn);
    });
    const extra = document.createElement('div');
    extra.className = 'extra';
    updateExtra(extra, q, state.answers[q.id]);
    panelInner.appendChild(desc);
    panelInner.appendChild(options);
    panelInner.appendChild(extra);
    if (q.caseStudy) {
      const csBtn = document.createElement('button');
      csBtn.type = 'button';
      csBtn.className = 'case-study-btn';
      csBtn.textContent = 'View Case Study';
      csBtn.addEventListener('click', () => openCaseStudy(q.caseStudy));
      panelInner.appendChild(csBtn);
    }
    panel.appendChild(panelInner);
    summary.addEventListener('click', () => toggleItem(item, panel, null));
    item.appendChild(summary);
    item.appendChild(panel);
    container.appendChild(item);
  });
}

function computePreviewScore() {
  const profile = scoringProfiles[state.persona] || scoringProfiles['default'] || {};
  const filtered = getFilteredSections();
  let overallNum = 0; let overallDen = 0;
  const perSection = {};
  filtered.forEach((sec) => {
    let num = 0; let den = 0; let answered = 0;
    (sec.items || []).forEach((q) => {
      const selected = state.answers[q.id];
      if (!selected) return;
      const weight = (q.scores && typeof q.scores[selected] === 'number') ? q.scores[selected] : (typeof profile[selected] === 'number' ? profile[selected] : 0);
      const maxWeight = Math.max(...(q.options || []).map((opt) => (q.scores && typeof q.scores[opt] === 'number') ? q.scores[opt] : (typeof profile[opt] === 'number' ? profile[opt] : 0)), 1);
      num += weight; den += maxWeight; answered += 1;
    });
    if (den > 0) { overallNum += num; overallDen += den; }
    perSection[sec.id] = { title: sec.title, percent: den > 0 ? (num/den)*100 : null, answered };
  });
  const overall = overallDen > 0 ? (overallNum/overallDen)*100 : null;
  return { perSection, overall };
}

function renderReview() {
  const body = document.getElementById('reviewBody');
  body.innerHTML = '';
  const score = computePreviewScore();
  for (const [sid, v] of Object.entries(score.perSection)) {
    const row = document.createElement('div');
    row.textContent = `${v.title}: ${typeof v.percent === 'number' ? Math.round(v.percent) + '%' : 'n/a'} (${v.answered} answered)`;
    body.appendChild(row);
  }
  const overall = document.createElement('div');
  overall.style.fontWeight = '600';
  overall.textContent = `Overall: ${typeof score.overall === 'number' ? Math.round(score.overall) + '%' : 'n/a'}`;
  body.appendChild(overall);
}

function setOpenAutoHeight(panelEl) {
  // Animate to content height then remove max-height so content can grow
  panelEl.style.maxHeight = panelEl.scrollHeight + 'px';
  const onEnd = (e) => {
    if (e.propertyName !== 'max-height') return;
    panelEl.style.maxHeight = 'none';
    panelEl.removeEventListener('transitionend', onEnd);
  };
  panelEl.addEventListener('transitionend', onEnd);
}

function setCloseHeight(panelEl) {
  // If set to 'none', set to current height first to enable transition
  if (getComputedStyle(panelEl).maxHeight === 'none') {
    panelEl.style.maxHeight = panelEl.scrollHeight + 'px';
  }
  requestAnimationFrame(() => { panelEl.style.maxHeight = '0px'; });
}

function toggleItem(item, panel, parentSectionPanel) {
  const id = item.dataset.qid;
  const isOpen = item.classList.toggle('open');
  if (isOpen) {
    state.expanded.add(id);
    setOpenAutoHeight(panel);
  } else {
    state.expanded.delete(id);
    setCloseHeight(panel);
  }
  // Recompute parent section height if open
  if (parentSectionPanel && parentSectionPanel.parentElement?.classList.contains('section') && parentSectionPanel.parentElement.classList.contains('open')) {
    if (getComputedStyle(parentSectionPanel).maxHeight === 'none') {
      // already auto-sizing; nothing to do
    } else {
      parentSectionPanel.style.maxHeight = parentSectionPanel.scrollHeight + 'px';
    }
  }
}

function toggleSection(sectionEl, secPanel) {
  const id = sectionEl.dataset.sid;
  const isOpen = sectionEl.classList.toggle('open');
  if (isOpen) {
    state.sectionExpanded.add(id);
    setOpenAutoHeight(secPanel);
  } else {
    state.sectionExpanded.delete(id);
    setCloseHeight(secPanel);
  }
}

function onSelectOption(q, opt, item, optionsContainer) {
  state.answers[q.id] = opt;
  $all('.option', optionsContainer).forEach((b) => b.setAttribute('aria-pressed', b.textContent === opt ? 'true' : 'false'));

  const extra = item.querySelector('.extra');
  updateExtra(extra, q, opt);

  // Recalculate panel height so the accordion expands to fit new content
  const panel = item.querySelector('.panel');
  if (item.classList.contains('open') && panel) {
    if (getComputedStyle(panel).maxHeight === 'none') {
      // already auto-sizing, nothing needed
    } else {
      panel.style.maxHeight = panel.scrollHeight + 'px';
    }
  }
  // Also recalc parent section height
  const parentSectionPanel = item.closest('.section')?.querySelector('.section-panel');
  const sectionEl = item.closest('.section');
  if (sectionEl && sectionEl.classList.contains('open') && parentSectionPanel) {
    if (getComputedStyle(parentSectionPanel).maxHeight === 'none') {
      // already auto-sizing
    } else {
      parentSectionPanel.style.maxHeight = parentSectionPanel.scrollHeight + 'px';
    }
  }
}

function updateExtra(extraEl, q, selected) {
  const text = q.details?.[selected];
  extraEl.textContent = text || '';
}

function openCaseStudy(cs) {
  const modal = $('#mediaModal');
  const body = $('#modalBody');
  body.innerHTML = '';

  if (cs.type === 'video' && cs.src) {
    const v = document.createElement('video');
    v.controls = true;
    v.autoplay = true;
    v.src = cs.src;
    v.setAttribute('playsinline', '');
    body.appendChild(v);
  } else if (cs.type === 'image' && cs.src) {
    const img = document.createElement('img');
    img.alt = cs.title || 'Case study image';
    img.src = cs.src;
    body.appendChild(img);
  } else {
    const p = document.createElement('p');
    p.textContent = 'Add a video or image source in the question configuration.';
    body.appendChild(p);
  }

  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = $('#mediaModal');
  const body = $('#modalBody');
  body.innerHTML = '';
  modal.setAttribute('aria-hidden', 'true');
}

function wireModal() {
  document.body.addEventListener('click', (e) => {
    if (e.target && e.target.hasAttribute('data-close-modal')) {
      closeModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

async function submitForm(e) {
  e.preventDefault();
  const emailEl = document.getElementById('email');
  const msgEl = document.getElementById('formMessage');
  msgEl.textContent = '';
  const email = emailEl.value.trim();

  if (!/.+@.+\..+/.test(email)) {
    msgEl.textContent = 'Please enter a valid email.';
    emailEl.focus();
    return;
  }

  const payload = {
    email,
    answers: state.answers,
    meta: {
      page: location.pathname,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      persona: state.persona || 'default',
    },
  };

  try {
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    msgEl.textContent = 'Thanks! We received your submission.';
    e.target.reset();
  } catch (err) {
    msgEl.textContent = 'Submit failed. Please try again.';
  }
}

function wireForm() {
  const form = document.getElementById('submitForm');
  form.addEventListener('submit', submitForm);
}

document.addEventListener('DOMContentLoaded', () => {
  Promise.all([loadSections(), loadPersonas(), loadScoring()]).then(() => {
    renderPersonaSelector();
    wireModal();
    wireForm();
    const back = document.getElementById('backBtn');
    const next = document.getElementById('nextBtn');
    back.addEventListener('click', () => setStep(state.step - 1));
    next.addEventListener('click', () => {
      const filtered = getFilteredSections();
      const total = 2 + filtered.length;
      const maxIndex = total - 1;
      if (state.step === maxIndex) {
        // submit programmatically
        document.getElementById('submitForm').requestSubmit();
      } else {
        setStep(state.step + 1);
      }
    });
    // Initial step
    setStep(0);
    // Resize recalculation for any open panels
    window.addEventListener('resize', () => {
      document.querySelectorAll('.item.open .panel').forEach((p) => {
        if (getComputedStyle(p).maxHeight === 'none') return;
        p.style.maxHeight = p.scrollHeight + 'px';
      });
      document.querySelectorAll('.section.open .section-panel').forEach((p) => {
        if (getComputedStyle(p).maxHeight === 'none') return;
        p.style.maxHeight = p.scrollHeight + 'px';
      });
    });
  });
});


