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
const messaging = getMessaging(app);

window.db = db; 
window.auth = auth;
window.fs = { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, updateDoc, setDoc };
window.authFuncs = { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword };

let logs = [];
let allSessionsRaw = []; 
let exerciseDefinitions = [];
let workoutTemplates = [];
let editId = null;
let myChart = null;
let todayStatus = null;

// Dynamisches Datum im Header setzen (z.B. "DIENSTAG, 1. APR.")
function updateHeaderDate() {
    const dateEl = document.getElementById('dynamic-date');
    if(dateEl) {
        const options = { weekday: 'long', day: 'numeric', month: 'short' };
        dateEl.innerText = new Date().toLocaleDateString('de-DE', options).toUpperCase();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateHeaderDate();

    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const tabName = targetId.replace('view-', ''); 
            window.switchTab(tabName, this);
        });
    });
});

// --- AUTHENTIFIZIERUNG ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('main-wrapper').style.display = 'flex';
        initApp();
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('main-wrapper').style.display = 'none';
    }
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
    
    await window.checkMorningStatus();

    const exSnap = await window.fs.getDocs(window.fs.query(window.fs.collection(window.db, "exerciseDefs"), window.fs.where("userId", "==", user.uid)));
    exerciseDefinitions = []; exSnap.forEach(d => exerciseDefinitions.push({id: d.id, ...d.data()}));
    renderExerciseDefinitions();
    
    const tplSnap = await window.fs.getDocs(window.fs.query(window.fs.collection(window.db, "workoutTemplates"), window.fs.where("userId", "==", user.uid)));
    workoutTemplates = []; tplSnap.forEach(d => workoutTemplates.push({id: d.id, ...d.data()}));
    renderWorkoutTemplates(); updateTemplateDropdown();
    
    const tSnap = await window.fs.getDocs(window.fs.query(window.fs.collection(window.db, "sessions"), window.fs.orderBy("date", "asc")));
    allSessionsRaw = []; tSnap.forEach(d => allSessionsRaw.push({id: d.id, ...d.data()}));
    logs = allSessionsRaw.filter(s => s.userId === user.uid).reverse();
    renderHistory(); updateBroExerciseDropdown();
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
        if(todayStatus.status === 'gym') text = "Bereit fürs Gym! Zerstör die Gewichte! 💪";
        if(todayStatus.status === 'rest') text = "Rest Day. Erhole dich gut! 🛋️";
        if(todayStatus.status === 'sick') text = "Krank. Kurier dich richtig aus! 🤒";
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
        let checkDate = new Date(); checkDate.setDate(checkDate.getDate() - i);
        let checkDateStr = checkDate.toLocaleDateString('en-CA');
        let status = logsMap[checkDateStr];
        
        if(i === 0 && !status) { continue; } 
        if(status === 'gym') { currentStreak++; } 
        else if(status === 'rest' || status === 'sick') { continue; } 
        else { break; }
    }
    const streakEl = document.getElementById('streak-counter');
    if(streakEl) streakEl.innerText = currentStreak;
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
    if(todayStatus && todayStatus.id && confirm("Tagesplan ändern?")) {
        await window.fs.deleteDoc(window.fs.doc(window.db, "dailyLogs", todayStatus.id));
        window.checkMorningStatus();
    }
};

window.requestNotifications = async function() {
    if (!("Notification" in window)) { alert("Nicht unterstützt."); return; }
    try {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            const currentToken = await getToken(messaging, { vapidKey: 'BHdfIhXEgwNgluSJbT_raqa4D50MoMGLRTSodojmEgo_h30SLjBMV7ChMAReILaAAeX73CtLbx6Ip9PqDysY39Q' });
            if (currentToken) {
                await window.fs.setDoc(window.fs.doc(window.db, "userTokens", window.auth.currentUser.uid), { token: currentToken, updatedAt: new Date().toISOString() });
                alert("Erfolgreich aktiviert!");
            }
        }
    } catch (error) { console.error(error); alert("Fehler: Als App zum Home-Bildschirm hinzufügen!"); }
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
        const div = document.createElement('div'); 
        div.style.display="flex"; div.style.justifyContent="space-between"; div.style.alignItems="center";
        div.style.padding = "8px 0"; div.style.borderBottom = "0.5px solid var(--ios-separator)";
        div.innerHTML = `<span style="font-size:16px; font-weight:500;">${ex.name}</span><button onclick="window.deleteExDef('${ex.id}')" class="btn-red-text">Löschen</button>`;
        list.appendChild(div);
    });
}

