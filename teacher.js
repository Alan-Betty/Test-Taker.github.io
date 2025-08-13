// --- Teacher App ---
// Requirements: firebase compat libs loaded + firebaseConfig + HTML has:
// Tabs: #tabList, #tabEditor, #tabMonitor
// Sections: #listSection, #editorSection, #monitorSection
// List: #testsWrap
// Editor: #testTitle, #testDuration, #questions, #addQuestionBtn, #publishBtn, #joinCode
// Monitor: #monitorTestTitle, #monitorCode, #studentList

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(),
    auth = firebase.auth();

const tabList = document.getElementById('tabList');
const tabEditor = document.getElementById('tabEditor');
const tabMonitor = document.getElementById('tabMonitor');
const listSection = document.getElementById('listSection');
const editorSection = document.getElementById('editorSection');
const monitorSection = document.getElementById('monitorSection');

function show(section) {
    [listSection, editorSection, monitorSection].forEach(s => s.style.display = 'none');
    [tabList, tabEditor, tabMonitor].forEach(t => t.classList.remove('active'));
    if (section === 'list') { listSection.style.display = 'block'; tabList.classList.add('active') }
    if (section === 'editor') { editorSection.style.display = 'block'; tabEditor.classList.add('active') }
    if (section === 'monitor') { monitorSection.style.display = 'block'; tabMonitor.classList.add('active') }
}
tabList.onclick = () => show('list');
tabEditor.onclick = () => show('editor');
tabMonitor.onclick = () => show('monitor');

let currentCode = null, currentTest = null, unsubMonitor = null, unsubStatus = null;

auth.onAuthStateChanged(async u => {
    if (!u) return;
    loadTests();
});

async function loadTests() {
    const u = auth.currentUser;
    if (!u) return;

    let snap;
    try {
        snap = await db.collection('tests')
            .where('teacherId', '==', u.uid)
            .orderBy('createdAt', 'desc')
            .get();
    } catch {
        snap = await db.collection('tests').where('teacherId', '==', u.uid).get();
    }

    const wrap = document.getElementById('testsWrap'); 
    wrap.innerHTML = '';
    if (snap.empty) {
        wrap.innerHTML = '<div class="test-item"><div class="meta"><strong>No tests yet.</strong><span class="sub">Click “New Test” to create one.</span></div></div>'; 
        return;
    }

    snap.forEach(doc => {
        const t = doc.data();
        const div = document.createElement('div'); 
        div.className = 'test-item';
        const created = t.createdAt?.toDate ? t.createdAt.toDate() : null;
        const tsString = created ? created.toLocaleString() : 'Unknown time';

        // Add placeholders for counts and status
        div.innerHTML = `
      <div class="meta">
        <div style="font-weight:800">${t.title || 'Untitled'}</div>
        <div class="sub" style="color:var(--sub)">
            Duration: ${t.duration || 0} min • Created: ${tsString}
        </div>
        <div style="margin-top:4px; font-size:0.9em;">
            <span class="status-label">Status: ${t.status || 'Pending'}</span>
            • <span class="submitted-count">Submitted: 0</span>
            / <span class="active-count">Active: 0</span>
        </div>
      </div>
      <div class="row">
        <span class="code-pill">Code: ${doc.id}</span>
        <button class="btn ghost" data-code="${doc.id}" data-act="edit">Edit</button>
        <button class="btn ghost" data-code="${doc.id}" data-title="${t.title || ''}" data-act="monitor">Monitor</button>
        <button class="btn ghost delete-btn" data-code="${doc.id}" data-act="delete">🗑</button>
      </div>`;
        wrap.appendChild(div);

        // Real-time listener for responses of this test only
        db.collection('tests').doc(doc.id)
            .collection('responses')
            .where('testCode', '==', doc.id) // filter only this test's participants
            .onSnapshot(resSnap => {
                let submitted = 0, active = 0;
                resSnap.forEach(d => {
                    const data = d.data();
                    if (data.tabStatus === 'Submitted') submitted++;
                    else active++;
                });
                div.querySelector('.submitted-count').textContent = `Submitted: ${submitted}`;
                div.querySelector('.active-count').textContent = `Active: ${active}`;

                // Update status color & text
                const statusEl = div.querySelector('.status-label');
                let label = t.status || 'Pending';
                let color = '#555';

                if (t.status === 'pending') { 
                    label = 'Pending'; 
                    color = 'red'; 
                } 
                else if (t.status === 'active') {
                    label = 'Started'; 
                    color = 'green';
                    if (t.startedAt && t.duration) {
                        const startedMs = t.startedAt.toMillis ? t.startedAt.toMillis() : new Date(t.startedAt).getTime();
                        const total = (t.duration || 0) * 60000;
                        const elapsed = Math.max(0, Date.now() - startedMs);
                        const remaining = Math.max(0, total - elapsed);
                        if (elapsed >= total / 2 && remaining > 0) { 
                            label = 'Midway'; 
                            color = 'orange'; 
                        }
                    }
                } 
                else if (t.status === 'ended') { 
                    label = 'Ended'; 
                    color = 'red'; 
                }

                statusEl.textContent = `Status: ${label}`;
                statusEl.style.color = color;
                statusEl.style.fontWeight = 'bold';
            });
    });

    // Button click handlers including Delete
    wrap.querySelectorAll('button').forEach(b => {
        b.onclick = async (e) => {
            const code = e.currentTarget.dataset.code;
            const act = e.currentTarget.dataset.act;
            if (act === 'edit') { openEditor(code); }
            else if (act === 'monitor') { openMonitor(code, e.currentTarget.dataset.title || ''); }
            else if (act === 'delete') {
                if (confirm('Are you sure you want to delete this test?')) {
                    // Delete test doc
                    await db.collection('tests').doc(code).delete();
                    // Delete all responses in batch
                    const responsesSnap = await db.collection('tests').doc(code).collection('responses').get();
                    const batch = db.batch();
                    responsesSnap.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    await loadTests(); // refresh list
                }
            }
        }
    });
}




