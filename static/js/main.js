// ============================================================
// main.js - Application Entry Point
// ============================================================

import { getTargetAngle, getTargetReps, getHoldTime, EXERCISES } from './config.js';
import { initializePose, setupCamera, startCamera, stopCamera, drawSkeleton } from './camera.js';
import { extractAngles, smoothAngle } from './poseProcessor.js';
import {
    countArmRaises,
    countOverheadHold,
    getArmRaisesFeedback,
    getOverheadHoldFeedback,
    resetExerciseState,
    getHoldState,
    countBicepCurls,
    getBicepFeedback,
    computeElbowAngle,
    computePreferredElbowAngle,
    resetBicepCounter
} from './exercises.js';
import { initSitToStandModel, predictSitToStandFrame, resetSitToStandLogic } from './exercises.js';
import {
    logDataPoint,
    saveSession,
    loadSessionHistory,
    resetSessionData
} from './sessionManager.js';
import {
    updateAngleDisplay,
    updateFeedback,
    updateProgressRing,
    updateRepCounter,
    updateSessionDuration,
    showSessionSummary,
    hideSessionSummary,
    updateExerciseUI,
    toggleFeedback,
    toggleButtons,
    renderHistoryTable
} from './uiController.js';
import { renderAngleChart, setupChartFilters } from './charts.js';
import { initAuthUI } from './auth.js';

// ===== APPLICATION STATE =====
const state = {
    // Core
    camera: null,
    pose: null,
    isSessionActive: false,
    sessionStartTime: null,
    currentExercise: 'seated-arm-raises',



    // Tracking
    repCount: 0,
    leftAngleSmoothed: 0,
    rightAngleSmoothed: 0,
    leftMaxAngle: 0,
    rightMaxAngle: 0,
    hipAngle: 0,
    hipAngleSmoothed: 0,
    hipLowObserved: null,
    hipHighObserved: null,


    // Settings
    difficultyLevel: 2,
    targetAngle: 60,
    requiredHoldTime: 5000
    ,
    // Sit-to-Stand timing
    repStartTime: null,
    sessionSplits: []
};



// ===== DOM ELEMENTS =====
// Defer DOM queries until the document is ready to ensure elements exist
let elements = {
    webcam: null,
    canvas: null,
    startBtn: null,
    stopBtn: null,
    difficultySelect: null,
    saveSessionBtn: null,
    closeModalBtn: null,
    backBtn: null,
    navLinks: null,
    exerciseCards: null
};