window.deleteExDef = async function(id) { if(confirm("Übung löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "exerciseDefs", id)); initApp(); } };

window.addTemplateExerciseSelector = function() {
    const container = document.getElementById('tpl-exercise-selector');
    const select = document.createElement('select'); select.className = "premium-input tpl-ex-item";
    let opts = exerciseDefinitions.map(ex => `<option value="${ex.name}">${ex.name}</option>`).join('');
    select.innerHTML = `<option value="">-- Übung wählen --</option>${opts}`;
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
        const div = document.createElement('div');
        div.style.padding = "10px 0"; div.style.borderBottom = "0.5px solid var(--ios-separator)";
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="font-size:16px;">${t.title}</b>
                <button onclick="window.deleteTpl('${t.id}')" class="btn-red-text">×</button>
            </div>
            <small style='color:var(--ios-label-dim); display:block; margin-top:4px;'>${t.exerciseNames.join(', ')}</small>`;
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
    
    let lastInfoHtml = "";
    if (name !== "") {
        const lastSessionWithEx = allSessionsRaw.filter(s => s.userId === window.auth.currentUser.uid).reverse().find(s => s.exercises.some(e => e.name === name));
        if (lastSessionWithEx) {
            const lastWeights = lastSessionWithEx.exercises.find(e => e.name === name).sets.map(st => st.kg + "kg").join(" | ");
            lastInfoHtml = `<div class="last-perf-badge">Letztes Mal: ${lastWeights}</div>`;
        }
    }

    let opts = exerciseDefinitions.map(ex => `<option value="${ex.name}" ${ex.name === name ? 'selected' : ''}>${ex.name}</option>`).join('');
    
    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
            <select class="premium-input ex-select" style="font-weight:700; margin:0; flex:1; background:rgba(255,255,255,0.1);" onchange="window.refreshExerciseBadge(this)">
                <option value="">-- Übung wählen --</option>${opts}
            </select>
            <button onclick="this.parentElement.parentElement.remove()" class="btn-red-text" style="font-size:24px; margin-left:12px;">×</button>
        </div>
        ${lastInfoHtml}
        <div class="sets-list"></div>
        <button onclick="window.addSetRow(this.previousElementSibling)" class="btn-text" style="margin-top:8px;">+ Satz hinzufügen</button>`;
    
    container.appendChild(div);
    const list = div.querySelector('.sets-list');
    if(sets.length > 0) sets.forEach(s => window.addSetRow(list, s.reps, s.kg)); 
    else window.addSetRow(list);
};

window.refreshExerciseBadge = function(selectEl) {
    const name = selectEl.value; const card = selectEl.parentElement.parentElement;
    const oldBadge = card.querySelector('.last-perf-badge'); if(oldBadge) oldBadge.remove();

    if(name) {
        const lastSessionWithEx = allSessionsRaw.filter(s => s.userId === window.auth.currentUser.uid).reverse().find(s => s.exercises.some(e => e.name === name));
        if (lastSessionWithEx) {
            const lastWeights = lastSessionWithEx.exercises.find(e => e.name === name).sets.map(st => st.kg + "kg").join(" | ");
            const badge = document.createElement('div'); badge.className = "last-perf-badge"; badge.innerText = `Letztes Mal: ${lastWeights}`;
            selectEl.parentElement.after(badge);
        }
    }
};

window.addSetRow = function(container, reps="", kg="") {
    const row = document.createElement('div'); 
    row.style.display = "grid"; row.style.gridTemplateColumns = "1fr 1fr 30px"; row.style.gap = "8px"; row.style.marginTop = "8px";
    row.innerHTML = `
        <input type="number" class="premium-input s-reps" placeholder="Reps" value="${reps}" style="margin:0;">
        <input type="number" class="premium-input s-weight" placeholder="kg" value="${kg}" style="margin:0;">
        <button onclick="this.parentElement.remove()" class="btn-red-text" style="display:flex; justify-content:center; align-items:center;">×</button>`;
    container.appendChild(row);
};

window.saveSession = async function() {
    const u = window.auth.currentUser;
    const b = document.querySelectorAll('#tracking-exercises .card');
    
    const checkInData = { energy: document.getElementById('checkin-energy').value, soreness: document.getElementById('checkin-soreness').value };

    let ex = []; 
    b.forEach(x => {
        const n = x.querySelector('.ex-select').value;
        const rs = x.querySelectorAll('.s-reps'), ws = x.querySelectorAll('.s-weight');
        let sets = []; for(let i=0; i<rs.length; i++) if(rs[i].value) sets.push({reps: rs[i].value, kg: ws[i].value});
        if(n) ex.push({name: n, sets: sets});
    });

    const data = { userId: u.uid, date: document.getElementById('session-date').value, title: document.getElementById('session-name').value || "Training", exercises: ex, checkIn: checkInData };

    if(editId) await window.fs.updateDoc(window.fs.doc(window.db, "sessions", editId), data);
    else await window.fs.addDoc(window.fs.collection(window.db, "sessions"), data);
    
    window.resetForm(); initApp();
};

window.deleteCurrentSession = async function() { 
    if(editId && confirm("Wirklich löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "sessions", editId)); window.resetForm(); await initApp(); } 
};

function renderHistory() {
    const h = document.getElementById('history'); h.innerHTML = "";
    logs.forEach(s => {
        const item = document.createElement('div'); item.className = "card";
        let exHtml = s.exercises.map(ex => `<div style="padding: 6px 0; border-bottom: 0.5px solid var(--ios-separator);"><span style="font-weight: 600; color:var(--ios-text);">${ex.name}</span><br><span style="color: var(--ios-label-dim); font-size: 14px;">${ex.sets.map(st => st.reps+'x'+st.kg).join(' · ')}</span></div>`).join('');
        item.innerHTML = `
            <button class="accordion-header" onclick="window.toggleAccordion(this)">
                <div><div style="font-weight:700; font-size:17px; letter-spacing:-0.3px;">${s.title}</div><small style="color:var(--ios-label-dim); font-weight:500;">${new Date(s.date).toLocaleDateString('de-DE')}</small></div>
                <div style="display:flex; align-items:center; gap: 12px;">
                    <div onclick="event.stopPropagation(); window.loadEdit('${s.id}')" class="btn-text">Edit</div>
                    <div class="chevron-icon">›</div>
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
    
    // Automatisch zum Loggen-Tab wechseln
    const logTab = document.querySelector('[data-target="view-loggen"]');
    if(logTab) window.switchTab('loggen', logTab);
};

window.resetForm = function() {
    editId = null; document.getElementById('session-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('session-name').value = ""; document.getElementById('tracking-exercises').innerHTML = "";
    document.getElementById('form-title').innerText = "Workout Loggen"; document.getElementById('edit-controls').style.display = "none";
};

// --- BRO PROGRESS ---
function updateBroExerciseDropdown() {
    const sel = document.getElementById('bro-exercise-select'); if (!sel) return;
    const cur = sel.value; sel.innerHTML = '<option value="">Übung für Graph wählen...</option>';
    exerciseDefinitions.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ex=>{ const opt=document.createElement('option'); opt.value=ex.name; opt.innerText=ex.name; sel.appendChild(opt); });
    sel.value = cur;
}

window.updateBroChart = function() {
    const exName = document.getElementById('bro-exercise-select')?.value; 
    if(!exName) { if(myChart) myChart.destroy(); return; }
    const uid = window.auth.currentUser.uid;
    const myD = [];
    allSessionsRaw.forEach(s => {
        const ex = s.exercises.find(e => e.name === exName);
        if(ex && s.userId === uid) {
            const max = Math.max(...ex.sets.map(st => parseFloat(st.kg) || 0));
            myD.push({x: s.date, y: max});
        }
    });
    const allY = [...myD.map(p=>p.y)];
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const range = maxY - minY, offset = range === 0 ? 10 : range * 0.25;
    
    // Premium Apple Fitness Chart Farben
    const ds = [{ label: 'Max KG', data: myD, borderColor: '#92E82A', backgroundColor: 'rgba(146, 232, 42, 0.15)', tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: '#000', pointBorderWidth: 2 }];
    
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
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }
            } 
        });
    }
};

// --- UI & HELPER ---
window.switchTab = function(tab, btn) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    
    const targetView = document.getElementById('view-' + tab);
    if(targetView) targetView.classList.add('active');
    
    if(btn) {
        btn.classList.add('active');
        const headerTitle = document.getElementById('header-title');
        const newTitle = btn.getAttribute('data-title');
        if (headerTitle && newTitle) headerTitle.textContent = newTitle;
    }

    if(tab === 'menu') { setTimeout(window.updateBroChart, 150); }
    
    const appContent = document.querySelector('.app-content');
    if (appContent) appContent.scrollTo({top: 0, behavior: 'smooth'});
};

window.toggleAccordion = function(element) {
    const card = element.closest('.card');
    if(card) card.classList.toggle('is-open');
};

if (document.getElementById('session-date')) document.getElementById('session-date').value = new Date().toISOString().split('T')[0];

const offlineBanner = document.getElementById('offline-banner');
if (offlineBanner && !navigator.onLine) { offlineBanner.style.display = 'block'; }
window.addEventListener('offline', () => { if(offlineBanner) offlineBanner.style.display = 'block'; });
window.addEventListener('online', () => {
    if(offlineBanner) offlineBanner.style.display = 'none';
    if (window.auth && window.auth.currentUser) initApp();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(err => console.error(err)); });
}
