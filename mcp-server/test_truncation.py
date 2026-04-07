import json

def truncate_json(data: any, max_chars: int = 1000) -> str:
    """Stringify data and truncate if it exceeds max_chars."""
    content = json.dumps(data, indent=2)
    if len(content) > max_chars:
        warning = f"\n\n... [Output truncated to {max_chars} characters for performance. Please use 'limit' or 'period' parameters to narrow your search.]"
        return content[:max_chars - len(warning)] + warning
    return content

# Test cases
def test():
    # Test case 1: Small data (no truncation)
    data1 = {"short": "message"}
    res1 = truncate_json(data1)
    print(f"Test 1 length: {len(res1)}")
    assert len(res1) <= 1000
    
    # Test case 2: Large data (truncation)
    data2 = {"large": "x" * 10000}
    res2 = truncate_json(data2)
    print(f"Test 2 length: {len(res2)}")
    assert len(res2) == 1000
    assert "[Output truncated to 1000 characters" in res2
    print("Test 2 successful")

if __name__ == "__main__":
    test()
