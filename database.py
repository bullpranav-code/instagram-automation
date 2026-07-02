"""
Database Module
SQLAlchemy models for storing content and tracking activities
"""

from sqlalchemy import create_engine, Column, String, Integer, DateTime, Boolean, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import logging

from config import DATABASE_URL

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database engine
engine = create_engine(DATABASE_URL, echo=False)
Session = sessionmaker(bind=engine)
Base = declarative_base()


# ============================================
# DATABASE MODELS
# ============================================

class GeneratedContent(Base):
    """Store AI-generated captions and comments"""
    __tablename__ = "generated_content"
    
    id = Column(Integer, primary_key=True)
    content_type = Column(String(50))  # caption, comment, hashtag
    topic = Column(String(255))
    content_text = Column(Text)
    ai_model = Column(String(50))  # claude, chatgpt
    hashtags = Column(String(500))
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    used_at = Column(DateTime, nullable=True)
    
    def __repr__(self):
        return f"<GeneratedContent {self.id}: {self.content_type}>"


class BotActivity(Base):
    """Track bot activities"""
    __tablename__ = "bot_activities"
    
    id = Column(Integer, primary_key=True)
    activity_type = Column(String(50))  # like, comment, follow, unfollow
    target_user = Column(String(255), nullable=True)
    target_post_id = Column(String(100), nullable=True)
    hashtag = Column(String(100), nullable=True)
    success = Column(Boolean)
    error_message = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<BotActivity {self.id}: {self.activity_type}>"


class InstagramPost(Base):
    """Track Instagram posts"""
    __tablename__ = "instagram_posts"
    
    id = Column(Integer, primary_key=True)
    post_id = Column(String(100), unique=True, nullable=True)
    caption = Column(Text)
    image_url = Column(Text, nullable=True)
    posted_at = Column(DateTime, nullable=True)
    scheduled_for = Column(DateTime, nullable=True)
    posted = Column(Boolean, default=False)
    likes_count = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    shares_count = Column(Integer, default=0)
    engagement_rate = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<InstagramPost {self.id}>"


class SystemLog(Base):
    """System logs and errors"""
    __tablename__ = "system_logs"
    
    id = Column(Integer, primary_key=True)
    level = Column(String(20))  # INFO, WARNING, ERROR
    message = Column(Text)
    component = Column(String(100))
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<SystemLog {self.id}: {self.level}>"


# ============================================
# DATABASE INITIALIZATION
# ============================================

def init_db():
    """Initialize database and create all tables"""
    try:
        Base.metadata.create_all(engine)
        logger.info("✓ Database initialized successfully")
        logger.info(f"  Database URL: {DATABASE_URL}")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


# ============================================
# HELPER FUNCTIONS
# ============================================

def save_generated_content(content_type: str, topic: str, content_text: str, 
                          ai_model: str, hashtags: str = "") -> int:
    """Save generated content to database"""
    session = Session()
    try:
        item = GeneratedContent(
            content_type=content_type,
            topic=topic,
            content_text=content_text,
            ai_model=ai_model,
            hashtags=hashtags
        )
        session.add(item)
        session.commit()
        logger.info(f"✓ Saved {content_type} content")
        return item.id
    except Exception as e:
        logger.error(f"Failed to save content: {e}")
        session.rollback()
        raise
    finally:
        session.close()


def get_unused_content(content_type: str, limit: int = 5) -> list:
    """Get unused generated content"""
    session = Session()
    try:
        items = session.query(GeneratedContent).filter(
            GeneratedContent.content_type == content_type,
            GeneratedContent.used == False
        ).limit(limit).all()
        return items
    except Exception as e:
        logger.error(f"Failed to get unused content: {e}")
        return []
    finally:
        session.close()


def mark_content_as_used(content_id: int):
    """Mark content as used"""
    session = Session()
    try:
        item = session.query(GeneratedContent).filter(
            GeneratedContent.id == content_id
        ).first()
        if item:
            item.used = True
            item.used_at = datetime.utcnow()
            session.commit()
            logger.info(f"✓ Marked content {content_id} as used")
    except Exception as e:
        logger.error(f"Failed to mark content as used: {e}")
        session.rollback()
    finally:
        session.close()


def save_bot_activity(activity_type: str, target_user: str = "", 
                     target_post_id: str = "", hashtag: str = "", 
                     success: bool = True, error_message: str = "") -> int:
    """Save bot activity to database"""
    session = Session()
    try:
        activity = BotActivity(
            activity_type=activity_type,
            target_user=target_user,
            target_post_id=target_post_id,
            hashtag=hashtag,
            success=success,
            error_message=error_message
        )
        session.add(activity)
        session.commit()
        return activity.id
    except Exception as e:
        logger.error(f"Failed to save activity: {e}")
        session.rollback()
        return None
    finally:
        session.close()


def get_activity_stats(activity_type: str = None, hours: int = 24) -> dict:
    """Get activity statistics"""
    from datetime import timedelta
    session = Session()
    try:
        query = session.query(BotActivity)
        if activity_type:
            query = query.filter(BotActivity.activity_type == activity_type)
        
        since = datetime.utcnow() - timedelta(hours=hours)
        query = query.filter(BotActivity.timestamp >= since)
        
        activities = query.all()
        successful = sum(1 for a in activities if a.success)
        
        return {
            "total": len(activities),
            "successful": successful,
            "failed": len(activities) - successful,
            "success_rate": (successful / len(activities) * 100) if activities else 0
        }
    except Exception as e:
        logger.error(f"Failed to get activity stats: {e}")
        return {}
    finally:
        session.close()


# Initialize database when module is imported
if __name__ == "__main__":
    init_db()
    print("Database setup complete!")
