import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, updateDoc, setDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

const firebaseConfig = {
    apiKey: "AIzaSyBsOrvObL2dpbV6H4HFNnHjGk_iDVJKdhs",
    authDomain: "my-gym-d5b6e.firebaseapp.com",
    projectId: "my-gym-d5b6e",
    storageBucket: "my-gym-d5b6e.firebasestorage.app",
    messagingSenderId: "262633382169",
    appId: "1:262633382169:web:13d6fc201eda300889e588"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
const messaging = getMessaging(app); // Der Postbote für Push-Nachrichten wird aktiviert

window.db = db; 
window.auth = auth;
window.fs = { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, updateDoc, setDoc };
window.authFuncs = { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword };

// App-Status
let logs = [];
let allSessionsRaw = []; 
let exerciseDefinitions = [];
let workoutTemplates = [];
let editId = null;
let myChart = null;
let broCalDate = new Date();
let todayStatus = null;

// Design Toggle Check beim Starten & Event-Listener für Navigation
window.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('theme') === 'light') {
        const toggle = document.getElementById('theme-toggle');
        if(toggle) toggle.checked = true;
    }

    // --- NEU: Navigation Event Listener (Health Design) ---
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            // Hier nutzen wir deine schon vorhandene Funktion switchTab!
            // Wir schneiden nur das "view-" ab, da switchTab das wieder anhängt.
            const tabName = targetId.replace('view-', ''); 
            window.switchTab(tabName, this);
        });
    });
});

// --- AUTHENTIFIZIERUNG ---
onAuthStateChanged(auth, (user) => {
    const ls = document.getElementById('loading-screen');
    if (user) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('main-wrapper').style.display = 'block'; // Achtung: in index.html ggf anpassen (App-Shell)
        initApp();
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('main-wrapper').style.display = 'none';
    }
    if(ls) { ls.style.opacity = '0'; setTimeout(() => ls.style.display = 'none', 500); }
});

window.handleLogin = async function() {
    try { await window.authFuncs.signInWithEmailAndPassword(window.auth, document.getElementById('email').value.trim(), document.getElementById('pass').value); }
    catch(e) { alert("Fehler: " + e.message); }
};

window.handleRegister = async function() {
    if(confirm("Konto erstellen?")) {
        try { await window.authFuncs.createUserWithEmailAndPassword(window.auth, document.getElementById('email').value.trim(), document.getElementById('pass').value); }
        catch(e) { alert("Fehler: " + e.message); }
    }
};

window.handleLogout = function() { 
    if(confirm("Wirklich abmelden?")) window.authFuncs.signOut(window.auth); 
};


// --- INITIALISIERUNG ---
async function initApp() {
    const user = window.auth.currentUser;
    if(!user) return;
    
    // Check Tagesstatus fürs Dashboard
    await window.checkMorningStatus();

    // Übungen & Vorlagen laden
    const exSnap = await window.fs.getDocs(window.fs.query(window.fs.collection(window.db, "exerciseDefs"), window.fs.where("userId", "==", user.uid)));
    exerciseDefinitions = []; exSnap.forEach(d => exerciseDefinitions.push({id: d.id, ...d.data()}));
    renderExerciseDefinitions();
    
    const tplSnap = await window.fs.getDocs(window.fs.query(window.fs.collection(window.db, "workoutTemplates"), window.fs.where("userId", "==", user.uid)));
    workoutTemplates = []; tplSnap.forEach(d => workoutTemplates.push({id: d.id, ...d.data()}));
    renderWorkoutTemplates(); updateTemplateDropdown();
    
    // Sessions laden
    const tSnap = await window.fs.getDocs(window.fs.query(window.fs.collection(window.db, "sessions"), window.fs.orderBy("date", "asc")));
    allSessionsRaw = []; tSnap.forEach(d => allSessionsRaw.push({id: d.id, ...d.data()}));
    logs = allSessionsRaw.filter(s => s.userId === user.uid).reverse();
    renderHistory(); updateBroExerciseDropdown();
    
    // Hinweis: Falls view-bro nicht im neuen HTML existiert, knallt es hier. Sicherstellen, dass das HTML passt.
    const viewBro = document.getElementById('view-bro');
    if(viewBro && viewBro.classList.contains('active')) window.updateBroChart();
}

