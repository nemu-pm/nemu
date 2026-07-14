module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  if (!projectId) return config;

  return {
    ...config,
    extra: {
      ...config.extra,
      eas: {
        ...(config.extra?.eas ?? {}),
        projectId,
      },
    },
  };
};
