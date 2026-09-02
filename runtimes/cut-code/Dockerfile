# Local qualification image only; not approved for multi-tenant production.
FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/cut-code
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY bundle.mjs sdk.jsx frame-readiness.mjs frame-audio.mjs video-source-audio.mjs motion.mjs text-layout.mjs audio.mjs video-encoding.mjs request.mjs render.mjs ./
ENV CUT_CODE_CONTAINER=1 HOME=/tmp
USER pwuser
ENTRYPOINT ["node", "render.mjs"]
