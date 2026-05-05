import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, updateDoc, setDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

window.db = db; window.auth = auth;
window.fs = { collection, addDoc, getDocs, query, orderBy, where, deleteDoc, doc, updateDoc, setDoc };
window.authFuncs = { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword };

let logs = [];
let allSessionsRaw = []; 
let dailyLogsRaw = [];
let exerciseDefinitions = [];
let workoutTemplates = [];
let editId = null;
let editTplId = null;
let myChart = null;
let myWeightChart = null;
let broCalDate = new Date();
let todayStatus = null;

const BRAND_ORANGE = '#FF5E00';
const CHART_BG_ORANGE = 'rgba(255, 94, 0, 0.15)';

window.addEventListener('DOMContentLoaded', () => {
    const dateEl = document.getElementById('dynamic-date');
    if(dateEl) dateEl.innerText = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
    if(localStorage.getItem('theme') === 'light') {
        document.documentElement.classList.add('light-mode');
        if(document.getElementById('theme-toggle')) document.getElementById('theme-toggle').checked = true;
    }
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', function() {
            window.switchTab(this.getAttribute('data-target').replace('view-', ''), this);
        });
    });
});

window.toggleTheme = function() {
    const isLight = document.getElementById('theme-toggle').checked;
    if(isLight) { document.documentElement.classList.add('light-mode'); localStorage.setItem('theme', 'light'); }
    else { document.documentElement.classList.remove('light-mode'); localStorage.setItem('theme', 'dark'); }
};

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
window.handleLogout = function() { if(confirm("Wirklich abmelden?")) window.authFuncs.signOut(window.auth); };

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
    
    window.renderBroCalendar();
    window.updateWeightChart();
}

window.checkMorningStatus = async function() {
    const uid = window.auth.currentUser.uid;
    const dateStr = new Date().toLocaleDateString('en-CA');
    const allLogsQ = window.fs.query(window.fs.collection(window.db, "dailyLogs"), window.fs.where("userId", "==", uid));
    const allLogsSnap = await window.fs.getDocs(allLogsQ);
    dailyLogsRaw = [];
    let logsMap = {};
    allLogsSnap.forEach(doc => { 
        const d = doc.data(); d.id = doc.id;
        dailyLogsRaw.push(d);
        logsMap[d.date] = d.status; 
        if(d.date === dateStr) todayStatus = d;
    });
    
    if(todayStatus) {
        document.getElementById('card-morning-checkin').style.display = 'none';
        document.getElementById('card-status-done').style.display = 'block';
        let t = todayStatus.status === 'gym' ? "Bereit fürs Gym! 💪" : (todayStatus.status === 'rest' ? "Rest Day! 🛋️" : "Krank! 🤒");
        document.getElementById('today-status-text').innerText = t;
    } else {
        document.getElementById('card-morning-checkin').style.display = 'block';
        document.getElementById('card-status-done').style.display = 'none';
    }
    
    const workoutDates = allSessionsRaw.filter(s => s.userId === uid).map(s => s.date);
    let currentStreak = 0;
    for(let i=0; i<365; i++) {
        let checkDate = new Date(); checkDate.setDate(checkDate.getDate() - i);
        let checkDateStr = checkDate.toLocaleDateString('en-CA');
        let status = logsMap[checkDateStr];
        let hasWorkout = workoutDates.includes(checkDateStr);
        
        if(i === 0 && !status && !hasWorkout) continue;
        if(status === 'gym' || hasWorkout) currentStreak++; 
        else if(status === 'rest' || status === 'sick') continue;
        else break; 
    }
    if(document.getElementById('streak-counter')) document.getElementById('streak-counter').innerText = currentStreak;
};

window.saveMorningStatus = async function(statusType) {
    const data = { userId: window.auth.currentUser.uid, date: new Date().toLocaleDateString('en-CA'), sleep: document.getElementById('dash-sleep').value, weight: document.getElementById('dash-weight').value, status: statusType, timestamp: new Date().toISOString() };
    await window.fs.addDoc(window.fs.collection(window.db, "dailyLogs"), data);
    await window.checkMorningStatus(); window.renderBroCalendar(); window.updateWeightChart(); 
};

window.resetMorningStatus = async function() {
    if(todayStatus && todayStatus.id) {
        // Die Browser-Abfrage (confirm) haben wir entfernt, da iOS sie oft blockiert.
        // Die Löschung wird jetzt direkt ausgeführt.
        await window.fs.deleteDoc(window.fs.doc(window.db, "dailyLogs", todayStatus.id));
        
        todayStatus = null; // Wichtig: Den lokalen Status leeren
        await window.checkMorningStatus(); 
        window.renderBroCalendar(); 
        window.updateWeightChart();
    }
};


