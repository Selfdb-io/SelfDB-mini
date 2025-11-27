#main.py 

import os
from fastapi import FastAPI
from contextlib import asynccontextmanager
from db import init_db, close_db
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from endpoints.users import router as users_router
from endpoints.tables import router as tables_router
from endpoints.system import router as system_router
from endpoints.backups import router as backups_router
from security import API_KEY
from fastapi.openapi.utils import get_openapi
from services.backup_service import start_scheduler, stop_scheduler

# App metadata from environment variables (required)
APP_NAME = os.environ["APP_NAME"]
APP_DESCRIPTION = os.environ["APP_DESCRIPTION"]
APP_VERSION = os.environ["APP_VERSION"]

# ─────────────────────────────────────────────────────────────────────────────
# Custom Middleware for API Key Validation
# ─────────────────────────────────────────────────────────────────────────────

class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate API key for all requests except documentation endpoints.
    Runs before routing and OpenAPI schema validation.
    """
    async def dispatch(self, request, call_next):
        # Exclude only documentation endpoints from API key validation
        # All other endpoints (including login, registration, and system) require API key
        excluded_paths = ["/docs", "/redoc", "/openapi.json"]
        
        current_path = request.url.path
        
        # Skip API key validation for excluded endpoints
        if current_path in excluded_paths:
            return await call_next(request)
        
        # Validate API key for all other endpoints
        api_key = request.headers.get("X-API-Key")
        
        if not api_key:
            return JSONResponse(
                status_code=406,
                content={"detail": "Missing required header: X-API-Key"}
            )
        
        if api_key != API_KEY:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid API key"}
            )
        
        # API key is valid, proceed with request
        response = await call_next(request)
        return response



@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await start_scheduler()
    yield
    await stop_scheduler()
    await close_db()

app = FastAPI(
    title=APP_NAME, 
    description=APP_DESCRIPTION,
    version=APP_VERSION,
    lifespan=lifespan
)


# Add API Key middleware BEFORE CORS
# This ensures API key validation happens first
app.add_middleware(APIKeyMiddleware)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# Include all routers
app.include_router(users_router)
app.include_router(tables_router)
app.include_router(system_router)
app.include_router(backups_router)


# Custom OpenAPI schema to document X-API-Key as a required header parameter
def custom_openapi():  
    if app.openapi_schema:  
        return app.openapi_schema  
      
    openapi_schema = get_openapi(  
        title=app.title,  
        version=app.version,  
        description=app.description,  
        routes=app.routes,  
    )  
      
    # Add X-API-Key as a required header parameter to all operations
    for path, path_item in openapi_schema["paths"].items():
            
        for operation in path_item.values():  
            if isinstance(operation, dict) and "operationId" in operation:  
                if "parameters" not in operation:
                    operation["parameters"] = []
                
                # Add X-API-Key header parameter if not already present
                has_api_key = any(
                    p.get("name") == "X-API-Key" and p.get("in") == "header"
                    for p in operation["parameters"]
                )
                
                if not has_api_key:
                    operation["parameters"].append({
                        "name": "X-API-Key",
                        "in": "header",
                        "required": True,
                        "schema": {"type": "string"},
                        "description": "API key required for all endpoints (validated by middleware)"
                    })
      
    app.openapi_schema = openapi_schema  
    return app.openapi_schema  
  
app.openapi = custom_openapi