// Frame processing lock to avoid double updates while a frame is being processed
let isProcessing = false;
// ===== POSE DETECTION CALLBACK =====
async function onPoseResults(results) {
    if (!state.isSessionActive || isProcessing) return;
    isProcessing = true;

    const ctx = elements.canvas.getContext('2d');
    try {
        ctx.save();
        ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);

        if (results.poseLandmarks) {
            // Draw skeleton
            drawSkeleton(ctx, results.poseLandmarks);

            // Extract and smooth angles
            const { leftAngle, rightAngle } = extractAngles(results.poseLandmarks);
            state.leftAngleSmoothed = smoothAngle(leftAngle, state.leftAngleSmoothed);
            state.rightAngleSmoothed = smoothAngle(rightAngle, state.rightAngleSmoothed);

            // Update max angles
            if (state.leftAngleSmoothed > state.leftMaxAngle) {
                state.leftMaxAngle = state.leftAngleSmoothed;
            }
            if (state.rightAngleSmoothed > state.rightMaxAngle) {
                state.rightMaxAngle = state.rightAngleSmoothed;
            }

            // Update UI
            updateAngleDisplay(state.leftAngleSmoothed, 'left', state.targetAngle, state.leftMaxAngle);
            updateAngleDisplay(state.rightAngleSmoothed, 'right', state.targetAngle, state.rightMaxAngle);

            // Count reps and update feedback
            if (state.currentExercise === 'overhead-hold') {
                const holdState = countOverheadHold(
                    state.leftAngleSmoothed,
                    state.rightAngleSmoothed,
                    state.targetAngle,
                    state.requiredHoldTime,
                    state.repCount
                );

                state.repCount = holdState.repCount;
                holdState.requiredHoldTime = state.requiredHoldTime;

                const feedback = getOverheadHoldFeedback(
                    state.leftAngleSmoothed,
                    state.rightAngleSmoothed,
                    state.targetAngle,
                    holdState
                );

                updateFeedback(feedback.left, feedback.right);
                updateProgressRing(state.leftAngleSmoothed, 'left', state.targetAngle, state.currentExercise, holdState);
                updateProgressRing(state.rightAngleSmoothed, 'right', state.targetAngle, state.currentExercise, holdState);

                // Log data
                logDataPoint(state.currentExercise, state.leftAngleSmoothed, state.rightAngleSmoothed, state.repCount, holdState.holdDuration);

            } else if (state.currentExercise === 'sit-to-stand') {
                // Sit-to-Stand (model-based)
                try {
                    const result = await predictSitToStandFrame(elements.webcam, state.repCount, results.poseLandmarks);
                    if (result && typeof result.repCount === 'number') {
                        // If a new rep was just counted
                        if (result.repCount > state.repCount) {
                            const now = Date.now();
                            // Calculate seconds since last rep (or session start)
                            const startTime = state.repStartTime || state.sessionStartTime;
                            const splitTime = ((now - startTime) / 1000).toFixed(2);

                            state.sessionSplits.push(splitTime);
                            state.repStartTime = now; // Reset timer for next rep
                        }
                        state.repCount = result.repCount;
                    }

                    // If model didn't load, show a clear message
                    if (result && result.modelLoaded === false) {
                        updateFeedback({ status: 'Model not loaded', text: 'Model not loaded', color: '#ffc107' });
                        // Try to (re)load the model in background once — do not exit the frame handler
                        initSitToStandModel('/static/models/sit_to_stand/').catch(() => {
                            console.warn('Background model reload failed');
                        });
                    }

                    // Build feedback based on the strict winner returned from the model
                    const preds = result && result.predictions ? result.predictions : null;
                    const winnerState = result && result.winnerState ? result.winnerState : null;
                    const winnerProb = result && typeof result.winnerProb === 'number' ? result.winnerProb : 0;
                    const tmStage = result && typeof result.tm_stage !== 'undefined' ? result.tm_stage : null;

                    // Only show a definitive class when the winner exceeds the strict threshold (0.85).
                    // Otherwise show 'Moving'. Also show 'Rep Cancelled' when predictor returned badForm cancellation.
                    if (!preds || preds.length === 0) {
                        updateFeedback({ status: 'No pose', text: 'No pose', color: '#ffc107' });
                    } else if (result.badForm && tmStage && (tmStage === 1 || tmStage === 2)) {
                        // explicit cancelled rep (model top-winner was 'bad' during a rep)
                        updateFeedback({ status: 'Rep Cancelled', text: 'Rep Cancelled', color: '#ff5252' });
                    } else if (result.invalidRep) {
                        // aggregated bad-class probability indicated hand use -> rep invalid
                        updateFeedback({ status: 'Rep not counted: Used hands!', text: 'Rep not counted: Used hands!', color: '#ff5252' });
                    } else if (winnerState && winnerProb > 0.85) {
                        if (winnerState === 'seated') updateFeedback({ status: 'Seated', text: 'Seated', color: '#28a745' });
                        else if (winnerState === 'standing') updateFeedback({ status: 'Standing', text: 'Standing', color: '#28a745' });
                        else updateFeedback({ status: 'Moving', text: 'Moving', color: '#ffc107' });
                    } else {
                        updateFeedback({ status: 'Moving', text: 'Moving', color: '#ffc107' });
                    }

                    // Log minimal data (no hip angles when using model)
                    logDataPoint(state.currentExercise, 0, 0, state.repCount);

                    // Check completion
                    const targetReps = getTargetReps(state.currentExercise, state.difficultyLevel);
                    if (state.repCount >= targetReps && state.isSessionActive) {
                        setTimeout(() => stopSessionHandler(), 1000);
                    }
                } catch (e) {
                    // On error, show no-pose feedback and keep app running
                    console.error('Sit-to-Stand prediction error', e);
                    updateFeedback({ status: 'No pose', text: 'No pose', color: '#ffc107' });
                }
            } else {
                // Bicep Curl - angle-based (Nicholas Renotte approach)
                if (state.currentExercise === 'bicep-curl') {
                    const pref = computePreferredElbowAngle(results.poseLandmarks);
                    const elbowAngle = pref && typeof pref.angle === 'number' ? pref.angle : null;
                    const detectedSide = pref && pref.side ? pref.side : 'left';
                    if (elbowAngle !== null) {
                        const res = countBicepCurls(elbowAngle);
                        state.repCount = res.repCount;

                        // Update small UI card for bicep if present
                        const repsEl = document.getElementById('bicep-reps');
                        const stageEl = document.getElementById('bicep-stage');
                        const angleEl = document.getElementById('bicep-angle');
                        const progressInner = document.getElementById('bicep-progress-inner');
                        if (repsEl) repsEl.textContent = String(state.repCount);
                        if (stageEl) stageEl.textContent = (res.state || 'up').toUpperCase();
                        if (angleEl) angleEl.textContent = Math.round(elbowAngle) + '°';

                        // progressPercent: 160° -> 0%, 30° -> 100%
                        const MIN_ANGLE = 32; const MAX_ANGLE = 160;
                        let pct = ((MAX_ANGLE - elbowAngle) / (MAX_ANGLE - MIN_ANGLE)) * 100;
                        pct = Math.max(0, Math.min(100, pct));
                        if (progressInner) progressInner.style.width = pct + '%';

                        // show card when bicep exercise selected
                        const bcard = document.getElementById('bicep-progress-card');
                        if (bcard) bcard.style.display = 'block';

                        // ALSO update the single shoulder progress/feedback to reflect bicep elbow angle
                        // Update left progress ring and left displays to show elbow angle
                        state.leftAngleSmoothed = elbowAngle;
                        if (state.leftAngleSmoothed > state.leftMaxAngle) state.leftMaxAngle = state.leftAngleSmoothed;

                        const leftAngleEl = document.getElementById('left-angle');
                        const leftPercentEl = document.getElementById('left-percent');
                        const leftMaxEl = document.getElementById('left-max');
                        if (leftAngleEl) leftAngleEl.textContent = `${Math.round(elbowAngle)}°`;
                        if (leftPercentEl) leftPercentEl.textContent = `${Math.round(pct)}%`;
                        if (leftMaxEl) leftMaxEl.textContent = `Max: ${Math.round(state.leftMaxAngle)}°`;

                        // Update left progress ring with bicep mapping (use left UI for display)
                        updateProgressRing(elbowAngle, 'left', null, 'bicep-curl');

                        // Real-time feedback: single-item feedback based on elbow angle
                        try {
                            const fb = getBicepFeedback(elbowAngle);
                            // annotate feedback with side for debugging/display if needed
                            updateFeedback(fb);
                        } catch (e) { }

                        // Log data point for bicep curl so sessionData is populated for saving
                        try {
                            logDataPoint('bicep-curl', elbowAngle, 0, state.repCount);
                        } catch (e) { }
                    }
                }
                // Arm raises — skip when Bicep Curl is active so its feedback isn't overwritten
                if (state.currentExercise !== 'bicep-curl') {
                    state.repCount = countArmRaises(
                        state.leftAngleSmoothed,
                        state.rightAngleSmoothed,
                        state.targetAngle,
                        state.repCount
                    );

                    const leftFeedback = getArmRaisesFeedback(state.leftAngleSmoothed, state.targetAngle);
                    const rightFeedback = getArmRaisesFeedback(state.rightAngleSmoothed, state.targetAngle);

                    updateFeedback(leftFeedback, rightFeedback);
                    updateProgressRing(state.leftAngleSmoothed, 'left', state.targetAngle, state.currentExercise);
                    updateProgressRing(state.rightAngleSmoothed, 'right', state.targetAngle, state.currentExercise);

                    // Log data
                    logDataPoint(state.currentExercise, state.leftAngleSmoothed, state.rightAngleSmoothed, state.repCount);
                }
            }

            updateRepCounter(state.repCount, state.currentExercise, state.difficultyLevel);

            // Check if session complete
            const targetReps = getTargetReps(state.currentExercise, state.difficultyLevel);
            if (state.repCount >= targetReps && state.isSessionActive) {
                setTimeout(() => stopSessionHandler(), 1000);
            }
        } else {
            // No pose detected
            const leftEl = document.getElementById('left-feedback');
            const rightEl = document.getElementById('right-feedback');
            if (leftEl) leftEl.textContent = 'No pose detected';
            if (rightEl) rightEl.textContent = 'No pose detected';
        }
    } catch (e) {
        console.error('onPoseResults error', e);
    } finally {
        try { ctx.restore(); } catch (e) { }
        isProcessing = false;
    }
}

