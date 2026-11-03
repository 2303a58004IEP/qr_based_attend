import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt


SECRET_KEY = os.getenv("JWT_SECRET_KEY", "local-development-only-change-this-secret")
TOKEN_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60
QR_TOKEN_SECONDS = 120
QR_REFRESH_SECONDS = 120
DEFAULT_TEMPORARY_PASSWORD = "demo@123"

if os.getenv("APP_ENV", "development") == "production" and SECRET_KEY == "local-development-only-change-this-secret":
    raise RuntimeError("Set JWT_SECRET_KEY before running in production.")


def hash_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must contain at least 8 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)
    return f"pbkdf2_sha256$600000${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest_hex = stored_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds)
        )
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, role: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "role": role, "type": "access", "exp": expires_at},
        SECRET_KEY,
        algorithm=TOKEN_ALGORITHM,
    )


def create_qr_token(session_id: int) -> tuple[str, datetime]:
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=QR_TOKEN_SECONDS)
    token = jwt.encode(
        {"sub": str(session_id), "type": "attendance_qr", "exp": expires_at},
        SECRET_KEY,
        algorithm=TOKEN_ALGORITHM,
    )
    return token, expires_at


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    claims = jwt.decode(token, SECRET_KEY, algorithms=[TOKEN_ALGORITHM])
    if claims.get("type") != expected_type:
        raise jwt.InvalidTokenError("Unexpected token type.")
    return claims
