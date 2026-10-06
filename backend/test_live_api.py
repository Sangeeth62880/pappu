import os
import httpx
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Frontend .env contains anon key & supabase URL
SUPABASE_URL = "https://mvobtveaewxgiczulyrq.supabase.co"
SUPABASE_ANON_KEY = ""

with open(os.path.join(os.path.dirname(__file__), "..", "frontend", ".env"), "r") as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_SUPABASE_ANON_KEY="):
            SUPABASE_ANON_KEY = line.strip().split("=", 1)[1]
        elif line.startswith("EXPO_PUBLIC_SUPABASE_URL="):
            SUPABASE_URL = line.strip().split("=", 1)[1]

API_BASE_URL = "http://127.0.0.1:8000"

with httpx.Client(timeout=30.0) as client:
    print(f"Signing in with Supabase Auth at {SUPABASE_URL}...")
    auth_res = client.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": "test@pappu.dev", "password": "testpass123"},
    )

    if auth_res.status_code != 200:
        print(f"Failed to sign in to Supabase: {auth_res.status_code} {auth_res.text}")
        exit(1)

    auth_data = auth_res.json()
    access_token = auth_data["access_token"]
    user_id = auth_data["user"]["id"]
    print(f"Authenticated successfully! User ID: {user_id}")

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    # 1. Health check
    print("\n1. Testing /health...")
    health_res = client.get(f"{API_BASE_URL}/health")
    print(f"Status: {health_res.status_code}, Response: {health_res.json()}")
    assert health_res.status_code == 200

    # 2. Summary
    print("\n2. Testing /summary with real JWT...")
    sum_res = client.get(f"{API_BASE_URL}/summary", headers=headers)
    print(f"Status: {sum_res.status_code}, Response: {sum_res.json()}")
    assert sum_res.status_code == 200
    summary = sum_res.json()
    assert "balance" in summary
    assert "category_breakdown" in summary

    # 3. Intent Parse
    print("\n3. Testing /intent/parse with 'I spent 250 on lunch today'...")
    parse_res = client.post(
        f"{API_BASE_URL}/intent/parse",
        headers=headers,
        json={"text": "I spent 250 on lunch today"},
    )
    print(f"Status: {parse_res.status_code}, Response: {parse_res.json()}")
    assert parse_res.status_code == 200
    intent_data = parse_res.json()
    intent = intent_data["intent"]
    print(f"Parsed Action: {intent['action']}, Amount: {intent['fields']['amount']}, Category: {intent['fields']['category']}")

    # 4. Route intent
    print("\n4. Testing /intent/route...")
    route_res = client.post(
        f"{API_BASE_URL}/intent/route",
        headers=headers,
        json={"intent": intent},
    )
    print(f"Status: {route_res.status_code}, Response: {route_res.json()}")
    assert route_res.status_code == 200

    # 5. Fetch transactions
    print("\n5. Testing /transactions...")
    txn_res = client.get(f"{API_BASE_URL}/transactions", headers=headers)
    print(f"Status: {txn_res.status_code}, Found {len(txn_res.json())} transaction(s):")
    for txn in txn_res.json():
        print(f"  ID: {txn['id']}, Amount: ₹{txn['amount']}, Cat: {txn['category_name']}, Date: {txn['txn_date']}")
    assert txn_res.status_code == 200
    assert len(txn_res.json()) > 0

    # 6. Verify updated summary
    print("\n6. Testing /summary after transaction...")
    updated_sum_res = client.get(f"{API_BASE_URL}/summary", headers=headers)
    print(f"Status: {updated_sum_res.status_code}, Updated Response: {updated_sum_res.json()}")
    assert updated_sum_res.status_code == 200

    print("\n🎉 All live API endpoints against real Supabase DB passed with 200 OK!")
