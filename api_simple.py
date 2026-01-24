from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
import sys
from datetime import datetime

# Add the current directory and query directory to the path
current_dir = os.path.dirname(__file__)
query_dir = os.path.join(current_dir, 'query')
sys.path.append(current_dir)
sys.path.append(query_dir)

# Import existing modules
try:
    from query.agents import MultiAssistantSystem
    from query.openai_utils import get_openai_client
except ImportError as e:
    print("Warning: Could not import query modules: {}".format(e))
    MultiAssistantSystem = None
    get_openai_client = None

app = FastAPI(title="Fantasy Baseball API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict[str, Any]] = None

class AgentStep(BaseModel):
    label: str
    detail: Optional[str] = None
    ts: Optional[str] = None

class ChatResponse(BaseModel):
    message: ChatMessage
    steps: Optional[List[AgentStep]] = None
    usage: Optional[Dict[str, int]] = None

# Initialize the multi-assistant system
def get_assistant_system():
    """Get or create the multi-assistant system."""
    if not MultiAssistantSystem:
        print("MultiAssistantSystem not available")
        return None

    try:
        # Connect to the database
        db_path = os.path.join(os.path.dirname(__file__), 'query', 'baseball.db')
        if not os.path.exists(db_path):
            print("Database not found at {}".format(db_path))
            return None

        import sqlite3
        db = sqlite3.connect(db_path)

        # Initialize the system
        system = MultiAssistantSystem(db=db)
        return system
    except Exception as e:
        print("Error initializing assistant system: {}".format(e))
        return None

# Global system instance
assistant_system = get_assistant_system()

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint that processes fantasy baseball questions."""
    try:
        if not assistant_system:
            raise HTTPException(status_code=500, detail="Assistant system not available")

        # Get the last user message
        user_messages = [msg for msg in request.messages if msg.role == "user"]
        if not user_messages:
            raise HTTPException(status_code=400, detail="No user message found")

        last_user_message = user_messages[-1].content

        # Use the existing multi-assistant system to analyze the question
        try:
            result = assistant_system.analyze_and_visualize(last_user_message)

            # Extract the response from the result
            if isinstance(result, dict) and 'response' in result:
                response_content = result['response']
            else:
                response_content = str(result)

            # Create agent steps for transparency
            steps = [
                AgentStep(
                    label="Query Analysis",
                    detail="Analyzed the fantasy baseball question",
                    ts=datetime.now().isoformat()
                ),
                AgentStep(
                    label="Data Processing",
                    detail="Processed data using multi-agent system",
                    ts=datetime.now().isoformat()
                )
            ]

            return ChatResponse(
                message=ChatMessage(
                    role="assistant",
                    content=response_content
                ),
                steps=steps,
                usage={"inputTokens": 0, "outputTokens": 0}  # Placeholder
            )

        except Exception as e:
            # Fallback to simple OpenAI response
            if not get_openai_client:
                raise HTTPException(status_code=500, detail="OpenAI client not available")

            try:
                client = get_openai_client()

                # Create a system prompt for fantasy baseball
                system_prompt = """You are a fantasy baseball expert assistant. Help users with their fantasy baseball questions about:
                - Player comparisons and recommendations
                - Lineup decisions
                - Trade analysis
                - Waiver wire pickups
                - Statistical analysis
                - Roster management

                Provide detailed, actionable advice based on current baseball data and trends."""

                # Prepare messages for OpenAI
                openai_messages = [{"role": "system", "content": system_prompt}]
                for msg in request.messages:
                    openai_messages.append({"role": msg.role, "content": msg.content})

                response = client.chat.completions.create(
                    model="gpt-4",
                    messages=openai_messages,
                    temperature=0.7
                )

                return ChatResponse(
                    message=ChatMessage(
                        role="assistant",
                        content=response.choices[0].message.content
                    ),
                    steps=[
                        AgentStep(
                            label="OpenAI Response",
                            detail="Generated response using GPT-4",
                            ts=datetime.now().isoformat()
                        )
                    ],
                    usage={
                        "inputTokens": response.usage.prompt_tokens,
                        "outputTokens": response.usage.completion_tokens
                    }
                )
            except Exception as openai_error:
                # Final fallback - return a simple response
                return ChatResponse(
                    message=ChatMessage(
                        role="assistant",
                        content="I apologize, but I'm having trouble processing your request right now. Error: {}".format(str(openai_error))
                    ),
                    steps=[
                        AgentStep(
                            label="Error Fallback",
                            detail="Returned error message due to system issues",
                            ts=datetime.now().isoformat()
                        )
                    ]
                )

    except Exception as e:
        raise HTTPException(status_code=500, detail="Error processing chat: {}".format(str(e)))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