// ===== SESSION HANDLERS =====
async function startSessionHandler() {
    if (state.isSessionActive) return;

    // Reset state
    resetSessionData();
    resetExerciseState();
    state.repCount = 0;
    state.sessionSplits = [];
    state.leftMaxAngle = 0;
    state.rightMaxAngle = 0;
    state.leftAngleSmoothed = 0;
    state.rightAngleSmoothed = 0;

    // If Sit-to-Stand, preload model immediately and show countdown
    if (state.currentExercise === 'sit-to-stand') {
        // Start preloading model in background while countdown runs
        initSitToStandModel('/static/models/sit_to_stand/').catch(() => {
            console.warn('Sit-to-Stand model failed to load; falling back to angle-based counting.');
        });

        // Show a 5-second on-screen countdown so user can get into position
        showCountdownOverlay(5, 'Get ready — position on the chair');
        return;
    }

    // For other exercises, start immediately
    await beginSession();
}

// Begin actual session initialization (camera, pose, UI)
async function beginSession() {
    // Initialize pose and camera
    state.pose = initializePose(onPoseResults);
    await setupCamera(elements.webcam, elements.canvas);
    state.camera = await startCamera(elements.webcam, state.pose);

    // Update UI
    state.isSessionActive = true;
    state.sessionStartTime = Date.now();

    state.repStartTime = Date.now(); // Reset the "stopwatch" for the first rep
    state.sessionSplits = [];

    toggleButtons(true);
    toggleFeedback(true);

    // Ensure the exercise UI reflects the chosen exercise when a session begins
    try {
        updateExerciseUI(state.currentExercise, state.difficultyLevel, state.targetAngle, state.requiredHoldTime);
    } catch (e) { }

    // Start duration timer
    updateDurationTimer();
}

