"""Python-side generated-contract target for the TypeScript render boundary.

The canonical source remains the TypeScript/Zod domain model. This module keeps
Python validation structurally aligned and is intentionally limited to the JSON
payload exchanged with the Modal renderer.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AspectRatio = Literal["9:16", "1:1", "16:9"]
RenderModel = Literal["wan22", "ltx"]


class RenderSegmentTask(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    jobId: str = Field(min_length=1, max_length=128)
    segmentId: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=1, max_length=4000)
    negativePrompt: str = Field(default="", max_length=4000)
    durationSeconds: float = Field(ge=1.0, le=12.0)
    fps: int = Field(ge=8, le=30)
    width: int = Field(ge=256, le=1920)
    height: int = Field(ge=256, le=1920)
    seed: int = Field(ge=0, le=2**63 - 1)
    model: RenderModel = "wan22"
    aspectRatio: AspectRatio = "9:16"
    steps: int = Field(default=28, ge=8, le=50)

    @field_validator("width", "height")
    @classmethod
    def dimensions_are_even(cls, value: int) -> int:
        if value % 2 != 0:
            raise ValueError("video dimensions must be even")
        return value


class RenderSegmentArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segmentId: str
    path: str
    durationSeconds: float
    width: int
    height: int
    fps: int
    checksum: str = Field(min_length=64, max_length=64)
    model: RenderModel
