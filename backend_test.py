#!/usr/bin/env python3
"""
Backend API Testing for Namaz Vakitleri (Prayer Times) Application
Tests all backend endpoints for functionality and data integrity
"""

import requests
import json
from datetime import datetime
import sys
import os

# Get backend URL from frontend .env file
def get_backend_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading frontend .env: {e}")
    return "https://qibla-finder-35.preview.emergentagent.com"

BASE_URL = get_backend_url()
API_BASE = f"{BASE_URL}/api"

# Test data - Istanbul coordinates
ISTANBUL_LAT = 41.0082
ISTANBUL_LNG = 28.9784

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        
    def add_pass(self, test_name):
        self.passed += 1
        print(f"✅ {test_name}")
        
    def add_fail(self, test_name, error):
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
        print(f"❌ {test_name}: {error}")
        
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {total}")
        print(f"Passed: {self.passed}")
        print(f"Failed: {self.failed}")
        print(f"Success Rate: {(self.passed/total*100):.1f}%" if total > 0 else "0%")
        
        if self.errors:
            print(f"\n{'='*60}")
            print("FAILED TESTS:")
            print(f"{'='*60}")
            for error in self.errors:
                print(f"• {error}")
        
        return self.failed == 0

def test_root_endpoint(results):
    """Test GET /api/ - Root endpoint"""
    try:
        response = requests.get(f"{API_BASE}/", timeout=10)
        
        if response.status_code != 200:
            results.add_fail("Root Endpoint", f"Status code {response.status_code}")
            return
            
        data = response.json()
        
        # Check expected response structure
        if data.get("message") != "Namaz Vakitleri API":
            results.add_fail("Root Endpoint", f"Unexpected message: {data.get('message')}")
            return
            
        if data.get("version") != "1.0":
            results.add_fail("Root Endpoint", f"Unexpected version: {data.get('version')}")
            return
            
        results.add_pass("Root Endpoint")
        
    except Exception as e:
        results.add_fail("Root Endpoint", str(e))

def test_prayer_times_endpoint(results):
    """Test GET /api/prayer-times - Get prayer times"""
    try:
        # Test with Istanbul coordinates
        params = {
            "latitude": ISTANBUL_LAT,
            "longitude": ISTANBUL_LNG,
            "method": 13  # Turkey Diyanet
        }
        
        response = requests.get(f"{API_BASE}/prayer-times", params=params, timeout=15)
        
        if response.status_code != 200:
            results.add_fail("Prayer Times API", f"Status code {response.status_code}")
            return
            
        data = response.json()
        
        # Check response structure
        if not data.get("success"):
            results.add_fail("Prayer Times API", "Success field is not true")
            return
            
        prayer_data = data.get("data", {})
        required_times = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
        
        for time_name in required_times:
            if time_name not in prayer_data:
                results.add_fail("Prayer Times API", f"Missing {time_name} time")
                return
                
        # Check if times are in valid format (HH:MM)
        for time_name in required_times:
            time_str = prayer_data[time_name]
            try:
                # Remove timezone info if present
                time_part = time_str.split(" ")[0]
                datetime.strptime(time_part, "%H:%M")
            except ValueError:
                results.add_fail("Prayer Times API", f"Invalid time format for {time_name}: {time_str}")
                return
                
        # Check additional fields
        if "date" not in prayer_data:
            results.add_fail("Prayer Times API", "Missing date field")
            return
            
        if "hijri_date" not in prayer_data:
            results.add_fail("Prayer Times API", "Missing hijri_date field")
            return
            
        results.add_pass("Prayer Times API")
        
    except Exception as e:
        results.add_fail("Prayer Times API", str(e))

