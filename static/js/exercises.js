// ============================================================
// This file Handles all of the rep counting and movement logic 
// ============================================================

import { CONFIG, getTargetReps } from './config.js';
import { checkRaiseThreshold, checkLowerThreshold, checkSymmetry } from './poseProcessor.js';
import { updateFeedback } from './uiController.js';

// Variable for arm raises
let bothSidesRaised = false;

// Variables for overhead holds
let holdActive = false;
let holdStartTime = null;
let holdDuration = 0;
let holdComplete = false;


// Counts the reps for seated arm raises or standing
export function countArmRaises(leftAngle, rightAngle, targetAngle, repCount) {
    const raised = checkRaiseThreshold(leftAngle, rightAngle, targetAngle);
    const lowered = checkLowerThreshold(leftAngle, rightAngle, targetAngle);

    if (raised.bothRaised && !bothSidesRaised) {
        bothSidesRaised = true;
    } else if (lowered.bothLowered && bothSidesRaised) {
        bothSidesRaised = false;
        repCount++;
    }

    return repCount;
}

// Counts reps for overhead holds
export function countOverheadHold(leftAngle, rightAngle, targetAngle, requiredHoldTime, repCount) {
    const leftAbove = leftAngle >= targetAngle;
    const rightAbove = rightAngle >= targetAngle;
    const bothAbove = leftAbove && rightAbove;

    // If arms dropped, reset timer
    if (!bothAbove && holdActive) {
        holdActive = false;
        holdStartTime = null;
        holdDuration = 0;
    }

    // If both arms above and not already completed
    if (bothAbove && !holdComplete) {
        if (!holdActive) {
            holdActive = true;
            holdStartTime = Date.now();
        }

        holdDuration = Date.now() - holdStartTime;

        // Check if hold time reached
        if (holdDuration >= requiredHoldTime) {
            holdComplete = true;
            holdActive = false;
            repCount++;

            // Reset after delay
            setTimeout(() => {
                holdComplete = false;
                holdDuration = 0;
                holdStartTime = null;
            }, CONFIG.HOLD_COMPLETE_DELAY);
        }
    }

    return {
        repCount,
        holdActive,
        holdDuration,
        holdComplete,
        leftAbove,
        rightAbove
    };
}

// Get the realtime feedback for arm raises on-screen
export function getArmRaisesFeedback(angle, targetAngle) {
    const pct = angle / targetAngle;
    
    if (pct < 0.5) {
        return { text: 'Raise higher', color: '#ffc107' };
    } else if (pct <= 1.2) {
        return { text: 'Good range ✓', color: '#28a745' };
    } else {
        return { text: 'Above target', color: '#ff9800' };
    }
}

// -----------------------------
// Angle based bicep curl
// -----------------------------
let _bicepRepCount = 0;
let _bicepState = 'down'; //start 'down' so a full up->down cycle counts
let _bicepLastTransition = 0;
const BICEP_DEBOUNCE_MS = 450;
const BICEP_DOWN_ANGLE = 160;
const BICEP_UP_ANGLE = 32; 

let _bicepUpStreak = 0;
let _bicepDownStreak = 0;
const BICEP_STREAK_CONFIRM = 3; // require 3 consecutive frames to confirm up/down

// Counts bicep curls based on elbow angle with debouncing and streak confirmation to improve accuracy
export function countBicepCurls(angle) {
    if (typeof angle !== 'number' || isNaN(angle)) return { repCount: _bicepRepCount, state: _bicepState };
    const now = Date.now();

    // Update streaks
    if (angle > BICEP_DOWN_ANGLE) {
        _bicepDownStreak++;
    } else {
        _bicepDownStreak = 0;
    }

    if (angle < BICEP_UP_ANGLE) {
        _bicepUpStreak++;
    } else {
        _bicepUpStreak = 0;
    }

    // Confirmed up after consecutive frames (mark the top of the curl)
    if (_bicepUpStreak >= BICEP_STREAK_CONFIRM && _bicepState !== 'up') {
        _bicepState = 'up';
        _bicepLastTransition = now;
        return { repCount: _bicepRepCount, state: _bicepState };
    }

    // Count only if we see a confirmed down after being up, with debounce to prevent false triggers
    if (_bicepDownStreak >= BICEP_STREAK_CONFIRM && _bicepState === 'up') {
        if (now - _bicepLastTransition > BICEP_DEBOUNCE_MS) {
            _bicepRepCount++;
        }
        _bicepState = 'down';
        _bicepLastTransition = now;
        // reset streaks to avoid not counting reps twice in a row
        _bicepUpStreak = 0;
        _bicepDownStreak = 0;
        return { repCount: _bicepRepCount, state: _bicepState };
    }

    return { repCount: _bicepRepCount, state: _bicepState };
}

