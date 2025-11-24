from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Optional, List, Dict
import os
from datetime import datetime
import random
from groq import Groq
from dotenv import load_dotenv
import json

load_dotenv()

app = FastAPI(title="AI Interview Practice Partner")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq client
try:
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
except TypeError:
    # Fallback for Python 3.13 compatibility issues
    import httpx
    groq_client = Groq(
        api_key=os.getenv("GROQ_API_KEY"),
        http_client=httpx.Client()
    )

# In-memory session storage
sessions: Dict[str, dict] = {}

# Role configurations
ROLE_CONFIGS = {
    "software_engineer": {
        "name": "Software Engineer",
        "num_questions": 7,
        "estimated_time": 30,
        "description": "Technical interview focusing on algorithms, system design, and coding practices"
    },
    "sales": {
        "name": "Sales Representative",
        "num_questions": 9,
        "estimated_time": 30,
        "description": "Interview assessing sales skills, customer handling, and negotiation abilities"
    },
    "manager": {
        "name": "Manager/Team Lead",
        "num_questions": 8,
        "estimated_time": 30,
        "description": "Leadership interview covering team management, decision-making, and strategic thinking"
    },
    "retail": {
        "name": "Retail Associate",
        "num_questions": 10,
        "estimated_time": 30,
        "description": "Customer service interview focusing on communication and problem-solving"
    },
    "marketing": {
        "name": "Marketing Specialist",
        "num_questions": 8,
        "estimated_time": 30,
        "description": "Creative interview covering campaigns, analytics, and brand strategy"
    },
    "data_analyst": {
        "name": "Data Analyst",
        "num_questions": 7,
        "estimated_time": 30,
        "description": "Analytical interview on data interpretation, SQL, and business insights"
    }
}

# Pydantic models
class InterviewStartRequest(BaseModel):
    role: str
    user_name: Optional[str] = "Candidate"

class MessageRequest(BaseModel):
    session_id: str
    message: str

class InterviewSession(BaseModel):
    session_id: str
    role: str
    user_name: str
    start_time: str
    questions_asked: int
    conversation_history: List[Dict]
    current_question: Optional[str]
    awaiting_followup: bool

# System prompts for different roles
def get_system_prompt(role: str, user_name: str) -> str:
    role_info = ROLE_CONFIGS.get(role, ROLE_CONFIGS["software_engineer"])
    
    base_prompt = f"""You are an experienced interviewer conducting a mock interview for a {role_info['name']} position.
The candidate's name is {user_name}.

CRITICAL INSTRUCTIONS:
1. Ask ONE question at a time and wait for the candidate's response
2. Your questions should be relevant to the {role_info['name']} role
3. After some answers, you may ask intelligent follow-up questions like:
   - "Why did you approach it that way?"
   - "Can you think of any alternative approaches?"
   - "How would you handle this scenario differently?"
   - "Can you elaborate on that point?"
4. DO NOT ask follow-ups after every answer - randomly decide (about 30-50% of the time)
5. Keep the conversation natural and professional
6. If the candidate goes off-topic, politely redirect: "That's interesting, but let's focus on..."
7. If the candidate is confused, provide gentle guidance
8. If responses are very brief, encourage more detail: "Could you expand on that?"
9. If responses are very lengthy, acknowledge and move forward: "Thank you for the detailed answer. Let's move to..."
10. Maintain a friendly but professional tone throughout
11. DO NOT provide feedback during the interview - only ask questions
12. After approximately {role_info['num_questions']} main questions, thank them and say: "That concludes our interview. Thank you for your time. Your feedback report is being generated."

Interview style: Conversational, supportive, realistic"""
    
    return base_prompt

def get_first_question(role: str) -> str:
    """Generate an appropriate opening question based on role"""
    opening_questions = {
        "software_engineer": "Let's start with a bit about yourself. Can you tell me about your background in software development and what interests you most about this role?",
        "sales": "Great to meet you! Could you tell me about your previous sales experience and what motivates you in a sales role?",
        "manager": "Thank you for joining today. Can you share your leadership experience and what you think makes a great manager?",
        "retail": "Welcome! Let's begin by hearing about your customer service experience and why you're interested in retail?",
        "marketing": "Nice to meet you! Can you tell me about your marketing background and what campaigns or projects you're most proud of?",
        "data_analyst": "Let's get started. Could you describe your experience with data analysis and what tools you're most comfortable using?"
    }
    return opening_questions.get(role, "Tell me about yourself and why you're interested in this position.")

def should_ask_followup() -> bool:
    """Randomly decide whether to ask a follow-up question"""
    return random.random() < 0.4  # 40% chance

