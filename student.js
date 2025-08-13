// --- Student App ---
// Requirements: firebase compat libs loaded + firebaseConfig + HTML has:
// #studentName, #testCode, #joinBtn, #testMeta, #testTitle, #testBanner,
// #testArea, #testForm, #submitBtn
// Optional: a wrapper for the join form with id="joinForm" or .join-section

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let studentId = 's_' + Math.random().toString(36).slice(2, 10);
let currentCode = '', studentName = '', order = [], test = null;
let answers = {};
let unsubTestStatus = null;
let timerInterval = null;
let hasSubmitted = false; // track submission state

(function injectStyles() {
    const css = `
  .loader {
    border: 4px solid var(--bg,#0f1720);
    border-top: 4px solid var(--ink,#e6edf3);
    border-radius: 50%;
    width: 44px; height: 44px;
    animation: spin 1s linear infinite;
    margin: 0 auto 10px;
  }
  @keyframes spin { 100% { transform: rotate(360deg); } }
  .timer-wrap { display:flex; gap:10px; align-items:center; justify-content:center; margin:10px 0; }
  .timer-svg { width:64px; height:64px; transform: rotate(-90deg); }
  .timer-bg { stroke: rgba(255,255,255,0.15); stroke-width: 8; fill: none; }
  .timer-fg { stroke: var(--ink,#e6edf3); stroke-width: 8; fill: none; stroke-linecap: round; stroke-dasharray: 283; stroke-dashoffset: 0; transition: stroke-dashoffset .3s linear; }
  .timer-text { font-weight: 800; letter-spacing: .5px; color: var(--ink,#e6edf3); }
  .timer-tag { font-size:.85rem; color: var(--sub,#9fb0c0); }
  .pop-animation { animation: pop 600ms ease forwards; }
  @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
  #waitScreen { padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
  `;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
})();

// Timer UI
const timerWrap = document.createElement('div');
timerWrap.className = 'timer-wrap';
timerWrap.style.display = 'none';
timerWrap.innerHTML = `
  <svg class="timer-svg" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="timer-bg" cx="50" cy="50" r="45"></circle>
    <circle class="timer-fg" id="timerFg" cx="50" cy="50" r="45"></circle>
  </svg>
  <div class="timer-text">
    <div id="timerDisplay">--:--</div>
    <div class="timer-tag">time left</div>
  </div>
`;

// Waiting + Results screens
const waitScreen = document.createElement('div');
waitScreen.id = 'waitScreen';
waitScreen.style.display = 'none';
waitScreen.style.textAlign = 'center';
waitScreen.innerHTML = `
  <div class="loader"></div>
  <h2 style="margin:6px 0 0 0;">Waiting for host to start the test...</h2>
  <div style="color:var(--sub,#9fb0c0); margin-top:4px;">Keep this tab open. Your test will begin automatically.</div>
`;

const resultScreen = document.createElement('div');
resultScreen.id = 'resultScreen';
resultScreen.style.display = 'none';
resultScreen.style.textAlign = 'center';
resultScreen.innerHTML = `
  <h2>Results</h2>
  <div id="scoreAnim" style="font-size:2rem;font-weight:bold;"></div>
  <div id="resultDetails" style="margin-top:8px;"></div>
  <button id="joinAnotherBtn" class="btn" style="margin-top:12px;">Join Another Test</button>
`;

const testArea = document.getElementById('testArea');
testArea.before(waitScreen);
testArea.before(timerWrap);
document.body.appendChild(resultScreen);

document.getElementById('joinAnotherBtn')?.addEventListener('click', () => location.reload());

function hideJoinForm() {
    const joinForm = document.getElementById('joinForm') || document.querySelector('.join-section');
    if (joinForm) joinForm.style.display = 'none';
    else {
        ['studentName', 'testCode', 'joinBtn'].forEach(id => {
            const el = document.getElementById(id); if (el) el.style.display = 'none';
        });
    }
}

document.getElementById('joinBtn').onclick = async () => {
    currentCode = document.getElementById('testCode').value.trim();
    studentName = document.getElementById('studentName').value.trim();
    if (!currentCode || !studentName) { alert('Enter your name and test code'); return; }

    hideJoinForm();

    const tDoc = await db.collection('tests').doc(currentCode).get();
    if (!tDoc.exists) { alert('Invalid test code'); return; }
    test = tDoc.data();
    if (!test.questions?.length) { alert('No questions in this test'); return; }

    const respRef = db.collection('tests').doc(currentCode).collection('responses').doc(studentId);
    const respSnap = await respRef.get();
    if (respSnap.exists && Array.isArray(respSnap.data().order) && respSnap.data().order.length === test.questions.length) {
        order = respSnap.data().order;
    } else {
        order = [...Array(test.questions.length).keys()].sort(() => Math.random() - 0.5);
        await respRef.set({ name: studentName, tabStatus: 'Active', answers: {}, order }, { merge: true });
    }

    document.getElementById('testMeta').style.display = 'flex';
    document.getElementById('testTitle').textContent = test.title || '';
    document.getElementById('testBanner').textContent = 'Code: ' + currentCode;

    // Presence tracking — skip tab change after submission
    document.addEventListener('visibilitychange', async () => {
        if (hasSubmitted) return; // prevent "Out of Tab" after submit
        await respRef.set({ name: studentName, tabStatus: document.hidden ? 'Out of Tab' : 'Active' }, { merge: true });
    });
    await respRef.set({ name: studentName, tabStatus: 'Active' }, { merge: true });

    unsubTestStatus = db.collection('tests').doc(currentCode).onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data(); test = data;

        if (data.status === 'pending' || !data.status) {
            waitScreen.style.display = 'block';
            waitScreen.querySelector('h2').textContent = 'Host has not started the test yet...';
            testArea.style.display = 'none';
            timerWrap.style.display = 'none';
            resultScreen.style.display = 'none';
        }

        if (data.status === 'active') {
            waitScreen.style.display = 'none';
            resultScreen.style.display = 'none';
            testArea.style.display = 'block';
            timerWrap.style.display = 'flex';
            renderQuestions();
            startTimer(data.startedAt ? data.startedAt.toDate() : null, data.duration || 0);
        }

        if (data.status === 'ended') {
            if (testArea.style.display !== 'none') {
                autoSubmit();
            }
        }
    });
};

