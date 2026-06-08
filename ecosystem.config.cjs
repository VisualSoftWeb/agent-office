module.exports = {
  apps: [
    {
      name: "llm-proxy",
      cwd: "D:\\agente-model\\LlmProxy-main",
      script: "node",
      args: "node_modules/tsx/dist/cli.mjs src/index.ts",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "agent",
      cwd: "D:\\agente-model",
      script: "node",
      args: "node_modules/tsx/dist/cli.mjs src/index.ts",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