export function resetBicepCounter() {
    _bicepRepCount = 0;
    _bicepState = 'down';
    _bicepLastTransition = 0;
    _bicepUpStreak = 0;
    _bicepDownStreak = 0;
}

// calculates the angle at the elbow using the shoulder, elbow, and wrist landmarks for a given side
export function computeElbowAngle(poseLandmarks, side = 'left') {
    // side: 'left' or 'right'
    if (!poseLandmarks || poseLandmarks.length < 17) return null;
    const idx = side === 'right' ? { s: 12, e: 14, w: 16 } : { s: 11, e: 13, w: 15 };
    const s = poseLandmarks[idx.s];
    const e = poseLandmarks[idx.e];
    const w = poseLandmarks[idx.w];
    if (!s || !e || !w) return null;

    const v1x = s.x - e.x, v1y = s.y - e.y;
    const v2x = w.x - e.x, v2y = w.y - e.y;
    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);
    if (mag1 === 0 || mag2 === 0) return null;

    let cos = (v1x * v2x + v1y * v2y) / (mag1 * mag2);
    cos = Math.max(-1, Math.min(1, cos));
    const angleRad = Math.acos(cos);
    return angleRad * (180 / Math.PI);
}

// Chooses the best elbow angle to use for bicep curls based on visibility and returns it along with the side ('left' or 'right')
export function computePreferredElbowAngle(poseLandmarks) {
    if (!poseLandmarks || poseLandmarks.length < 17) return { angle: null, side: null };
    // Try left
    let left = null;
    try { left = computeElbowAngle(poseLandmarks, 'left'); } catch (e) { left = null; }
    let right = null;
    try { right = computeElbowAngle(poseLandmarks, 'right'); } catch (e) { right = null; }

    // Use visibility if available
    const leftVis = (poseLandmarks[11] && typeof poseLandmarks[11].visibility === 'number') ? poseLandmarks[11].visibility : 0;
    const rightVis = (poseLandmarks[12] && typeof poseLandmarks[12].visibility === 'number') ? poseLandmarks[12].visibility : 0;

    // Prefer the side with higher shoulder visibility and a valid angle
    if (left != null && right != null) {
        if (leftVis > rightVis) return { angle: left, side: 'left' };
        if (rightVis > leftVis) return { angle: right, side: 'right' };
        // if vis equal, choose the side with larger wrist-shoulder distance (more clearly in frame)
        const lDist = Math.hypot(poseLandmarks[15].x - poseLandmarks[11].x, poseLandmarks[15].y - poseLandmarks[11].y);
        const rDist = Math.hypot(poseLandmarks[16].x - poseLandmarks[12].x, poseLandmarks[16].y - poseLandmarks[12].y);
        return lDist >= rDist ? { angle: left, side: 'left' } : { angle: right, side: 'right' };
    }

    if (left != null) return { angle: left, side: 'left' };
    if (right != null) return { angle: right, side: 'right' };
    return { angle: null, side: null };
}

// returns feedback for bicep curls based on the angle, with thresholds for "hand higher", "good range", and "at top"
export function getBicepFeedback(angle) {
    if (typeof angle !== 'number' || isNaN(angle)) return { text: 'No pose', color: '#ffc107' };
    const MIN_ANGLE = 32; const MAX_ANGLE = 160;
    let pct = ((MAX_ANGLE - angle) / (MAX_ANGLE - MIN_ANGLE));
    pct = Math.max(0, Math.min(1, pct));

    if (pct < 0.4) {
        return { text: 'Hand higher', color: '#ffc107' };
    } else if (pct <= 0.95) {
        return { text: 'Good range ✓', color: '#28a745' };
    } else {
        return { text: 'At top', color: '#667eea' };
    }
}

// Same thing here where it gives back feedback for overhead holds such as raise higher, Good etc...
export function getOverheadHoldFeedback(leftAngle, rightAngle, targetAngle, holdState) {
    const { holdActive, holdDuration, holdComplete, leftAbove, rightAbove } = holdState;
    const requiredHoldTime = holdState.requiredHoldTime || 5000;

    if (!leftAbove && !rightAbove) {
        return {
            left: { text: 'Raise higher', color: '#ffc107' },
            right: { text: 'Raise higher', color: '#ffc107' }
        };
    }

    if (!leftAbove) {
        return {
            left: { text: 'Raise higher', color: '#ffc107' },
            right: { text: 'Good ✓', color: '#28a745' }
        };
    }

    if (!rightAbove) {
        return {
            left: { text: 'Good ✓', color: '#28a745' },
            right: { text: 'Raise higher', color: '#ffc107' }
        };
    }

    // Both arms above
    if (holdComplete) {
        return {
            left: { text: 'Hold Complete ✓', color: '#667eea' },
            right: { text: 'Hold Complete ✓', color: '#667eea' }
        };
    }

    if (holdActive) {
        const secondsLeft = Math.max(0, Math.ceil((requiredHoldTime - holdDuration) / 1000));
        const symmetryOk = checkSymmetry(leftAngle, rightAngle);
        const text = symmetryOk ? `Hold steady: ${secondsLeft}...` : 'Balance both arms';
        const color = symmetryOk ? '#28a745' : '#ff9800';

        return {
            left: { text, color },
            right: { text, color }
        };
    }

    return {
        left: { text: 'Ready', color: '#28a745' },
        right: { text: 'Ready', color: '#28a745' }
    };
}



