from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VideoSegmentRenderTask(BaseModel):
    """Python representation of contracts/video-segment-render-task.schema.json."""

    model_config = ConfigDict(extra="forbid")

    jobId: str = Field(min_length=1, max_length=128)
    segmentId: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=1, max_length=4000)
    negativePrompt: str | None = Field(default=None, max_length=4000)
    durationSeconds: float = Field(ge=1, le=12)
    fps: int = Field(ge=8, le=30)
    width: int = Field(ge=256, le=1920)
    height: int = Field(ge=256, le=1920)
    seed: int = Field(ge=0, le=9223372036854775807)
    aspectRatio: str
    referenceImagePath: str | None = Field(default=None, max_length=2048)
    cacheKey: str | None = Field(default=None, max_length=128)

    @field_validator("aspectRatio")
    @classmethod
    def validate_aspect_ratio(cls, value: str) -> str:
        if value not in {"9:16", "1:1", "16:9"}:
            raise ValueError(f"unsupported aspect ratio: {value}")
        return value
