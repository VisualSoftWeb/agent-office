module.exports = {
  apps: [
    {
      name: "telegram-bot",
      cwd: ".",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "node.exe",
      restart_delay: 15000,
      kill_timeout: 10000,
      max_restarts: 10,
    },
  ],
};
