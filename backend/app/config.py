import os
from dotenv import load_dotenv

# Load environment variables from the .env file in the backend directory
# Specify the absolute/relative path to backend/.env if needed, but standard load_dotenv searches parent dirs
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(backend_dir, ".env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
