// Manual Jest mock for react-native-fs. The plumbing tests never exercise real
// filesystem paths (routing/asset code is mocked or unreached), so these are
// inert stubs that just satisfy the imports.
module.exports = {
  DocumentDirectoryPath: '/tmp',
  readFile: jest.fn(async () => '{}'),
  writeFile: jest.fn(async () => {}),
  exists: jest.fn(async () => false),
  getFSInfo: jest.fn(async () => ({freeSpace: 1e9, totalSpace: 1e9})),
  hash: jest.fn(async () => ''),
};
