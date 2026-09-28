function safeParse(key, defaultVal) {
    try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : defaultVal; } 
    catch (e) { return defaultVal; }
}

let tasks = safeParse('studyTasks', []);
let savedBoards = safeParse('savedBoards', []);
let studyStats = safeParse('studyStats', { totalSec: 0, daily: [0,0,0,0,0,0,0], streak: 0, lastStudyDate: null, currentWeekStart: null });
let editingTaskId = null; 

let deviceMode = localStorage.getItem('deviceMode');

let currentDisplayPercent = 0;
let targetPercent = 0;
let progressAnimFrame = null;

let intervals = { study: null, break: null };
let timeRemaining = { study: 0, break: 0 };

let swSeconds = parseInt(localStorage.getItem('tempSwSeconds')) || 0;
let swInterval = null;

let canvas = null;
let ctx = null;
let container = null;
let colorPicker = null;
let thicknessSlider = null;

let isDrawing = false;
let currentTool = 'pen';
let activeThickness = 4;
let startX = 0, startY = 0, lastX = 0, lastY = 0;

let mainCanvasBackup = document.createElement('canvas');
let selCanvas = document.createElement('canvas'); 
let sel = { active: false, x: 0, y: 0, w: 0, h: 0, imgData: null, isMoving: false, startX: 0, startY: 0 };

const stickyPastels = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#EBE4F4', '#B5A1D9', '#9FB4D4'];

let currentBoardIndex = 1;
let savedStickies = safeParse('studyStickies_1', null);
if (!savedStickies) {
    savedStickies = safeParse('studyStickies', []);
}

function initApp() {
    canvas = document.getElementById('whiteboard');
    if (canvas) ctx = canvas.getContext('2d');
    container = document.getElementById('canvas-container');
    colorPicker = document.getElementById('color-picker');
    thicknessSlider = document.getElementById('line-width');

    if (thicknessSlider) { 
        thicknessSlider.addEventListener('input', (e) => { activeThickness = e.target.value; }); 
    }
    
    updateSwDisplay(); 

    if (!deviceMode) {
        document.getElementById('device-prompt').style.display = 'flex';
    } else {
        document.getElementById('device-prompt').style.display = 'none';
        runWorkspace();
    }
}

function selectDevice(mode) {
    deviceMode = mode;
    localStorage.setItem('deviceMode', mode);
    document.getElementById('device-prompt').style.display = 'none';
    runWorkspace();
}

function resetDeviceChoice() {
    document.getElementById('device-prompt').style.display = 'flex';
}

function runWorkspace() {
    if (localStorage.getItem('studyTheme') === 'dark') {
        document.body.classList.add('dark-mode');
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) themeBtn.innerText = 'Light Mode';
    }
    
    if (deviceMode === 'mouse') {
        setupMouseDragZones();
    }

    renderTasks();
    renderStickies();
    renderGallery();
    
    setTimeout(() => { 
        resizeCanvas(); 
        fillCanvasWhite(); 
        loadCanvas(); 
    }, 150);
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } 
else { initApp(); }

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('studyTheme', isDark ? 'dark' : 'light');
    document.getElementById('theme-toggle').innerText = isDark ? 'Light Mode' : 'Dark Mode';
    updateProgress(); 
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function switchTab(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.getElementById('btn-' + viewId).classList.add('active');
    
    if(viewId === 'view3') setTimeout(() => { resizeCanvas(); loadCanvas(); }, 50); 
    if(viewId === 'view4') renderDashboard(); 
}

