
// Simple client-side stroke screening demo using MediaPipe FaceMesh.
// Note: This is a demo and NOT a medical device. Use for development/testing only.

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const scoreP = document.getElementById('score');
const adviceP = document.getElementById('advice');

let camera = null;
let collecting = false;
let collectedResults = []; // store landmarks results
let captureTimeout = null;

// Common MediaPipe FaceMesh landmarks used for mouth corners and eyes
// Indices are based on the MediaPipe FaceMesh topology
const LEFT_MOUTH = 61;
const RIGHT_MOUTH = 291;
const LEFT_EYE_LEFT = 33;   // left eye outer
const LEFT_EYE_RIGHT = 133; // left eye inner
const RIGHT_EYE_LEFT = 362; // right eye inner
const RIGHT_EYE_RIGHT = 263; // right eye outer
const NOSE_TIP = 1;

function normDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

function computeFeatures(landmarks) {
  // landmarks are normalized [0..1] coordinates
  const lm = landmarks;
  const leftM = lm[LEFT_MOUTH];
  const rightM = lm[RIGHT_MOUTH];
  const nose = lm[NOSE_TIP];
  const leftEyeCenter = {x: (lm[LEFT_EYE_LEFT].x + lm[LEFT_EYE_RIGHT].x)/2, y: (lm[LEFT_EYE_LEFT].y + lm[LEFT_EYE_RIGHT].y)/2};
  const rightEyeCenter = {x: (lm[RIGHT_EYE_LEFT].x + lm[RIGHT_EYE_RIGHT].x)/2, y: (lm[RIGHT_EYE_LEFT].y + lm[RIGHT_EYE_RIGHT].y)/2};

  // Face scale for normalization: distance between eyes
  const faceScale = normDistance(leftEyeCenter, rightEyeCenter) || 1e-6;

  // Mouth vertical position relative to nose (y) - compute left vs right difference
  const leftOffsetY = (leftM.y - nose.y) / faceScale;
  const rightOffsetY = (rightM.y - nose.y) / faceScale;
  const mouthAsym = (leftOffsetY - rightOffsetY); // >0 means left lower than right

  // Gaze proxy: difference between eye centers x positions relative to nose
  const leftEyeDx = (leftEyeCenter.x - nose.x) / faceScale;
  const rightEyeDx = (rightEyeCenter.x - nose.x) / faceScale;
  const gazeAsym = leftEyeDx - rightEyeDx;

  // Mouth corner distance (horizontal) normalized
  const mouthWidth = normDistance(leftM, rightM) / faceScale;

  return {mouthAsym, gazeAsym, mouthWidth, faceScale};
}

function aggregateScore(featuresList) {
  // featuresList: array of features over time
  if (featuresList.length === 0) return null;
  // compute median-like robust averages
  const mouthAsy = featuresList.map(f => f.mouthAsym);
  const gaze = featuresList.map(f => f.gazeAsym);
  const widths = featuresList.map(f => f.mouthWidth);

  // simple stats
  const mean = arr => arr.reduce((a,b) => a+b,0)/arr.length;
  const std = arr => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length);
  };

  const score = Math.abs(mean(mouthAsy))*2.5 + Math.abs(mean(gaze))*1.5 + (0.6 - mean(widths))*1.0;
  // Normalize roughly to 0..100
  const raw = Math.max(0, score);
  const normalized = Math.min(100, Math.round(raw * 35)); // tuned to produce sensible numbers in demos
  return {normalized, details:{mouthAsymMean: mean(mouthAsy), gazeMean: mean(gaze), mouthWidthMean: mean(widths), mouthAsymStd: std(mouthAsy)}};
}

