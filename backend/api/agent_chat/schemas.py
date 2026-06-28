"""
Agent Chat Pydantic 请求/响应模型。
"""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field


class AgentChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|tool)$")
    content: str = Field(default="", max_length=8000)
    # tool 角色消息必须携带 tool_call_id，用于关联对应的 tool_call
    tool_call_id: Optional[str] = Field(default=None, max_length=128)


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[AgentChatHistoryItem] = Field(default_factory=list, max_items=20)
    location_context: Optional[str] = Field(default=None, max_length=1000)
    override_base_url: Optional[str] = Field(default=None, max_length=240)
    override_api_key: Optional[str] = Field(default=None, max_length=5000)
    override_model: Optional[str] = Field(default=None, max_length=160)
    override_timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    override_max_tokens: Optional[int] = Field(default=None, ge=1, le=32768)
    override_temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    override_top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    override_extra_body: Optional[Dict[str, Any]] = Field(default=None, description="附加上游请求体字段")
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, description="Function Calling 工具声明（OpenAI 格式）")
    # tool_choice 支持字符串 ("auto"/"none"/"required") 或对象 ({"type":"function","function":{"name":"xxx"}})
    tool_choice: Optional[Union[str, Dict[str, Any]]] = Field(default=None, description="工具选择策略")


class AgentChatProxyRequest(BaseModel):
    """用户个人 API Key 代理聊天请求（绕过平台配额限制）。"""
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[AgentChatHistoryItem] = Field(default_factory=list, max_items=20)
    location_context: Optional[str] = Field(default=None, max_length=1000)
    api_key: str = Field(..., min_length=1, max_length=5000)
    base_url: str = Field(..., min_length=1, max_length=240)
    model: str = Field(..., min_length=1, max_length=160)
    system_prompt: Optional[str] = Field(default=None, max_length=8000)
    timeout_seconds: int = Field(default=45, ge=5, le=180)
    max_tokens: int = Field(default=32768, ge=1, le=32768)
    temperature: float = Field(default=1.0, ge=0.0, le=2.0)
    top_p: float = Field(default=0.95, ge=0.0, le=1.0)
    extra_body: Optional[Dict[str, Any]] = Field(default=None, description="上游请求体附加字段")
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, description="Function Calling 工具声明（OpenAI 格式）")
    tool_choice: Optional[Union[str, Dict[str, Any]]] = Field(default=None, description="工具选择策略")


class AgentConfigUpdateRequest(BaseModel):
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=240)
    model: Optional[str] = Field(default=None, max_length=160)
    available_models: Optional[List[str]] = Field(default=None, max_items=200)
    system_prompt: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=32768)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    extra_body: Optional[Dict[str, Any]] = Field(default=None, description="上游请求体附加字段")
    guest_daily_quota: Optional[int] = Field(default=None, ge=1, le=100000)
    registered_daily_quota: Optional[int] = Field(default=None, ge=1, le=100000)
    reset_chat_quota: Optional[bool] = Field(default=None)


class AgentUserConfigUpdateRequest(BaseModel):
    api_key: Optional[str] = Field(default=None, max_length=5000)
    base_url: Optional[str] = Field(default=None, max_length=240)
    model: Optional[str] = Field(default=None, max_length=160)
    system_prompt: Optional[str] = Field(default=None, max_length=2000)
    timeout_seconds: Optional[int] = Field(default=None, ge=5, le=180)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=32768)
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    extra_body: Optional[Dict[str, Any]] = Field(default=None, description="上游请求体附加字段")
    clear_personal_key: bool = Field(default=False)
    reset_provider_overrides: bool = Field(default=False)


class DefaultAIConfigUpdateRequest(BaseModel):
    """管理员更新默认 AI 专属配置请求（base_url / model / api_key）。"""
    api_key: Optional[str] = Field(default=None, max_length=5000, description="专属 API Key")
    base_url: Optional[str] = Field(default=None, max_length=240, description="LLM 端点地址")
    model: Optional[str] = Field(default=None, max_length=160, description="默认模型名称")