function exportData() {
    const data = {
        tasks: localStorage.getItem('studyTasks') || "[]",
        stickies: localStorage.getItem('studyStickies_1') || localStorage.getItem('studyStickies') || "[]", 
        boards: localStorage.getItem('savedBoards') || "[]",
        stats: localStorage.getItem('studyStats') || "{}", 
        theme: localStorage.getItem('studyTheme') || "light",
        device: localStorage.getItem('deviceMode') || "mouse"
    };
    const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `StudyWorkspace_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); showToast("Backup downloaded! 📥");
}

function importData(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(data.tasks) localStorage.setItem('studyTasks', data.tasks);
            if(data.stickies) {
                localStorage.setItem('studyStickies_1', data.stickies);
                localStorage.setItem('studyStickies', data.stickies);
            }
            if(data.boards) localStorage.setItem('savedBoards', data.boards);
            if(data.stats) localStorage.setItem('studyStats', data.stats);
            if(data.theme) localStorage.setItem('studyTheme', data.theme);
            if(data.device) localStorage.setItem('deviceMode', data.device);
            showToast("Data restored! 🚀 Reloading...");
            setTimeout(() => location.reload(), 1500);
        } catch(err) { showToast("Error loading file! ❌"); }
    };
    reader.readAsText(file);
}

function saveTask() {
    const nameInput = document.getElementById('task-name');
    const priority = document.getElementById('task-priority').value;
    if(!nameInput.value.trim()) return showToast("Please enter a task name! ⚠️");

    if (editingTaskId) {
        const task = tasks.find(t => t.id === editingTaskId);
        if(task) { task.name = nameInput.value.trim(); task.priority = priority; }
        editingTaskId = null;
        document.getElementById('form-title').innerText = "New Study Task";
        document.getElementById('save-btn').innerText = "Save Task";
        showToast("Task updated! ✨");
    } else {
        const newTask = { id: 'task-' + Date.now(), name: nameInput.value.trim(), priority: priority, location: 'saved-tasks', checked: false };
        tasks.unshift(newTask);
        showToast("Task added! 🎉");
    }
    saveTasksToStorage(); renderTasks(); nameInput.value = ''; switchTab('view2');
}

function editTask(id) {
    const task = tasks.find(t => t.id === id); if(!task) return;
    editingTaskId = id;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('form-title').innerText = "Update Study Task";
    document.getElementById('save-btn').innerText = "Update Task";
    switchTab('view1');
}

function saveTasksToStorage() { try { localStorage.setItem('studyTasks', JSON.stringify(tasks)); } catch(e) {} }
function deleteTask(id) { tasks = tasks.filter(t => t.id !== id); saveTasksToStorage(); renderTasks(); updateProgress(); showToast("Task deleted! 🗑️"); }
function toggleCheck(id) {
    const task = tasks.find(t => t.id === id);
    if(task) { task.checked = !task.checked; saveTasksToStorage(); renderTasks(); updateProgress(); }
}

function renderTasks() {
    const savedTasksContainer = document.getElementById('saved-tasks');
    if (!savedTasksContainer) return;
    savedTasksContainer.innerHTML = '';
    document.querySelectorAll('.day-card').forEach(col => {
        const title = col.querySelector('.day-title'); col.innerHTML = ''; col.appendChild(title);
    });

    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = `task-item ${task.priority} ${task.checked ? 'checked' : ''}`;
        if(task.id.startsWith('task-') && Date.now() - parseInt(task.id.split('-')[1]) < 5000) { div.classList.add('new-task'); }
        div.id = task.id; 
        
        if (deviceMode === 'mouse') { div.draggable = true; div.ondragstart = drag; } 
        else if (deviceMode === 'touch') { div.addEventListener('touchstart', handleTaskTouchStart, {passive: false}); }

        const showCheckbox = task.location !== 'saved-tasks' ? 'style="display:flex;"' : '';
        const isChecked = task.checked ? 'checked' : '';

        div.innerHTML = `
            <div class="task-info">
                <label class="custom-checkbox-wrapper" ${showCheckbox}>
                    <input type="checkbox" onchange="toggleCheck('${task.id}')" ${isChecked}>
                    <span class="checkmark"></span>
                </label>
                <span class="task-text">${task.name}</span>
            </div>
            <div class="task-actions">
                <button class="btn-edit bouncy-hover" onclick="editTask('${task.id}')" title="Edit">✎</button>
                <button class="btn-delete bouncy-hover" onclick="deleteTask('${task.id}')" title="Delete">✕</button>
            </div>
        `;
        const container = document.getElementById(task.location) || savedTasksContainer;
        container.appendChild(div);
    });
    updateProgress();
}

function setupMouseDragZones() {
    document.querySelectorAll('.day-card, #saved-tasks').forEach(zone => {
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('hover'); };
        zone.ondragleave = (e) => { zone.classList.remove('hover'); };
        zone.ondrop = (e) => {
            e.preventDefault(); zone.classList.remove('hover');
            const taskId = e.dataTransfer.getData("text/plain");
            if (taskId) {
                const task = tasks.find(t => t.id === taskId);
                if (task) { task.location = zone.id; if(zone.id === 'saved-tasks') task.checked = false; saveTasksToStorage(); renderTasks(); }
            }
        };
    });
}
function drag(ev) { ev.dataTransfer.setData("text/plain", ev.target.id); setTimeout(() => ev.target.style.opacity = '0.5', 0); }

let draggedTaskID = null;
let touchGhost = null;

function handleTaskTouchStart(e) {
    if(e.target.tagName.toLowerCase() === 'button' || e.target.tagName.toLowerCase() === 'input' || e.target.classList.contains('checkmark')) return;
    draggedTaskID = this.id;
    const touch = e.touches[0];
    touchGhost = this.cloneNode(true);
    touchGhost.style.position = 'fixed'; touchGhost.style.opacity = '0.8'; touchGhost.style.zIndex = '10000';
    touchGhost.style.pointerEvents = 'none'; touchGhost.style.width = this.offsetWidth + 'px';
    touchGhost.style.left = touch.clientX - (this.offsetWidth / 2) + 'px';
    touchGhost.style.top = touch.clientY - (this.offsetHeight / 2) + 'px';
    document.body.appendChild(touchGhost);
    this.style.opacity = '0.3';
    document.addEventListener('touchmove', handleTaskTouchMove, {passive: false});
    document.addEventListener('touchend', handleTaskTouchEnd);
}

function handleTaskTouchMove(e) {
    if(!touchGhost) return; e.preventDefault(); 
    const touch = e.touches[0];
    touchGhost.style.left = touch.clientX - (touchGhost.offsetWidth / 2) + 'px';
    touchGhost.style.top = touch.clientY - (touchGhost.offsetHeight / 2) + 'px';
}

function handleTaskTouchEnd(e) {
    document.removeEventListener('touchmove', handleTaskTouchMove); document.removeEventListener('touchend', handleTaskTouchEnd);
    if(!touchGhost) return;
    const touch = e.changedTouches[0];
    touchGhost.remove(); touchGhost = null;
    const originalEl = document.getElementById(draggedTaskID);
    if(originalEl) originalEl.style.opacity = '1';
    
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if(target) {
        const dropZone = target.closest('.day-card, #saved-tasks');
        if(dropZone) {
            const task = tasks.find(t => t.id === draggedTaskID);
            if(task) { task.location = dropZone.id; if(dropZone.id === 'saved-tasks') task.checked = false; saveTasksToStorage(); renderTasks(); }
        }
    }
    draggedTaskID = null;
}

function animateProgress() {
    let diff = targetPercent - currentDisplayPercent;
    if (Math.abs(diff) < 0.5) { currentDisplayPercent = targetPercent; progressAnimFrame = null; } 
    else { currentDisplayPercent += diff * 0.15; progressAnimFrame = requestAnimationFrame(animateProgress); }
    
    let p = Math.max(0, Math.min(100, Math.round(currentDisplayPercent)));
    const progressCircle = document.getElementById('progress-circle');
    const progressText = document.getElementById('progress-text');
    if(progressCircle) progressCircle.style.background = `conic-gradient(var(--baby-blue-dark) ${p}%, transparent ${p}%)`;
    if(progressText) progressText.innerText = p + '%';
}
function updateProgress() {
    const calendarTasks = tasks.filter(t => t.location !== 'saved-tasks');
    const checkedTasks = calendarTasks.filter(t => t.checked);
    targetPercent = calendarTasks.length > 0 ? Math.round((checkedTasks.length / calendarTasks.length) * 100) : 0;
    if(!progressAnimFrame) animateProgress();
}
function startTimer(type) {
    if(intervals[type]) return;
    const minInput = document.getElementById(`${type}-m`).value || 0, secInput = document.getElementById(`${type}-s`).value || 0;
    if(timeRemaining[type] === 0) timeRemaining[type] = (parseInt(minInput) * 60) + parseInt(secInput);
    if(timeRemaining[type] <= 0) return;
    intervals[type] = setInterval(() => {
        timeRemaining[type]--; updateTimerDisplay(type);
        if(timeRemaining[type] <= 0) { stopTimer(type); showToast(`Time's up for ${type === 'study' ? 'Study' : 'Break'}! ⏰`); }
    }, 1000);
}
function stopTimer(type) { clearInterval(intervals[type]); intervals[type] = null; }
function resetTimer(type) { stopTimer(type); timeRemaining[type] = 0; document.getElementById(`${type}-m`).value = ''; document.getElementById(`${type}-s`).value = ''; updateTimerDisplay(type); }
function updateTimerDisplay(type) {
    const m = Math.floor(timeRemaining[type] / 60).toString().padStart(2, '0'), s = (timeRemaining[type] % 60).toString().padStart(2, '0');
    document.getElementById(`${type}-display`).innerText = `${m}:${s}`;
}

