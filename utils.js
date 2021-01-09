const getCwdPath = (path) => process.cwd() + '/' + path;

function getLangFromPath(path) {
  const pathArr = path.split('.');
  return pathArr[pathArr.length - 2];
}

function getTranslatedPath(path, lang) {
  const pathArr = path.split('.');
  pathArr.splice(pathArr.length - 1, 0, lang);
  return pathArr.join('.');
}

function getOriginalPath(translatedPath) {
  const pathArr = translatedPath.split('.');
  pathArr.splice(pathArr.length - 2, 1);
  return pathArr.join('.');
}

module.exports = {
  getCwdPath,
  getLangFromPath,
  getTranslatedPath,
  getOriginalPath,
};