window.addExerciseDefinition = async function() {
    const n = document.getElementById('new-ex-name').value; if(!n) return;
    await window.fs.addDoc(window.fs.collection(window.db, "exerciseDefs"), { userId: window.auth.currentUser.uid, name: n });
    document.getElementById('new-ex-name').value = ""; initApp();
};

function renderExerciseDefinitions() {
    const list = document.getElementById('exercise-definitions-list'); list.innerHTML = "";
    exerciseDefinitions.sort((a,b)=>a.name.localeCompare(b.name)).forEach(ex => {
        const d = document.createElement('div'); d.style.display="flex"; d.style.justifyContent="space-between"; d.style.alignItems="center"; d.style.padding = "12px 0"; d.style.borderBottom = "1px solid var(--separator)";
        d.innerHTML = `<span style="font-weight: 600;">${ex.name}</span><button onclick="window.deleteExDef('${ex.id}')" class="btn-red-text">Löschen</button>`;
        list.appendChild(d);
    });
}
window.deleteExDef = async function(id) { if(confirm("Löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "exerciseDefs", id)); initApp(); } };

window.addTemplateExerciseSelector = function() {
    const s = document.createElement('select'); s.className = "premium-input tpl-ex-item";
    s.innerHTML = `<option value="">-- Übung wählen --</option>` + exerciseDefinitions.map(ex => `<option value="${ex.name}">${ex.name}</option>`).join('');
    document.getElementById('tpl-exercise-selector').appendChild(s);
};

window.saveWorkoutTemplate = async function() {
    const title = document.getElementById('tpl-title').value;
    if(!title) return alert("Bitte einen Titel vergeben!");
    let names = []; document.querySelectorAll('.tpl-ex-item').forEach(x => { if(x.value) names.push(x.value); });
    
    const data = { userId: window.auth.currentUser.uid, title: title, exerciseNames: names };
    
    if (editTplId) {
        await window.fs.updateDoc(window.fs.doc(window.db, "workoutTemplates", editTplId), data);
    } else {
        await window.fs.addDoc(window.fs.collection(window.db, "workoutTemplates"), data);
    }
    window.cancelEditTpl();
    initApp();
};

window.loadEditTpl = function(id) {
    const tpl = workoutTemplates.find(t => t.id === id);
    if(!tpl) return;
    editTplId = id;
    
    document.getElementById('tpl-form-title').innerText = "Vorlage bearbeiten";
    document.getElementById('tpl-title').value = tpl.title;
    document.getElementById('tpl-exercise-selector').innerHTML = "";
    
    tpl.exerciseNames.forEach(n => {
        window.addTemplateExerciseSelector();
        const selects = document.querySelectorAll('.tpl-ex-item');
        selects[selects.length - 1].value = n;
    });
    
    document.getElementById('btn-save-tpl').innerText = "Änderungen speichern";
    document.getElementById('btn-cancel-tpl').style.display = "block";
    
    const accArea = document.getElementById('tpl-creator-area').closest('.collapsible-area');
    if(accArea) accArea.parentElement.classList.add('is-open');
};

window.cancelEditTpl = function() {
    editTplId = null;
    document.getElementById('tpl-form-title').innerText = "Neue Vorlage erstellen";
    document.getElementById('tpl-title').value = "";
    document.getElementById('tpl-exercise-selector').innerHTML = "";
    document.getElementById('btn-save-tpl').innerText = "Vorlage speichern";
    document.getElementById('btn-cancel-tpl').style.display = "none";
};

function renderWorkoutTemplates() {
    const list = document.getElementById('workout-templates-list'); list.innerHTML = "";
    workoutTemplates.forEach(t => {
        const d = document.createElement('div'); d.style.padding = "16px 0"; d.style.borderBottom = "1px solid var(--separator)";
        d.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="font-size:16px;">${t.title}</b>
                <div style="display: flex; gap: 16px;">
                    <button onclick="window.loadEditTpl('${t.id}')" class="btn-text" style="color: var(--text-muted);">Edit</button>
                    <button onclick="window.deleteTpl('${t.id}')" class="btn-red-text">×</button>
                </div>
            </div>
            <small style="color: var(--text-muted); display: block; margin-top: 6px;">${t.exerciseNames.join(', ')}</small>
        `;
        list.appendChild(d);
    });
}
window.deleteTpl = async function(id) { if(confirm("Löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "workoutTemplates", id)); initApp(); } };

function updateTemplateDropdown() {
    const sel = document.getElementById('load-tpl-select'); sel.innerHTML = '<option value="">Vorlage laden...</option>';
    workoutTemplates.forEach(t => { const opt = document.createElement('option'); opt.value = t.id; opt.innerText = t.title; sel.appendChild(opt); });
}
window.applyTemplate = function(tplId) {
    if(!tplId) return; const tpl = workoutTemplates.find(t => t.id === tplId);
    document.getElementById('session-name').value = tpl.title; document.getElementById('tracking-exercises').innerHTML = "";
    tpl.exerciseNames.forEach(n => window.addTrackingExercise(n));
};

window.addTrackingExercise = function(name = "", sets = []) {
    const div = document.createElement('div'); div.className = "card"; 
    let lastHtml = "";
    if (name !== "") {
        const lastS = allSessionsRaw.filter(s => s.userId === window.auth.currentUser.uid).reverse().find(s => s.exercises.some(e => e.name === name));
        if (lastS) lastHtml = `<div class="last-perf-badge">Letztes Mal: ${lastS.exercises.find(e => e.name === name).sets.map(st => st.kg + "kg").join(" | ")}</div>`;
    }
    div.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;"><select class="premium-input ex-select" style="flex:1; font-weight:700;" onchange="window.refreshExerciseBadge(this)"><option value="">-- Übung --</option>${exerciseDefinitions.map(ex => `<option value="${ex.name}" ${ex.name === name ? 'selected' : ''}>${ex.name}</option>`).join('')}</select><button onclick="this.parentElement.parentElement.remove()" class="btn-red-text" style="font-size:28px; margin-left:16px;">×</button></div>${lastHtml}<div class="sets-list"></div><button onclick="window.addSetRow(this.previousElementSibling)" class="btn-text" style="margin-top: 12px; display:block; width:100%; text-align:center;">+ Satz hinzufügen</button>`;
    document.getElementById('tracking-exercises').appendChild(div);
    const list = div.querySelector('.sets-list');
    if(sets.length > 0) sets.forEach(s => window.addSetRow(list, s.reps, s.kg)); else window.addSetRow(list);
};

window.refreshExerciseBadge = function(el) {
    const n = el.value; const card = el.parentElement.parentElement; const old = card.querySelector('.last-perf-badge'); if(old) old.remove();
    if(n) {
        const lastS = allSessionsRaw.filter(s => s.userId === window.auth.currentUser.uid).reverse().find(s => s.exercises.some(e => e.name === n));
        if (lastS) {
            const b = document.createElement('div'); b.className = "last-perf-badge"; b.innerText = `Letztes Mal: ${lastS.exercises.find(e => e.name === n).sets.map(st => st.kg + "kg").join(" | ")}`;
            el.parentElement.after(b);
        }
    }
};

window.addSetRow = function(container, reps="", kg="") {
    const r = document.createElement('div'); r.style.display = "grid"; r.style.gridTemplateColumns = "1fr 1fr 40px"; r.style.gap = "12px"; r.style.marginTop = "12px";
    r.innerHTML = `<input type="number" class="premium-input s-reps" placeholder="Reps" value="${reps}"><input type="number" class="premium-input s-weight" placeholder="kg" value="${kg}"><button onclick="this.parentElement.remove()" class="btn-red-text" style="font-size: 24px;">×</button>`;
    container.appendChild(r);
};

window.saveSession = async function() {
    let ex = []; document.querySelectorAll('#tracking-exercises .card').forEach(x => {
        const n = x.querySelector('.ex-select').value;
        const rs = x.querySelectorAll('.s-reps'), ws = x.querySelectorAll('.s-weight');
        let sets = []; for(let i=0; i<rs.length; i++) if(rs[i].value) sets.push({reps: rs[i].value, kg: ws[i].value});
        if(n) ex.push({name: n, sets: sets});
    });
    const d = { userId: window.auth.currentUser.uid, date: document.getElementById('session-date').value, title: document.getElementById('session-name').value || "Training", exercises: ex, checkIn: { energy: document.getElementById('checkin-energy').value, soreness: document.getElementById('checkin-soreness').value } };
    if(editId) await window.fs.updateDoc(window.fs.doc(window.db, "sessions", editId), d);
    else await window.fs.addDoc(window.fs.collection(window.db, "sessions"), d);
    window.resetForm(); initApp();
};

window.deleteCurrentSession = async function() { if(editId && confirm("Wirklich löschen?")) { await window.fs.deleteDoc(window.fs.doc(window.db, "sessions", editId)); window.resetForm(); initApp(); } };

function renderHistory() {
    const h = document.getElementById('history'); h.innerHTML = "";
    if(logs.length > 0) document.getElementById('last-workout-date').innerText = new Date(logs[0].date).toLocaleDateString('de-DE');
    logs.forEach(s => {
        const item = document.createElement('div'); item.style.padding = "16px 0"; item.style.borderBottom = "1px solid var(--separator)";
        item.innerHTML = `<button class="accordion-header" onclick="const c = this.nextElementSibling; c.style.display = c.style.display === 'block' ? 'none' : 'block';"><div><div style="font-weight:800; font-size:16px;">${s.title}</div><small style="color:var(--text-muted); font-weight:600;">${new Date(s.date).toLocaleDateString('de-DE')}</small></div><div style="display:flex; gap:16px; align-items:center;"><div onclick="event.stopPropagation(); window.loadEdit('${s.id}')" class="btn-text" style="color: var(--text-muted);">Edit</div><div class="chevron-icon">›</div></div></button><div class="collapsible-area" style="border:none; padding-top:12px; margin-top:0;">${s.exercises.map(ex => `<div style="padding:6px 0;"><b style="color:var(--brand-orange);">${ex.name}:</b> ${ex.sets.map(st => st.reps+'x'+st.kg).join(' · ')}</div>`).join('')}</div>`;
        h.appendChild(item);
    });
}
window.loadEdit = function(id) {
    const s = logs.find(l => l.id === id); editId = id; document.getElementById('session-date').value = s.date; document.getElementById('session-name').value = s.title;
    document.getElementById('tracking-exercises').innerHTML = ""; s.exercises.forEach(ex => window.addTrackingExercise(ex.name, ex.sets));
    document.getElementById('form-title').innerText = "Bearbeiten"; document.getElementById('edit-controls').style.display = "block";
    document.querySelector('.app-content').scrollTo({top: 0, behavior: 'smooth'});
};
window.resetForm = function() { editId = null; document.getElementById('session-date').value = new Date().toISOString().split('T')[0]; document.getElementById('session-name').value = ""; document.getElementById('tracking-exercises').innerHTML = ""; document.getElementById('form-title').innerText = "Workout Loggen"; document.getElementById('edit-controls').style.display = "none"; };

// --- KALENDER ---
window.changeBroMonth = function(v) { broCalDate.setMonth(broCalDate.getMonth() + v); window.renderBroCalendar(); };
window.renderBroCalendar = function() {
    const grid = document.getElementById('bro-calendar-days'); if (!grid) return; grid.innerHTML = "";
    const uid = window.auth.currentUser.uid;
    const workoutDates = allSessionsRaw.filter(s => s.userId === uid).map(s => s.date);
    const first = new Date(broCalDate.getFullYear(), broCalDate.getMonth(), 1);
    const last = new Date(broCalDate.getFullYear(), broCalDate.getMonth() + 1, 0);
    document.getElementById('bro-cal-month').innerText = broCalDate.toLocaleString('de-de', {month:'long', year:'numeric'});
    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => { const el = document.createElement('div'); el.style.color = "var(--text-muted)"; el.style.fontSize = "12px"; el.style.fontWeight = "700"; el.style.textAlign = "center"; el.innerText=d; grid.appendChild(el); });
    let start = (first.getDay() + 6) % 7;
    for (let i = 0; i < start; i++) grid.appendChild(document.createElement('div'));
    for (let d = 1; d <= last.getDate(); d++) {
        const ds = `${broCalDate.getFullYear()}-${String(broCalDate.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const div = document.createElement('div'); div.className = "cal-day"; div.innerText = d;
        const log = dailyLogsRaw.find(l => l.date === ds);
        const hasWorkout = workoutDates.includes(ds);
        
        if(hasWorkout || (log && log.status === 'gym')) div.classList.add('day-gym');
        else if(log && log.status === 'rest') div.classList.add('day-rest');
        else if(log && log.status === 'sick') div.classList.add('day-sick');
        grid.appendChild(div);
    }
};

window.updateBroChart = function() {
    const exName = document.getElementById('bro-exercise-select')?.value; if(!exName) { if(myChart) myChart.destroy(); return; }
    const compare = document.getElementById('compare-bro-toggle').checked;
    const uid = window.auth.currentUser.uid;
    const myD = [], broD = [];
    allSessionsRaw.forEach(s => {
        const ex = s.exercises.find(e => e.name === exName);
        if(ex) {
            const m = Math.max(...ex.sets.map(st => parseFloat(st.kg) || 0));
            if(s.userId === uid) myD.push({x: s.date, y: m}); else if(compare) broD.push({x: s.date, y: m});
        }
    });
    const allY = [...myD.map(p=>p.y), ...broD.map(p=>p.y)];
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const off = (maxY - minY) === 0 ? 10 : (maxY - minY) * 0.25;
    if(myChart) myChart.destroy();
    const ctx = document.getElementById('progressChart')?.getContext('2d');
    if (ctx) {
        const textColor = document.documentElement.classList.contains('light-mode') ? '#000' : '#8E8E93';
        const gridColor = document.documentElement.classList.contains('light-mode') ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        
        myChart = new Chart(ctx, { 
            type: 'line', 
            data: { 
                datasets: [
                    { label: 'Du', data: myD, borderColor: BRAND_ORANGE, backgroundColor: CHART_BG_ORANGE, tension: 0.4, fill: true, pointRadius: myD.length === 1 ? 6 : 4, pointBackgroundColor: '#000', pointBorderWidth: 2 }, 
                    ...(compare && broD.length > 0 ? [{ label: 'Bro', data: broD, borderColor: '#30D158', tension: 0.4, fill: false, pointRadius: 4, pointBackgroundColor: '#000', pointBorderWidth: 2, borderDash: [5, 5] }] : [])
                ] 
            }, 
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    x: { display: false }, 
                    y: { min: minY - off, max: maxY + off, grid: { color: gridColor }, ticks: { color: textColor, font: { weight: 'bold' } } } 
                }, 
                plugins: { legend: { display: false } } 
            } 
        });
    }
};

window.updateWeightChart = async function() {
    const sorted = [...dailyLogsRaw].sort((a,b) => new Date(a.date) - new Date(b.date));
    const pts = []; sorted.forEach(d => { if(d.weight && !isNaN(d.weight)) pts.push({ x: d.date, y: parseFloat(d.weight) }); });
    if(pts.length === 0) return;
    const allY = pts.map(p=>p.y);
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const off = (minY === maxY) ? 5 : 2; 
    if(myWeightChart) myWeightChart.destroy();
    const ctx = document.getElementById('weightChart')?.getContext('2d');
    if (ctx) {
        const textColor = document.documentElement.classList.contains('light-mode') ? '#000' : '#8E8E93';
        const gridColor = document.documentElement.classList.contains('light-mode') ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        
        myWeightChart = new Chart(ctx, { 
            type: 'line', 
            data: { 
                datasets: [{ label: 'kg', data: pts, borderColor: BRAND_ORANGE, backgroundColor: CHART_BG_ORANGE, tension: 0.4, fill: true, pointRadius: pts.length === 1 ? 6 : 4, pointBackgroundColor: '#000', pointBorderWidth: 2 }] 
            }, 
            options: { 
                responsive: true, maintainAspectRatio: false, 
                scales: { 
                    x: { display: false }, 
                    y: { min: minY - off, max: maxY + off, grid: { color: gridColor }, ticks: { color: textColor, font: { weight: 'bold' } } } 
                }, 
                plugins: { legend: { display: false } } 
            } 
        });
    }
};

window.switchTab = function(t, btn) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(i => i.classList.remove('active'));
    if(document.getElementById('view-' + t)) document.getElementById('view-' + t).classList.add('active');
    if(btn) { btn.classList.add('active'); document.getElementById('header-title').textContent = btn.getAttribute('data-title'); }
    if(t === 'bro') setTimeout(() => { window.updateBroChart(); window.updateWeightChart(); window.renderBroCalendar(); }, 150);
    document.querySelector('.app-content').scrollTo({top: 0, behavior: 'smooth'});
};
window.toggleAccordion = function(e) { const c = e.closest('.card'); if(c) c.classList.toggle('is-open'); };
function updateBroExerciseDropdown() { const sel = document.getElementById('bro-exercise-select'); if (!sel) return; sel.innerHTML = '<option value="">Übung wählen...</option>' + exerciseDefinitions.sort((a,b)=>a.name.localeCompare(b.name)).map(ex => `<option value="${ex.name}">${ex.name}</option>`).join(''); }

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.error(e)));
