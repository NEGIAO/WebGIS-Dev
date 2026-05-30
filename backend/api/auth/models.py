"""
认证模块 Pydantic 请求模型。
"""

from typing import Optional

from pydantic import BaseModel, Field

from .constants import MAX_AVATAR_INDEX


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=24)
    password: str = Field(..., min_length=6, max_length=64)
    avatar_index: int = Field(default=0, ge=0, le=MAX_AVATAR_INDEX)


class LoginRequest(BaseModel):
    username: Optional[str] = Field(default=None, max_length=24)
    password: str = Field(..., min_length=1, max_length=128)
    guest_device_id: Optional[str] = Field(default=None, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=64)


class ChangeAvatarRequest(BaseModel):
    new_avatar_index: int = Field(..., ge=0, le=MAX_AVATAR_INDEX)


class UpdatePreferencesRequest(BaseModel):
    default_basemap: Optional[str] = Field(default=None, max_length=80)
    language: Optional[str] = Field(default=None, max_length=16)
    unit_system: Optional[str] = Field(default=None, max_length=16)
    preferred_agent_model: Optional[str] = Field(default=None, max_length=160)
