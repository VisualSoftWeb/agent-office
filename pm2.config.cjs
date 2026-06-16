module.exports = {
  apps: [
    {
      name: "qwenproxy",
      cwd: "./qwenproxy-main",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "node.exe",
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
    },
    {
      name: "telegram-bot",
      cwd: ".",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      interpreter: "node.exe",
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
      },
    },
  ],
};