function renderPredictions(results) {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  canvasCtx.save();
  canvasCtx.clearRect(0,0,canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    for (const landmarks of results.multiFaceLandmarks) {
      // draw small dots for mouth corners and nose
      const w = canvasElement.width, h = canvasElement.height;
      const drawPoint = (pt, color='#00FFAA') => {
        canvasCtx.beginPath();
        canvasCtx.arc(pt.x*w, pt.y*h, 4, 0, 2*Math.PI);
        canvasCtx.fillStyle = color;
        canvasCtx.fill();
      };
      drawPoint(landmarks[LEFT_MOUTH], '#ff6666');
      drawPoint(landmarks[RIGHT_MOUTH], '#ff6666');
      drawPoint(landmarks[NOSE_TIP], '#66b0ff');
      // draw simple face mesh (subset)
      canvasCtx.strokeStyle = 'rgba(11,18,32,0.25)';
      canvasCtx.lineWidth = 1;
      for (let i=0;i<landmarks.length-1;i+=4) {
        const a = landmarks[i], b = landmarks[i+1];
        canvasCtx.beginPath();
        canvasCtx.moveTo(a.x*w, a.y*h);
        canvasCtx.lineTo(b.x*w, b.y*h);
        canvasCtx.stroke();
      }
    }
  }
  canvasCtx.restore();
}

// MediaPipe FaceMesh setup
const faceMesh = new FaceMesh({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

faceMesh.onResults((results) => {
  renderPredictions(results);
  if (!collecting) return;
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];
    // store normalized landmarks
    collectedResults.push(landmarks.map(pt => ({x: pt.x, y: pt.y, z: pt.z || 0})));
  }
});

async function startCamera() {
  // Use the Camera utility from MediaPipe
  camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({image: videoElement});
    },
    width: 640,
    height: 480
  });
  camera.start();
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  adviceP.textContent = '';
  scoreP.textContent = 'Collecting 8 seconds of data... Please face camera straight on and keep neutral expression.';
  collectedResults = [];
  collecting = true;
  if (!camera) {
    await startCamera();
  }
  // stop collecting after 8 seconds
  captureTimeout = setTimeout(() => {
    collecting = false;
    evaluateCollected();
  }, 8000);
});

stopBtn.addEventListener('click', () => {
  startBtn.disabled = false;
  stopBtn.disabled = true;
  collecting = false;
  if (captureTimeout) clearTimeout(captureTimeout);
  evaluateCollected();
});

function evaluateCollected() {
  if (collectedResults.length === 0) {
    scoreP.textContent = 'No face detected. Try again with better lighting and face the camera.';
    return;
  }
  // compute feature list
  const features = collectedResults.map(lms => computeFeatures(lms));
  const agg = aggregateScore(features);
  if (!agg) {
    scoreP.textContent = 'Insufficient data.';
    return;
  }
  const s = agg.normalized;
  scoreP.textContent = `Screening score: ${s} / 100`;
  if (s >= 60) {
    adviceP.innerHTML = '<strong style="color:#a11">High risk flag</strong> — Suggest immediate medical evaluation. If sudden onset, call emergency services.';
  } else if (s >= 35) {
    adviceP.innerHTML = '<strong style="color:#d67">Moderate risk</strong> — Recommend contacting a clinician for evaluation.';
  } else {
    adviceP.innerHTML = '<strong style="color:#2a7">Low risk</strong> — No immediate alarm; if symptoms persist or are sudden, seek medical care.';
  }
  downloadBtn.disabled = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  // store details for report
  window._lastReport = {
    timestamp: new Date().toISOString(),
    score: s,
    details: agg.details,
    frames: collectedResults.length
  };
}

downloadBtn.addEventListener('click', () => {
  if (!window._lastReport) return;
  const rep = window._lastReport;
  const txt = `Stroke Screening Report (Demo)
Timestamp: ${rep.timestamp}
Score: ${rep.score} / 100
Frames captured: ${rep.frames}
Details: ${JSON.stringify(rep.details, null, 2)}

DISCLAIMER: This is a development/demo screening tool. NOT a medical diagnosis.
If you suspect stroke, call emergency services immediately.
`;
  const blob = new Blob([txt], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stroke_screening_report.txt';
  a.click();
  URL.revokeObjectURL(url);
});
