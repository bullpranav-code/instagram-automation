# Instagram Automation System

Complete end-to-end automation with Claude AI, ChatGPT, Canva, n8n, and InstaPy.

## 🎯 Features

✅ AI-powered content generation (Claude + ChatGPT)
✅ Automatic design creation (Canva integration)
✅ Instagram bot automation (InstaPy)
✅ n8n workflow orchestration
✅ REST API for easy integration
✅ Database tracking and analytics
✅ Rate limiting and safety checks

## 📦 Files in This Project

- **config.py** - Configuration management
- **database.py** - SQLAlchemy database models
- **content_generator.py** - AI content generation
- **n8n_orchestrator.py** - n8n webhook integration
- **main_orchestrator.py** - Main API server
- **requirements.txt** - Python dependencies
- **.env.example** - Configuration template

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Create .env File
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Create logs directory
```bash
mkdir -p logs
```

### 4. Run the Application
```bash
python main_orchestrator.py
```

The API will be available at: **http://localhost:5000**

## 📚 API Endpoints

### Health Check
```bash
GET /api/health
```

### Generate Content
```bash
POST /api/generate-content
Content-Type: application/json

{
  "topic": "Digital Marketing",
  "count": 5
}
```

### Run Automation Cycle
```bash
POST /api/run-automation
Content-Type: application/json

{
  "topic": "Social Media Marketing",
  "hashtags": ["marketing", "socialmedia"]
}
```

### Get Statistics
```bash
GET /api/stats
```

## 🔧 Configuration

Edit `config.py` to customize:
- Content generation tone
- Hashtag count
- Rate limits
- Error handling
- Feature flags

## 📝 Environment Variables

Create a `.env` file from `.env.example`:

```
CLAUDE_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
CANVA_API_KEY=your_key_here
INSTAGRAM_USERNAME=your_username
INSTAGRAM_PASSWORD=your_password
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=your_key_here
DATABASE_URL=sqlite:///instagram_automation.db
```

## 🔑 Getting API Keys

### Claude API
1. Visit https://console.anthropic.com
2. Sign up and create API key
3. Add to `.env`

### OpenAI (ChatGPT)
1. Visit https://platform.openai.com
2. Create API key
3. Add to `.env`

### Canva
1. Visit https://www.canva.com/api/
2. Request API access
3. Add key to `.env`

## 📊 Database

SQLite database is created automatically at: `instagram_automation.db`

Tables:
- `generated_content` - AI-generated captions/comments
- `bot_activities` - Activity logs
- `instagram_posts` - Post tracking
- `system_logs` - System events

## 🛠️ Troubleshooting

### "Module not found" error
```bash
pip install -r requirements.txt
```

### "API key not found" error
Check your `.env` file has all required keys

### Database error
```bash
rm instagram_automation.db
python main_orchestrator.py
```

## 📞 Support

For issues, check the logs:
```bash
tail -f logs/automation.log
```

## 📄 License

MIT License

---

**Ready to automate?** 🚀
