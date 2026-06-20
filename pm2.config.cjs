module.exports = {
  apps: [
    {
      name: "deepsproxy",
      cwd: ".",
      script: "scripts/hide-runner.js",
      args: "deepsproxy/node_modules/tsx/dist/cli.mjs deepsproxy/src/index.ts",
      interpreter: "node.exe",
      restart_delay: 15000,
      kill_timeout: 10000,
      max_restarts: 10,
    },
    {
      name: "telegram-bot",
      cwd: ".",
      script: "scripts/hide-runner.js",
      args: "node_modules/tsx/dist/cli.mjs src/index.ts",
      interpreter: "node.exe",
      restart_delay: 15000,
      kill_timeout: 10000,
      max_restarts: 10,
    },
  ],
};
