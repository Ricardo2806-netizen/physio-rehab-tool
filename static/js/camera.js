// ============================================================
// camera.js - Camera and MediaPipe Setup
// ============================================================

import { CONFIG, POSE_CONNECTIONS } from './config.js';

let camera = null;
let pose = null;

//starts mediapipe pose model
export function initializePose(onResultsCallback) {
    pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
        modelComplexity: CONFIG.MEDIAPIPE.MODEL_COMPLEXITY,
        smoothLandmarks: CONFIG.MEDIAPIPE.SMOOTH_LANDMARKS,
        enableSegmentation: false,
        selfieMode: CONFIG.MEDIAPIPE.SELFIE_MODE,
        minDetectionConfidence: CONFIG.MEDIAPIPE.MIN_DETECTION_CONFIDENCE,
        minTrackingConfidence: CONFIG.MEDIAPIPE.MIN_TRACKING_CONFIDENCE
    });

    pose.onResults(onResultsCallback);
    return pose;
}

//Setsup the camera
export async function setupCamera(webcamElement, canvasElement) {
    try {
        // Stop existing stream
        if (webcamElement.srcObject) {
            webcamElement.srcObject.getTracks().forEach(t => t.stop());
            webcamElement.srcObject = null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: CONFIG.CAMERA.WIDTH },
                height: { ideal: CONFIG.CAMERA.HEIGHT },
                facingMode: CONFIG.CAMERA.FACING_MODE
            }
        });

        webcamElement.srcObject = stream;

        return new Promise((resolve) => {
            webcamElement.onloadedmetadata = () => {
                canvasElement.width = webcamElement.videoWidth;
                canvasElement.height = webcamElement.videoHeight;
                webcamElement.play();
                resolve();
            };
        });
    } catch (err) {
        console.error('Webcam error:', err);
        alert('Cannot access webcam. Please check permissions and try again.');
    }
}

//Starts the camera
export async function startCamera(webcamElement, poseInstance) {
    camera = new Camera(webcamElement, {
        onFrame: async () => await poseInstance.send({ image: webcamElement }),
        width: CONFIG.CAMERA.WIDTH,
        height: CONFIG.CAMERA.HEIGHT
    });

    await camera.start();
    return camera;
}

//Stops the camera
export function stopCamera(webcamElement) {
    if (camera) {
        camera.stop();
        camera = null;
    }

    if (webcamElement?.srcObject) {
        webcamElement.srcObject.getTracks().forEach(t => t.stop());
        webcamElement.srcObject = null;
    }
}

//Draws the Skeleton/landmarks etc...
export function drawSkeleton(ctx, landmarks) {
    const canvas = ctx.canvas;

    // Draw connections
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 4;
    for (const [si, ei] of POSE_CONNECTIONS) {
        const s = landmarks[si];
        const e = landmarks[ei];
        if (s && e && s.visibility > 0.5 && e.visibility > 0.5) {
            ctx.beginPath();
            ctx.moveTo(s.x * canvas.width, s.y * canvas.height);
            ctx.lineTo(e.x * canvas.width, e.y * canvas.height);
            ctx.stroke();
        }
    }

    // Draw landmarks
    ctx.fillStyle = '#FF0000';
    const joints = [11, 12, 13, 14, 15, 16, 23, 24];
    for (const idx of joints) {
        const lm = landmarks[idx];
        if (lm && lm.visibility > 0.5) {
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
}

export { camera, pose };
