# Mystery Box

A simple browser game where players register, log in, and spend coins to open mystery boxes.
User accounts, coin balances, and box-open history are saved in a SQLite database.

## Run Locally

Install Flask:

```bash
python3 -m pip install -r requirements.txt
```

Start the server:

```bash
python3 server.py
```

Then open:

```text
http://127.0.0.1:8000
```

## Change Box Prices and Odds

Edit `GAME_CONFIG` near the top of `server.py`.

```python
{
    "id": "starter",
    "name": "Starter Box",
    "price": 10_000,
    "jackpot_probability": 0.02,
    "prizes": [
        {"name": "Pen", "value": 2_500},
        {"name": "Key Chain", "value": 5_000},
        {"name": "Tissue Pack", "value": 7_500},
        {"name": "Notebook", "value": 10_000},
    ],
    "jackpot_prize_name": "Golden Door",
}
```

- `price` is the coin cost to open the box.
- `jackpot_probability` is the chance of winning the grand prize. `0.02` means 2%.
- The grand prize is always `price * 100`.
- `prizes` controls the normal prize names and coin values shown on each box.
- `jackpot_prize_name` controls the rare grand prize name.

Add another object to `boxes` if you want a fourth box.

## Database

The server creates `mystery_box.db` automatically the first time it runs.
It stores:

- registered users
- hashed passwords
- login sessions
- coin balances
- recent box opens
- top-up transactions

## Profile

Logged-in users can open the profile page from the game wallet.
The profile page lets them:

- top up coins
- reset their password
- see purchase history, including box opens, signup bonus coins, and top-up coins
# mystery_box
