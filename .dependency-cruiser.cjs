/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-domain-to-infra",
      comment:
        "Domain/spine code (finding, validation, heuristic) must not import infrastructure or VM tools",
      severity: "error",
      from: {
        path: "^src/(finding|validation|heuristic)/",
      },
      to: {
        path: "^(tools/|src/store/|src/llm/|node_modules/(pg|ioredis|docker))",
      },
    },
    {
      name: "no-domain-to-router",
      comment: "Spine primitives must not import the router layer",
      severity: "error",
      from: {
        path: "^src/(finding|validation|heuristic)/",
      },
      to: {
        path: "^src/router/",
      },
    },
    {
      name: "contract-stays-pure",
      comment: "src/scope/ artifact schemas must not import outside src/scope/",
      severity: "error",
      from: {
        path: "^src/scope/artifact\\.ts$",
      },
      to: {
        pathNot: "^src/scope/",
      },
    },
    {
      name: "no-circular",
      comment: "No circular dependencies",
      severity: "warn",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "no-svm-imports-evm",
      comment: "SVM-specific agents and tools must not import EVM-specific code",
      severity: "error",
      from: {
        path: "^src/agents/svm-",
      },
      to: {
        path: "^tools/(slither|foundry|mythril|echidna)/",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "./tsconfig.json",
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
