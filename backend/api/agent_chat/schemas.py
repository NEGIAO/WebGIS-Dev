"""
Agent Chat Pydantic 请求/响应模型。
"""

from datetime import datetime
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AgentChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|tool)$")
    content: str = Field(default="", max_length=8000)
    # tool 角色消息必须携带 tool_call_id，用于关联对应的 tool_call
    tool_call_id: Optional[str] = Field(default=None, max_length=128)


class _StrictMapContextModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class AgentMapCenter(_StrictMapContextModel):
    lng: float = Field(..., ge=-180, le=180)
    lat: float = Field(..., ge=-90, le=90)


class AgentMapOlContext(_StrictMapContextModel):
    zoom: float = Field(..., ge=0, le=30)
    resolution: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    viewport_width: Optional[int] = Field(default=None, alias="viewportWidth", ge=1, le=100_000)
    viewport_height: Optional[int] = Field(default=None, alias="viewportHeight", ge=1, le=100_000)


class AgentMapCesiumContext(_StrictMapContextModel):
    camera_height: float = Field(..., alias="cameraHeight", ge=0, le=100_000_000)
    heading: Optional[float] = Field(default=None, ge=-360, le=360)
    pitch: Optional[float] = Field(default=None, ge=-90, le=90)
    roll: Optional[float] = Field(default=None, ge=-360, le=360)


class AgentMapBasemapContext(_StrictMapContextModel):
    index: Optional[int] = Field(default=None, ge=0, le=10_000)
    id: Optional[str] = Field(default=None, max_length=120)
    label: Optional[str] = Field(default=None, max_length=120)


class AgentMapUrlState(_StrictMapContextModel):
    view: Literal["ol", "cesium"]
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    z: Optional[float] = Field(default=None, ge=0, le=100_000_000)
    l: Optional[int] = Field(default=None, ge=0, le=10_000)


AgentMapChangeString = Annotated[str, Field(max_length=160)]
AgentMapChangeInt = Annotated[int, Field(ge=-100_000_000, le=100_000_000)]
AgentMapChangeFloat = Annotated[
    float,
    Field(ge=-100_000_000, le=100_000_000, allow_inf_nan=False),
]
AgentMapChangeValue = Union[
    None,
    bool,
    AgentMapChangeInt,
    AgentMapChangeFloat,
    AgentMapChangeString,
    AgentMapCenter,
]
AgentMapRecentAction = Annotated[str, Field(min_length=1, max_length=200)]
MAX_MAP_CONTEXT_SERIALIZED_BYTES = 12 * 1024


class AgentMapContextChange(_StrictMapContextModel):
    field: str = Field(..., min_length=1, max_length=64)
    from_: AgentMapChangeValue = Field(default=None, alias="from")
    to: AgentMapChangeValue = None


class AgentMapContextV1(_StrictMapContextModel):
    schema_version: Literal[1] = Field(alias="schemaVersion")
    context_id: str = Field(alias="contextId", min_length=1, max_length=64)
    captured_at: datetime = Field(alias="capturedAt")
    source: Literal["runtime+url", "runtime", "url"]
    view: Literal["ol", "cesium"]
    center: Optional[AgentMapCenter] = None
    ol: Optional[AgentMapOlContext] = None
    cesium: Optional[AgentMapCesiumContext] = None
    basemap: AgentMapBasemapContext
    url_state: AgentMapUrlState = Field(alias="urlState")
    changes_since_last_turn: Optional[List[AgentMapContextChange]] = Field(
        default=None, alias="changesSinceLastTurn",
        description="Field-level changes since the previous turn (for LLM state awareness)",
        max_length=10,
    )
    recent_actions: Optional[List[AgentMapRecentAction]] = Field(
        default=None, alias="recentActions",
        description="Short summaries of recent user-initiated map actions (journal)",
        max_length=5,
    )

    @model_validator(mode="after")
    def validate_view_semantics(self):
        if self.url_state.view != self.view:
            raise ValueError("urlState.view must match view")
        if self.view == "ol" and self.cesium is not None:
            raise ValueError("cesium state is not allowed when view=ol")
        if self.view == "cesium" and self.ol is not None:
            raise ValueError("ol state is not allowed when view=cesium")
        if self.view == "ol" and self.url_state.z is not None and self.url_state.z > 30:
            raise ValueError("urlState.z must be an OpenLayers zoom when view=ol")
        return self

    @model_validator(mode="after")
    def validate_serialized_size(self):
        serialized = self.model_dump_json(by_alias=True, exclude_none=True).encode("utf-8")
        if len(serialized) > MAX_MAP_CONTEXT_SERIALIZED_BYTES:
            raise ValueError(
                f"map_context exceeds {MAX_MAP_CONTEXT_SERIALIZED_BYTES} serialized bytes"
            )
        return self


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[AgentChatHistoryItem] = Field(default_factory=list, max_items=20)
    location_context: Optional[str] = Field(default=None, max_length=1000)
    map_context: Optional[AgentMapContextV1] = Field(default=None, description="Validated AgentMapContextV1 snapshot")
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
    map_context: Optional[AgentMapContextV1] = Field(default=None, description="Validated AgentMapContextV1 snapshot")
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
