from flask import Flask, request, jsonify, send_from_directory
import sqlite3
import os
from datetime import datetime

from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user

app = Flask(__name__, static_folder=".", template_folder=".")

# Secret key for session cookies (override in production via env var)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret")

DB_FILE = "physiosense.db"

# Setup Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)


class User(UserMixin):
    def __init__(self, id, username, password_hash):
        self.id = id
        self.username = username
        self.password_hash = password_hash

    @staticmethod
    def get(user_id):
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("SELECT id, username, password_hash FROM users WHERE id = ?", (user_id,))
        row = c.fetchone()
        conn.close()
        if row:
            return User(row[0], row[1], row[2])
        return None

    @staticmethod
    def get_by_username(username):
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,))
        row = c.fetchone()
        conn.close()
        if row:
            return User(row[0], row[1], row[2])
        return None


@login_manager.user_loader
def load_user(user_id):
    try:
        return User.get(int(user_id))
    except Exception:
        return None


# ===== DATABASE SETUP =====
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Create table with exercise_name column
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            exercise_name TEXT DEFAULT 'seated-arm-raises',
            duration TEXT,
            reps INTEGER,
            left_max INTEGER,
            right_max INTEGER,
            difficulty INTEGER,
            target_angle INTEGER
        )
    ''')

    # Create users table
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            created_at TEXT
        )
    ''')

    # ✅ If table already exists but is missing exercise_name, add it
    try:
        c.execute("ALTER TABLE sessions ADD COLUMN exercise_name TEXT DEFAULT 'seated-arm-raises'")
        print("✅ Added exercise_name column to existing database")
    except sqlite3.OperationalError:
        pass  # Column already exists - that's fine

    # Note: hip_low / hip_high columns intentionally omitted

    # Add user_id to sessions so sessions can be associated with a user
    try:
        c.execute("ALTER TABLE sessions ADD COLUMN user_id INTEGER")
        print("✅ Added user_id column to sessions table")
    except sqlite3.OperationalError:
        pass

    # ✅ Add rep_splits column to existing database for Sit-to-Stand breakdown
    try:
        c.execute("ALTER TABLE sessions ADD COLUMN rep_splits TEXT")
        print("✅ Added rep_splits column to sessions table")
    except sqlite3.OperationalError:
        pass # Column already exists

    conn.commit()
    conn.close()


init_db()


# ===== ROUTES =====

# Serve index.html
@app.route("/")
def index():
    return send_from_directory(".", "index.html")


# Register new user
@app.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"status": "error", "message": "Missing username or password"}), 400

    if User.get_by_username(username):
        return jsonify({"status": "error", "message": "Username already exists"}), 400

    password_hash = generate_password_hash(password)
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
              (username, password_hash, datetime.now().isoformat()))
    conn.commit()
    conn.close()

    return jsonify({"status": "success"})


# Login
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"status": "error", "message": "Missing username or password"}), 400

    user = User.get_by_username(username)
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

    login_user(user)
    return jsonify({"status": "success"})


# Logout
@app.route("/logout", methods=["POST"]) 
@login_required
def logout():
    logout_user()
    return jsonify({"status": "success"})


# Save session data (requires login)
@app.route("/save_session", methods=["POST"])
@login_required
def save_session():
    data = request.get_json(force=True)

    required_fields = [
        "duration",
        "reps",
        "left_max",
        "right_max",
        "difficulty",
        "target_angle"
    ]

    if not all(field in data for field in required_fields):
        return jsonify({"status": "error", "message": "Missing fields"}), 400

    try:
        exercise_name = data.get("exercise_name", "seated-arm-raises")
        # GET THE NEW FIELD HERE
        rep_splits = data.get("rep_splits")

        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("""
            INSERT INTO sessions (
                timestamp, exercise_name, duration, reps,
                left_max, right_max, difficulty, target_angle, user_id,
                rep_splits
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now().isoformat(),
            exercise_name,
            data["duration"],
            data["reps"],
            data.get("left_max"),
            data.get("right_max"),
            data["difficulty"],
            data["target_angle"],
            int(current_user.get_id()),
            rep_splits
        ))
        conn.commit()
        conn.close()

        return jsonify({"status": "success"})
    except Exception as e:
        print("Database error:", e)
        return jsonify({"status": "error", "message": "Database failure"}), 500


# View sessions for current user
@app.route("/api/sessions")
@login_required
def get_sessions_json():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        SELECT id, timestamp, exercise_name, duration, reps,
               left_max, right_max, difficulty, target_angle,
               rep_splits
        FROM sessions
        WHERE user_id = ?
        ORDER BY id DESC
    """, (int(current_user.get_id()),))
    rows = c.fetchall()
    conn.close()

    sessions = [
        {
            "id":           r[0],
            "timestamp":    r[1],
            "exercise_name": r[2],
            "duration":     r[3],
            "reps":         r[4],
            "left_max":     r[5],
            "right_max":    r[6],
            "difficulty":   r[7],
            "target_angle": r[8],
            "rep_splits":    r[9]
        }
        for r in rows
    ]

    return jsonify(sessions)


# Return current user info
@app.route("/api/me")
def me():
    if current_user.is_authenticated:
        return jsonify({"id": current_user.get_id(), "username": current_user.username})
    return jsonify({}), 204


# Serve static files (JS/CSS) - keep last so API routes take precedence
@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


# ===== RUN APP =====
if __name__ == "__main__":
    app.run(debug=True)
