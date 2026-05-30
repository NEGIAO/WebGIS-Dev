"""
Agent Chat Pydantic 请求/响应模型。
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class AgentChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=2000)


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[AgentChatHistoryItem] = Field(default_factory=list, max_items=12)
    location_context: Optional[str] = Field(default=None, max_length=1000)
    override_base_url: Optional[str] = Field(default=None, max_length=240)
    override_api_key: Optional[str] = Field(default=None, max_length=5000)
    override_model: Optional[str] = Field(default=None, max_length=160)
    override_timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    override_max_tokens: Optional[int] = Field(default=None, ge=1, le=8192)
    override_temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)


class AgentChatProxyRequest(BaseModel):
    """用户个人 API Key 代理聊天请求（绕过平台配额限制）。"""
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[AgentChatHistoryItem] = Field(default_factory=list, max_items=12)
    location_context: Optional[str] = Field(default=None, max_length=1000)
    api_key: str = Field(..., min_length=1, max_length=5000)
    base_url: str = Field(..., min_length=1, max_length=240)
    model: str = Field(..., min_length=1, max_length=160)
    system_prompt: Optional[str] = Field(default=None, max_length=2000)
    timeout_seconds: int = Field(default=45, ge=5, le=180)
    max_tokens: int = Field(default=8192, ge=1, le=8192)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)


class AgentConfigUpdateRequest(BaseModel):
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=240)
    model: Optional[str] = Field(default=None, max_length=160)
    available_models: Optional[List[str]] = Field(default=None, max_items=200)
    system_prompt: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=8192)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    guest_daily_quota: Optional[int] = Field(default=None, ge=1, le=100000)
    registered_daily_quota: Optional[int] = Field(default=None, ge=1, le=100000)
    reset_chat_quota: Optional[bool] = Field(default=None)


class AgentUserConfigUpdateRequest(BaseModel):
    api_key: Optional[str] = Field(default=None, max_length=5000)
    base_url: Optional[str] = Field(default=None, max_length=240)
    model: Optional[str] = Field(default=None, max_length=160)
    system_prompt: Optional[str] = Field(default=None, max_length=2000)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=8192)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    clear_personal_key: bool = Field(default=False)
    reset_provider_overrides: bool = Field(default=False)
