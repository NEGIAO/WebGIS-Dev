#!/usr/bin/env python3
"""
WebGIS 位置服务接口测试脚本

用法:
    python test_location_apis.py
"""

import asyncio
import json
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)


def test_ip_locate():
    """测试 IP 定位接口"""
    print("\n" + "="*60)
    print("测试 1: IP 定位接口 (prefer_free_service=False)")
    print("="*60)
    
    response = client.post(
        "/api/v1/location/ip-locate",
        json={
            "ip": "1.1.1.1",
            "prefer_free_service": False,
            "silent": False
        }
    )
    
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    
    print("\n" + "="*60)
    print("测试 2: IP 定位接口 (prefer_free_service=True)")
    print("="*60)
    
    response = client.post(
        "/api/v1/location/ip-locate",
        json={
            "ip": "1.1.1.1",
            "prefer_free_service": True,
            "silent": False
        }
    )
    
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")


def test_reverse_geocode():
    """测试反向地理编码接口"""
    print("\n" + "="*60)
    print("测试 3: 反向地理编码接口 (prefer_service=auto)")
    print("="*60)
    
    response = client.post(
        "/api/v1/location/reverse",
        json={
            "lng": 116.0,
            "lat": 39.5,
            "prefer_service": "auto",
            "silent": False
        }
    )
    
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    
    print("\n" + "="*60)
    print("测试 4: 反向地理编码接口 (prefer_service=nominatim)")
    print("="*60)
    
    response = client.post(
        "/api/v1/location/reverse",
        json={
            "lng": 116.0,
            "lat": 39.5,
            "prefer_service": "nominatim",
            "silent": False
        }
    )
    
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")


def test_track_visit():
    """测试访问追踪接口"""
    print("\n" + "="*60)
    print("测试 5: 访问追踪接口")
    print("="*60)
    
    response = client.post(
        "/api/v1/location/track-visit",
        json={
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "referrer": "https://example.com"
        }
    )
    
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("WebGIS 位置服务接口测试")
    print("="*60)
    
    try:
        test_ip_locate()
        test_reverse_geocode()
        test_track_visit()
        
        print("\n" + "="*60)
        print("✅ 所有测试完成")
        print("="*60)
    except Exception as e:
        print(f"\n❌ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
