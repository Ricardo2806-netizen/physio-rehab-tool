// ============================================================
// poseProcessor.js - Angle Calculation & Rep Counting Logic
// ============================================================

import { CONFIG } from './config.js';

//calculates the angle between 3 points
export function calculateAngle(p1, p2, p3) {
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x)
                  - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
}

//applies a smoothing feature to the angle
export function smoothAngle(newAngle, previousSmoothed) {
    return CONFIG.SMOOTHING_FACTOR * newAngle + 
           (1 - CONFIG.SMOOTHING_FACTOR) * previousSmoothed;
}

//gets shoulder angles from landmarks
export function extractAngles(landmarks) {
    // Both exercises use: hip → shoulder → elbow
    const leftAngle = calculateAngle(landmarks[23], landmarks[11], landmarks[13]);
    const rightAngle = calculateAngle(landmarks[24], landmarks[12], landmarks[14]);
    
    return { leftAngle, rightAngle };
}

//gets hip angle for sit to stand
export function extractHipAngle(landmarks) {
    try {
        const left = calculateAngle(landmarks[11], landmarks[23], landmarks[25]);
        const right = calculateAngle(landmarks[12], landmarks[24], landmarks[26]);

        if (!isNaN(left) && !isNaN(right)) {
            return (left + right) / 2;
        }

        if (!isNaN(left)) return left;
        if (!isNaN(right)) return right;
    } catch (e) {
        // Fallback
    }
    return 0;
}

//checks if both arms are raised for the threshold
export function checkRaiseThreshold(leftAngle, rightAngle, targetAngle) {
    const threshold = targetAngle * CONFIG.RAISE_THRESHOLD_MULTIPLIER;
    return {
        leftRaised: leftAngle >= threshold,
        rightRaised: rightAngle >= threshold,
        bothRaised: leftAngle >= threshold && rightAngle >= threshold
    };
}

//checks if both arms are below the threshold for counting rep
export function checkLowerThreshold(leftAngle, rightAngle, targetAngle) {
    const threshold = Math.max(
        CONFIG.LOWER_THRESHOLD_MIN,
        targetAngle * CONFIG.LOWER_THRESHOLD_MULTIPLIER
    );
    return {
        leftLowered: leftAngle < threshold,
        rightLowered: rightAngle < threshold,
        bothLowered: leftAngle < threshold && rightAngle < threshold
    };
}

//checks symmetry between left and right angles
export function checkSymmetry(leftAngle, rightAngle) {
    const diff = Math.abs(leftAngle - rightAngle);
    return diff < CONFIG.SYMMETRY_TOLERANCE;
}
