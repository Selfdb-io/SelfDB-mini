"""
Locust Load Testing for FastAPI Application (Day-One Backend)

This file contains load tests for Users and Tables APIs.
It simulates realistic user behavior patterns and measures performance.

Run with:
    locust -f locustfile.py --host=http://localhost:8000

Then open http://localhost:8089 to access the Locust web UI.

For headless mode:
    locust -f locustfile.py --host=http://localhost:8000 --users 100 --spawn-rate 10 --run-time 1m --headless

API Key for testing:
    X-API-Key: "Myapi-Key-for-dev"
"""

from locust import HttpUser, task, between, SequentialTaskSet
from uuid import uuid4
import random
import string


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
API_KEY = "Myapi-Key-for-dev"
API_KEY_HEADER = "X-API-Key"


def generate_table_name():
    """Generate a valid table name (lowercase, starts with letter)."""
    prefix = random.choice(string.ascii_lowercase)
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{prefix}{suffix}"


class AuthenticatedUserBehavior(SequentialTaskSet):
    """
    Sequential task set simulating authenticated user behavior.
    
    Users will:
    1. Create account and login
    2. CRUD operations on users (as admin)
    3. CRUD operations on tables
    4. CRUD operations on table data (rows)
    5. CRUD operations on columns
    """
    
    access_token = None
    created_user_ids = []
    created_table_ids = []
    created_table_names = []  # Track table names for data operations
    test_user_email = None
    test_user_password = "TestPass123!"
    
    def on_start(self):
        """Create a test user and login to get access token."""
        self.test_user_email = f"loadtest-{uuid4()}@example.com"
        self.created_user_ids = []
        self.created_table_ids = []
        self.created_table_names = []
        
        # Create user (public endpoint)
        payload = {
            "email": self.test_user_email,
            "password": self.test_user_password,
            "firstName": "Load",
            "lastName": "Test"
        }
        
        with self.client.post(
            "/users/",
            json=payload,
            headers=self._api_key_headers(),
            catch_response=True,
            name="/users/ [Create Account]"
        ) as response:
            if response.status_code in [200, 201]:
                user_data = response.json()
                self.created_user_ids.append(user_data["id"])
                response.success()
            else:
                response.failure(f"Failed to create user: {response.status_code}")
        
        # Login to get access token
        self._login()
    
    def _login(self):
        """Login and store access token."""
        login_payload = {
            "email": self.test_user_email,
            "password": self.test_user_password
        }
        
        with self.client.post(
            "/users/token",
            json=login_payload,
            headers=self._api_key_headers(),
            catch_response=True,
            name="/users/token [Login]"
        ) as response:
            if response.status_code == 200:
                token_data = response.json()
                self.access_token = token_data["access_token"]
                response.success()
            else:
                response.failure(f"Login failed: {response.status_code}")
    
    def _auth_headers(self):
        """Return headers with Bearer token and API key."""
        headers = {
            "Content-Type": "application/json",
            API_KEY_HEADER: API_KEY
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers
    
    def _api_key_headers(self):
        """Return headers with API key only (no auth token)."""
        return {
            API_KEY_HEADER: API_KEY,
            "Content-Type": "application/json"
        }
    
    # ─────────────────────────────────────────────────────────────────────────
    # User Endpoints (Authenticated)
    # ─────────────────────────────────────────────────────────────────────────
    
    @task(3)
    def get_current_user(self):
        """GET /users/me - Get current logged in user."""
        with self.client.get(
            "/users/me",
            headers=self._auth_headers(),
            catch_response=True,
            name="/users/me [Get Current User]"
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                # Token expired, re-login
                self._login()
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(2)
    def list_users(self):
        """GET /users/ - List all users with pagination (requires auth)."""
        with self.client.get(
            "/users/",
            params={"skip": 0, "limit": 10},
            headers=self._auth_headers(),
            catch_response=True,
            name="/users/ [List]"
        ) as response:
            if response.status_code == 200:
                response.success()
            elif response.status_code == 401:
                self._login()
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(2)
    def create_user(self):
        """POST /users/ - Create a new user (public endpoint)."""
        payload = {
            "email": f"loadtest-{uuid4()}@example.com",
            "password": "TestPass123!",
            "firstName": "Load",
            "lastName": "Tester"
        }
        
        with self.client.post(
            "/users/",
            json=payload,
            headers=self._api_key_headers(),
            catch_response=True,
            name="/users/ [Create]"
        ) as response:
            if response.status_code in [200, 201]:
                user_data = response.json()
                self.created_user_ids.append(user_data["id"])
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(1)
    def get_user(self):
        """GET /users/{user_id} - Get specific user (requires auth)."""
        if self.created_user_ids:
            user_id = random.choice(self.created_user_ids)
            with self.client.get(
                f"/users/{user_id}",
                headers=self._auth_headers(),
                catch_response=True,
                name="/users/{user_id} [Read]"
            ) as response:
                if response.status_code == 200:
                    response.success()
                elif response.status_code in [401, 404]:
                    response.success()  # Expected for expired tokens or deleted users
                else:
                    response.failure(f"Got status code {response.status_code}")
    
    # ─────────────────────────────────────────────────────────────────────────
    # Table Endpoints (Authenticated)
    # ─────────────────────────────────────────────────────────────────────────
    
    @task(3)
    def list_tables(self):
        """GET /tables/ - List tables (public + owned for authenticated users)."""
        with self.client.get(
            "/tables/",
            params={"skip": 0, "limit": 10},
            headers=self._auth_headers(),
            catch_response=True,
            name="/tables/ [List]"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(3)
    def create_table(self):
        """POST /tables/ - Create a new table (requires auth)."""
        table_name = generate_table_name()
        payload = {
            "name": table_name,
            "schema": {
                "name": {"type": "TEXT", "nullable": False},
                "value": {"type": "INTEGER", "nullable": True},
                "active": {"type": "BOOLEAN", "nullable": True}
            },
            "public": random.choice([True, False]),
            "description": f"Load test table {uuid4().hex[:8]}"
        }
        
        with self.client.post(
            "/tables/",
            json=payload,
            headers=self._auth_headers(),
            catch_response=True,
            name="/tables/ [Create]"
        ) as response:
            if response.status_code in [200, 201]:
                table_data = response.json()
                self.created_table_ids.append(table_data["id"])
                self.created_table_names.append(table_name)
                response.success()
            elif response.status_code == 401:
                self._login()
                response.failure("Token expired, re-login needed")
            else:
                response.failure(f"Got status code {response.status_code}: {response.text}")
    
    @task(2)
    def get_table(self):
        """GET /tables/{table_id} - Get specific table."""
        if self.created_table_ids:
            table_id = random.choice(self.created_table_ids)
            with self.client.get(
                f"/tables/{table_id}",
                headers=self._auth_headers(),
                catch_response=True,
                name="/tables/{table_id} [Read]"
            ) as response:
                if response.status_code == 200:
                    response.success()
                elif response.status_code in [401, 403, 404]:
                    response.success()  # Expected for access issues or deleted tables
                else:
                    response.failure(f"Got status code {response.status_code}")
    
    @task(1)
    def update_table(self):
        """PATCH /tables/{table_id} - Update table (owner only)."""
        if self.created_table_ids:
            table_id = random.choice(self.created_table_ids)
            payload = {
                "description": f"Updated at {uuid4().hex[:8]}",
                "public": random.choice([True, False])
            }
            
            with self.client.patch(
                f"/tables/{table_id}",
                json=payload,
                headers=self._auth_headers(),
                catch_response=True,
                name="/tables/{table_id} [Update]"
            ) as response:
                if response.status_code == 200:
                    response.success()
                elif response.status_code in [401, 403, 404]:
                    response.success()  # Expected for access issues
                else:
                    response.failure(f"Got status code {response.status_code}")
    
    # ─────────────────────────────────────────────────────────────────────────
    # Table Data (Row) Endpoints
    # ─────────────────────────────────────────────────────────────────────────
    
    @task(2)
    def get_table_data(self):
        """GET /tables/{table_id}/data - Get paginated data from table."""
        if self.created_table_ids:
            table_id = random.choice(self.created_table_ids)
            with self.client.get(
                f"/tables/{table_id}/data",
                params={"page": 1, "page_size": 10},
                headers=self._auth_headers(),
                catch_response=True,
                name="/tables/{table_id}/data [Get Data]"
            ) as response:
                if response.status_code == 200:
                    response.success()
                elif response.status_code in [400, 401, 403, 404]:
                    response.success()  # Expected for various access/state issues
                else:
                    response.failure(f"Got status code {response.status_code}")
    
    @task(2)
    def insert_row(self):
        """POST /tables/{table_id}/data - Insert row into table."""
        if self.created_table_ids:
            table_id = random.choice(self.created_table_ids)
            row_data = {
                "name": f"Item-{uuid4().hex[:6]}",
                "value": random.randint(1, 1000),
                "active": random.choice([True, False])
            }
            
            with self.client.post(
                f"/tables/{table_id}/data",
                json=row_data,
                headers=self._auth_headers(),
                catch_response=True,
                name="/tables/{table_id}/data [Insert Row]"
            ) as response:
                if response.status_code in [200, 201]:
                    response.success()
                elif response.status_code in [400, 401, 403, 404]:
                    response.success()  # Expected for various states
                else:
                    response.failure(f"Got status code {response.status_code}")
    
    # ─────────────────────────────────────────────────────────────────────────
    # Column Management Endpoints
    # ─────────────────────────────────────────────────────────────────────────
    
    @task(1)
    def add_column(self):
        """POST /tables/{table_id}/columns - Add column to table."""
        if self.created_table_ids:
            table_id = random.choice(self.created_table_ids)
            column_name = f"col_{uuid4().hex[:6]}"
            payload = {
                "name": column_name,
                "type": random.choice(["TEXT", "INTEGER", "BOOLEAN"]),
                "nullable": True
            }
            
            with self.client.post(
                f"/tables/{table_id}/columns",
                json=payload,
                headers=self._auth_headers(),
                catch_response=True,
                name="/tables/{table_id}/columns [Add Column]"
            ) as response:
                if response.status_code == 200:
                    response.success()
                elif response.status_code in [400, 401, 403, 404, 409]:
                    response.success()  # Expected for various states
                else:
                    response.failure(f"Got status code {response.status_code}")
    
    # ─────────────────────────────────────────────────────────────────────────
    # Cleanup Tasks (Lower Weight)
    # ─────────────────────────────────────────────────────────────────────────
    
    @task(1)
    def delete_table(self):
        """DELETE /tables/{table_id} - Delete table (owner only)."""
        if self.created_table_ids and len(self.created_table_ids) > 3:
            idx = random.randint(0, len(self.created_table_ids) - 1)
            table_id = self.created_table_ids.pop(idx)
            if idx < len(self.created_table_names):
                self.created_table_names.pop(idx)
            
            with self.client.delete(
                f"/tables/{table_id}",
                headers=self._auth_headers(),
                catch_response=True,
                name="/tables/{table_id} [Delete]"
            ) as response:
                if response.status_code in [200, 204]:
                    response.success()
                elif response.status_code in [401, 403, 404]:
                    response.success()  # Already deleted or access denied
                else:
                    response.failure(f"Got status code {response.status_code}")


class PublicUserBehavior(SequentialTaskSet):
    """
    Task set for unauthenticated users.
    Tests public endpoints only.
    """
    
    def _api_key_headers(self):
        """Return headers with API key."""
        return {
            API_KEY_HEADER: API_KEY,
            "Content-Type": "application/json"
        }
    
    @task(3)
    def list_public_tables(self):
        """GET /tables/ - List public tables (no auth required)."""
        with self.client.get(
            "/tables/",
            params={"skip": 0, "limit": 10},
            headers=self._api_key_headers(),
            catch_response=True,
            name="/tables/ [List Public]"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(2)
    def create_account(self):
        """POST /users/ - Create new account (public endpoint)."""
        payload = {
            "email": f"newuser-{uuid4()}@example.com",
            "password": "NewUser123!",
            "firstName": "New",
            "lastName": "User"
        }
        
        with self.client.post(
            "/users/",
            json=payload,
            headers=self._api_key_headers(),
            catch_response=True,
            name="/users/ [Register]"
        ) as response:
            if response.status_code in [200, 201]:
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")
    
    @task(2)
    def login_attempt(self):
        """POST /users/token - Attempt login (may fail with random credentials)."""
        payload = {
            "email": f"random-{uuid4()}@example.com",
            "password": "RandomPass123!"
        }
        
        with self.client.post(
            "/users/token",
            json=payload,
            headers=self._api_key_headers(),
            catch_response=True,
            name="/users/token [Login Attempt]"
        ) as response:
            # 401 is expected for invalid credentials
            if response.status_code in [200, 401]:
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")


# ─────────────────────────────────────────────────────────────────────────────
# Locust User Classes
# ─────────────────────────────────────────────────────────────────────────────

class AuthenticatedAPIUser(HttpUser):
    """
    Simulated authenticated user for load testing.
    Performs full CRUD operations on all resources.
    
    Configuration:
    - wait_time: Random wait between 1-3 seconds between tasks
    - weight: 3 (more authenticated users than public)
    """
    tasks = [AuthenticatedUserBehavior]
    wait_time = between(1, 3)
    weight = 3
    
    def on_start(self):
        """Called when a simulated user starts."""
        self.client.headers = {
            "Content-Type": "application/json",
            "User-Agent": "Locust Load Test - Authenticated",
            API_KEY_HEADER: API_KEY
        }


class PublicAPIUser(HttpUser):
    """
    Simulated unauthenticated user for load testing.
    Only accesses public endpoints.
    
    Configuration:
    - wait_time: Random wait between 1-5 seconds between tasks
    - weight: 1 (fewer public users)
    """
    tasks = [PublicUserBehavior]
    wait_time = between(1, 5)
    weight = 1
    
    def on_start(self):
        """Called when a simulated user starts."""
        self.client.headers = {
            "Content-Type": "application/json",
            "User-Agent": "Locust Load Test - Public",
            API_KEY_HEADER: API_KEY
        }


class QuickSmokeTest(HttpUser):
    """
    Quick smoke test user - hits endpoints rapidly without waiting.
    Use this to quickly verify API can handle high request rates.
    
    Run specific test:
        locust -f locustfile.py --host=http://localhost:8000 -u 10 -r 5 --run-time 30s --headless QuickSmokeTest
    """
    wait_time = between(0.1, 0.5)  # Very short wait times
    weight = 0  # Set to 0 to exclude from normal runs; use explicitly when needed
    
    def on_start(self):
        """Setup for smoke test."""
        self.client.headers = {
            "Content-Type": "application/json",
            "User-Agent": "Locust Smoke Test",
            API_KEY_HEADER: API_KEY
        }
        
        # Create and login a test user for authenticated endpoints
        self.test_email = f"smoke-{uuid4()}@example.com"
        self.test_password = "SmokeTest123!"
        self.access_token = None
        
        # Register
        payload = {
            "email": self.test_email,
            "password": self.test_password,
            "firstName": "Smoke",
            "lastName": "Test"
        }
        self.client.post("/users/", json=payload)
        
        # Login
        login_response = self.client.post(
            "/users/token",
            json={"email": self.test_email, "password": self.test_password}
        )
        if login_response.status_code == 200:
            self.access_token = login_response.json().get("access_token")
    
    def _auth_headers(self):
        headers = {
            "Content-Type": "application/json",
            API_KEY_HEADER: API_KEY
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers
    
    @task(5)
    def quick_list_tables(self):
        """Rapid-fire table listing."""
        self.client.get("/tables/?skip=0&limit=5", name="/tables/ [Quick]")
    
    @task(3)
    def quick_get_me(self):
        """Rapid-fire get current user."""
        self.client.get("/users/me", headers=self._auth_headers(), name="/users/me [Quick]")
    
    @task(2)
    def quick_list_users(self):
        """Rapid-fire user listing."""
        self.client.get(
            "/users/?skip=0&limit=5", 
            headers=self._auth_headers(), 
            name="/users/ [Quick]"
        )
    
    @task(1)
    def quick_create_table(self):
        """Quick table creation."""
        table_name = generate_table_name()
        payload = {
            "name": table_name,
            "schema": {"data": {"type": "TEXT"}},
            "public": True
        }
        self.client.post(
            "/tables/", 
            json=payload, 
            headers=self._auth_headers(),
            name="/tables/ [Quick Create]"
        )

