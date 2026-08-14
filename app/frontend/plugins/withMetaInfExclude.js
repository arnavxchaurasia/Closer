const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withMetaInfExclude(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('META-INF/versions/9/OSGI-INF/MANIFEST.MF')) {
      mod.modResults.contents += `
android {
    packagingOptions {
        resources {
            excludes += ['META-INF/versions/9/OSGI-INF/MANIFEST.MF']
        }
    }
}
`;
    }
    return mod;
  });
};
