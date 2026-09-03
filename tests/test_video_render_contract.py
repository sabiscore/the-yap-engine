from pydantic import ValidationError
import pytest

from swarmx.contracts.video_render_contract import RenderSegmentTask


def valid_task() -> dict[str, object]:
    return {
        "jobId": "job-1",
        "segmentId": "segment-000",
        "prompt": "cinematic close-up of a creator explaining one sharp idea",
        "negativePrompt": "blurry, watermark",
        "durationSeconds": 4,
        "fps": 24,
        "width": 720,
        "height": 1280,
        "seed": 42,
        "model": "wan22",
        "aspectRatio": "9:16",
        "steps": 20,
    }


def test_valid_task_round_trips() -> None:
    task = RenderSegmentTask.model_validate(valid_task())
    assert task.aspectRatio == "9:16"
    assert task.model == "wan22"


def test_aspect_ratio_is_closed_union() -> None:
    payload = valid_task()
    payload["aspectRatio"] = "4:5"
    with pytest.raises(ValidationError):
        RenderSegmentTask.model_validate(payload)


def test_extra_fields_are_rejected() -> None:
    payload = valid_task()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        RenderSegmentTask.model_validate(payload)
