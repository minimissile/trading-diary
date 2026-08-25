const githubOwner = process.env.GH_OWNER?.trim() || 'minimissile';
const githubRepo = process.env.GH_REPO?.trim() || 'trading-diary';
const releaseType = process.env.GH_RELEASE_TYPE?.trim() || 'release';

/** @type {import('electron-builder').Configuration} */
module.exports = {
  extends: './electron-builder.yml',
  publish: [
    {
      provider: 'github',
      owner: githubOwner,
      repo: githubRepo,
      releaseType,
    },
  ],
};
