---
name: Workflow port registration
description: Handling delayed preview-port registration after dependency restoration.
---

When an imported Node application logs that it is listening on the configured webview port and responds locally, allow time for the workflow manager to register the port before changing application code.

**Why:** After dependencies are restored, workflow restart reporting can time out even though the process binds to `0.0.0.0:5000` and the preview becomes available shortly afterward.

**How to apply:** Confirm the process is still running, the expected port returns HTTP 200 locally, and the preview renders before treating the timeout as a server-side failure.