// ============================================================
// sessionManager.js - Session Data Management
// ============================================================

import { CONFIG } from './config.js';

let sessionData = [];
let lastLogTime = 0;

//logs a data point for the current session with throttling to limit frequency
export function logDataPoint(exercise, leftAngle, rightAngle, repCount, holdTime = null) {
    const now = Date.now();
    if (now - lastLogTime < CONFIG.LOG_THROTTLE_MS) return;
    
    lastLogTime = now;
    sessionData.push({
        timestamp: new Date().toISOString(),
        exercise: exercise,
        leftAngle: Math.round(leftAngle),
        rightAngle: Math.round(rightAngle),
        reps: repCount,
        holdTime: holdTime
    });
}

//saves the session to backend database
export async function saveSession(payload) {
    if (!sessionData.length) {
        alert('No data to save. Please complete a session first.');
        return false;
    }

    try {
        const res = await fetch(CONFIG.API_SAVE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });

        // If user is not authenticated, prompt login instead of generic error
        if (res.status === 401 || res.status === 403) {
            alert('Please log in to save your session.');
            // Open login modal if present
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) loginBtn.click();
            return false;
        }

        if (!res.ok) throw new Error(`Server error ${res.status}`);

        const result = await res.json();

        if (result.status === 'success') {
            alert('✓ Session saved successfully!');
            resetSessionData();
            return true;
        } else {
            console.error('Save returned error:', result);
            alert(result.message || 'Error saving session data. Please try again.');
            return false;
        }
    } catch (err) {
        console.error('Save error:', err);
        alert('Error saving session data. Please try again.');
        return false;
    }
}

//loads session history from backend for display in history page
export async function loadSessionHistory() {
    try {
        const res = await fetch(CONFIG.API_SESSIONS, { credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) {
            // Not authenticated — open login modal and return empty list
            const loginBtn = document.getElementById('login-btn');
            if (loginBtn) loginBtn.click();
            return [];
        }
        const sessions = await res.json();
        return sessions;
    } catch (err) {
        console.error('History error:', err);
        return [];
    }
}

//resets session data
export function resetSessionData() {
    sessionData = [];
    lastLogTime = 0;
}

//retrieves current session data
export function getSessionData() {
    return sessionData;
}