// Utility: show a centered countdown overlay for `seconds` seconds, then start session
function showCountdownOverlay(seconds = 5, message = '') {
    // Prevent double overlays
    if (document.getElementById('countdown-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'countdown-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        zIndex: '2000'
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
        background: 'rgba(255,255,255,0.95)',
        color: '#1f1f2b',
        padding: '28px 34px',
        borderRadius: '12px',
        textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,0.25)'
    });

    const msgEl = document.createElement('div');
    msgEl.textContent = message;
    Object.assign(msgEl.style, { marginBottom: '12px', fontSize: '1rem', color: '#333' });

    const numEl = document.createElement('div');
    numEl.textContent = String(seconds);
    Object.assign(numEl.style, { fontSize: '54px', fontWeight: '800', color: '#667eea' });

    box.appendChild(msgEl);
    box.appendChild(numEl);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let remaining = seconds;
    const intervalId = setInterval(async () => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(intervalId);
            // remove overlay
            overlay.remove();
            // now start the session
            await beginSession();
        } else {
            numEl.textContent = String(remaining);
        }
    }, 1000);
}

function stopSessionHandler() {
    state.isSessionActive = false;
    stopCamera(elements.webcam);

    // Reset exercise-specific runtime state so UI from one session
    // cannot bleed into the next session.
    try {
        resetExerciseState();
    } catch (e) { }
    try {
        resetBicepCounter();
    } catch (e) { }

    // Hide bicep progress card and reset its fields
    try {
        const bcard = document.getElementById('bicep-progress-card');
        if (bcard) bcard.style.display = 'none';
        const repsEl = document.getElementById('bicep-reps'); if (repsEl) repsEl.textContent = '0';
        const stageEl = document.getElementById('bicep-stage'); if (stageEl) stageEl.textContent = 'UP';
        const angleEl = document.getElementById('bicep-angle'); if (angleEl) angleEl.textContent = '0°';
        const progressInner = document.getElementById('bicep-progress-inner'); if (progressInner) progressInner.style.width = '0%';
    } catch (e) { }

    // Reset shoulder progress displays
    try {
        const leftAngleEl = document.getElementById('left-angle'); if (leftAngleEl) leftAngleEl.textContent = '0°';
        const rightAngleEl = document.getElementById('right-angle'); if (rightAngleEl) rightAngleEl.textContent = '0°';
        const leftPercentEl = document.getElementById('left-percent'); if (leftPercentEl) leftPercentEl.textContent = '0%';
        const rightPercentEl = document.getElementById('right-percent'); if (rightPercentEl) rightPercentEl.textContent = '0%';
        const leftMaxEl = document.getElementById('left-max'); if (leftMaxEl) leftMaxEl.textContent = 'Max: 0°';
        const rightMaxEl = document.getElementById('right-max'); if (rightMaxEl) rightMaxEl.textContent = 'Max: 0°';
    } catch (e) { }

    toggleButtons(false);
    toggleFeedback(false);

    // Show summary (pass hip observed values for sit-to-stand)
    const duration = document.getElementById('session-duration').textContent;
    if (state.currentExercise === 'sit-to-stand') {
        showSessionSummary(duration, state.repCount, state.hipLowObserved, state.hipHighObserved, state.currentExercise);
    } else {
        showSessionSummary(duration, state.repCount, state.leftMaxAngle, state.rightMaxAngle, state.currentExercise);
    }
}

function updateDurationTimer() {
    if (!state.isSessionActive) return;
    updateSessionDuration(state.sessionStartTime);
    setTimeout(updateDurationTimer, 1000);
}