document.getElementById('newTestBtn').onclick = () => {
    // Always new ID for new test
    currentCode = null;
    currentTest = null;
    document.getElementById('testTitle').value = '';
    document.getElementById('testDuration').value = '';
    document.getElementById('questions').innerHTML = '';
    addQuestionCard();
    document.getElementById('joinCode').innerHTML = '';
    show('editor');
};

async function openEditor(code) {
    const doc = await db.collection('tests').doc(code).get();
    if (!doc.exists) return;
    currentCode = code;
    currentTest = doc.data();
    document.getElementById('testTitle').value = currentTest.title || '';
    document.getElementById('testDuration').value = currentTest.duration || 60;
    const qWrap = document.getElementById('questions');
    qWrap.innerHTML = '';
    (currentTest.questions || []).forEach(q => addQuestionCard(q));
    document.getElementById('joinCode').innerHTML = `< div class="test-code-banner" > Test Code: ${ code }</ > `;
    show('editor');
}

function addOption(el) {
    const box = el.parentElement;
    const n = box.querySelectorAll('.option-input').length + 1;
    const input = document.createElement('input');
    input.className = 'option-input';
    input.placeholder = `Option ${ n } `;
    input.oninput = syncCorrectOptions;
    box.insertBefore(input, el);
    syncCorrectOptions();
}
function deleteCard(el) {
    el.closest('.question-card').remove();
    syncCorrectOptions();
}
function toggleRequired(el) { el.classList.toggle('on'); }

function syncCorrectOptions() {
    document.querySelectorAll('.question-card').forEach(card => {
        const opts = [...card.querySelectorAll('.option-input')].map(i => i.value.trim()).filter(Boolean);
        const sel = card.querySelector('.correct-select');
        const prev = sel.value;
        sel.innerHTML = '';
        opts.forEach((o, i) => {
            const op = document.createElement('option'); op.value = String(i + 1); op.textContent = `${ i + 1 } – ${ o || 'Option ' + (i + 1) } `;
            sel.appendChild(op);
        });
        if (opts.length === 0) { const op = document.createElement('option'); op.value = '1'; op.textContent = '1'; sel.appendChild(op); }
        if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    });
}

