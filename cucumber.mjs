export default {
  default: {
      paths: ["features/**/*.feature"],
      import: ["tests/bdd/**/*.ts"],
      format: ["progress"],
      tags: "not @todo",
    },
  };
