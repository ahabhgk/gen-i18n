#!/usr/bin/env node

const argv = require('minimist')(process.argv.slice(2));
const glob = require('glob');
const remark = require('remark');
const mdx = require('remark-mdx');
const detectFrontmatter = require('remark-frontmatter');
const {read, write} = require('to-vfile');
const yaml = require('yaml');
const visit = require('unist-util-visit');
const createTranslateAPI = require('youdao-fanyi');

const {
  getCwdPath,
  getLangFromPath,
  getTranslatedPath,
  getOriginalPath,
} = require('./utils');
const supportLangs = new Set(require('./support-langs.json'));

const inputPaths = argv._.map(getCwdPath);
const matcher = argv.m;
const langs = argv.l.split(',').map((l) => l.trim());
const isForce = argv.f;
const config = require(getCwdPath(argv.c));

function getRealLang(lang) {
  const realLang = config.transform[lang];
  return realLang ?? lang;
}

const translateAPI = createTranslateAPI({
  appkey: config.appkey,
  secret: config.secret,
});

function translate(text, to) {
  to = getRealLang(to);
  if (!supportLangs.has(to)) {
    throw new Error('target lang is not supported, check your `-l` argument.');
  };

  let retry = 0;
  const fetch = () => translateAPI(text, {from: 'auto', to})
    .then((r) => r.translation[0])
    .catch((e) => {
      if (retry >= 3) return e;
      retry += 1;
      return fetch();
    });
  return fetch();
}

function translater({lang}) {
  return async (tree, file) => {
    const nodesToChange = [];
    visit(tree, 'heading', (node) => {
      visit(node, 'text', (textNode) => {
        nodesToChange.push(textNode);
      });
    });
    visit(tree, 'paragraph', (node) => {
      visit(node, 'text', (textNode) => {
        nodesToChange.push(textNode);
      });
    });
    const changeNodes = nodesToChange
      .map((node) => translate(node.value, lang)
        .then((r) => node.value = r)
        .catch(console.error));
    await Promise.all(changeNodes);
  };
}

function slugChanger({lang}) {
  return (tree, file) => {
    visit(tree, 'yaml', function visitor(node) {
      const frontmatter = yaml.parse(node.value);
      frontmatter.slug = `/${lang}${frontmatter.slug}`;
      node.value = yaml.stringify(frontmatter);
    });
  };
}

async function translateFile(path, lang) {
  const translatedPath = getTranslatedPath(path, lang);
  const file = await read(path);
  const contents = await remark()
    .use(mdx)
    .use(detectFrontmatter)
    .use(slugChanger, {lang})
    .use(translater, {lang})
    .process(file);

  await write({
    path: translatedPath,
    contents: contents.toString(),
  });
}

function processPaths(paths) {
  paths = paths.sort((a, b) => a.length - b.length);
  const path2TranslatedMap = new Map();

  for (const path of paths) {
    const pathArr = path.split('.');
    const fileLang = getLangFromPath(path);
    const realFileLang = getRealLang(fileLang);
    if (pathArr.length === 2 || !supportLangs.has(realFileLang)) {
      path2TranslatedMap.set(path, new Set());
    } else {
      const originalFilePath = getOriginalPath(path);
      const translatedFilePaths = path2TranslatedMap.get(originalFilePath);
      translatedFilePaths.add(fileLang);
      path2TranslatedMap.set(originalFilePath, translatedFilePaths);
    }
  }

  for (const [path, translated] of path2TranslatedMap.entries()) {
    for (const lang of langs) {
      if (!isForce && translated.has(lang)) continue;
      translateFile(path, lang);
    }
  }
}

if (matcher) {
  glob(getCwdPath(matcher), (err, paths) => {
    if (err) throw err;

    paths.push(...inputPaths);
    processPaths([...new Set(paths)]);
  });
} else {
  processPaths([...new Set(inputPaths)]);
}
