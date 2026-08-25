const fs = require('node:fs');
const path = require('node:path');

const githubOwner = process.env.GH_OWNER?.trim() || 'minimissile';
const githubRepo = process.env.GH_REPO?.trim() || 'trading-diary';
const releaseType = process.env.GH_RELEASE_TYPE?.trim() || 'release';
const releaseNotesFile = path.join(__dirname, 'release-notes.md');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  extends: './electron-builder.yml',
  ...(fs.existsSync(releaseNotesFile) ? { releaseInfo: { releaseNotesFile } } : {}),
  publish: [
    {
      provider: 'github',
      owner: githubOwner,
      repo: githubRepo,
      releaseType,
    },
  ],
};