function addQuestionCard(pref) {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.innerHTML = `
            < div class="q-grid" >
                <input class="q-text" placeholder="Question" value="${pref?.question ? pref.question.replace(/" /g, '&quot;') : ''
} ">
    < select class="select q-type" >
        <option value="multiple"${pref?.type === 'multiple' ? ' selected' : ''}>Multiple choice</option>
        <option value="checkboxes"${pref?.type === 'checkboxes' ? ' selected' : ''}>Checkboxes</option>
        <option value="dropdown"${pref?.type === 'dropdown' ? ' selected' : ''}>Dropdown</option>
      </select >
    </div >
    <div class="options"></div>
    <div class="correct-wrap">
      <label>Correct:</label>
      <select class="select correct-select"></select>
      <div class="right-actions">
        <div class="switch ${pref && pref.required ? 'on' : ''}" onclick="toggleRequired(this)">
          <div class="knob"></div>
        </div>
        <span class="req-label">Required</span>
        <button class="icon-btn delete-btn" title="Delete" onclick="deleteCard(this)">🗑</button>
      </div>
    </div>
`;

    const opts = card.querySelector('.options');
    const base = (pref?.options && pref.options.length ? pref.options : ['', '']).slice();
    base.forEach((v, i) => {
        const inp = document.createElement('input');
        inp.className = 'option-input'; inp.placeholder = `Option ${ i + 1 } `; inp.value = v || '';
        inp.oninput = syncCorrectOptions;
        opts.appendChild(inp);
    });

    const add = document.createElement('div');
    add.className = 'add-option';
    add.textContent = '+ Add option';
    add.onclick = function () { addOption(this) };
    opts.appendChild(add);

    document.getElementById('questions').appendChild(card);
    syncCorrectOptions();
    if (pref?.correct) card.querySelector('.correct-select').value = String(pref.correct);
}

window.addOption = addOption;
window.deleteCard = deleteCard;
window.toggleRequired = toggleRequired;

document.getElementById('addQuestionBtn').onclick = () => addQuestionCard();

function validate() {
    const title = document.getElementById('testTitle').value.trim();
    const dur = parseInt(document.getElementById('testDuration').value);
    if (!title) return { ok: false, msg: 'Enter test title', el: document.getElementById('testTitle') };
    if (!(dur > 0)) return { ok: false, msg: 'Duration must be > 0', el: document.getElementById('testDuration') };
    const cards = [...document.querySelectorAll('.question-card')];
    if (cards.length === 0) return { ok: false, msg: 'Add at least one question' };
    for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const q = c.querySelector('.q-text').value.trim();
        const opts = [...c.querySelectorAll('.option-input')].map(x => x.value.trim()).filter(Boolean);
        const corr = parseInt(c.querySelector('.correct-select').value || '1');
        if (!q) return { ok: false, msg: `Q${ i + 1 }: question is required`, el: c.querySelector('.q-text') };
        if (opts.length < 2) return { ok: false, msg: `Q${ i + 1 }: at least 2 options`, el: c.querySelector('.option-input') };
        if (!(corr >= 1 && corr <= opts.length)) return { ok: false, msg: `Q${ i + 1 }: correct must be 1..${ opts.length } `, el: c.querySelector('.correct-select') };
    }
    return { ok: true };
}

document.getElementById('publishBtn').onclick = async () => {
    const v = validate(); if (!v.ok) { alert(v.msg); v.el?.focus(); return; }
    const title = document.getElementById('testTitle').value.trim();
    const duration = parseInt(document.getElementById('testDuration').value);
    const qCards = [...document.querySelectorAll('.question-card')];
    const questions = qCards.map(c => ({
        question: c.querySelector('.q-text').value.trim(),
        type: c.querySelector('.q-type').value,
        options: [...c.querySelectorAll('.option-input')].map(i => i.value.trim()).filter(Boolean),
        correct: parseInt(c.querySelector('.correct-select').value),
        required: c.querySelector('.switch').classList.contains('on')
    }));

    let code = currentCode || Math.floor(100000 + Math.random() * 900000).toString();
    const payload = {
        title, duration, questions,
        teacherId: auth.currentUser?.uid || 'unknown',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending'
    };
    await db.collection('tests').doc(code).set(payload);
    currentCode = code;
    currentTest = payload;
    document.getElementById('joinCode').innerHTML = `< div class="test-code-banner" > Test Code: ${ code }</div > `;
    await loadTests();
    show('list');
};