//Resets exercise state especially for when switching exercises
export function resetExerciseState() {
    bothSidesRaised = false;
    holdActive = false;
    holdStartTime = null;
    holdDuration = 0;
    holdComplete = false;
}


//This is just for UI Updates to show the hold timer and status on screen for overhead holds
export function getHoldState() {
    return {
        holdActive,
        holdDuration,
        holdComplete
    };
}


// Loads a Teachable Machine pose model and provides a per-frame prediction
// function that can be called from the existing MediaPipe requestAnimationFrame loop.
// Sit to stand setup for the model
let sitModel = null;
let sitModelLoaded = false;
let sitModelBasePath = '/static/models/sit_to_stand/';

//Stops model from trying to load multiple times
let sitModelLoadingPromise = null;

//Rep counter logic
let tm_stage = 0;
let isRepValid = true; 

//Tuning/Sensetivity, 
const TM_STATE_CONFIDENCE = 0.85;       //Only changes state if model is above 85%
const TM_BADFORM_THRESHOLD = 0.8;       //Triggers bad form at 80 percent
const TM_AGG_BADFORM_THRESHOLD = 0.12;  //small thing to catch slouching
const TM_REP_DEBOUNCE_MS = 800;         //prevents double counting reps


async function ensureTmPoseLoaded() {
    if (typeof window.tmPose !== 'undefined') return;
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@teachablemachine/pose@0.8/dist/teachablemachine-pose.min.js';
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error('Failed to load tmPose script'));
        document.head.appendChild(s);
    });
}

// Grabs the model and metadata files from the folder to initialize the AI
export function initSitToStandModel(basePath) {
    sitModelBasePath = basePath || sitModelBasePath;
    // If already loaded, return resolved value
    if (sitModelLoaded && sitModel) return Promise.resolve(sitModel);

    // If a load is already in progress, return the existing promise
    if (sitModelLoadingPromise) return sitModelLoadingPromise;

    // Start loading and keep the promise to prevent duplicate loads
    sitModelLoadingPromise = (async () => {
        try {
            await ensureTmPoseLoaded();
            sitModel = await tmPose.load(sitModelBasePath + 'model.json', sitModelBasePath + 'metadata.json');
            sitModelLoaded = true;
            return sitModel;
        } catch (e) {
            console.error('Failed to load Sit-to-Stand model:', e);
            sitModelLoaded = false;
            // clear the loading promise so future attempts can retry
            sitModelLoadingPromise = null;
            throw e;
        } finally {
            // Clear the loading promise on success as well
            if (sitModelLoaded) sitModelLoadingPromise = null;
        }
    })();

    return sitModelLoadingPromise;
}

