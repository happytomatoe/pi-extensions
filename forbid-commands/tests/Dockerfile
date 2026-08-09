FROM node:22-slim

# Install basic tools
RUN apt-get update && apt-get install -y \
    curl \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create test user
RUN useradd -m -s /bin/bash testuser

# Install Pi globally
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# Create Pi config directory for test user
RUN mkdir -p /home/testuser/.pi/agent/extensions

# Copy the forbid-commands extension
COPY --chown=testuser:testuser index.ts /home/testuser/.pi/agent/extensions/forbid-commands.ts
COPY --chown=testuser:testuser src/ /home/testuser/.pi/agent/extensions/src/
COPY --chown=testuser:testuser grammars/ /home/testuser/.pi/agent/extensions/grammars/
COPY --chown=testuser:testuser node_modules/ /home/testuser/.pi/agent/extensions/node_modules/
COPY --chown=testuser:testuser package.json /home/testuser/.pi/agent/extensions/package.json

# Create the config file
RUN echo '# forbid-commands configuration\n\
use_dcg: false\n\
\n\
deny:\n\
  - pattern: "shutdown *"\n\
    message: "Shutdown is forbidden"\n\
  - pattern: "reboot"\n\
    message: "Reboot is forbidden"\n\
  - pattern: "halt"\n\
    message: "Halt is forbidden"\n\
  - pattern: "poweroff"\n\
    message: "Power off is forbidden"\n\
  - pattern: "kill *"\n\
    message: "Killing processes is forbidden"\n\
  - pattern: "sudo *"\n\
    message: "Sudo is forbidden"\n\
  - pattern: "rm -rf /*"\n\
    message: "Dangerous: rm -rf / is forbidden"\n\
\n\
confirm:\n\
  - pattern: "rm *"\n\
    message: "Allow rm?"\n\
\n\
allow:\n\
  - pattern: "ls *"\n\
  - pattern: "cat *"\n\
  - pattern: "echo *"\n\
  - pattern: "pwd"\n\
  - pattern: "whoami"\n\
  - pattern: "date"\n' > /home/testuser/.pi/agent/forbid-commands.yaml

# Create settings.json with the extension
RUN echo '{\n\
  "extensions": [\n\
    "+extensions/forbid-commands.ts"\n\
  ]\n\
}' > /home/testuser/.pi/settings.json

# Create test directory
RUN mkdir -p /home/testuser/test-project && \
    chown -R testuser:testuser /home/testuser

# Set working directory
WORKDIR /home/testuser/test-project

# Switch to test user
USER testuser

# Set environment variables
ENV HOME=/home/testuser
ENV PATH="/home/testuser/.local/bin:${PATH}"

# Copy test files
COPY --chown=testuser:testuser tests/e2e-pi-test.ts /home/testuser/test-project/

# Default command: run E2E tests
CMD ["npx", "tsx", "e2e-pi-test.ts"]
