# Windows and WSL2 memory profiles

These are starting points for the Creative Hub local profiles. Validate the actual ceiling and peak RSS with `docs/8GB-PROFILING-RUNBOOK.md`; they are not certification evidence.

## 8 GB host

Create or merge into `%UserProfile%\\.wslconfig`:

```ini
[wsl2]
memory=6GB
processors=4
swap=4GB
```

The 6 GB WSL ceiling is paired with the 6 GB Ollama hard cap in the compose profile; Docker service limits for Redis, API, dashboard and Python worker remain deliberately small. Keep one model and one video job active at a time. Treat the profile as a starting point and validate peak RSS on the physical host.

## 16 GB host

```ini
[wsl2]
memory=12GB
processors=6
swap=8GB
```

Use `docker-compose.16gb.yml` for the larger profile.

Restart WSL after changing the file:

```powershell
wsl --shutdown
```
