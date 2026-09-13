import json, sqlite3, time

DB_PATH = "aegis_evidence.db"
SCHEMA = """
CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, seed INTEGER, shielded INTEGER,
    scenario_json TEXT, steps INTEGER, total_cost REAL, min_hazard_dist REAL,
    min_ttc_seen REAL, override_count INTEGER, risk_score REAL
)"""


def init_db(path=DB_PATH):
    conn = sqlite3.connect(path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn


def log_trial(conn, **fields):
    conn.execute(
        """INSERT INTO trials (ts, seed, shielded, scenario_json, steps, total_cost,
           min_hazard_dist, min_ttc_seen, override_count, risk_score)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (time.time(), fields["seed"], int(fields["shielded"]), json.dumps(fields["scenario"]),
         fields["steps"], fields["total_cost"], fields["min_hazard_dist"],
         fields["min_ttc_seen"], fields["override_count"], fields["risk_score"]),
    )
    conn.commit()
