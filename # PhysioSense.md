A real-time physiotherapy rehabilitation prototype. It tracks body movement
through a camera using MediaPipe, works out joint angles (for example the
elbow angle from the shoulder, elbow and wrist points), and [checks whether
an exercise is being done correctly].

## Built with
- Python and Flask (backend and REST API)
- MediaPipe (pose tracking)
- SQLite (stores exercise data)
- HTML, CSS and JavaScript (front end)
- Hosted on Render

## Live demo
https://physio-rehab-tool.onrender.com
(The first load may take up to a minute while the server wakes up.)

## Run it locally
1. Install the requirements: `pip install -r requirements.txt`
2. Run the app: `python app.py`
3. Open it in your browser at [the address it prints].

## Notes
- Joint-angle calculations were developed with help from AI tools
  (ChatGPT, Claude and Copilot) and tested against known positions.
- Built as a university project.