// --- DASHBOARD: MORGEN CHECK-IN & STREAK ---
window.checkMorningStatus = async function() {
    const uid = window.auth.currentUser.uid;
    const dateStr = new Date().toLocaleDateString('en-CA');
    
    const q = window.fs.query(window.fs.collection(window.db, "dailyLogs"), window.fs.where("userId", "==", uid), window.fs.where("date", "==", dateStr));
    const snap = await window.fs.getDocs(q);
    
    if(!snap.empty) {
        todayStatus = snap.docs[0].data();
        todayStatus.id = snap.docs[0].id;
        document.getElementById('card-morning-checkin').style.display = 'none';
        document.getElementById('card-status-done').style.display = 'block';

        let text = "";
        if(todayStatus.status === 'gym') text = "Du gehst heute ins Gym! Zerstör die Gewichte! 💪";
        if(todayStatus.status === 'rest') text = "Heute ist Rest Day. Erhole dich gut! 🛋️";
        if(todayStatus.status === 'sick') text = "Du bist krank. Kurier dich richtig aus! 🤒";
        document.getElementById('today-status-text').innerText = text;
    } else {
        document.getElementById('card-morning-checkin').style.display = 'block';
        document.getElementById('card-status-done').style.display = 'none';
        todayStatus = null;
    }

    const allLogsQ = window.fs.query(window.fs.collection(window.db, "dailyLogs"), window.fs.where("userId", "==", uid));
    const allLogsSnap = await window.fs.getDocs(allLogsQ);
    
    let logsMap = {};
    allLogsSnap.forEach(doc => { logsMap[doc.data().date] = doc.data().status; });

    let currentStreak = 0;
    
    for(let i=0; i<365; i++) {
        let checkDate = new Date();
        checkDate.setDate(checkDate.getDate() - i);
        let checkDateStr = checkDate.toLocaleDateString('en-CA');
        
        let status = logsMap[checkDateStr];
        
        if(i === 0 && !status) { continue; } // Heute leer ist okay
        if(status === 'gym') {
            currentStreak++; 
        } else if(status === 'rest' || status === 'sick') {
            continue; // Rest Day / Krank friert die Streak ein
        } else {
            break; // Streak gebrochen
        }
    }
    document.getElementById('streak-counter').innerText = currentStreak;
};

window.saveMorningStatus = async function(statusType) {
    const uid = window.auth.currentUser.uid;
    const dateStr = new Date().toLocaleDateString('en-CA');
    const sleepVal = document.getElementById('dash-sleep').value;
    const data = { userId: uid, date: dateStr, sleep: sleepVal, status: statusType, timestamp: new Date().toISOString() };
    await window.fs.addDoc(window.fs.collection(window.db, "dailyLogs"), data);
    window.checkMorningStatus(); 
};

window.resetMorningStatus = async function() {
    if(todayStatus && todayStatus.id) {
        if(confirm("Möchtest du deinen Tagesplan ändern?")) {
            await window.fs.deleteDoc(window.fs.doc(window.db, "dailyLogs", todayStatus.id));
            window.checkMorningStatus();
        }
    }
};

// --- PUSH BENACHRICHTIGUNGEN ---
window.requestNotifications = async function() {
    if (!("Notification" in window)) { 
        alert("Dein Browser unterstützt leider keine Benachrichtigungen."); 
        return; 
    }
    
    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            const currentToken = await getToken(messaging, { vapidKey: 'BHdfIhXEgwNgluSJbT_raqa4D50MoMGLRTSodojmEgo_h30SLjBMV7ChMAReILaAAeX73CtLbx6Ip9PqDysY39Q' });
            
            if (currentToken) {
                const uid = window.auth.currentUser.uid;
                await window.fs.setDoc(window.fs.doc(window.db, "userTokens", uid), {
                    token: currentToken,
                    updatedAt: new Date().toISOString()
                });
                alert("Erfolgreich! Ab jetzt darf dir die App Erinnerungen schicken.");
            } else {
                alert("Konnte keinen Push-Token generieren.");
            }
        } else {
            alert("Benachrichtigungen wurden blockiert. Bitte erlaube sie in den Einstellungen deines Handys.");
        }
    } catch (error) {
        console.error("Fehler bei Push-Aktivierung:", error);
        alert("Fehler bei der Aktivierung: Du musst die Seite als App zum Home-Bildschirm hinzufügen!");
    }
};


