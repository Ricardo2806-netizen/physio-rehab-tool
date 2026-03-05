// ============================================================
// uiController.js - UI Updates and Rendering
// ============================================================

import { getTargetReps, formatDifficulty, EXERCISES } from './config.js';

//updates the angle display on the UI
export function updateAngleDisplay(angle, side, targetAngle, maxAngle) {
    const rounded = Math.round(angle);
    const percentage = Math.min(Math.round((angle / targetAngle) * 100), 100);

    const angleDisplay = document.getElementById(`${side}-angle`);
    const percentDisplay = document.getElementById(`${side}-percent`);
    const maxDisplay = document.getElementById(`${side}-max`);

    if (angleDisplay) angleDisplay.textContent = `${rounded}°`;
    if (percentDisplay) percentDisplay.textContent = `${percentage}%`;
    if (maxDisplay) maxDisplay.textContent = `Max: ${Math.round(maxAngle)}°`;
}

//updates feedback badges and text based on current state
export function updateFeedback(leftFeedback, rightFeedback) {
    const singleEl = document.getElementById('single-feedback');
    const singleItem = document.getElementById('single-feedback-item');
    const leftEl = document.getElementById('left-feedback');
    const rightEl = document.getElementById('right-feedback');
    const leftItem = document.getElementById('left-feedback-item');
    const rightItem = document.getElementById('right-feedback-item');

    // If only one feedback object provided (sit-to-stand), show single feedback centered
    if (rightFeedback === undefined || rightFeedback == null) {
        if (singleItem) singleItem.style.display = 'flex';
        if (leftItem) leftItem.style.display = 'none';
        if (rightItem) rightItem.style.display = 'none';
        if (singleEl && leftFeedback) {
            singleEl.textContent = leftFeedback.status || leftFeedback.text || '';
            singleEl.style.backgroundColor = leftFeedback.color || 'transparent';
        }
        return;
    }

    // Otherwise show left/right feedback for arm exercises
    if (singleItem) singleItem.style.display = 'none';
    if (leftItem) leftItem.style.display = 'flex';
    if (rightItem) rightItem.style.display = 'flex';

    if (leftEl && leftFeedback) {
        leftEl.textContent = leftFeedback.text || '';
        leftEl.style.backgroundColor = leftFeedback.color || 'transparent';
    }
    if (rightEl && rightFeedback) {
        rightEl.textContent = rightFeedback.text || '';
        rightEl.style.backgroundColor = rightFeedback.color || 'transparent';
    }
}

//updates progress ring
export function updateProgressRing(angle, side, targetAngle, exercise, holdState = null) {
    const circle = document.getElementById(`${side}-progress-circle`);
    if (!circle) return;

    const circumference = 2 * Math.PI * 60;
    let targetPct, color;

    if (exercise === 'overhead-hold' && holdState) {
        if (holdState.holdComplete) {
            targetPct = 1.0;
            color = '#667eea';
        } else if (holdState.holdActive) {
            // Ring drains as timer counts down
            targetPct = 1.0 - Math.min(holdState.holdDuration / holdState.requiredHoldTime, 1.0);
            color = '#28a745';
        } else {
            // Ring fills as arms rise
            targetPct = Math.min(angle / targetAngle, 1.0);
            color = targetPct < 0.5 ? '#ffc107' : '#28a745';
        }
    } else if (exercise === 'bicep-curl') {
        // Map elbow angle: 160deg -> 0%, 32deg -> 100%
        const MIN_ANGLE = 32; const MAX_ANGLE = 160;
        targetPct = (MAX_ANGLE - angle) / (MAX_ANGLE - MIN_ANGLE);
        targetPct = Math.max(0, Math.min(1, targetPct));
        color = targetPct < 0.4 ? '#ffc107' : targetPct < 1 ? '#28a745' : '#667eea';
    } else {
        // Arm raises - ring fills as angle increases
        targetPct = Math.min(angle / targetAngle, 1.2);
        color = targetPct < 0.5 ? '#ffc107' : targetPct < 1 ? '#28a745' : '#667eea';
    }

    circle.style.strokeDashoffset = circumference * (1 - Math.min(targetPct, 1));
    circle.style.stroke = color;
}

//updates rep counter and progress bar
export function updateRepCounter(repCount, exercise, difficulty = 2) {
    const target = getTargetReps(exercise, difficulty);
    const repCounter = document.getElementById('rep-counter');
    const repProgress = document.getElementById('rep-progress');

    if (repCounter) {
        repCounter.textContent = `${repCount} / ${target}`;
    }

    if (repProgress) {
        repProgress.style.width = `${Math.min((repCount / target) * 100, 100)}%`;
    }
}