def generate_feedback(session: dict) -> str:
    """Generate comprehensive feedback using Groq"""
    conversation = session['conversation_history']
    role_info = ROLE_CONFIGS[session['role']]
    
    # Prepare conversation for analysis
    interview_text = "\n\n".join([
        f"{'INTERVIEWER' if msg['role'] == 'assistant' else 'CANDIDATE'}: {msg['content']}"
        for msg in conversation
    ])
    
    feedback_prompt = f"""You are an expert interview coach. Analyze this mock interview for a {role_info['name']} position and provide detailed feedback.

INTERVIEW TRANSCRIPT:
{interview_text}

Provide comprehensive feedback covering:

1. OVERALL PERFORMANCE (Score: X/10)
   - Brief summary of the candidate's performance

2. STRENGTHS
   - What the candidate did well
   - Specific examples from their answers

3. AREAS FOR IMPROVEMENT
   - Communication skills
   - Technical knowledge (if applicable)
   - Problem-solving approach
   - Confidence and clarity
   - Specific examples where they could improve

4. SPECIFIC RECOMMENDATIONS
   - 3-5 actionable tips for improvement
   - Resources or practice areas to focus on

5. NOTABLE RESPONSES
   - Highlight 2-3 particularly good or concerning responses

Keep the feedback constructive, specific, and encouraging. Format it clearly with headers and bullet points."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an expert interview coach providing detailed, constructive feedback."},
                {"role": "user", "content": feedback_prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error generating feedback: {str(e)}"

# API Endpoints

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")

@app.get("/favicon.ico")
async def favicon():
    # Return a simple response or redirect
    return Response(status_code=204)  # No Content

@app.get("/api/roles")
async def get_roles():
    """Get available interview roles"""
    return {"roles": ROLE_CONFIGS}

@app.post("/api/interview/start")
async def start_interview(request: InterviewStartRequest):
    """Start a new interview session"""
    if request.role not in ROLE_CONFIGS:
        raise HTTPException(status_code=400, detail="Invalid role selected")
    
    session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{random.randint(1000, 9999)}"
    
    first_question = get_first_question(request.role)
    
    sessions[session_id] = {
        "session_id": session_id,
        "role": request.role,
        "user_name": request.user_name,
        "start_time": datetime.now().isoformat(),
        "questions_asked": 1,
        "conversation_history": [
            {"role": "assistant", "content": first_question}
        ],
        "current_question": first_question,
        "awaiting_followup": False,
        "system_prompt": get_system_prompt(request.role, request.user_name)
    }
    
    return {
        "session_id": session_id,
        "first_question": first_question,
        "role_info": ROLE_CONFIGS[request.role]
    }

@app.post("/api/interview/message")
async def send_message(request: MessageRequest):
    """Send a message in the interview"""
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[request.session_id]
    role_info = ROLE_CONFIGS[session['role']]
    
    # Validate input
    if not request.message.strip():
        return {
            "response": "I didn't catch that. Could you please provide an answer?",
            "is_complete": False
        }
    
    # Handle edge cases - very long responses
    if len(request.message) > 2000:
        return {
            "response": "I appreciate the detailed response! Let me make sure I understand the key points. Could you summarize your main idea?",
            "is_complete": False
        }
    
    # Add user message to history
    session['conversation_history'].append({
        "role": "user",
        "content": request.message
    })
    
    # Check if interview should end
    if session['questions_asked'] >= role_info['num_questions']:
        # End interview and generate feedback
        closing_message = "Thank you so much for your time today! That concludes our interview. I'm now generating your detailed feedback report..."
        session['conversation_history'].append({
            "role": "assistant",
            "content": closing_message
        })
        
        feedback = generate_feedback(session)
        
        return {
            "response": closing_message,
            "is_complete": True,
            "feedback": feedback
        }
    
    # Prepare messages for Groq
    messages = [
        {"role": "system", "content": session['system_prompt']}
    ]
    
    # Add conversation history
    for msg in session['conversation_history']:
        messages.append({
            "role": msg['role'],
            "content": msg['content']
        })
    
    # Get AI response
    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.8,
            max_tokens=500
        )
        
        ai_response = response.choices[0].message.content
        
        # Add AI response to history
        session['conversation_history'].append({
            "role": "assistant",
            "content": ai_response
        })
        
        # Increment question counter if not a follow-up
        if not session['awaiting_followup']:
            session['questions_asked'] += 1
        
        # Decide if next should be a follow-up
        session['awaiting_followup'] = should_ask_followup() and session['questions_asked'] < role_info['num_questions']
        
        return {
            "response": ai_response,
            "is_complete": False,
            "questions_remaining": role_info['num_questions'] - session['questions_asked']
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")

@app.post("/api/interview/end")
async def end_interview(session_id: str):
    """Manually end interview and get feedback"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    feedback = generate_feedback(session)
    
    return {
        "feedback": feedback,
        "transcript": session['conversation_history']
    }

@app.get("/api/interview/transcript/{session_id}")
async def get_transcript(session_id: str):
    """Get interview transcript"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = sessions[session_id]
    role_info = ROLE_CONFIGS[session['role']]
    
    # Format transcript
    transcript = f"""
AI INTERVIEW PRACTICE - TRANSCRIPT
{'='*60}
Role: {role_info['name']}
Candidate: {session['user_name']}
Date: {session['start_time']}
Duration: {role_info['estimated_time']} minutes
{'='*60}

CONVERSATION:
"""
    
    for i, msg in enumerate(session['conversation_history'], 1):
        speaker = "INTERVIEWER" if msg['role'] == 'assistant' else "CANDIDATE"
        transcript += f"\n[{i}] {speaker}:\n{msg['content']}\n"
    
    return {
        "transcript": transcript,
        "session_info": {
            "role": role_info['name'],
            "user_name": session['user_name'],
            "start_time": session['start_time'],
            "questions_asked": session['questions_asked']
        }
    }

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
