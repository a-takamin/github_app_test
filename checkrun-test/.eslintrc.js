module.exports = {
  extends: ["@cybozu/eslint-config/presets/node-prettier"],
  rules: {
    "prettier/prettier": [
      "error",
      {
        printWidth: 120, // defaultの80は短すぎるので120に変更した
      },
    ],
  },
}