function startTimer(startedAt, durationMin) {
    clearInterval(timerInterval);
    const fg = document.getElementById('timerFg');
    const label = document.getElementById('timerDisplay');
    if (!startedAt || !durationMin) { label.textContent = '--:--'; return; }

    const endTime = startedAt.getTime() + durationMin * 60000;
    const circumference = 2 * Math.PI * 45;

    const tick = () => {
        const now = Date.now();
        const remaining = Math.max(0, endTime - now);
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        label.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

        const fraction = remaining / (durationMin * 60000);
        fg.style.strokeDasharray = `${circumference}`;
        fg.style.strokeDashoffset = `${circumference * (1 - Math.max(0, Math.min(1, fraction)))}`;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            label.textContent = '0:00';
            autoSubmit();
        }
    };

    tick();
    timerInterval = setInterval(tick, 1000);
}

function renderQuestions() {
    const form = document.getElementById('testForm'); form.innerHTML = '';
    order.forEach((origIdx, i) => {
        const q = test.questions[origIdx];
        const card = document.createElement('div'); card.className = 'question-card';
        const reqBadge = q.required ? '<span class="code-pill" style="background:#2a3548;color:var(--ink)">Required</span>' : '';
        let body = '';
        if (q.type === 'dropdown') {
            const opts = q.options.map((o, idx) => `<option value="${idx + 1}">${o}</option>`).join('');
            body = `<select class="select pretty" name="q${origIdx}"><option value="">Select...</option>${opts}</select>`;
        } else if (q.type === 'checkboxes') {
            body = q.options.map((o, idx) => `
        <label class="choice">
          <input type="checkbox" name="q${origIdx}" value="${idx + 1}">
          <span>${o}</span>
        </label>
      `).join('');
        } else {
            body = q.options.map((o, idx) => `
        <label class="choice">
          <input type="radio" name="q${origIdx}" value="${idx + 1}">
          <span>${o}</span>
        </label>
      `).join('');
        }
        card.innerHTML = `
      <div class="q-grid" style="grid-template-columns:1fr auto">
        <div class="q-text" style="border:0;padding:0;font-weight:800">${i + 1}. ${q.question}</div>
        ${reqBadge}
      </div>
      <div class="options" style="margin-top:6px">${body}</div>
    `;
        form.appendChild(card);
    });

    form.onchange = async (e) => {
        const name = e.target.name; if (!name) return;
        if (e.target.type === 'checkbox') {
            const group = [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(x => parseInt(x.value));
            answers[name] = group;
        } else {
            answers[name] = e.target.value ? parseInt(e.target.value) : null;
        }
        await db.collection('tests').doc(currentCode).collection('responses').doc(studentId)
            .set({ name: studentName, answers }, { merge: true });
    };
}

document.getElementById('submitBtn').onclick = async (e) => {
    e.preventDefault();
    autoSubmit();
};

async function autoSubmit() {
    if (hasSubmitted) return; // prevent double submit
    hasSubmitted = true;

    if (!currentCode || !test) return;

    const form = document.getElementById('testForm');
    if (form) {
        form.querySelectorAll('input[type="radio"]:checked').forEach(inp => answers[inp.name] = parseInt(inp.value));
        form.querySelectorAll('select').forEach(sel => { if (sel.value) answers[sel.name] = parseInt(sel.value); });
    }

    const ref = db.collection('tests').doc(currentCode).collection('responses').doc(studentId);
    await ref.set({ name: studentName, answers, tabStatus: 'Submitted' }, { merge: true });

    if (form) form.querySelectorAll('input,select,button').forEach(el => el.disabled = true);
    showResults();
}

async function showResults() {
    testArea.style.display = 'none';
    timerWrap.style.display = 'none';
    waitScreen.style.display = 'none';
    resultScreen.style.display = 'block';

    const testDoc = await db.collection('tests').doc(currentCode).get();
    const testData = testDoc.data() || { questions: [] };

    let score = 0;
    testData.questions.forEach((q, i) => {
        const key = 'q' + i;
        if (q.type === 'checkboxes') {
            const corr = [q.correct].flat().sort((a, b) => a - b);
            const got = [...(answers?.[key] || [])].map(Number).sort((a, b) => a - b);
            if (corr.length === got.length && corr.every((v, idx) => v === got[idx])) score++;
        } else {
            if ((answers?.[key] | 0) === q.correct) score++;
        }
    });
    const total = testData.questions.length;
    const correct = score;
    const wrong = total - score;

    const scoreEl = document.getElementById('scoreAnim');
    let display = 0;
    const step = () => {
        scoreEl.textContent = `${display}/${total}`;
        if (display < correct) {
            display++;
            requestAnimationFrame(step);
        } else {
            if (total > 0 && (correct / total) * 100 >= 60) scoreEl.classList.add('pop-animation');
        }
    };
    step();

    document.getElementById('resultDetails').textContent = `Correct: ${correct} • Wrong: ${wrong}`;
}
