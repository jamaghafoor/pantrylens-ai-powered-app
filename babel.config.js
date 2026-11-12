const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.resolve(__dirname, '.env');
  const envVars = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        envVars[key] = value;
      }
    }
  }
  return envVars;
}

function inlineDotEnvPlugin({ types: t }) {
  const defaultAllowedKeys = new Set(['OPENROUTER_API_KEY', 'OPENROUTER_MODEL']);

  return {
    name: 'inline-dotenv-openrouter',
    visitor: {
      MemberExpression(nodePath) {
        if (
          t.isMemberExpression(nodePath.node.object) &&
          t.isIdentifier(nodePath.node.object.object, { name: 'process' }) &&
          t.isIdentifier(nodePath.node.object.property, { name: 'env' }) &&
          t.isIdentifier(nodePath.node.property)
        ) {
          const key = nodePath.node.property.name;
          const envVars = loadDotEnv();
          if (
            defaultAllowedKeys.has(key) ||
            Object.prototype.hasOwnProperty.call(envVars, key)
          ) {
            const val =
              envVars[key] !== undefined
                ? envVars[key]
                : process.env[key] || '';
            nodePath.replaceWith(t.stringLiteral(val));
          }
        }
      },
    },
  };
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [inlineDotEnvPlugin],
};
