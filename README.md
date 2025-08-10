# Stroke Screening — Demo (client-side)

This is a minimal **client-side** stroke screening demo that uses **MediaPipe FaceMesh** to extract facial landmarks from a webcam video and computes a simple rule-based screening score (mouth asymmetry + gaze proxy).

**Important:** This project is a *research/demo* prototype ONLY. It is **not** a medical device and must **not** be used for clinical diagnosis. Always consult clinicians and emergency services for suspected stroke.

## How to run

1. Unzip and open `index.html` in a modern browser (Chrome/Edge/Firefox).  
2. Allow webcam access when prompted.  
3. Click **Start** and keep a neutral face facing the camera for ~8 seconds.  
4. A simple screening score and advice will appear. You can download a text report.

## Files

- `index.html` — main page
- `app.js` — main JavaScript (MediaPipe integration + simple analysis)
- `styles.css` — basic styling
- `README.md` — this file

## Notes / Next steps

- This demo runs entirely in the browser; no server required.
- To improve accuracy: collect labeled stroke / control videos and train a tiny classifier; add speech analysis; include Neurolens data by allowing CSV upload.
- For clinical use: partner with clinicians, get IRB approval, and pursue regulatory pathways.