//updates session duration timer
export function updateSessionDuration(startTime) {
    const elapsed = Date.now() - startTime;
    const m = Math.floor(elapsed / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    
    const durationEl = document.getElementById('session-duration');
    if (durationEl) {
        durationEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
}

//shows the session summary modal with final stats
export function showSessionSummary(duration, repCount, leftMax, rightMax, exercise = 'seated-arm-raises') {
    const modal = document.getElementById('session-complete-modal');
    const finalDuration = document.getElementById('final-duration');
    const finalReps = document.getElementById('final-reps');
    const finalLeftMax = document.getElementById('final-left-max');
    const finalRightMax = document.getElementById('final-right-max');
    const leftLabel = document.getElementById('final-left-label');
    const rightLabel = document.getElementById('final-right-label');

    if (finalDuration) finalDuration.textContent = duration;
    if (finalReps) finalReps.textContent = repCount;

    // For exercises that don't use left/right max (sit-to-stand, bicep-curl), hide those rows
    const hideLeftRight = (exercise === 'sit-to-stand' || exercise === 'bicep-curl');

    if (hideLeftRight) {
        if (leftLabel) leftLabel.style.display = 'none';
        if (rightLabel) rightLabel.style.display = 'none';
        if (finalLeftMax) finalLeftMax.style.display = 'none';
        if (finalRightMax) finalRightMax.style.display = 'none';
    } else {
        if (leftLabel) leftLabel.style.display = '';
        if (rightLabel) rightLabel.style.display = '';
        if (leftLabel) leftLabel.textContent = 'Left Max:';
        if (rightLabel) rightLabel.textContent = 'Right Max:';
        if (finalLeftMax) { finalLeftMax.style.display = ''; finalLeftMax.textContent = leftMax != null ? `${Math.round(leftMax)}°` : '-'; }
        if (finalRightMax) { finalRightMax.style.display = ''; finalRightMax.textContent = rightMax != null ? `${Math.round(rightMax)}°` : '-'; }
    }

    if (modal) modal.style.display = 'flex';
}

//hides the session summary modal
export function hideSessionSummary() {
    const modal = document.getElementById('session-complete-modal');
    if (modal) modal.style.display = 'none';
}

//updates the exercise selection dropdown and related UI elements based on the selected exercise and difficulty
export function updateExerciseUI(exercise, difficulty, targetAngle, requiredHoldTime) {
    const config = EXERCISES[exercise];
    if (!config) return;

    // Update title and subtitle
    const title = document.getElementById('exercise-title');
    const subtitle = document.getElementById('exercise-subtitle');
    const repCounter = document.getElementById('rep-counter');

    if (title) title.textContent = config.name;
    if (subtitle) subtitle.textContent = config.subtitle;
    if (repCounter) repCounter.textContent = `0 / ${getTargetReps(exercise, difficulty)}`;

    // Update difficulty selector
    const difficultySelect = document.getElementById('difficulty-select');
    const difficultyDisplay = document.getElementById('difficulty-display');

    if (difficultySelect) {
        difficultySelect.innerHTML = '';
        Object.entries(config.difficulties).forEach(([level, data]) => {
            const option = document.createElement('option');
            option.value = level;
            option.textContent = data.label;
            if (parseInt(level) === difficulty) option.selected = true;
            difficultySelect.appendChild(option);
        });
    }

    

    if (difficultyDisplay) {
        if (exercise === 'overhead-hold') {
            difficultyDisplay.textContent = `Hold: ${requiredHoldTime / 1000}s at ${targetAngle}°`;
        } else {
            difficultyDisplay.textContent = `Target: ${targetAngle}°`;
        }
    }

    // Sit-to-Stand specific UI: hide shoulder progress card (we don't show shoulders for sit-to-stand)
    const progressCardsNodes = document.querySelectorAll('.progress-card');
    const leftCard = document.getElementById('left-progress-card');
    const rightCard = document.getElementById('right-progress-card');
    if (exercise === 'sit-to-stand') {
        if (repCounter) repCounter.textContent = `0 / ${getTargetReps(exercise, difficulty)}`;

        // Hide the shoulder progress cards (we don't show shoulders for sit-to-stand)
        if (leftCard) leftCard.style.display = 'none';
        if (rightCard) rightCard.style.display = 'none';

        if (difficultySelect) {
            difficultySelect.innerHTML = '';
            if (config.difficulties) {
                Object.entries(config.difficulties).forEach(([level, data]) => {
                    const option = document.createElement('option');
                    option.value = level;
                    option.textContent = data.label || (level + ' - ' + (data.reps || ''));
                    if (parseInt(level) === difficulty) option.selected = true;
                    difficultySelect.appendChild(option);
                });
            }
        }

        if (difficultyDisplay) difficultyDisplay.textContent = `Target: ${getTargetReps(exercise, difficulty)} reps`;
        return;
    }

    // Bicep Curl specific UI: show the bicep progress card and adjust layout
    if (exercise === 'bicep-curl') {
        const bcard = document.getElementById('bicep-progress-card');
        if (bcard) bcard.style.display = 'block';
        // Hide shoulder cards during bicep exercise
        if (leftCard) leftCard.style.display = 'none';
        if (rightCard) rightCard.style.display = 'none';
        if (difficultyDisplay) difficultyDisplay.textContent = `Target: ${getTargetReps(exercise, difficulty)} reps`;
        return;
    }

    // For other exercises ensure the shoulder cards are visible again
    if (leftCard) leftCard.style.display = '';
    if (rightCard) rightCard.style.display = '';

    // Hide bicep card by default for non-bicep exercises
    const bcard = document.getElementById('bicep-progress-card');
    if (bcard) bcard.style.display = 'none';

    // Update progress card labels
    const leftHeader = document.querySelector('#left-progress-card h3');
    const rightHeader = document.querySelector('#right-progress-card h3');
    if (leftHeader) leftHeader.textContent = 'Left Shoulder';
    if (rightHeader) rightHeader.textContent = 'Right Shoulder';
}

//this function toggles the visibility of the webcam feed and feedback display
export function toggleFeedback(active) {
    const placeholder = document.getElementById('feedback-content');
    const feedbackActive = document.getElementById('feedback-active');

    if (placeholder) placeholder.style.display = active ? 'none' : 'block';
    if (feedbackActive) feedbackActive.style.display = active ? 'block' : 'none';
}

//starts start and stops the webcam feed
export function toggleButtons(isActive) {
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');

    if (startBtn) {
        startBtn.style.display = isActive ? 'none' : 'block';
        startBtn.disabled = isActive;
    }

    if (stopBtn) {
        stopBtn.style.display = isActive ? 'block' : 'none';
    }
}

//renders the sessions history table
export function renderHistoryTable(sessions) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No sessions recorded yet.</td></tr>';
        return;
    }
    // Helper: format timestamp as DD/MM/YYYY, HH:MM:SS
    function formatTimestamp(ts) {
        const d = new Date(ts);
        if (isNaN(d)) return ts;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy}, ${hh}:${min}:${ss}`;
    }

    // Helper: render difficulty badge with color
    function difficultyBadge(level) {
        const text = formatDifficulty(level);
        let color = '#6c757d'; // default gray
        if (level === 1) color = '#28a745'; // green - Easy
        else if (level === 2) color = '#667eea'; // blue - Medium
        else if (level === 3) color = '#ff9800'; // orange - Hard
        return `<span style="display:inline-block;padding:4px 8px;border-radius:12px;background:${color};color:#fff;font-weight:600;font-size:0.9rem">${text}</span>`;
    }

    tbody.innerHTML = '';
    sessions.forEach(s => {
        // Map exercise names to friendly labels
        let name = 'Unknown Exercise';
        if (s.exercise_name === 'seated-arm-raises') name = 'Arm Raises';
        else if (s.exercise_name === 'overhead-hold') name = 'Overhead Hold';
        else if (s.exercise_name === 'sit-to-stand') name = 'Sit-to-Stand Test';
        else if (s.exercise_name === 'bicep-curl') name = 'Bicep Curl';

        const ts = formatTimestamp(s.timestamp);
        const duration = typeof s.duration === 'number' ?
            `${String(Math.floor(s.duration/60)).padStart(2,'0')}:${String(s.duration%60).padStart(2,'0')}` : s.duration;

        // Default displays
        // For bicep-curl we repurpose columns: Left -> Peak (smallest angle), Right -> Ext (largest angle)
        let leftCell = '-';
        let rightCell = '-';
        // hip_low and hip_high removed from backend schema; don't render them here

        // Target: for sit-to-stand show reps, otherwise angle
        let target = '-';
        if (s.exercise_name === 'sit-to-stand') {
            target = `${getTargetReps(s.exercise_name, s.difficulty)} reps`;
        } else if (s.target_angle != null) {
            target = `${s.target_angle}°`;
        }

        if (s.exercise_name === 'sit-to-stand') {
            leftCell = '-';
            rightCell = '-';
        } else if (s.exercise_name === 'bicep-curl') {
            // Bicep curls do not expose left/right max values in the history table
            leftCell = '-';
            rightCell = '-';
        } else {
            leftCell = s.left_max != null ? `${s.left_max}°` : '-';
            rightCell = s.right_max != null ? `${s.right_max}°` : '-';
        }

        tbody.innerHTML += `
            <tr class="history-row">
                <td class="history-exercise">${name}</td>
                <td class="history-date">${ts}</td>
                <td class="history-duration">${duration}</td>
                <td class="history-reps">${s.reps}</td>
                <td class="history-left">${leftCell}</td>
                <td class="history-right">${rightCell}</td>
                <td class="history-target">${target}</td>
                <td class="history-difficulty">${difficultyBadge(s.difficulty)}</td>
            </tr>`;
    });
}