// --- LISTEN & VORLAGEN ---
window.addExerciseDefinition = async function() {
    const n = document.getElementById('new-ex-name').value;
    if(!n) return;
    await window.fs.addDoc(window.fs.collection(window.db, "exerciseDefs"), { userId: window.auth.currentUser.uid, name: n });
    document.getElementById('new-ex-name').value = ""; initApp();
};

function renderExerciseDefinitions() {
    const list = document.getElementById('exercise-definitions-list'); list.innerHTML = "";
    exerciseDefinitions.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ex => {
        const div = document.createElement('div'); div.className = "list-item";
        div.style.display="flex"; div.style.justifyContent="space-between"; div.style.alignItems="center";
        div.innerHTML = `<span>${ex.name}</span><button onclick="window.deleteExDef('${ex.id}')" class="btn-red-text" style="min-height:30px;">Löschen</button>`;
        list.appendChild(div);
    });
}

window.deleteExDef = async function(id) { if(confirm("Übung löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "exerciseDefs", id)); initApp(); } };

window.addTemplateExerciseSelector = function() {
    const container = document.getElementById('tpl-exercise-selector');
    const select = document.createElement('select'); select.className = "tpl-ex-item";
    let opts = exerciseDefinitions.map(ex => `<option value="${ex.name}">${ex.name}</option>`).join('');
    select.innerHTML = `<option value="">-- Übung --</option>${opts}`;
    container.appendChild(select);
};

window.saveWorkoutTemplate = async function() {
    const t = document.getElementById('tpl-title').value;
    const s = document.querySelectorAll('.tpl-ex-item');
    let n = []; s.forEach(x => { if(x.value) n.push(x.value); });
    await window.fs.addDoc(window.fs.collection(window.db, "workoutTemplates"), { userId: window.auth.currentUser.uid, title: t, exerciseNames: n });
    document.getElementById('tpl-title').value = ""; document.getElementById('tpl-exercise-selector').innerHTML = ""; initApp();
};

function renderWorkoutTemplates() {
    const list = document.getElementById('workout-templates-list'); list.innerHTML = "";
    workoutTemplates.forEach(t => {
        const div = document.createElement('div'); div.className = "list-item";
        div.innerHTML = `<b>${t.title}</b><br><small style='color:var(--text-dim)'>${t.exerciseNames.join(', ')}</small><button onclick="window.deleteTpl('${t.id}')" class="btn-red-text" style="float:right; min-height:30px;">×</button>`;
        list.appendChild(div);
    });
}

window.deleteTpl = async function(id) { if(confirm("Vorlage löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "workoutTemplates", id)); initApp(); } };

function updateTemplateDropdown() {
    const sel = document.getElementById('load-tpl-select'); sel.innerHTML = '<option value="">Vorlage laden...</option>';
    workoutTemplates.forEach(t => { const opt = document.createElement('option'); opt.value = t.id; opt.innerText = t.title; sel.appendChild(opt); });
}

window.applyTemplate = function(tplId) {
    if(!tplId) return; const tpl = workoutTemplates.find(t => t.id === tplId);
    document.getElementById('session-name').value = tpl.title; document.getElementById('tracking-exercises').innerHTML = "";
    tpl.exerciseNames.forEach(name => window.addTrackingExercise(name)); document.getElementById('load-tpl-select').value = "";
};


// --- AKTIVITÄT & TRACKING ---
window.addTrackingExercise = function(name = "", sets = []) {
    const container = document.getElementById('tracking-exercises');
    const div = document.createElement('div'); 
    div.className = "card"; 
    div.style.background = "var(--input-bg)"; 
    div.style.marginBottom = "10px";
    
    let lastInfoHtml = "";
    if (name !== "") {
        const lastSessionWithEx = allSessionsRaw
            .filter(s => s.userId === window.auth.currentUser.uid)
            .reverse()
            .find(s => s.exercises.some(e => e.name === name));
            
        if (lastSessionWithEx) {
            const lastExData = lastSessionWithEx.exercises.find(e => e.name === name);
            const lastWeights = lastExData.sets.map(st => st.kg + "kg").join(" | ");
            lastInfoHtml = `<div class="last-perf-badge">Letztes Mal: ${lastWeights}</div>`;
        }
    }

    let opts = exerciseDefinitions.map(ex => `<option value="${ex.name}" ${ex.name === name ? 'selected' : ''}>${ex.name}</option>`).join('');
    
    div.innerHTML = `
        <select class="ex-select" style="font-weight:700; background: var(--card-bg);" onchange="window.refreshExerciseBadge(this)">
            <option value="">-- Übung --</option>${opts}
        </select>
        ${lastInfoHtml}
        <div class="sets-list"></div>
        <button onclick="window.addSetRow(this.previousElementSibling)" class="btn-text" style="font-size:14px;">+ Satz</button>
        <button onclick="this.parentElement.remove()" class="btn-red-text" style="float:right; font-size:24px; min-height:30px;">×</button>`;
    
    container.appendChild(div);
    const list = div.querySelector('.sets-list');
    if(sets.length > 0) sets.forEach(s => window.addSetRow(list, s.reps, s.kg)); 
    else window.addSetRow(list);
};

window.refreshExerciseBadge = function(selectEl) {
    const name = selectEl.value;
    const card = selectEl.parentElement;
    const oldBadge = card.querySelector('.last-perf-badge');
    if(oldBadge) oldBadge.remove();

    if(name) {
        const lastSessionWithEx = allSessionsRaw
            .filter(s => s.userId === window.auth.currentUser.uid)
            .reverse()
            .find(s => s.exercises.some(e => e.name === name));
            
        if (lastSessionWithEx) {
            const lastExData = lastSessionWithEx.exercises.find(e => e.name === name);
            const lastWeights = lastExData.sets.map(st => st.kg + "kg").join(" | ");
            const badge = document.createElement('div');
            badge.className = "last-perf-badge";
            badge.innerText = `Letztes Mal: ${lastWeights}`;
            selectEl.after(badge);
        }
    }
};

window.addSetRow = function(container, reps="", kg="") {
    const row = document.createElement('div'); row.style.display = "grid"; row.style.gridTemplateColumns = "1fr 1fr 30px"; row.style.gap = "8px"; row.style.marginTop = "8px";
    row.innerHTML = `<input type="number" class="s-reps" placeholder="Reps" value="${reps}" style="margin:0; background: var(--card-bg);"><input type="number" class="s-weight" placeholder="kg" value="${kg}" style="margin:0; background: var(--card-bg);"><button onclick="this.parentElement.remove()" class="btn-red-text" style="min-height:30px;">×</button>`;
    container.appendChild(row);
};

window.saveSession = async function() {
    const u = window.auth.currentUser;
    const b = document.querySelectorAll('#tracking-exercises .card');
    
    const checkInData = {
        energy: document.getElementById('checkin-energy').value,
        soreness: document.getElementById('checkin-soreness').value
    };

    let ex = []; 
    b.forEach(x => {
        const n = x.querySelector('.ex-select').value;
        const rs = x.querySelectorAll('.s-reps'), ws = x.querySelectorAll('.s-weight');
        let sets = []; for(let i=0; i<rs.length; i++) if(rs[i].value) sets.push({reps: rs[i].value, kg: ws[i].value});
        if(n) ex.push({name: n, sets: sets});
    });

    const data = { 
        userId: u.uid, 
        date: document.getElementById('session-date').value, 
        title: document.getElementById('session-name').value || "Training", 
        exercises: ex,
        checkIn: checkInData
    };

    if(editId) await window.fs.updateDoc(window.fs.doc(window.db, "sessions", editId), data);
    else await window.fs.addDoc(window.fs.collection(window.db, "sessions"), data);
    
    window.resetForm(); 
    initApp();
};

window.deleteCurrentSession = async function() { 
    if(editId && confirm("Wirklich löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "sessions", editId)); window.resetForm(); await initApp(); } 
};

function renderHistory() {
    const h = document.getElementById('history'); h.innerHTML = "";
    logs.forEach(s => {
        const item = document.createElement('div'); item.className = "card"; item.style.boxShadow = "none"; item.style.border = "1px solid var(--separator)";
        let exHtml = s.exercises.map(ex => `<div class="ex-line" style="padding-top: 5px;"><span class="ex-name-label" style="font-weight: 500;">${ex.name}:</span> <span style="color: var(--text-dim);">${ex.sets.map(st => st.reps+'x'+st.kg).join(' · ')}</span></div>`).join('');
        item.innerHTML = `
            <button class="accordion-header" onclick="window.toggleAccordion(this)">
                <div><div style="font-weight:600; font-size:17px;">${s.title}</div><small style="color:var(--text-dim)">${new Date(s.date).toLocaleDateString('de-DE')}</small></div>
                <div style="display:flex; align-items:center;">
                    <div onclick="event.stopPropagation(); window.loadEdit('${s.id}')" class="btn-text" style="padding:10px;">Edit</div>
                    <div class="chevron-icon"></div>
                </div>
            </button>
            <div class="collapsible-area">${exHtml}</div>`;
        h.appendChild(item);
    });
}

window.loadEdit = function(id) {
    const s = logs.find(l => l.id === id); editId = id; 
    document.getElementById('session-date').value = s.date; document.getElementById('session-name').value = s.title;
    document.getElementById('tracking-exercises').innerHTML = ""; s.exercises.forEach(ex => window.addTrackingExercise(ex.name, ex.sets));
    document.getElementById('form-title').innerText = "Bearbeiten"; document.getElementById('edit-controls').style.display = "block";
    window.scrollTo({top: 0, behavior: 'smooth'});
};

window.resetForm = function() {
    editId = null; document.getElementById('session-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('session-name').value = ""; document.getElementById('tracking-exercises').innerHTML = "";
    document.getElementById('form-title').innerText = "Neue Session"; document.getElementById('edit-controls').style.display = "none";
};


// --- BRO PROGRESS ---
function updateBroExerciseDropdown() {
    const sel = document.getElementById('bro-exercise-select');
    if (!sel) return;
    const cur = sel.value; sel.innerHTML = '<option value="">Übung wählen...</option>';
    exerciseDefinitions.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ex=>{ const opt=document.createElement('option'); opt.value=ex.name; opt.innerText=ex.name; sel.appendChild(opt); });
    sel.value = cur;
}

window.updateBroChart = function() {
    const exName = document.getElementById('bro-exercise-select')?.value; 
    if(!exName) { if(myChart) myChart.destroy(); return; }
    const compare = document.getElementById('compare-bro-toggle')?.checked;
    const uid = window.auth.currentUser.uid;
    const myD = [], broD = [];
    allSessionsRaw.forEach(s => {
        const ex = s.exercises.find(e => e.name === exName);
        if(ex) {
            const max = Math.max(...ex.sets.map(st => parseFloat(st.kg) || 0));
            if(s.userId === uid) myD.push({x: s.date, y: max}); else if(compare) broD.push({x: s.date, y: max});
        }
    });
    const allY = [...myD.map(p=>p.y), ...broD.map(p=>p.y)];
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const range = maxY - minY, offset = range === 0 ? 10 : range * 0.25;
    const ds = [{ label: 'Ich', data: myD, borderColor: '#0a84ff', backgroundColor: 'rgba(10, 132, 255, 0.1)', tension: 0.3, fill: true, pointRadius: 4 }];
    if(compare && broD.length > 0) ds.push({ label: 'Bruder', data: broD, borderColor: '#ff453a', backgroundColor: 'rgba(255, 69, 58, 0.1)', tension: 0.3, fill: true, pointRadius: 4 });
    if(myChart) myChart.destroy();
    const ctx = document.getElementById('progressChart')?.getContext('2d');
    if (ctx) {
        myChart = new Chart(ctx, { 
            type: 'line', data: { datasets: ds }, 
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    x: { display: false }, 
                    y: { min: minY - offset, max: maxY + offset, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8E8E93' } } 
                }, 
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { title: (items) => new Date(items[0].raw.x).toLocaleDateString('de-DE') } } }
            } 
        });
    }
};

window.changeBroMonth = function(v) { broCalDate.setMonth(broCalDate.getMonth() + v); window.renderBroCalendar(); };

window.renderBroCalendar = function() {
    const grid = document.getElementById('bro-calendar-days');
    if (!grid) return;
    grid.innerHTML = "";
    const compare = document.getElementById('compare-bro-toggle').checked;
    const uid = window.auth.currentUser.uid;
    const myDates = allSessionsRaw.filter(s => s.userId === uid).map(s => s.date);
    const broDates = allSessionsRaw.filter(s => s.userId !== uid).map(s => s.date);
    const first = new Date(broCalDate.getFullYear(), broCalDate.getMonth(), 1);
    const last = new Date(broCalDate.getFullYear(), broCalDate.getMonth() + 1, 0);
    document.getElementById('bro-cal-month').innerText = broCalDate.toLocaleString('de-de', {month:'long', year:'numeric'});
    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => { const el = document.createElement('div'); el.className="day-label"; el.style.color = "var(--text-dim)"; el.style.fontSize = "12px"; el.style.textAlign = "center"; el.innerText=d; grid.appendChild(el); });
    let start = (first.getDay() + 6) % 7;
    for (let i = 0; i < start; i++) grid.appendChild(document.createElement('div'));
    for (let d = 1; d <= last.getDate(); d++) {
        const ds = `${broCalDate.getFullYear()}-${String(broCalDate.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const div = document.createElement('div'); div.className = "cal-day"; div.innerText = d;
        const isMe = myDates.includes(ds), isBro = compare && broDates.includes(ds);
        if(isMe && isBro) div.classList.add('day-both'); else if(isMe) div.classList.add('day-me'); else if(isBro) div.classList.add('day-bro');
        grid.appendChild(div);
    }
};

// --- UI & HELPER ---
window.switchTab = function(tab, btn) {
    // 1. Alle Views verstecken
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    // 2. Alle Tabs un-markieren
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    
    // 3. View anzeigen, falls vorhanden
    const targetView = document.getElementById('view-' + tab);
    if(targetView) {
        targetView.classList.add('active');
    }
    
    // 4. Button als aktiv markieren (falls übergeben)
    if(btn) {
        btn.classList.add('active');
        // Header anpassen, wenn das Element existiert
        const headerTitle = document.getElementById('header-title');
        const newTitle = btn.getAttribute('data-title');
        if (headerTitle && newTitle) {
            headerTitle.textContent = newTitle;
        }
    }

    if(tab === 'bro') { updateBroExerciseDropdown(); window.renderBroCalendar(); setTimeout(window.updateBroChart, 150); }
    // Da wir jetzt scrollen im main (app-content) haben, müssen wir auch diesen scrollen, nicht mehr window
    const appContent = document.querySelector('.app-content');
    if (appContent) {
        appContent.scrollTo({top: 0, behavior: 'smooth'});
    } else {
        window.scrollTo({top: 0, behavior: 'smooth'}); // Fallback
    }
};

window.toggleAccordion = function(element) {
    const card = element.closest('.card');
    if(card) card.classList.toggle('is-open');
};

window.toggleHistoryView = function() {
    const container = document.getElementById('history-container');
    const chevron = document.getElementById('history-chevron');
    if (container.style.display === 'none') {
        container.style.display = 'block';
        chevron.style.transform = 'rotate(135deg)';
        chevron.style.borderColor = 'var(--system-blue)';
    } else {
        container.style.display = 'none';
        chevron.style.transform = 'rotate(45deg)';
        chevron.style.borderColor = 'var(--system-gray)';
    }
};

window.toggleTheme = function() {
    const isLight = document.getElementById('theme-toggle').checked;
    if(isLight) {
        document.documentElement.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
    }
};

if (document.getElementById('session-date')) {
    document.getElementById('session-date').value = new Date().toISOString().split('T')[0];
}

// --- OFFLINE / ONLINE ERKENNUNG ---
const offlineBanner = document.getElementById('offline-banner');
if (offlineBanner && !navigator.onLine) { offlineBanner.style.display = 'block'; }
window.addEventListener('offline', () => { if(offlineBanner) offlineBanner.style.display = 'block'; });
window.addEventListener('online', () => {
    if(offlineBanner) offlineBanner.style.display = 'none';
    if (window.auth && window.auth.currentUser) initApp();
});

// --- SERVICE WORKER (BUTLER) REGISTRIERUNG ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Butler (Service Worker) erfolgreich eingestellt!', reg))
            .catch(err => console.error('Butler hat gestreikt:', err));
    });
}
