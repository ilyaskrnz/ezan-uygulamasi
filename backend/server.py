from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, date
import httpx
import math

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== Models ====================

class PrayerTimes(BaseModel):
    fajr: str  # Imsak
    sunrise: str  # Güneş
    dhuhr: str  # Öğle
    asr: str  # İkindi
    maghrib: str  # Akşam
    isha: str  # Yatsı
    date: str
    hijri_date: Optional[str] = None
    location: str
    country: str
    timezone: str

class LocationRequest(BaseModel):
    latitude: float
    longitude: float
    country_code: Optional[str] = None

class QiblaDirection(BaseModel):
    direction: float
    latitude: float
    longitude: float

class UserSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    device_id: str
    language: str = "tr"
    theme: str = "dark"
    notification_enabled: bool = True
    notification_sound: str = "default"
    calculation_method: int = 13  # Turkey Diyanet
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    country: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UserSettingsUpdate(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None
    notification_enabled: Optional[bool] = None
    notification_sound: Optional[str] = None
    calculation_method: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    country: Optional[str] = None

# Turkish cities for Diyanet
TURKISH_CITIES = [
    {"name": "İstanbul", "latitude": 41.0082, "longitude": 28.9784},
    {"name": "Ankara", "latitude": 39.9334, "longitude": 32.8597},
    {"name": "İzmir", "latitude": 38.4237, "longitude": 27.1428},
    {"name": "Bursa", "latitude": 40.1885, "longitude": 29.0610},
    {"name": "Antalya", "latitude": 36.8969, "longitude": 30.7133},
    {"name": "Adana", "latitude": 37.0000, "longitude": 35.3213},
    {"name": "Konya", "latitude": 37.8746, "longitude": 32.4932},
    {"name": "Gaziantep", "latitude": 37.0662, "longitude": 37.3833},
    {"name": "Şanlıurfa", "latitude": 37.1591, "longitude": 38.7969},
    {"name": "Kocaeli", "latitude": 40.8533, "longitude": 29.8815},
    {"name": "Mersin", "latitude": 36.8121, "longitude": 34.6415},
    {"name": "Diyarbakır", "latitude": 37.9144, "longitude": 40.2306},
    {"name": "Hatay", "latitude": 36.2028, "longitude": 36.1600},
    {"name": "Manisa", "latitude": 38.6191, "longitude": 27.4289},
    {"name": "Kayseri", "latitude": 38.7312, "longitude": 35.4787},
    {"name": "Samsun", "latitude": 41.2928, "longitude": 36.3313},
    {"name": "Balıkesir", "latitude": 39.6484, "longitude": 27.8826},
    {"name": "Kahramanmaraş", "latitude": 37.5858, "longitude": 36.9371},
    {"name": "Van", "latitude": 38.4891, "longitude": 43.4089},
    {"name": "Aydın", "latitude": 37.8560, "longitude": 27.8416},
    {"name": "Denizli", "latitude": 37.7765, "longitude": 29.0864},
    {"name": "Tekirdağ", "latitude": 40.9781, "longitude": 27.5117},
    {"name": "Sakarya", "latitude": 40.6940, "longitude": 30.4358},
    {"name": "Muğla", "latitude": 37.2153, "longitude": 28.3636},
    {"name": "Eskişehir", "latitude": 39.7767, "longitude": 30.5206},
    {"name": "Mardin", "latitude": 37.3212, "longitude": 40.7245},
    {"name": "Trabzon", "latitude": 41.0027, "longitude": 39.7168},
    {"name": "Erzurum", "latitude": 39.9055, "longitude": 41.2658},
    {"name": "Malatya", "latitude": 38.3552, "longitude": 38.3095},
    {"name": "Ordu", "latitude": 40.9862, "longitude": 37.8797},
]

# World major cities
WORLD_CITIES = [
    {"name": "Mecca", "country": "Saudi Arabia", "latitude": 21.4225, "longitude": 39.8262},
    {"name": "Medina", "country": "Saudi Arabia", "latitude": 24.5247, "longitude": 39.5692},
    {"name": "Dubai", "country": "UAE", "latitude": 25.2048, "longitude": 55.2708},
    {"name": "Cairo", "country": "Egypt", "latitude": 30.0444, "longitude": 31.2357},
    {"name": "Jakarta", "country": "Indonesia", "latitude": -6.2088, "longitude": 106.8456},
    {"name": "Kuala Lumpur", "country": "Malaysia", "latitude": 3.1390, "longitude": 101.6869},
    {"name": "London", "country": "UK", "latitude": 51.5074, "longitude": -0.1278},
    {"name": "Paris", "country": "France", "latitude": 48.8566, "longitude": 2.3522},
    {"name": "Berlin", "country": "Germany", "latitude": 52.5200, "longitude": 13.4050},
    {"name": "New York", "country": "USA", "latitude": 40.7128, "longitude": -74.0060},
    {"name": "Los Angeles", "country": "USA", "latitude": 34.0522, "longitude": -118.2437},
    {"name": "Toronto", "country": "Canada", "latitude": 43.6532, "longitude": -79.3832},
    {"name": "Sydney", "country": "Australia", "latitude": -33.8688, "longitude": 151.2093},
    {"name": "Tokyo", "country": "Japan", "latitude": 35.6762, "longitude": 139.6503},
    {"name": "Islamabad", "country": "Pakistan", "latitude": 33.6844, "longitude": 73.0479},
    {"name": "Karachi", "country": "Pakistan", "latitude": 24.8607, "longitude": 67.0011},
    {"name": "Dhaka", "country": "Bangladesh", "latitude": 23.8103, "longitude": 90.4125},
    {"name": "Riyadh", "country": "Saudi Arabia", "latitude": 24.7136, "longitude": 46.6753},
    {"name": "Baghdad", "country": "Iraq", "latitude": 33.3152, "longitude": 44.3661},
    {"name": "Tehran", "country": "Iran", "latitude": 35.6892, "longitude": 51.3890},
]

# Kaaba coordinates
KAABA_LAT = 21.4225
KAABA_LNG = 39.8262

# ==================== Helper Functions ====================

def calculate_qibla_direction(lat: float, lng: float) -> float:
    """Calculate Qibla direction from given coordinates"""
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    kaaba_lat_rad = math.radians(KAABA_LAT)
    kaaba_lng_rad = math.radians(KAABA_LNG)
    
    delta_lng = kaaba_lng_rad - lng_rad
    
    x = math.sin(delta_lng)
    y = math.cos(lat_rad) * math.tan(kaaba_lat_rad) - math.sin(lat_rad) * math.cos(delta_lng)
    
    qibla = math.degrees(math.atan2(x, y))
    
    # Normalize to 0-360
    if qibla < 0:
        qibla += 360
    
    return round(qibla, 2)

async def fetch_prayer_times_aladhan(lat: float, lng: float, date_str: str = None, method: int = 13) -> Dict[str, Any]:
    """Fetch prayer times from Aladhan API"""
    if date_str is None:
        date_str = datetime.now().strftime("%d-%m-%Y")
    
    url = f"http://api.aladhan.com/v1/timings/{date_str}"
    params = {
        "latitude": lat,
        "longitude": lng,
        "method": method,
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, timeout=30.0)
        response.raise_for_status()
        return response.json()

# ==================== API Endpoints ====================

@api_router.get("/")
async def root():
    return {"message": "Namaz Vakitleri API", "version": "1.0"}

@api_router.get("/prayer-times")
async def get_prayer_times(
    latitude: float = Query(..., description="Latitude"),
    longitude: float = Query(..., description="Longitude"),
    date: Optional[str] = Query(None, description="Date in DD-MM-YYYY format"),
    method: int = Query(13, description="Calculation method (13=Turkey Diyanet)")
):
    """Get prayer times for given coordinates"""
    try:
        data = await fetch_prayer_times_aladhan(latitude, longitude, date, method)
        
        timings = data["data"]["timings"]
        date_info = data["data"]["date"]
        meta = data["data"]["meta"]
        
        return {
            "success": True,
            "data": {
                "fajr": timings["Fajr"],
                "sunrise": timings["Sunrise"],
                "dhuhr": timings["Dhuhr"],
                "asr": timings["Asr"],
                "maghrib": timings["Maghrib"],
                "isha": timings["Isha"],
                "date": date_info["readable"],
                "hijri_date": f"{date_info['hijri']['day']} {date_info['hijri']['month']['en']} {date_info['hijri']['year']}",
                "hijri_date_ar": f"{date_info['hijri']['day']} {date_info['hijri']['month']['ar']} {date_info['hijri']['year']}",
                "timezone": meta["timezone"],
                "method": meta["method"]["name"]
            }
        }
    except Exception as e:
        logger.error(f"Error fetching prayer times: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch prayer times: {str(e)}")

@api_router.get("/prayer-times/monthly")
async def get_monthly_prayer_times(
    latitude: float = Query(..., description="Latitude"),
    longitude: float = Query(..., description="Longitude"),
    month: int = Query(..., description="Month (1-12)"),
    year: int = Query(..., description="Year"),
    method: int = Query(13, description="Calculation method")
):
    """Get prayer times for entire month"""
    try:
        url = f"http://api.aladhan.com/v1/calendar/{year}/{month}"
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "method": method,
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()
        
        monthly_data = []
        for day_data in data["data"]:
            timings = day_data["timings"]
            date_info = day_data["date"]
            
            monthly_data.append({
                "date": date_info["readable"],
                "gregorian": date_info["gregorian"]["date"],
                "hijri": f"{date_info['hijri']['day']} {date_info['hijri']['month']['en']}",
                "fajr": timings["Fajr"].split(" ")[0],
                "sunrise": timings["Sunrise"].split(" ")[0],
                "dhuhr": timings["Dhuhr"].split(" ")[0],
                "asr": timings["Asr"].split(" ")[0],
                "maghrib": timings["Maghrib"].split(" ")[0],
                "isha": timings["Isha"].split(" ")[0],
            })
        
        return {"success": True, "data": monthly_data}
    except Exception as e:
        logger.error(f"Error fetching monthly prayer times: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/qibla")
async def get_qibla_direction(
    latitude: float = Query(..., description="Latitude"),
    longitude: float = Query(..., description="Longitude")
):
    """Get Qibla direction from given coordinates"""
    direction = calculate_qibla_direction(latitude, longitude)
    return {
        "success": True,
        "data": {
            "direction": direction,
            "latitude": latitude,
            "longitude": longitude,
            "kaaba_latitude": KAABA_LAT,
            "kaaba_longitude": KAABA_LNG
        }
    }

@api_router.get("/cities/turkey")
async def get_turkish_cities():
    """Get list of Turkish cities"""
    return {"success": True, "data": TURKISH_CITIES}

@api_router.get("/cities/world")
async def get_world_cities():
    """Get list of world major cities"""
    return {"success": True, "data": WORLD_CITIES}

@api_router.get("/calculation-methods")
async def get_calculation_methods():
    """Get available calculation methods"""
    methods = [
        {"id": 0, "name": "Shia Ithna-Ashari", "name_tr": "Şii İsna Aşeri"},
        {"id": 1, "name": "University of Islamic Sciences, Karachi", "name_tr": "Karachi Üniversitesi"},
        {"id": 2, "name": "Islamic Society of North America", "name_tr": "ISNA"},
        {"id": 3, "name": "Muslim World League", "name_tr": "Müslüman Dünya Birliği"},
        {"id": 4, "name": "Umm Al-Qura University, Makkah", "name_tr": "Ümmül Kura"},
        {"id": 5, "name": "Egyptian General Authority of Survey", "name_tr": "Mısır"},
        {"id": 7, "name": "Institute of Geophysics, University of Tehran", "name_tr": "Tahran"},
        {"id": 8, "name": "Gulf Region", "name_tr": "Körfez Bölgesi"},
        {"id": 9, "name": "Kuwait", "name_tr": "Kuveyt"},
        {"id": 10, "name": "Qatar", "name_tr": "Katar"},
        {"id": 11, "name": "Majlis Ugama Islam Singapura", "name_tr": "Singapur"},
        {"id": 12, "name": "Union Organization Islamic de France", "name_tr": "Fransa"},
        {"id": 13, "name": "Diyanet İşleri Başkanlığı, Turkey", "name_tr": "Diyanet İşleri Başkanlığı"},
        {"id": 14, "name": "Spiritual Administration of Muslims of Russia", "name_tr": "Rusya"},
    ]
    return {"success": True, "data": methods}

# User Settings Endpoints
@api_router.post("/settings")
async def create_or_update_settings(device_id: str, settings: UserSettingsUpdate):
    """Create or update user settings"""
    try:
        existing = await db.user_settings.find_one({"device_id": device_id})
        
        if existing:
            update_data = {k: v for k, v in settings.dict().items() if v is not None}
            update_data["updated_at"] = datetime.utcnow()
            await db.user_settings.update_one(
                {"device_id": device_id},
                {"$set": update_data}
            )
            updated = await db.user_settings.find_one({"device_id": device_id})
            return {"success": True, "data": updated}
        else:
            new_settings = UserSettings(
                device_id=device_id,
                **{k: v for k, v in settings.dict().items() if v is not None}
            )
            await db.user_settings.insert_one(new_settings.dict())
            return {"success": True, "data": new_settings.dict()}
    except Exception as e:
        logger.error(f"Error saving settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/settings/{device_id}")
async def get_settings(device_id: str):
    """Get user settings"""
    settings = await db.user_settings.find_one({"device_id": device_id})
    if settings:
        settings.pop("_id", None)
        return {"success": True, "data": settings}
    return {"success": True, "data": None}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