function updateSwDisplay() {
    let h = Math.floor(swSeconds / 3600).toString().padStart(2, '0');
    let m = Math.floor((swSeconds % 3600) / 60).toString().padStart(2, '0');
    let s = (swSeconds % 60).toString().padStart(2, '0');
    const display = document.getElementById('stopwatch-display'); 
    if (display) display.innerText = `${h}:${m}:${s}`;
}

function startStopwatch() { 
    if(!swInterval) {
        swInterval = setInterval(() => { 
            swSeconds++; 
            updateSwDisplay(); 
            localStorage.setItem('tempSwSeconds', swSeconds);
        }, 1000); 
    }
}

function stopStopwatch() { clearInterval(swInterval); swInterval = null; }

function resetStopwatchMain() { 
    stopStopwatch(); 
    if (swSeconds > 0) { 
        saveTimeToDashboard(swSeconds); 
        swSeconds = 0; 
        localStorage.setItem('tempSwSeconds', 0);
        updateSwDisplay(); 
    } 
}

function getWeekStart(d) {
    let date = new Date(d);
    date.setHours(0,0,0,0);
    let day = date.getDay();
    let diff = date.getDate() - day; 
    return new Date(date.setDate(diff)).getTime();
}

function saveTimeToDashboard(seconds) {
    let now = new Date();
    let todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let todayIdx = now.getDay();
    let currentWeek = getWeekStart(now);

    if (studyStats.currentWeekStart !== currentWeek) {
        studyStats.daily = [0,0,0,0,0,0,0];
        studyStats.currentWeekStart = currentWeek;
    }

    if (studyStats.lastStudyDate) {
        let lastDate = new Date(studyStats.lastStudyDate);
        lastDate.setHours(0,0,0,0);
        let diffTime = todayDate.getTime() - lastDate.getTime();
        let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) { 
            studyStats.streak++; 
        } else if (diffDays > 1) { 
            studyStats.streak = 1; 
        }
    } else { 
        studyStats.streak = 1; 
        if(!studyStats.currentWeekStart) studyStats.currentWeekStart = currentWeek;
    }

    studyStats.lastStudyDate = todayDate.toISOString();
    studyStats.totalSec += seconds;
    studyStats.daily[todayIdx] += seconds;
    
    try { localStorage.setItem('studyStats', JSON.stringify(studyStats)); } catch(e) {}
    if(document.getElementById('view4').classList.contains('active')) renderDashboard();
    showToast(`Saved ${Math.floor(seconds / 60)} minutes to Dashboard! 🔥`);
}