// --- Monitor ---
function openMonitor(code, title) {
    currentCode = code;
    const monitorTitleEl = document.getElementById('monitorTestTitle');
    const monitorCodeEl = document.getElementById('monitorCode');
    const monitorSectionEl = document.getElementById('monitorSection');
    const studentListEl = document.getElementById('studentList');

    monitorTitleEl.textContent = title || '';
    monitorCodeEl.textContent = `Code: ${code}`;

    // Remove old status/count elements if any
    ['testStatus', 'monitorParticipantCount', 'monitorControls'].forEach(id => {
        const old = document.getElementById(id);
        if (old) old.remove();
    });

    // Status div
    const statusEl = document.createElement('div');
    statusEl.id = 'testStatus';
    statusEl.className = 'code-pill';
    statusEl.style.marginBottom = '10px';
    monitorSectionEl.prepend(statusEl);

    // Participant counts & controls
    const controls = document.createElement('div');
    controls.id = 'monitorControls';
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.marginBottom = '10px';
    controls.innerHTML = `
        <span id="monitorParticipantCount" style="color:var(--sub)">Submitted: 0 • Active: 0</span>
        <button id="startTestBtn" class="btn">Start Test</button>
        <button id="endTestBtn" class="btn ghost" style="display:none;">End Test</button>
    `;
    monitorSectionEl.prepend(controls);

    const startBtn = document.getElementById('startTestBtn');
    const endBtn = document.getElementById('endTestBtn');

    // Start / End logic
    startBtn.onclick = async () => {
        await db.collection('tests').doc(code).set({
            status: 'active',
            startedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        startBtn.disabled = true;
    };
    endBtn.onclick = async () => {
        await db.collection('tests').doc(code).set({ status: 'ended' }, { merge: true });
    };

    // Listen to test status changes
    if (unsubStatus) unsubStatus();
    unsubStatus = db.collection('tests').doc(code).onSnapshot(docSnap => {
        const t = docSnap.data() || {};
        let label = 'Pending', bgColor = '#555';
        if (t.status === 'active') {
            label = 'Active'; bgColor = 'var(--ok)';
            if (t.startedAt && t.duration) {
                const startedMs = t.startedAt.toMillis ? t.startedAt.toMillis() : new Date(t.startedAt).getTime();
                const total = (t.duration || 0) * 60000;
                const elapsed = Math.max(0, Date.now() - startedMs);
                const remaining = Math.max(0, total - elapsed);
                if (elapsed >= total / 2 && remaining > 0) {
                    label = 'Midway'; bgColor = 'orange';
                }
            }
            startBtn.style.display = 'none';
            endBtn.style.display = 'inline-block';
        } else if (t.status === 'ended') {
            label = 'Ended'; bgColor = 'var(--danger)';
            startBtn.style.display = 'inline-block'; startBtn.disabled = false;
            endBtn.style.display = 'none';
        } else { // pending
            label = 'Pending'; bgColor = '#555';
            startBtn.style.display = 'inline-block'; startBtn.disabled = false;
            endBtn.style.display = 'none';
        }
        statusEl.textContent = `Status: ${label}`;
        statusEl.style.background = bgColor;
    });

    // Listen to responses and update counts
    if (unsubMonitor) unsubMonitor();
    unsubMonitor = db.collection('tests').doc(code).collection('responses')
        .onSnapshot(snap => {
            let submitted = 0, active = 0;
            studentListEl.innerHTML = '';
            snap.forEach(d => {
                const data = d.data();
                if (data.tabStatus === 'Submitted') submitted++;
                else active++;

                const answersCount = countAnswered(data.answers);
                const score = (currentTest?.questions) ? calcScore(currentTest.questions, data.answers || {}) : '—';
                const li = document.createElement('li');
                li.className = data.tabStatus === 'Submitted' ? 'active' : 'active';
                const st = data.tabStatus === 'Submitted' ? '✔ Submitted' :
                    (data.tabStatus === 'Out of Tab' ? 'Out of Tab' : 'Active');
                li.innerHTML = `
                    <div><strong>${data.name || 'Student'}</strong></div>
                    <div>Answered: ${answersCount}/${(currentTest?.questions || []).length} • Score: ${score}/${(currentTest?.questions || []).length} • ${st}</div>
                `;
                studentListEl.appendChild(li);
            });

            const countEl = document.getElementById('monitorParticipantCount');
            if (countEl) countEl.textContent = `Submitted: ${submitted} • Active: ${active}`;
        });

    show('monitor');
}


function countAnswered(answers) {
    if (!answers) return 0;
    let n = 0; for (const k in answers) {
        const v = answers[k];
        if (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null) n++;
    }
    return n;
}
function calcScore(questions, answers) {
    let s = 0;
    questions.forEach((q, i) => {
        const key = 'q' + i;
        if (q.type === 'checkboxes') {
            const corr = [q.correct].flat().sort((a, b) => a - b);
            const got = [...(answers?.[key] || [])].map(Number).sort((a, b) => a - b);
            if (corr.length === got.length && corr.every((v, idx) => v === got[idx])) s++;
        } else {
            if ((answers?.[key] | 0) === q.correct) s++;
        }
    });
    return s;
}
