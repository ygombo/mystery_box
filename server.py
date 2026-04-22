from pathlib import Path
import hashlib
import hmac
import os
import random
import secrets
import sqlite3
import time

from flask import Flask, jsonify, make_response, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mystery_box.db"
SESSION_SECONDS = 60 * 60 * 24 * 7

app = Flask(__name__)

GAME_CONFIG = {
    "starting_coins": 1_250_000,
    "max_history_items": 8,
    "profile_history_items": 30,
    "top_up_amounts": [100_000, 500_000, 1_000_000],
    "boxes": [
        {
            "id": "starter",
            "name": "Starter Box",
            "price": 10_000,
            "jackpot_probability": 0.02,
            "accent": "#27764f",
            "prizes": [
                {"name": "Pen", "value": 2_500},
                {"name": "Key Chain", "value": 5_000},
                {"name": "Tissue Pack", "value": 7_500},
                {"name": "Notebook", "value": 10_000},
            ],
            "jackpot_prize_name": "Golden Door",
        },
        {
            "id": "premium",
            "name": "Premium Box",
            "price": 100_000,
            "jackpot_probability": 0.01,
            "accent": "#2d6ccf",
            "prizes": [
                {"name": "Coffee Voucher", "value": 20_000},
                {"name": "Power Bank", "value": 45_000},
                {"name": "Wireless Mouse", "value": 70_000},
                {"name": "Headphones", "value": 100_000},
            ],
            "jackpot_prize_name": "Diamond Door",
        },
        {
            "id": "legend",
            "name": "Legend Box",
            "price": 1_000_000,
            "jackpot_probability": 0.005,
            "accent": "#d8a51f",
            "prizes": [
                {"name": "Smart Watch", "value": 150_000},
                {"name": "Tablet", "value": 400_000},
                {"name": "Game Console", "value": 650_000},
                {"name": "Laptop", "value": 1_000_000},
            ],
            "jackpot_prize_name": "Royal Door",
        },
    ],
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              salt TEXT NOT NULL,
              coins INTEGER NOT NULL,
              created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              expires_at INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS box_opens (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              box_id TEXT NOT NULL,
              box_name TEXT NOT NULL,
              prize_name TEXT NOT NULL DEFAULT 'Prize',
              cost INTEGER NOT NULL,
              prize INTEGER NOT NULL,
              is_jackpot INTEGER NOT NULL,
              balance_after INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS coin_transactions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              kind TEXT NOT NULL,
              amount INTEGER NOT NULL,
              balance_after INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id)
            );
            """
        )
        columns = {row["name"] for row in db.execute("PRAGMA table_info(box_opens)").fetchall()}
        if "prize_name" not in columns:
            db.execute("ALTER TABLE box_opens ADD COLUMN prize_name TEXT NOT NULL DEFAULT 'Prize'")


def now():
    return int(time.time() * 1000)


def hash_password(password, salt):
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return digest.hex()


def verify_password(password, salt, expected_hash):
    return hmac.compare_digest(hash_password(password, salt), expected_hash)


def public_box(box):
    return {
        "id": box["id"],
        "name": box["name"],
        "price": box["price"],
        "jackpotProbability": box["jackpot_probability"],
        "accent": box["accent"],
        "maxRegularPrize": box["price"],
        "jackpotValue": box["price"] * 100,
        "jackpotPrizeName": box["jackpot_prize_name"],
        "prizes": box["prizes"],
    }


def find_box(box_id):
    return next((box for box in GAME_CONFIG["boxes"] if box["id"] == box_id), None)


def json_error(message, status_code):
    return jsonify({"error": message}), status_code


def get_request_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def get_current_user():
    token = request.cookies.get("session")
    if not token:
        return None

    with get_db() as db:
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
        return db.execute(
            """
            SELECT users.id, users.username, users.coins
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ? AND sessions.expires_at >= ?
            """,
            (token, now()),
        ).fetchone()


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    created_at = now()
    expires_at = created_at + (SESSION_SECONDS * 1000)

    with get_db() as db:
        db.execute(
            "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (token, user_id, expires_at, created_at),
        )

    return token


def response_with_session(payload, user_id):
    response = make_response(jsonify(payload))
    response.set_cookie(
        "session",
        create_session(user_id),
        max_age=SESSION_SECONDS,
        httponly=True,
        samesite="Lax",
    )
    return response


def clear_session_response(payload):
    response = make_response(jsonify(payload))
    response.delete_cookie("session")
    return response


def user_payload(user):
    return {"username": user["username"], "coins": user["coins"]}


def get_history(user_id):
    with get_db() as db:
        rows = db.execute(
            """
            SELECT box_name, prize_name, cost, prize, is_jackpot, balance_after, created_at
            FROM box_opens
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (user_id, GAME_CONFIG["max_history_items"]),
        ).fetchall()

    return [
        {
            "boxName": row["box_name"],
            "prizeName": row["prize_name"],
            "cost": row["cost"],
            "prize": row["prize"],
            "isJackpot": bool(row["is_jackpot"]),
            "balance": row["balance_after"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def get_profile_history(user_id):
    with get_db() as db:
        rows = db.execute(
            """
            SELECT
              'box_open' AS type,
              box_name AS title,
              prize_name,
              -cost AS amount,
              prize,
              is_jackpot,
              balance_after,
              created_at
            FROM box_opens
            WHERE user_id = ?

            UNION ALL

            SELECT
              kind AS type,
              CASE
                WHEN kind = 'top_up' THEN 'Coin top up'
                ELSE 'Signup bonus'
              END AS title,
              NULL AS prize_name,
              amount,
              NULL AS prize,
              0 AS is_jackpot,
              balance_after,
              created_at
            FROM coin_transactions
            WHERE user_id = ?

            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, user_id, GAME_CONFIG["profile_history_items"]),
        ).fetchall()

    return [
        {
            "type": row["type"],
            "title": row["title"],
            "prizeName": row["prize_name"],
            "amount": row["amount"],
            "prize": row["prize"],
            "isJackpot": bool(row["is_jackpot"]),
            "balance": row["balance_after"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


@app.after_request
def add_no_store_header(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename):
    return send_from_directory(BASE_DIR, filename)


@app.get("/api/config")
def config():
    return jsonify(
        {
            "boxes": [public_box(box) for box in GAME_CONFIG["boxes"]],
            "topUpAmounts": GAME_CONFIG["top_up_amounts"],
        }
    )


@app.get("/api/me")
def me():
    user = get_current_user()
    if not user:
        return jsonify({"user": None})

    return jsonify({"user": user_payload(user), "history": get_history(user["id"])})


@app.get("/api/profile")
def profile():
    user = get_current_user()
    if not user:
        return json_error("Please log in first.", 401)

    return jsonify(
        {
            "user": user_payload(user),
            "profileHistory": get_profile_history(user["id"]),
        }
    )


@app.post("/api/register")
def register():
    data = get_request_json()
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if len(username) < 3:
        return json_error("Username must be at least 3 characters.", 400)
    if len(password) < 6:
        return json_error("Password must be at least 6 characters.", 400)

    salt = secrets.token_hex(16)
    password_hash = hash_password(password, salt)

    try:
        with get_db() as db:
            cursor = db.execute(
                """
                INSERT INTO users (username, password_hash, salt, coins, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, password_hash, salt, GAME_CONFIG["starting_coins"], now()),
            )
            user_id = cursor.lastrowid
            db.execute(
                """
                INSERT INTO coin_transactions (user_id, kind, amount, balance_after, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, "signup_bonus", GAME_CONFIG["starting_coins"], GAME_CONFIG["starting_coins"], now()),
            )
    except sqlite3.IntegrityError:
        return json_error("That username is already taken.", 409)

    return response_with_session(
        {
            "user": {"username": username, "coins": GAME_CONFIG["starting_coins"]},
            "history": [],
        },
        user_id,
    )


@app.post("/api/login")
def login():
    data = get_request_json()
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

    if not user or not verify_password(password, user["salt"], user["password_hash"]):
        return json_error("Incorrect username or password.", 401)

    return response_with_session(
        {
            "user": user_payload(user),
            "history": get_history(user["id"]),
        },
        user["id"],
    )


@app.post("/api/logout")
def logout():
    token = request.cookies.get("session")
    if token:
        with get_db() as db:
            db.execute("DELETE FROM sessions WHERE token = ?", (token,))

    return clear_session_response({"ok": True})


@app.post("/api/reset")
def reset():
    user = get_current_user()
    if not user:
        return json_error("Please log in first.", 401)

    with get_db() as db:
        db.execute("UPDATE users SET coins = ? WHERE id = ?", (GAME_CONFIG["starting_coins"], user["id"]))
        db.execute("DELETE FROM box_opens WHERE user_id = ?", (user["id"],))

    return jsonify({"user": {"username": user["username"], "coins": GAME_CONFIG["starting_coins"]}, "history": []})


@app.post("/api/clear-history")
def clear_history():
    user = get_current_user()
    if not user:
        return json_error("Please log in first.", 401)

    with get_db() as db:
        db.execute("DELETE FROM box_opens WHERE user_id = ?", (user["id"],))

    return jsonify({"history": []})


@app.post("/api/change-password")
def change_password():
    user = get_current_user()
    if not user:
        return json_error("Please log in first.", 401)

    data = get_request_json()
    current_password = str(data.get("currentPassword", ""))
    new_password = str(data.get("newPassword", ""))

    if len(new_password) < 6:
        return json_error("New password must be at least 6 characters.", 400)

    with get_db() as db:
        full_user = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not full_user or not verify_password(current_password, full_user["salt"], full_user["password_hash"]):
            return json_error("Current password is incorrect.", 401)

        salt = secrets.token_hex(16)
        password_hash = hash_password(new_password, salt)
        db.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
            (password_hash, salt, user["id"]),
        )

    return jsonify({"ok": True})


@app.post("/api/top-up")
def top_up():
    user = get_current_user()
    if not user:
        return json_error("Please log in first.", 401)

    data = get_request_json()
    try:
        amount = int(data.get("amount", 0))
    except (TypeError, ValueError):
        return json_error("Choose a valid top-up amount.", 400)

    if amount not in GAME_CONFIG["top_up_amounts"]:
        return json_error("Choose a valid top-up amount.", 400)

    new_balance = user["coins"] + amount
    created_at = now()

    with get_db() as db:
        db.execute("UPDATE users SET coins = ? WHERE id = ?", (new_balance, user["id"]))
        db.execute(
            """
            INSERT INTO coin_transactions (user_id, kind, amount, balance_after, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user["id"], "top_up", amount, new_balance, created_at),
        )

    return jsonify(
        {
            "user": {"username": user["username"], "coins": new_balance},
            "profileHistory": get_profile_history(user["id"]),
        }
    )


@app.post("/api/open-box")
def open_box():
    user = get_current_user()
    if not user:
        return json_error("Please log in first.", 401)

    data = get_request_json()
    box = find_box(data.get("boxId"))
    if box is None:
        return json_error("Unknown box.", 400)
    if user["coins"] < box["price"]:
        return json_error("Not enough coins.", 400)

    is_jackpot = random.random() < box["jackpot_probability"]
    if is_jackpot:
        prize_name = box["jackpot_prize_name"]
        prize = box["price"] * 100
    else:
        won_prize = random.choice(box["prizes"])
        prize_name = won_prize["name"]
        prize = won_prize["value"]
    new_balance = user["coins"] - box["price"] + prize
    opened_at = now()

    with get_db() as db:
        db.execute("UPDATE users SET coins = ? WHERE id = ?", (new_balance, user["id"]))
        db.execute(
            """
            INSERT INTO box_opens
            (user_id, box_id, box_name, prize_name, cost, prize, is_jackpot, balance_after, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user["id"], box["id"], box["name"], prize_name, box["price"], prize, int(is_jackpot), new_balance, opened_at),
        )

    play = {
        "boxName": box["name"],
        "prizeName": prize_name,
        "cost": box["price"],
        "prize": prize,
        "isJackpot": is_jackpot,
        "balance": new_balance,
        "createdAt": opened_at,
    }

    return jsonify(
        {
            "user": {"username": user["username"], "coins": new_balance},
            "play": play,
            "history": get_history(user["id"]),
        }
    )


def run():
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="127.0.0.1", port=port, debug=True)


if __name__ == "__main__":
    run()