function renderDashboard() {
    let h = Math.floor(studyStats.totalSec / 3600), m = Math.floor((studyStats.totalSec % 3600) / 60);
    const statTime = document.getElementById('stat-time'); if (statTime) statTime.innerText = `${h}h ${m}m`;
    const statTasks = document.getElementById('stat-tasks'); if (statTasks) statTasks.innerText = tasks.filter(t => t.checked).length;
    const statStreak = document.getElementById('stat-streak'); if (statStreak) statStreak.innerText = `${studyStats.streak} Days`;

    const maxSec = Math.max(...studyStats.daily, 1); 
    for(let i=0; i<7; i++) {
        const bar = document.getElementById(`bar-${i}`);
        if(bar) bar.style.height = `${(studyStats.daily[i] / maxSec) * 100}%`;
    }
}

function openShareModal() { 
    document.getElementById('share-modal').style.display = 'flex'; 
    drawShareCanvas(); 
}
function closeShareModal() { document.getElementById('share-modal').style.display = 'none'; }

function drawShareCanvas() {
    const sc = document.getElementById('share-canvas'); 
    sc.width = 1080; sc.height = 1920;
    const sCtx = sc.getContext('2d');
    
    const emojiFont = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
    
    let gradient = sCtx.createLinearGradient(0, 0, 1080, 1920);
    gradient.addColorStop(0, "#F9F6FC"); 
    gradient.addColorStop(1, "#EBE4F4"); 
    sCtx.fillStyle = gradient; 
    sCtx.fillRect(0, 0, 1080, 1920);

    sCtx.filter = 'blur(120px)';
    sCtx.fillStyle = "rgba(181, 161, 217, 0.45)";
    sCtx.beginPath(); sCtx.arc(150, 200, 350, 0, Math.PI*2); sCtx.fill();
    sCtx.fillStyle = "rgba(159, 180, 212, 0.45)";
    sCtx.beginPath(); sCtx.arc(950, 1650, 400, 0, Math.PI*2); sCtx.fill();
    sCtx.filter = 'none';

    sCtx.fillStyle = "rgba(74, 74, 104, 0.04)";
    for(let x = 0; x < 1080; x += 60) { 
        for(let y = 0; y < 1920; y += 60) { 
            sCtx.beginPath(); sCtx.arc(x, y, 2.5, 0, Math.PI*2); sCtx.fill(); 
        } 
    }

    sCtx.fillStyle = "#8E8E9F"; 
    sCtx.font = `800 45px 'Nunito', sans-serif`; 
    sCtx.textAlign = "center";
    sCtx.fillText("STUDY SESSION COMPLETE", 540, 260);
    
    sCtx.fillStyle = "#4A4A68"; 
    sCtx.font = `900 135px 'Nunito', ${emojiFont}`; 
    sCtx.shadowColor = "rgba(181, 161, 217, 0.5)";
    sCtx.shadowBlur = 30;
    sCtx.shadowOffsetY = 15;
    sCtx.fillText("Flow State 🚀", 540, 410);
    sCtx.shadowBlur = 0;
    sCtx.shadowOffsetY = 0;

    function drawStatCard(yOffset, title, value, emoji) {
        const x = 100, w = 880, h = 330, r = 40;
        
        sCtx.fillStyle = "rgba(255, 255, 255, 0.7)"; 
        sCtx.strokeStyle = "rgba(255, 255, 255, 0.9)"; 
        sCtx.lineWidth = 4;
        
        sCtx.shadowColor = "rgba(159, 180, 212, 0.25)";
        sCtx.shadowBlur = 35;
        sCtx.shadowOffsetY = 20;
        
        sCtx.beginPath(); 
        if(sCtx.roundRect) { sCtx.roundRect(x, yOffset, w, h, r); } 
        else { sCtx.rect(x, yOffset, w, h); }
        sCtx.fill(); sCtx.stroke();
        
        sCtx.shadowBlur = 0; sCtx.shadowOffsetY = 0;
        
        sCtx.fillStyle = "#FFFFFF";
        sCtx.beginPath(); sCtx.arc(x + 170, yOffset + 165, 95, 0, Math.PI*2); sCtx.fill();
        
        sCtx.textAlign = "center";
        sCtx.textBaseline = "middle";
        sCtx.font = `85px ${emojiFont}`; 
        sCtx.fillText(emoji, x + 170, yOffset + 172);

        sCtx.textAlign = "left";
        sCtx.textBaseline = "alphabetic";
        sCtx.fillStyle = "#8E8E9F"; 
        sCtx.font = `800 45px 'Nunito', sans-serif`; 
        sCtx.fillText(title, x + 320, yOffset + 140);
        
        sCtx.fillStyle = "#4A4A68"; 
        sCtx.font = `900 100px 'Nunito', sans-serif`; 
        sCtx.fillText(value, x + 320, yOffset + 250);
        sCtx.textAlign = "center";
    }

    let h = Math.floor(studyStats.totalSec / 3600);
    let m = Math.floor((studyStats.totalSec % 3600) / 60);

    drawStatCard(580, "Total Focus Time", `${h}h ${m}m`, "⏳");
    drawStatCard(950, "Tasks Completed", `${tasks.filter(t => t.checked).length} Tasks`, "🎯");
    drawStatCard(1320, "Current Streak", `${studyStats.streak} Days`, "🔥");

    sCtx.font = `700 40px 'Nunito', ${emojiFont}`; 
    sCtx.fillStyle = "#9FB4D4";
    sCtx.fillText("Made with My Workspace 💻", 540, 1820);
}

