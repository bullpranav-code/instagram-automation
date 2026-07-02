"""
Configuration Module
Central configuration for the Instagram automation system
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# ============================================
# API KEYS & CREDENTIALS
# ============================================

CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
CLAUDE_MODEL = "claude-3-5-sonnet-20241022"

CHATGPT_API_KEY = os.getenv("OPENAI_API_KEY", "")
CHATGPT_MODEL = "gpt-4"

CANVA_API_KEY = os.getenv("CANVA_API_KEY", "")

N8N_BASE_URL = os.getenv("N8N_BASE_URL", "http://localhost:5678")
N8N_API_KEY = os.getenv("N8N_API_KEY", "")

INSTAGRAM_USERNAME = os.getenv("INSTAGRAM_USERNAME", "")
INSTAGRAM_PASSWORD = os.getenv("INSTAGRAM_PASSWORD", "")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///instagram_automation.db")

# ============================================
# CONTENT GENERATION SETTINGS
# ============================================

CONTENT_CONFIG = {
    "min_captions_per_batch": 5,
    "max_captions_per_batch": 20,
    "caption_tone": "professional_engaging",  # professional_engaging, casual, inspirational, educational
    "hashtag_count": 15,
    "content_language": "en",
}

# ============================================
# FEATURE FLAGS
# ============================================

FEATURES = {
    "claude_enabled": True,
    "chatgpt_fallback_enabled": True,
    "canva_integration_enabled": True,
    "n8n_webhook_enabled": True,
    "database_logging_enabled": True,
}

# ============================================
# LOGGING SETTINGS
# ============================================

LOG_CONFIG = {
    "log_level": "INFO",
    "log_file": "logs/instagram_automation.log",
    "max_log_size_mb": 50,
    "backup_count": 5,
}

# ============================================
# ERROR HANDLING
# ============================================

ERROR_CONFIG = {
    "max_retries": 3,
    "retry_delay_seconds": 60,
    "enable_error_notifications": True,
    "fallback_to_chatgpt_on_claude_error": True,
}

# ============================================
# RATE LIMITING & SAFETY
# ============================================

RATE_LIMIT_CONFIG = {
    "max_likes_per_day": 300,
    "max_comments_per_day": 80,
    "max_follows_per_day": 200,
    "max_unfollows_per_day": 150,
}
