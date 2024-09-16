from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
from litellm import acompletion
from starlette.middleware.base import BaseHTTPMiddleware

import asyncio
import litellm

litellm.set_verbose = True  # Enable verbose logging

app = FastAPI()


# Define input structure using Pydantic
class ChatRequest(BaseModel):
    message: str


# Custom middleware to disable Gzip for the /chat route
class DisableGzipMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/chat"):
            # Remove 'Content-Encoding' from the headers if it's Gzip
            if "Content-Encoding" in response.headers and response.headers["Content-Encoding"] == "gzip":
                del response.headers["Content-Encoding"]
            # Set connection to keep-alive for streaming
            response.headers["Connection"] = "keep-alive"
        return response


# Add the custom middleware to FastAPI
app.add_middleware(DisableGzipMiddleware)


# Streaming response with proper headers and no Gzip
async def async_ollama(user_message: str):
    try:
        # Call the API with streaming enabled
        response = await acompletion(
            model="openai/Meta-Llama-3-70B-Instruct",
            messages=[
                {'role': 'system', 'content': "you are an email composing expert."},
                {'role': 'user', 'content': f"QUERY:\n{user_message} and my name is Vana"}
            ],
            api_base="http://192.168.1.74:9198/v1",
            api_key='empty',
            stream=True,
            max_tokens=1024,
            timeout=60,
            metadata={'generation_name': 'test-vana'},
        )

        # Yield each chunk of the response
        async for chunk in response:
            if 'choices' in chunk and chunk.choices[0].delta.content:
                yield f"data: {chunk.choices[0].delta.content} \n\n"

    except Exception as e:
        yield f"Error: {str(e)}"


# FastAPI route for handling chat requests
@app.post("/chat")
async def chat_stream(request: ChatRequest):
    try:
        # Create a streaming response
        response = StreamingResponse(
            async_ollama(request.message),
            headers={
                "Content-Encoding": "identity",
                "Transfer-Encoding": "chunked",
                "X-Content-Type-Options": "nosniff"
            },
            media_type="text/event-stream"
        )

        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/hello/{name}")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}