function downloadShareImage() {
    const sc = document.getElementById('share-canvas');
    const a = document.createElement('a'); a.href = sc.toDataURL("image/png");
    a.download = `Study_Progress_${new Date().toISOString().split('T')[0]}.png`;
    a.click(); showToast("Image Saved! 🚀");
}

async function nativeShareImage() {
    const sc = document.getElementById('share-canvas');
    sc.toBlob(async (blob) => {
        try {
            const file = new File([blob], "Study_Progress.png", { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: 'My Study Progress 🔥', text: 'Flow State Achieved! 🚀', files: [file] });
            } else { showToast("Direct sharing not supported here. Use Save to Device!"); }
        } catch (error) { console.log("Sharing failed", error); }
    });
}

function fillCanvasWhite() {}

function resizeCanvas() {
    if(!canvas || !container || !ctx) return;
    const dataURL = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL() : null; 
    canvas.width = container.offsetWidth || window.innerWidth; 
    canvas.height = container.offsetHeight || 750;
    
    if (dataURL) {
        const img = new Image(); img.src = dataURL; 
        img.onload = () => { ctx.drawImage(img, 0, 0); updateMainCanvasImage(); };
    } else { updateMainCanvasImage(); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}
window.addEventListener('resize', resizeCanvas);

function updateMainCanvasImage() {
    if(!canvas) return;
    mainCanvasBackup.width = canvas.width;
    mainCanvasBackup.height = canvas.height;
    const bCtx = mainCanvasBackup.getContext('2d');
    bCtx.drawImage(canvas, 0, 0);
}

const saveCanvas = () => { 
    if(!canvas || !ctx) return; 
    try { localStorage.setItem('studyCanvas_' + currentBoardIndex, canvas.toDataURL('image/png')); } catch(e) {}
};

function loadCanvas() {
    let savedImage = localStorage.getItem('studyCanvas_' + currentBoardIndex);
    if (!savedImage && currentBoardIndex === 1) { savedImage = localStorage.getItem('studyCanvas'); }
    
    if (savedImage && canvas && ctx) {
        const img = new Image();
        img.src = savedImage;
        img.onload = () => { 
            ctx.drawImage(img, 0, 0); 
            updateMainCanvasImage(); 
        };
    }
}

function switchBoard(index) {
    if (sel.active) stampSelection(); 
    
    saveCanvas();
    saveStickiesToStorage();
    
    currentBoardIndex = index;
    
    document.querySelectorAll('.board-tab').forEach(b => b.classList.remove('active'));
    const activeTab = document.getElementById('tab-board-' + index);
    if(activeTab) activeTab.classList.add('active');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    loadCanvas();
    
    let loadedStickies = localStorage.getItem('studyStickies_' + index);
    if (!loadedStickies && index === 1) { loadedStickies = localStorage.getItem('studyStickies'); }
    savedStickies = loadedStickies ? JSON.parse(loadedStickies) : [];
    renderStickies();
    
    showToast("Switched to Board " + index + " 🎨");
}

function stampSelection() {
    if (sel.active && selCanvas.width > 0 && ctx) {
        if (mainCanvasBackup.width > 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
            ctx.drawImage(mainCanvasBackup, 0, 0);
        }
        ctx.globalAlpha = 1.0;
        ctx.drawImage(selCanvas, sel.x, sel.y); 
        sel.active = false;
        updateMainCanvasImage();
        saveCanvas(); 
    }
}

function setTool(tool) {
    if (sel.active) stampSelection();
    
    if (ctx && mainCanvasBackup.width > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
        ctx.drawImage(mainCanvasBackup, 0, 0);
    }
    
    currentTool = tool;
    document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('tool-' + tool);
    if(btn) btn.classList.add('active');
    
    updateMainCanvasImage();
}

function getMouseCoordinates(e) { 
    const rect = canvas.getBoundingClientRect(); 
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }; 
}
function getTouchCoordinates(e) { 
    const rect = canvas.getBoundingClientRect(); 
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }; 
}

function handleStart(pos) {
    if(!ctx || !canvas) return;
    lastX = pos.x; lastY = pos.y;
    if (currentTool === 'select') {
        if (sel.active) {
            if (pos.x >= sel.x && pos.x <= sel.x + sel.w && pos.y >= sel.y && pos.y <= sel.y + sel.h) {
                sel.isMoving = true; sel.startX = pos.x - sel.x; sel.startY = pos.y - sel.y; return;
            } else stampSelection();
        }
        isDrawing = true; startX = pos.x; startY = pos.y; return;
    }
    stampSelection();
    isDrawing = true; startX = pos.x; startY = pos.y;
    ctx.beginPath(); ctx.moveTo(startX, startY);
}