// ===== EVENT HANDLERS =====
function setupEventListeners() {
    // Start/Stop buttons
    elements.startBtn?.addEventListener('click', startSessionHandler);
    elements.stopBtn?.addEventListener('click', stopSessionHandler);

    // Difficulty change
    elements.difficultySelect?.addEventListener('change', (e) => {
        state.difficultyLevel = parseInt(e.target.value) || 2;
        state.targetAngle = getTargetAngle(state.currentExercise, state.difficultyLevel);

        if (state.currentExercise === 'overhead-hold') {
            state.requiredHoldTime = getHoldTime(state.currentExercise, state.difficultyLevel);
        }

        updateExerciseUI(state.currentExercise, state.difficultyLevel, state.targetAngle, state.requiredHoldTime);
    });

    // Exercise selection
    elements.exerciseCards.forEach(card => {
        card.addEventListener('click', () => {
            state.currentExercise = card.dataset.exercise;
            state.targetAngle = getTargetAngle(state.currentExercise, state.difficultyLevel);

            if (state.currentExercise === 'overhead-hold') {
                state.requiredHoldTime = getHoldTime(state.currentExercise, state.difficultyLevel);
            }

            updateExerciseUI(state.currentExercise, state.difficultyLevel, state.targetAngle, state.requiredHoldTime);
            showPage('exercise-page');
        });
    });

    // Navigation
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;

            elements.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            if (page === 'home') showPage('home-page');
            else if (page === 'exercises') showPage('exercises-page');
            else if (page === 'history') {
                showPage('history-page');
                loadHistory();
            }
        });
    });

    // Back button
    elements.backBtn?.addEventListener('click', () => {
        if (state.isSessionActive) {
            if (confirm('Stop current session?')) {
                stopSessionHandler();
                showPage('exercises-page');
            }
        } else {
            showPage('exercises-page');
        }
    });

    // Save session
    elements.saveSessionBtn?.addEventListener('click', async () => {
        const duration = document.getElementById('session-duration').textContent;
        const payload = {
            exercise_name: state.currentExercise,
            duration: duration,
            reps: state.repCount,


            rep_splits: state.sessionSplits.join(','),


            // Only store left/right max for shoulder/hold exercises; hide for bicep-curl and sit-to-stand
            left_max: (state.currentExercise === 'bicep-curl' || state.currentExercise === 'sit-to-stand') ? null : Math.round(state.leftMaxAngle),
            right_max: (state.currentExercise === 'bicep-curl' || state.currentExercise === 'sit-to-stand') ? null : Math.round(state.rightMaxAngle),
            difficulty: state.difficultyLevel,
            target_angle: state.targetAngle
        };

        // If sit-to-stand, include hip low/high observed values
        if (state.currentExercise === 'sit-to-stand') {
            payload.hip_low = (typeof state.hipLowObserved === 'number' && !isNaN(state.hipLowObserved)) ? Math.round(state.hipLowObserved) : null;
            payload.hip_high = (typeof state.hipHighObserved === 'number' && !isNaN(state.hipHighObserved)) ? Math.round(state.hipHighObserved) : null;
        }

        const success = await saveSession(payload);
        if (success) {
            hideSessionSummary();
            showPage('exercises-page');
        }
    });

    // Close modal
    elements.closeModalBtn?.addEventListener('click', () => {
        hideSessionSummary();
        showPage('exercises-page');
    });
}

// ===== PAGE NAVIGATION =====
function showPage(pageId) {
    const pages = ['home-page', 'exercises-page', 'exercise-page', 'history-page'];
    pages.forEach(id => {
        const page = document.getElementById(id);
        if (page) {
            page.classList.toggle('active', id === pageId);
        }
    });
}

// ===== LOAD HISTORY =====
async function loadHistory() {
    const sessions = await loadSessionHistory();
    renderHistoryTable(sessions);
    renderAngleChart(sessions, 'all');
}

// ===== INITIALIZE APP =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('PhysioSense initialized');

    // Populate element references after DOM is available
    elements = {
        webcam: document.getElementById('webcam'),
        canvas: document.getElementById('output-canvas'),
        startBtn: document.getElementById('start-btn'),
        stopBtn: document.getElementById('stop-btn'),
        difficultySelect: document.getElementById('difficulty-select'),
        saveSessionBtn: document.getElementById('save-session-btn'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        backBtn: document.getElementById('back-to-home'),
        navLinks: document.querySelectorAll('.nav-link'),
        exerciseCards: document.querySelectorAll('.exercise-card')
    };

    setupEventListeners();
    setupChartFilters();
    initAuthUI();
});