def test_monthly_prayer_times_endpoint(results):
    """Test GET /api/prayer-times/monthly - Get monthly prayer times"""
    try:
        current_date = datetime.now()
        params = {
            "latitude": ISTANBUL_LAT,
            "longitude": ISTANBUL_LNG,
            "month": current_date.month,
            "year": current_date.year,
            "method": 13
        }
        
        response = requests.get(f"{API_BASE}/prayer-times/monthly", params=params, timeout=20)
        
        if response.status_code != 200:
            results.add_fail("Monthly Prayer Times API", f"Status code {response.status_code}")
            return
            
        data = response.json()
        
        if not data.get("success"):
            results.add_fail("Monthly Prayer Times API", "Success field is not true")
            return
            
        monthly_data = data.get("data", [])
        
        if not isinstance(monthly_data, list):
            results.add_fail("Monthly Prayer Times API", "Data is not an array")
            return
            
        if len(monthly_data) == 0:
            results.add_fail("Monthly Prayer Times API", "Empty data array")
            return
            
        # Check first day structure
        first_day = monthly_data[0]
        required_fields = ["date", "gregorian", "hijri", "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
        
        for field in required_fields:
            if field not in first_day:
                results.add_fail("Monthly Prayer Times API", f"Missing field {field} in daily data")
                return
                
        results.add_pass("Monthly Prayer Times API")
        
    except Exception as e:
        results.add_fail("Monthly Prayer Times API", str(e))

def test_qibla_endpoint(results):
    """Test GET /api/qibla - Get Qibla direction"""
    try:
        params = {
            "latitude": ISTANBUL_LAT,
            "longitude": ISTANBUL_LNG
        }
        
        response = requests.get(f"{API_BASE}/qibla", params=params, timeout=10)
        
        if response.status_code != 200:
            results.add_fail("Qibla Direction API", f"Status code {response.status_code}")
            return
            
        data = response.json()
        
        if not data.get("success"):
            results.add_fail("Qibla Direction API", "Success field is not true")
            return
            
        qibla_data = data.get("data", {})
        
        # Check direction field
        direction = qibla_data.get("direction")
        if direction is None:
            results.add_fail("Qibla Direction API", "Missing direction field")
            return
            
        # For Istanbul, Qibla direction should be around 151 degrees
        if not (140 <= direction <= 160):
            results.add_fail("Qibla Direction API", f"Unexpected direction for Istanbul: {direction}° (expected ~151°)")
            return
            
        # Check coordinate fields
        if qibla_data.get("latitude") != ISTANBUL_LAT:
            results.add_fail("Qibla Direction API", "Latitude mismatch")
            return
            
        if qibla_data.get("longitude") != ISTANBUL_LNG:
            results.add_fail("Qibla Direction API", "Longitude mismatch")
            return
            
        results.add_pass("Qibla Direction API")
        
    except Exception as e:
        results.add_fail("Qibla Direction API", str(e))

def test_turkish_cities_endpoint(results):
    """Test GET /api/cities/turkey - Get Turkish cities list"""
    try:
        response = requests.get(f"{API_BASE}/cities/turkey", timeout=10)
        
        if response.status_code != 200:
            results.add_fail("Turkish Cities API", f"Status code {response.status_code}")
            return
            
        data = response.json()
        
        if not data.get("success"):
            results.add_fail("Turkish Cities API", "Success field is not true")
            return
            
        cities = data.get("data", [])
        
        if not isinstance(cities, list):
            results.add_fail("Turkish Cities API", "Data is not an array")
            return
            
        if len(cities) != 30:
            results.add_fail("Turkish Cities API", f"Expected 30 cities, got {len(cities)}")
            return
            
        # Check first city structure
        first_city = cities[0]
        required_fields = ["name", "latitude", "longitude"]
        
        for field in required_fields:
            if field not in first_city:
                results.add_fail("Turkish Cities API", f"Missing field {field} in city data")
                return
                
        # Check if Istanbul is in the list
        istanbul_found = any(city["name"] == "İstanbul" for city in cities)
        if not istanbul_found:
            results.add_fail("Turkish Cities API", "İstanbul not found in cities list")
            return
            
        results.add_pass("Turkish Cities API")
        
    except Exception as e:
        results.add_fail("Turkish Cities API", str(e))

def test_world_cities_endpoint(results):
    """Test GET /api/cities/world - Get world cities list"""
    try:
        response = requests.get(f"{API_BASE}/cities/world", timeout=10)
        
        if response.status_code != 200:
            results.add_fail("World Cities API", f"Status code {response.status_code}")
            return
            
        data = response.json()
        
        if not data.get("success"):
            results.add_fail("World Cities API", "Success field is not true")
            return
            
        cities = data.get("data", [])
        
        if not isinstance(cities, list):
            results.add_fail("World Cities API", "Data is not an array")
            return
            
        if len(cities) != 20:
            results.add_fail("World Cities API", f"Expected 20 cities, got {len(cities)}")
            return
            
        # Check first city structure
        first_city = cities[0]
        required_fields = ["name", "country", "latitude", "longitude"]
        
        for field in required_fields:
            if field not in first_city:
                results.add_fail("World Cities API", f"Missing field {field} in city data")
                return
                
        # Check if Mecca is in the list
        mecca_found = any(city["name"] == "Mecca" for city in cities)
        if not mecca_found:
            results.add_fail("World Cities API", "Mecca not found in cities list")
            return
            
        results.add_pass("World Cities API")
        
    except Exception as e:
        results.add_fail("World Cities API", str(e))

def test_calculation_methods_endpoint(results):
    """Test GET /api/calculation-methods - Get calculation methods"""
    try:
        response = requests.get(f"{API_BASE}/calculation-methods", timeout=10)
        
        if response.status_code != 200:
            results.add_fail("Calculation Methods API", f"Status code {response.status_code}")
            return
            
        data = response.json()
        
        if not data.get("success"):
            results.add_fail("Calculation Methods API", "Success field is not true")
            return
            
        methods = data.get("data", [])
        
        if not isinstance(methods, list):
            results.add_fail("Calculation Methods API", "Data is not an array")
            return
            
        if len(methods) != 14:
            results.add_fail("Calculation Methods API", f"Expected 14 methods, got {len(methods)}")
            return
            
        # Check first method structure
        first_method = methods[0]
        required_fields = ["id", "name", "name_tr"]
        
        for field in required_fields:
            if field not in first_method:
                results.add_fail("Calculation Methods API", f"Missing field {field} in method data")
                return
                
        # Check if Diyanet method (id=13) is in the list
        diyanet_found = any(method["id"] == 13 for method in methods)
        if not diyanet_found:
            results.add_fail("Calculation Methods API", "Diyanet method (id=13) not found")
            return
            
        results.add_pass("Calculation Methods API")
        
    except Exception as e:
        results.add_fail("Calculation Methods API", str(e))

def main():
    print("🕌 Namaz Vakitleri API Backend Testing")
    print(f"Testing API at: {API_BASE}")
    print("="*60)
    
    results = TestResults()
    
    # Run all tests
    test_root_endpoint(results)
    test_prayer_times_endpoint(results)
    test_monthly_prayer_times_endpoint(results)
    test_qibla_endpoint(results)
    test_turkish_cities_endpoint(results)
    test_world_cities_endpoint(results)
    test_calculation_methods_endpoint(results)
    
    # Print summary
    success = results.summary()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())