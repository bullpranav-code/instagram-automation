
# Define files map
project_files = {
"requirements.txt": """fastapi==0.110.0
uvicorn==0.28.0
sqlalchemy==2.0.28
pydantic==2.6.4
pydantic-settings==2.2.1
openai==1.14.1
anthropic==0.21.3
httpx==0.27.0
python-dotenv==1.0.1
""",

".env.example": """CLAUDE_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
CANVA_API_KEY=your_key_here
INSTAGRAM_USERNAME=your_username
INSTAGRAM_PASSWORD=your_password
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=your_key_here
DATABASE_URL=sqlite:///./instagram_automation.db
""",

"config.py": """import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    CLAUDE_API_KEY: str = Field(default="mock_key", validation_alias="CLAUDE_API_KEY")
    OPENAI_API_KEY: str = Field(default="mock_key", validation_alias="OPENAI_API_KEY")
    CANVA_API_KEY: str = Field(default="mock_key", validation_alias="CANVA_API_KEY")
    
    INSTAGRAM_USERNAME: str = Field(default="user", validation_alias="INSTAGRAM_USERNAME")
    INSTAGRAM_PASSWORD: str = Field(default="pass", validation_alias="INSTAGRAM_PASSWORD")
    
    N8N_BASE_URL: str = Field(default="http://localhost:5678", validation_alias="N8N_BASE_URL")
    N8N_API_KEY: str = Field(default="mock_key", validation_alias="N8N_API_KEY")
    
    DATABASE_URL: str = Field(default="sqlite:///./instagram_automation.db", validation_alias="DATABASE_URL")
    LOG_LEVEL: str = "INFO"
    
    DEFAULT_TONE: str = "Professional yet engaging"
    MAX_HASHTAGS: int = 15
    DAILY_POST_LIMIT: int = 3

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
""",

"database.py": """import datetime
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from config import settings

Base = declarative_base()
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class GeneratedContent(Base):
    __tablename__ = "generated_content"
    id = Column(Integer, primary_key=True, index=True)
    topic = Column(String, index=True)
    caption = Column(Text)
    hashtags = Column(JSON)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class BotActivity(Base):
    __tablename__ = "bot_activities"
    id = Column(Integer, primary_key=True, index=True)
    activity_type = Column(String)
    target = Column(String)
    status = Column(String)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class InstagramPost(Base):
    __tablename__ = "instagram_posts"
    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(String, unique=True, index=True)
    caption = Column(Text)
    status = Column(String)
    published_at = Column(DateTime, nullable=True)

class SystemLog(Base):
    __tablename__ = "system_logs"
    id = Column(Integer, primary_key=True, index=True)
    level = Column(String)
    message = Column(Text)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
""",

"content_generator.py": """import logging
from openai import OpenAI
from anthropic import Anthropic
from config import settings

logger = logging.getLogger("automation.content")

class ContentGenerator:
    def __init__(self):
        self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.claude_client = Anthropic(api_key=settings.CLAUDE_API_KEY)

    async def generate_caption_claude(self, topic: str, tone: str = None) -> str:
        selected_tone = tone or settings.DEFAULT_TONE
        try:
            message = self.claude_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=400,
                temperature=0.7,
                system="You are an expert Instagram growth marketer and copywriter.",
                messages=[
                    {"role": "user", "content": f"Write an engaging Instagram caption about: '{topic}'. Tone: {selected_tone}. Do not include hashtags."}
                ]
            )
            return message.content[0].text.strip()
        except Exception as e:
            logger.error(f"Claude API failed: {e}")
            return await self._fallback_generate_caption(topic, selected_tone)

    async def generate_hashtags_openai(self, topic: str, count: int = None) -> list:
        limit = count or settings.MAX_HASHTAGS
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You output relevant hashtags for Instagram as a raw JSON array of strings only."},
                    {"role": "user", "content": f"Give me {limit} high-performing, targeted hashtags for a post about: {topic}"}
                ],
                response_format={"type": "json_object"}
            )
            import json
            data = json.loads(response.choices[0].message.content)
            hashtags = data.get("hashtags", list(data.values())[0] if data.values() else [])
            return [h.replace("#", "") for h in hashtags[:limit]]
        except Exception as e:
            logger.error(f"OpenAI Hashtag Generation failed: {e}")
            return ["marketing", "growth", "automation"]

    async def _fallback_generate_caption(self, topic: str, tone: str) -> str:
        return f"Exploring everything about {topic}! Elevating our strategy with a {tone.lower()} approach. What are your thoughts? 👇"
""",

"n8n_orchestrator.py": """import httpx
import logging
from config import settings

logger = logging.getLogger("automation.n8n")

class N8NOrchestrator:
    def __init__(self):
        self.base_url = settings.N8N_BASE_URL.rstrip('/')
        self.headers = {"X-N8N-API-KEY": settings.N8N_API_KEY, "Content-Type": "application/json"}

    async def trigger_canva_generation(self, caption: str, topic: str) -> str:
        endpoint = f"{self.base_url}/webhook/generate-design"
        payload = {"topic": topic, "text_content": caption, "canva_api_key": settings.CANVA_API_KEY}
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(endpoint, json=payload, headers=self.headers, timeout=30.0)
                if response.status_code == 200:
                    return response.json().get("image_url", "")
                logger.error(f"n8n design webhook returned status {response.status_code}")
            except Exception as e:
                logger.error(f"Failed to communicate with n8n workflow: {e}")
            return ""

    async def dispatch_instapy_job(self, post_data: dict) -> bool:
        endpoint = f"{self.base_url}/webhook/instapy-publish"
        payload = {
            "username": settings.INSTAGRAM_USERNAME,
            "password": settings.INSTAGRAM_PASSWORD,
            **post_data
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(endpoint, json=payload, headers=self.headers, timeout=60.0)
                return response.status_code in [200, 201]
            except Exception as e:
                logger.error(f"Failed to route publishing pipeline via n8n: {e}")
                return False
""",

"main_orchestrator.py": """import logging
import os
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from config import settings
from database import engine, Base, get_db, GeneratedContent, BotActivity, InstagramPost, SystemLog
from content_generator import ContentGenerator
from n8n_orchestrator import N8NOrchestrator

os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("logs/automation.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("automation.main")

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Instagram Automation System API", version="2.0.0")

class ContentRequest(BaseModel):
    topic: str
    count: Optional[int] = 1

class AutomationRequest(BaseModel):
    topic: str
    hashtags: Optional[List[str]] = None

generator = ContentGenerator()
n8n = N8NOrchestrator()

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "database_connected": engine is not None}

@app.post("/api/generate-content")
async def generate_content(payload: ContentRequest, db: Session = Depends(get_db)):
    results = []
    for _ in range(payload.count):
        caption = await generator.generate_caption_claude(payload.topic)
        tags = await generator.generate_hashtags_openai(payload.topic)
        
        db_content = GeneratedContent(topic=payload.topic, caption=caption, hashtags=tags)
        db.add(db_content)
        db.commit()
        db.refresh(db_content)
        
        results.append({
            "id": db_content.id,
            "caption": caption,
            "hashtags": [f"#{t}" for t in tags]
        })
    return {"success": True, "data": results}

async def run_automation_pipeline(topic: str, custom_tags: Optional[List[str]], db: Session):
    try:
        caption = await generator.generate_caption_claude(topic)
        generated_tags = await generator.generate_hashtags_openai(topic)
        tags = custom_tags if custom_tags else [f"#{t}" for t in generated_tags]
        
        image_url = await n8n.trigger_canva_generation(caption, topic)
        if not image_url:
            raise Exception("Canva assets generation step timed out or failed.")
            
        full_caption = f"{caption}\\n\\n" + " ".join(tags)
        payload = {"image_url": image_url, "caption": full_caption}
        
        success = await n8n.dispatch_instapy_job(payload)
        
        post_record = InstagramPost(
            media_id=image_url.split('/')[-1].split('?')[0] if '/' in image_url else "unknown_media",
            caption=full_caption,
            status="published" if success else "failed"
        )
        db.add(post_record)
        
        activity = BotActivity(activity_type="post_publish", target="feed", status="success" if success else "failed")
        db.add(activity)
        db.commit()
        
    except Exception as e:
        logger.error(f"Automation execution flow dropped: {e}")
        log_err = SystemLog(level="CRITICAL", message=str(e))
        db.add(log_err)
        db.commit()

@app.post("/api/run-automation")
async def run_automation(payload: AutomationRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    background_tasks.add_task(run_automation_pipeline, payload.topic, payload.hashtags, db)
    return {"success": True, "message": "Automation cycle spawned in background worker tasks group safely."}

@app.get("/api/stats")
def get_statistics(db: Session = Depends(get_db)):
    total_posts = db.query(InstagramPost).count()
    failed_posts = db.query(InstagramPost).filter(InstagramPost.status == "failed").count()
    bot_interactions = db.query(BotActivity).count()
    system_errors = db.query(SystemLog).filter(SystemLog.level == "CRITICAL").count()
    
    return {
        "metrics": {
            "total_posts_attempted": total_posts,
            "successful_posts": max(0, total_posts - failed_posts),
            "failed_posts": failed_posts,
            "growth_bot_interactions": bot_interactions,
            "system_health_alerts": system_errors
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main_orchestrator:app", host="0.0.0.0", port=5000, reload=True)
"""
}

# Write project files into space dynamically
print("🚀 Initializing Setup Orchestration...")
os.makedirs("logs", exist_ok=True)

for filename, content in project_files.items():
    with open(filename, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")
    print(f"📦 Successfully created: {filename}")

# Duplicate .env for local runtime execution automatically
if not os.path.exists(".env"):
    with open(".env", "w", encoding="utf-8") as env_f:
        env_f.write(project_files[".env.example"])
    print("🔑 Auto-generated template setup configuration '.env'")

print("\\n✅ Setup Finished! Run the application using the following commands:")
print("1. pip install -r requirements.txt")
print("2. python main_orchestrator.py")
