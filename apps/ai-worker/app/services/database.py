import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/lead-agent")

client = AsyncIOMotorClient(MONGODB_URI)
db = client.get_default_database()

async def get_db():
    return db