// Runs the AI model on every frame and uses pose data to catch if they're using their hands
export async function predictSitToStandFrame(webcam, repCount, poseLandmarks) {
    // 1. Safety Check: If model isn't ready or pose is missing
    if (!sitModelLoaded || !sitModel) return { repCount, predictions: null, modelLoaded: false };
    
    // If MediaPipe hasn't found your body yet
    if (!poseLandmarks || poseLandmarks.length === 0) {
        return { repCount, predictions: null, winnerState: "No pose", winnerProb: 0, modelLoaded: true };
    }

    try {
        // attempt predict(webcam) then fallback to estimatePose+predict
        let predictions = null;
        try {
            predictions = await sitModel.predict(webcam);
        } catch (e) {
            console.debug('sitModel.predict failed, will try estimatePose fallback', e);
        }

        if (!predictions || (Array.isArray(predictions) && predictions.length === 0)) {
            try {
                const { pose, posenetOutput } = await sitModel.estimatePose(webcam);
                predictions = await sitModel.predict(posenetOutput);
            } catch (e) {
                console.debug('estimatePose fallback failed', e);
            }
        }

        if (!predictions || !Array.isArray(predictions) || predictions.length === 0) {
            // no tm predictions available for this frame
            // still run geometric check and return a safe response
            let handsOnKnees = false;
            if (poseLandmarks && poseLandmarks.length) {
                const dist = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
                const leftWrist = poseLandmarks[15], rightWrist = poseLandmarks[16];
                const leftKnee = poseLandmarks[25], rightKnee = poseLandmarks[26];
                if (leftWrist && rightWrist && leftKnee && rightKnee) {
                    if (dist(leftWrist, leftKnee) < 0.15 || dist(rightWrist, rightKnee) < 0.15) handsOnKnees = true;
                }
            }
            let invalidRep = false;
            if (handsOnKnees) {
                invalidRep = true;
                if (typeof isRepValid !== 'undefined') isRepValid = false;
                try { updateFeedback({ status: 'Hands detected!', text: 'KEEP HANDS OFF KNEES', color: '#ff5252' }); } catch (e) {}
            }

            return { repCount, predictions: null, winnerState: 'moving', winnerProb: 0, modelLoaded: true, invalidRep };
        }

        // 2. Identify the "Winner"
        let top = predictions.reduce((prev, current) => (prev.probability > current.probability) ? prev : current);
        let winnerName = (top.className || "").toLowerCase();
        let winnerProb = top.probability || 0;

        // 3. Define the State for the UI
        let winnerState = "moving";
        if (winnerProb > 0.85) {
            if (winnerName.includes('sit') || winnerName.includes('seated')) winnerState = "seated";
            else if (winnerName.includes('stand')) winnerState = "standing";
            else if (winnerName.includes('bad')) winnerState = "bad";
        }

        // 4. Geometric "Cheating" Detection (Hands on Knees)
        let handsOnKnees = false;
        const dist = (a, b) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
        const leftWrist = poseLandmarks[15], rightWrist = poseLandmarks[16];
        const leftKnee = poseLandmarks[25], rightKnee = poseLandmarks[26];
        
        if (leftWrist && rightWrist && leftKnee && rightKnee) {
            // If wrist is too close to knee (using a 0.15 normalized distance)
            if (dist(leftWrist, leftKnee) < 0.15 || dist(rightWrist, rightKnee) < 0.15) {
                handsOnKnees = true;
            }
        }

        // 5. The "Poison" Logic
        // If we see cheating, mark this specific rep as invalid
        let invalidRep = false;
        let badForm = false;
        if (winnerState === "bad") {
            badForm = true;
            if (typeof isRepValid !== 'undefined') isRepValid = false; 
            try { updateFeedback({ status: 'Bad form detected!', text: 'BAD FORM', color: '#ff5252' }); } catch (e) {}
        }
        if (handsOnKnees) {
            invalidRep = true;
            if (typeof isRepValid !== 'undefined') isRepValid = false; 
            try { updateFeedback({ status: 'Hands detected!', text: 'KEEP HANDS OFF KNEES', color: '#ff5252' }); } catch (e) {}
        }

        // 6. The State Machine logic
        if (typeof tm_stage !== 'undefined') {
            if (winnerState === "seated") {
                if (tm_stage === 2) {
                    if (isRepValid) {
                        repCount++;
                        try { updateFeedback({ status: 'Success', text: 'Rep Counted!', color: '#28a745' }); } catch (e) {}
                    } else {
                        // THIS IS THE KEY: Tell them why it didn't count
                        try { updateFeedback({ status: 'Invalid', text: 'NOT COUNTED: Used Hands', color: '#ff5252' }); } catch (e) {}
                        // Keep the invalid message visible briefly, then restore seated-ready feedback
                        setTimeout(() => {
                            try { updateFeedback({ status: 'Seated', text: 'Ready...', color: '#28a745' }); } catch (e) {}
                        }, 1500);
                    }
                } else {
                    try { updateFeedback({ status: 'Seated', text: 'Ready...', color: '#28a745' }); } catch (e) {}
                }
                tm_stage = 1; 
                isRepValid = true; 
            } else if (winnerState === "standing" && tm_stage === 1) {
                tm_stage = 2; 
                // Only show "Standing" if they haven't cheated yet
                if (isRepValid) {
                    try { updateFeedback({ status: 'Standing', text: 'Good Form!', color: '#28a745' }); } catch (e) {}
                }
            }
        }

        // Return everything the UI needs to display angles and status
        return { 
            repCount, 
            predictions, 
            winnerState, 
            winnerProb, 
            tm_stage: typeof tm_stage !== 'undefined' ? tm_stage : 0,
            modelLoaded: true,
            invalidRep,
            badForm
        };

    } catch (e) {
        console.error('Logic Error:', e);
        return { repCount, predictions: null, winnerState: "Error", winnerProb: 0 };
    }
}

// Provide a small exported helper to reset the Sit-to-Stand internal logic
export function resetSitToStandLogic() {
    // Ensure variables exist and set to safe defaults
    try {
        if (typeof tm_stage !== 'undefined') tm_stage = 1;
    } catch (e) {}
    try {
        if (typeof isRepValid !== 'undefined') isRepValid = true;
    } catch (e) {}
    console.log('Sit-to-Stand Logic Reset');
}
