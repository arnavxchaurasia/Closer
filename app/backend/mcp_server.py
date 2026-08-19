#!/usr/bin/env python3
"""
OurSpace MCP (Model Context Protocol) Server
Exposes JSON-RPC 2.0 stdin/stdout tools for AI agents and external tools to interact with OurSpace.
"""

import sys
import json
import asyncio
import os
from datetime import datetime

# Define MCP tools
TOOLS = [
    {
        "name": "get_couple_status",
        "description": "Fetch paired partner profile, connection status, daily streak, and partner mood.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "Optional user ID filter"}
            }
        }
    },
    {
        "name": "get_upcoming_festivals_and_events",
        "description": "Retrieve upcoming Indian festivals and couple calendar events.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "days": {"type": "number", "description": "Days ahead to fetch (default: 30)"}
            }
        }
    },
    {
        "name": "add_couple_event",
        "description": "Create a new event on the couple shared calendar.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Event title (e.g. Date Night, Anniversary)"},
                "category": {"type": "string", "description": "Category: date, festival, trip, anniversary, reminder"},
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                "description": {"type": "string", "description": "Optional event notes"}
            },
            "required": ["title", "date"]
        }
    },
    {
        "name": "send_love_note",
        "description": "Send a romantic love note to partner.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Love note content (max 500 characters)"}
            },
            "required": ["text"]
        }
    },
    {
        "name": "ask_aria_ai",
        "description": "Ask Aria (internal LLM relationship coach) for couple advice, date ideas, or resolution tips.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "Question or scenario for relationship coach Aria"}
            },
            "required": ["prompt"]
        }
    }
]

def handle_call_tool(name: str, arguments: dict) -> list:
    """Execute MCP tool logic and return text content response."""
    now_str = datetime.utcnow().strftime("%Y-%m-%d")

    if name == "get_couple_status":
        result = {
            "status": "connected",
            "partner_name": "Partner",
            "days_together": 420,
            "streak_days": 12,
            "partner_mood": "😄 8/10 (Happy)",
            "last_active": "Just now",
        }
    elif name == "get_upcoming_festivals_and_events":
        result = {
            "festivals": [
                {"name": "Hariyali Teej 🌿", "date": f"{now_str}", "significance": "Festival of love, mehendi & swings"},
                {"name": "Raksha Bandhan 🪢", "date": "2026-08-28", "significance": "Sacred bond & protection"},
                {"name": "Janmashtami 🪚", "date": "2026-09-04", "significance": "Divine love of Radha-Krishna"},
                {"name": "Karwa Chauth 🌕", "date": "2026-10-29", "significance": "Moonlit fast of eternal love"},
                {"name": "Diwali 🪔", "date": "2026-11-08", "significance": "Festival of lights & prosperity"}
            ],
            "calendar_events": [
                {"title": "Romantic Rooftop Dinner 🍷", "date": f"{now_str}", "time": "20:00"}
            ]
        }
    elif name == "add_couple_event":
        title = arguments.get("title", "New Event")
        date = arguments.get("date", now_str)
        result = {
            "success": True,
            "message": f"Added '{title}' on {date} to the shared couple calendar! 📅",
            "event_id": f"evt_{int(datetime.utcnow().timestamp())}"
        }
    elif name == "send_love_note":
        text = arguments.get("text", "")
        result = {
            "success": True,
            "message": f"Sent love note '{text}' to partner! 💌"
        }
    elif name == "ask_aria_ai":
        prompt = arguments.get("prompt", "")
        result = {
            "response": f"✨ Aria Relationship Coach: For '{prompt}', I recommend focusing on quality time together, expressing appreciation in your partner's love language, and celebrating small moments!"
        }
    else:
        result = {"error": f"Unknown tool: {name}"}

    return [{"type": "text", "text": json.dumps(result, indent=2)}]

def main():
    """Main JSON-RPC 2.0 stdio server loop."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue

        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        if method == "initialize":
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "ourspace-mcp-server", "version": "1.0.0"}
                }
            }
        elif method == "tools/list":
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"tools": TOOLS}
            }
        elif method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments", {})
            content = handle_call_tool(name, arguments)
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": content}
            }
        elif method == "notifications/initialized":
            continue
        else:
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": "Method not found"}
            }

        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
