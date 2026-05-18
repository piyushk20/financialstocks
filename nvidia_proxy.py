import json
import requests
import uuid
import time
from flask import Flask, request, Response, stream_with_context

app = Flask(__name__)

# MAPPING CONFIGURATION
MODEL_MAP = {
    "claude-3-5-sonnet-20241022": "moonshotai/kimi-k2.6",
    "claude-3-opus-20240229": "z-ai/glm-5.1",
    "claude-3-haiku-20240307": "deepseek-ai/deepseek-v4-flash"
}

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

@app.route("/v1/models", methods=["GET"])
def list_models():
    models = [{"id": k, "object": "model", "created": 1686935002, "owned_by": "anthropic"} for k in MODEL_MAP.keys()]
    return json.dumps({"object": "list", "data": models}), 200, {"Content-Type": "application/json"}

@app.route("/v1/messages", methods=["POST"])
def proxy():
    data = request.json
    anthropic_model = data.get("model")
    nvidia_model = MODEL_MAP.get(anthropic_model, "moonshotai/kimi-k2.6")
    
    print(f"Translating: {anthropic_model} -> {nvidia_model}")
    
    messages = []
    for msg in data.get("messages", []):
        role = msg.get("role")
        content = msg.get("content")
        if isinstance(content, list):
            content = " ".join([c.get("text", "") for c in content if c.get("type") == "text"])
        messages.append({"role": role, "content": content})
    
    if data.get("system"):
        messages.insert(0, {"role": "system", "content": data.get("system")})

    payload = {
        "model": nvidia_model,
        "messages": messages,
        "temperature": data.get("temperature", 1.0),
        "max_tokens": data.get("max_tokens", 4096),
        "stream": data.get("stream", False)
    }

    headers = {
        "Authorization": request.headers.get("Authorization"),
        "Content-Type": "application/json"
    }

    res = requests.post(NVIDIA_URL, headers=headers, json=payload, stream=data.get("stream", False))

    if data.get("stream"):
        def generate():
            msg_id = f"msg_{uuid.uuid4()}"
            # 1. message_start
            yield f"data: {json.dumps({'type': 'message_start', 'message': {'id': msg_id, 'type': 'message', 'role': 'assistant', 'model': anthropic_model, 'content': [], 'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 0, 'output_tokens': 0}}})}\n\n"
            # 2. content_block_start
            yield f"data: {json.dumps({'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}})}\n\n"
            
            for line in res.iter_lines():
                if line:
                    decoded = line.decode("utf-8")
                    if decoded.startswith("data: ") and "[DONE]" not in decoded:
                        try:
                            chunk = json.loads(decoded[6:])
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                # 3. content_block_delta
                                yield f"data: {json.dumps({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': delta}})}\n\n"
                        except: pass
            
            # 4. content_block_stop
            yield f"data: {json.dumps({'type': 'content_block_stop', 'index': 0})}\n\n"
            # 5. message_delta
            yield f"data: {json.dumps({'type': 'message_delta', 'delta': {'stop_reason': 'end_turn', 'stop_sequence': None}, 'usage': {'output_tokens': 0}})}\n\n"
            # 6. message_stop
            yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
            
        return Response(stream_with_context(generate()), content_type="text/event-stream")
    else:
        nvidia_res = res.json()
        content = nvidia_res["choices"][0]["message"]["content"]
        return json.dumps({
            "id": nvidia_res["id"], "type": "message", "role": "assistant", "model": anthropic_model,
            "content": [{"type": "text", "text": content}], "stop_reason": "end_turn", "usage": {"input_tokens": 0, "output_tokens": 0}
        }), 200, {"Content-Type": "application/json"}

if __name__ == "__main__":
    app.run(port=8000)
