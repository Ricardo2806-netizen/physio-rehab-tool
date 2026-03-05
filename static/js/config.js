// ============================================================
// config.js - Configuration and Constants
// ============================================================

export const CONFIG = {
    // Camera settings
    CAMERA: {
        WIDTH: 640,
        HEIGHT: 480,
        FACING_MODE: 'user'
    },

    // MediaPipe settings
    MEDIAPIPE: {
        MODEL_COMPLEXITY: 1,
        SMOOTH_LANDMARKS: true,
        SELFIE_MODE: false,
        MIN_DETECTION_CONFIDENCE: 0.5,
        MIN_TRACKING_CONFIDENCE: 0.5
    },

    // Performance
    SMOOTHING_FACTOR: 0.08, //used in poseProcessor.js for smoothing angles
    LOG_THROTTLE_MS: 1000,

    // Rep counting thresholds
    RAISE_THRESHOLD_MULTIPLIER: 0.9,
    LOWER_THRESHOLD_MULTIPLIER: 0.35,
    LOWER_THRESHOLD_MIN: 15,

    // Overhead hold
    SYMMETRY_TOLERANCE: 15,
    HOLD_COMPLETE_DELAY: 1500,

    // API
    API_SAVE: '/save_session',
    API_SESSIONS: '/api/sessions'
};

// Exercise configurations
export const EXERCISES = {
    'seated-arm-raises': {
        name: 'Seated Arm Raises',
        subtitle: 'Lateral shoulder abduction – raise arms to the sides',
        targetReps: 10,
        difficulties: {
            1: { angle: 30, label: '1 - Easy   (30°)' },
            2: { angle: 60, label: '2 - Medium (60°)' },
            3: { angle: 90, label: '3 - Hard   (90°)' }
        }
    },
    'overhead-hold': {
        name: 'Overhead Hold',
        subtitle: 'Raise both arms overhead and hold steady for 5 seconds',
        targetReps: 5,
        difficulties: {
            1: { angle: 120, holdTime: 3000, label: '1 - Easy  (120° / 3 sec hold)' },
            2: { angle: 140, holdTime: 5000, label: '2 - Medium (140° / 5 sec hold)' },
            3: { angle: 160, holdTime: 8000, label: '3 - Hard  (160° / 8 sec hold)' }
        }
    }
    ,
    'sit-to-stand': {
        name: 'Sit-to-Stand Test',
        subtitle: 'Stand up and sit down – elderly rehabilitation assessment',
        targetReps: 10,
        difficulties: {
            1: { reps: 5, label: '1 - Easy  (5 reps)' },
            2: { reps: 10, label: '2 - Medium (10 reps)' },
            3: { reps: 15, label: '3 - Hard  (15 reps)' }
        }
    }
    ,
    'bicep-curl': {
        name: 'Bicep Curl',
        subtitle: 'Elbow flexion – curl your forearm toward your shoulder',
        targetReps: 10,
        difficulties: {
            1: { reps: 5, label: '1 - Easy   (5 reps)' },
            2: { reps: 10, label: '2 - Medium (10 reps)' },
            3: { reps: 15, label: '3 - Hard   (15 reps)' }
        }
    }
};

// MediaPipe Pose Connections
export const POSE_CONNECTIONS = [
    [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]
];

// Helper functions
export function getTargetAngle(exercise, difficulty) {
    return EXERCISES[exercise]?.difficulties[difficulty]?.angle || 60;
}

export function getTargetReps(exercise, difficulty) {
    // If exercise defines per-difficulty 'reps', prefer that
    const ex = EXERCISES[exercise];
    if (!ex) return 10;

    if (difficulty && ex.difficulties && ex.difficulties[difficulty] && ex.difficulties[difficulty].reps != null) {
        return ex.difficulties[difficulty].reps;
    }

    return ex.targetReps || 10;
}

export function getHoldTime(exercise, difficulty) {
    return EXERCISES[exercise]?.difficulties[difficulty]?.holdTime || 5000;
}

export function formatDifficulty(level) {
    return level === 1 ? 'Easy' : level === 2 ? 'Medium' : level === 3 ? 'Hard' : 'Unknown';
}