function handleMove(pos) {
    if(!ctx || !canvas) return;
    if (currentTool === 'select') {
        if (sel.isMoving && sel.active) {
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if(mainCanvasBackup.width > 0) ctx.drawImage(mainCanvasBackup, 0, 0);
            sel.x = pos.x - sel.startX; sel.y = pos.y - sel.startY;
            ctx.globalAlpha = 1.0; ctx.drawImage(selCanvas, sel.x, sel.y); 
            ctx.setLineDash([5, 5]); ctx.strokeStyle = '#9FB4D4'; ctx.lineWidth = 2;
            ctx.strokeRect(sel.x, sel.y, sel.w, sel.h); ctx.setLineDash([]);
        } else if (isDrawing) {
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if(mainCanvasBackup.width > 0) ctx.drawImage(mainCanvasBackup, 0, 0);
            ctx.setLineDash([5, 5]); ctx.strokeStyle = '#9FB4D4'; ctx.lineWidth = 2;
            ctx.strokeRect(startX, startY, pos.x - startX, pos.y - startY); ctx.setLineDash([]);
        }
        lastX = pos.x; lastY = pos.y; return;
    }

    if (!isDrawing) { lastX = pos.x; lastY = pos.y; return; }
    
    const hex = colorPicker ? colorPicker.value : '#B5A1D9'; 
    ctx.lineWidth = activeThickness; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    
    if (currentTool === 'pen' || currentTool === 'eraser') {
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over'; 
        ctx.strokeStyle = currentTool === 'eraser' ? 'rgba(0,0,0,1)' : hex; 
        ctx.globalAlpha = 1.0;
        ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    } else {
        ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if(mainCanvasBackup.width > 0) ctx.drawImage(mainCanvasBackup, 0, 0);
        
        if (['highlighter', 'gouache'].includes(currentTool)) {
            if (currentTool === 'highlighter') {
                let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.08)`; ctx.globalAlpha = 1.0; 
            } else {
                ctx.globalAlpha = 0.2; ctx.shadowBlur = activeThickness * 1.5; ctx.shadowColor = hex; ctx.strokeStyle = hex;
            }
            ctx.lineTo(pos.x, pos.y); ctx.stroke();
        } else {
            ctx.globalAlpha = 1.0; ctx.strokeStyle = hex; ctx.beginPath();
            if (currentTool === 'rect') ctx.strokeRect(startX, startY, pos.x - startX, pos.y - startY); 
            else if (currentTool === 'circle') { let radius = Math.sqrt(Math.pow(pos.x - startX, 2) + Math.pow(pos.y - startY, 2)); ctx.arc(startX, startY, radius, 0, 2 * Math.PI); ctx.stroke(); } 
            else if (currentTool === 'line') { ctx.moveTo(startX, startY); ctx.lineTo(pos.x, pos.y); ctx.stroke(); } 
            else if (currentTool === 'arrow') {
                ctx.moveTo(startX, startY); ctx.lineTo(pos.x, pos.y); ctx.stroke();
                let angle = Math.atan2(pos.y - startY, pos.x - startX);
                ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - 15 * Math.cos(angle - Math.PI / 6), pos.y - 15 * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(pos.x, pos.y);
                ctx.lineTo(pos.x - 15 * Math.cos(angle + Math.PI / 6), pos.y - 15 * Math.sin(angle + Math.PI / 6)); ctx.stroke();
            } 
            else if (currentTool === 'triangle') { ctx.moveTo(startX + (pos.x - startX) / 2, startY); ctx.lineTo(startX, pos.y); ctx.lineTo(pos.x, pos.y); ctx.closePath(); ctx.stroke(); } 
            else if (currentTool === 'diamond') { ctx.moveTo(startX + (pos.x - startX) / 2, startY); ctx.lineTo(pos.x, startY + (pos.y - startY) / 2); ctx.lineTo(startX + (pos.x - startX) / 2, pos.y); ctx.lineTo(startX, startY + (pos.y - startY) / 2); ctx.closePath(); ctx.stroke(); }
        }
    }
    lastX = pos.x; lastY = pos.y;
}

function handleEnd() {
    if(!ctx || !canvas) return;
    ctx.globalAlpha = 1.0; ctx.shadowBlur = 0;
    
    if (currentTool === 'select') {
        if (sel.isMoving) { 
            sel.isMoving = false; ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if(mainCanvasBackup.width > 0) ctx.drawImage(mainCanvasBackup, 0, 0);
            ctx.drawImage(selCanvas, sel.x, sel.y); updateMainCanvasImage();
            ctx.setLineDash([5, 5]); ctx.strokeStyle = '#9FB4D4'; ctx.lineWidth = 2;
            ctx.strokeRect(sel.x, sel.y, sel.w, sel.h); ctx.setLineDash([]);
        } else if (isDrawing) { 
            isDrawing = false; 
            let rw = lastX - startX, rh = lastY - startY;
            sel.x = rw > 0 ? startX : lastX; sel.y = rh > 0 ? startY : lastY;
            sel.w = Math.abs(rw); sel.h = Math.abs(rh);
            
            if (sel.w > 5 && sel.h > 5) {
                ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if(mainCanvasBackup.width > 0) ctx.drawImage(mainCanvasBackup, 0, 0);
                
                sel.imgData = ctx.getImageData(sel.x, sel.y, sel.w, sel.h); 
                sel.active = true;
                selCanvas.width = sel.w; selCanvas.height = sel.h;
                selCanvas.getContext('2d').putImageData(sel.imgData, 0, 0);
                
                if (mainCanvasBackup.width > 0) {
                    const bCtx = mainCanvasBackup.getContext('2d');
                    bCtx.clearRect(sel.x, sel.y, sel.w, sel.h);
                }

                ctx.clearRect(sel.x, sel.y, sel.w, sel.h); updateMainCanvasImage();
                ctx.drawImage(selCanvas, sel.x, sel.y);
                ctx.setLineDash([5, 5]); ctx.strokeStyle = '#9FB4D4'; ctx.lineWidth = 2;
                ctx.strokeRect(sel.x, sel.y, sel.w, sel.h); ctx.setLineDash([]);
            } else sel.active = false;
        }
        return;
    }
    
    if (isDrawing) { isDrawing = false; updateMainCanvasImage(); saveCanvas(); }
}

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('whiteboard');
    if (canvas) {
        canvas.addEventListener('mousedown', (e) => { if (deviceMode === 'mouse') handleStart(getMouseCoordinates(e)); });
        canvas.addEventListener('mousemove', (e) => { if (deviceMode === 'mouse') handleMove(getMouseCoordinates(e)); });
        canvas.addEventListener('mouseup', () => { if (deviceMode === 'mouse') handleEnd(); });
        canvas.addEventListener('mouseout', () => { if (deviceMode === 'mouse' && isDrawing) handleEnd(); });

        canvas.addEventListener('touchstart', (e) => { if (deviceMode === 'touch') { e.preventDefault(); handleStart(getTouchCoordinates(e)); } }, {passive: false});
        canvas.addEventListener('touchmove', (e) => { if (deviceMode === 'touch') { e.preventDefault(); handleMove(getTouchCoordinates(e)); } }, {passive: false});
        canvas.addEventListener('touchend', (e) => { if (deviceMode === 'touch') { e.preventDefault(); handleEnd(); } });
    }
});

function clearCanvas() {
    if(!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    sel.active = false; sel.imgData = null; 
    updateMainCanvasImage();
    saveCanvas(); 
    
    savedStickies = [];
    saveStickiesToStorage();
    renderStickies();
    showToast("Board & Notes cleared! 🧹");
}

function saveBoardToGallery() {
    if(!canvas || !ctx) return; 
    if (sel.active) stampSelection();
    
    const rawCanvasURL = canvas.toDataURL('image/png'); 
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);
    
    const isDark = document.body.classList.contains('dark-mode');
    
    savedStickies.forEach(note => {
        const x = parseInt(note.left, 10) || 0; const y = parseInt(note.top, 10) || 0;
        tempCtx.shadowColor = "rgba(0,0,0,0.15)"; tempCtx.shadowBlur = 15; tempCtx.shadowOffsetY = 5;
        tempCtx.fillStyle = isDark ? '#2A2A35' : '#FFFFFF';
        tempCtx.beginPath(); tempCtx.roundRect(x, y, 220, 220, 16); tempCtx.fill();
        tempCtx.fillStyle = note.color || '#9FB4D4';
        tempCtx.beginPath(); tempCtx.roundRect(x, y, 220, 14, [16, 16, 0, 0]); tempCtx.fill();
        tempCtx.shadowBlur = 0; tempCtx.shadowOffsetY = 0;
        
        tempCtx.fillStyle = isDark ? '#EAEAEA' : '#4A4A68'; tempCtx.font = "600 15px 'Nunito', sans-serif";
        const words = note.text.split(' '); let line = ''; let textY = y + 45;
        for(let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' '; let metrics = tempCtx.measureText(testLine);
            if (metrics.width > 180 && n > 0) { tempCtx.fillText(line, x + 20, textY); line = words[n] + ' '; textY += 24; } 
            else line = testLine;
            if (textY > y + 200) break; 
        }
        tempCtx.fillText(line, x + 20, textY);
    });

    const thumbnailURL = tempCanvas.toDataURL('image/png');
    const now = new Date(); const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const stickiesCopy = JSON.parse(JSON.stringify(savedStickies)); 
    
    savedBoards.unshift({ id: Date.now(), img: thumbnailURL, raw: rawCanvasURL, date: dateStr, stickies: stickiesCopy }); 
    if(savedBoards.length > 12) savedBoards.pop(); 
    try { localStorage.setItem('savedBoards', JSON.stringify(savedBoards)); renderGallery(); showToast("Board saved to gallery! 🎨"); }
    catch(e) { showToast("Storage full! Delete old boards first."); }
}

function deleteBoard(id) { savedBoards = savedBoards.filter(b => b.id != id); localStorage.setItem('savedBoards', JSON.stringify(savedBoards)); renderGallery(); }

function loadBoardFromGallery(id) {
    const board = savedBoards.find(b => b.id == id);
    if(board && ctx && canvas) { 
        const img = new Image(); img.src = board.raw || board.img; 
        img.onload = () => { 
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); 
            updateMainCanvasImage(); saveCanvas(); 
        }; 
        savedStickies = board.stickies ? JSON.parse(JSON.stringify(board.stickies)) : [];
        saveStickiesToStorage(); renderStickies();
    }
}
function filterGallery(text) { renderGallery(text.toLowerCase()); }
function renderGallery(filterText = '') {
    const gal = document.getElementById('board-gallery'); if(!gal) return; gal.innerHTML = '';
    let filteredBoards = savedBoards;
    if (filterText) filteredBoards = savedBoards.filter(b => b.date && b.date.toLowerCase().includes(filterText));
    filteredBoards.forEach(board => {
        const div = document.createElement('div'); div.className = 'board-thumb-wrapper fade-in-up';
        div.innerHTML = `<img src="${board.img}" class="board-thumb bouncy-hover" onclick="loadBoardFromGallery('${board.id}')"><div class="board-date">${board.date || 'Unknown Date'}</div><button class="board-delete-btn bouncy-hover" onclick="deleteBoard('${board.id}')">✕</button>`;
        gal.appendChild(div);
    });
}

function insertImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            let w = img.width, h = img.height;
            if (w > 350) { 
                h = h * (350 / w); 
                w = 350; 
            }
            
            setTool('select');
            
            sel.active = true;
            sel.w = w; sel.h = h;
            sel.x = (canvas.width / 2) - (w / 2);
            sel.y = (canvas.height / 2) - (h / 2);
            
            selCanvas.width = w; selCanvas.height = h;
            const sCtx = selCanvas.getContext('2d');
            sCtx.drawImage(img, 0, 0, w, h);
            
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if(mainCanvasBackup.width > 0) ctx.drawImage(mainCanvasBackup, 0, 0);
            
            ctx.drawImage(selCanvas, sel.x, sel.y);
            ctx.setLineDash([5, 5]); ctx.strokeStyle = '#9FB4D4'; ctx.lineWidth = 2;
            ctx.strokeRect(sel.x, sel.y, sel.w, sel.h); ctx.setLineDash([]);
            
            showToast("Image added! Drag to move it 🖼️");
        }
    }
    reader.readAsDataURL(file);
}

function addStickyNote() { 
    const randomColor = stickyPastels[Math.floor(Math.random() * stickyPastels.length)];
    savedStickies.push({ id: 'sticky-' + Date.now(), text: 'Type here...', top: '40px', left: '40px', color: randomColor }); 
    saveStickiesToStorage(); renderStickies(); 
}
function saveStickiesToStorage() { try { localStorage.setItem('studyStickies_' + currentBoardIndex, JSON.stringify(savedStickies)); } catch(e){} }
function updateStickyText(id, text) { const note = savedStickies.find(s => s.id === id); if(note) { note.text = text; saveStickiesToStorage(); } }
function deleteSticky(id) { savedStickies = savedStickies.filter(s => s.id !== id); saveStickiesToStorage(); renderStickies(); }

function renderStickies() {
    const container = document.getElementById('sticky-notes-container'); if(!container) return; container.innerHTML = '';
    savedStickies.forEach(note => {
        const div = document.createElement('div'); div.className = 'sticky-note fade-in-up bouncy-hover'; 
        div.style.top = note.top; div.style.left = note.left;
        const noteColor = note.color || '#9FB4D4'; div.style.borderColor = noteColor; div.style.borderTopColor = noteColor;

        const handle = document.createElement('div'); handle.className = 'sticky-drag-handle';
        handle.innerHTML = `<span class="sticky-note-delete" onclick="deleteSticky('${note.id}')">✕` + '</span>';
        
        if(deviceMode === 'mouse') { handle.addEventListener('mousedown', (e) => dragStickyMouse(e, div, note.id)); } 
        else if (deviceMode === 'touch') { handle.addEventListener('touchstart', (e) => dragStickyTouch(e, div, note.id), {passive: false}); }

        const content = document.createElement('div'); content.className = 'sticky-content'; content.contentEditable = true; content.innerText = note.text;
        content.oninput = (e) => updateStickyText(note.id, e.target.innerText);
        div.appendChild(handle); div.appendChild(content); container.appendChild(div);
    });
}

function dragStickyMouse(e, elmnt, id) {
    if(e.target.classList.contains('sticky-note-delete')) return; e.preventDefault();
    let pos1 = 0, pos2 = 0, pos3 = e.clientX, pos4 = e.clientY;
    function moveMove(ev) { ev.preventDefault(); pos1 = pos3 - ev.clientX; pos2 = pos4 - ev.clientY; pos3 = ev.clientX; pos4 = ev.clientY; elmnt.style.top = (elmnt.offsetTop - pos2) + "px"; elmnt.style.left = (elmnt.offsetLeft - pos1) + "px"; }
    function moveEnd() { document.removeEventListener('mousemove', moveMove); document.removeEventListener('mouseup', moveEnd); const note = savedStickies.find(s => s.id === id); if(note) { note.top = elmnt.style.top; note.left = elmnt.style.left; saveStickiesToStorage(); } }
    document.addEventListener('mousemove', moveMove); document.addEventListener('mouseup', moveEnd);
}

function dragStickyTouch(e, elmnt, id) {
    if(e.target.classList.contains('sticky-note-delete')) return; e.preventDefault();
    let pos1 = 0, pos2 = 0, pos3 = e.touches[0].clientX, pos4 = e.touches[0].clientY;
    function moveMove(ev) { ev.preventDefault(); pos1 = pos3 - e.touches[0].clientX; pos2 = pos4 - e.touches[0].clientY; pos3 = e.touches[0].clientX; pos4 = e.touches[0].clientY; elmnt.style.top = (elmnt.offsetTop - pos2) + "px"; elmnt.style.left = (elmnt.offsetLeft - pos1) + "px"; }
    function moveEnd() { document.removeEventListener('touchmove', moveMove); document.removeEventListener('touchend', moveEnd); const note = savedStickies.find(s => s.id === id); if(note) { note.top = elmnt.style.top; note.left = elmnt.style.left; saveStickiesToStorage(); } }
    document.addEventListener('touchmove', moveMove, {passive: false}); document.addEventListener('touchend', moveEnd);
}